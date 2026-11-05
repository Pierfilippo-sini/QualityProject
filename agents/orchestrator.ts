import {
  AGENT_MODEL_ASSIGNMENT,
  GOOGLE_MAPS_PLACES_API_ID,
  UNIFIED_GEMINI_MODEL,
  getDefaultCompaniesCount,
  getGeminiApiKey,
  getGoogleMapsApiKey,
  getMaxCompaniesCap,
} from "@/lib/agent-config";
import { deduplicateCompaniesKeepMostRecent } from "@/lib/company-dedup-and-geo";
import { cleanupSessionCaches } from "@/lib/gemini-cache-guard";
import {
  aggregateStepCallMetrics,
  runWithStepUsageCollector,
  type GeminiCallCostMetrics,
} from "@/lib/gemini-usage-tracker";
import type { SingleCompanyMapsVerification } from "@/lib/google-maps";
import { sanitizeTextFields } from "@/lib/html-cleaner";
import {
  clampWeight,
  mergeAndComputeFinalRanking,
  type EnrichedCompanyDraft,
  type LightweightCompanyScoreItem,
} from "@/lib/scoring";
import { ZeroTokenTelemetry } from "@/lib/telemetry";
import type {
  ApiConnectionStatus,
  CompanyResult,
  DebugTrace,
  DiscardedCompanyTrace,
  MandatorySearchInput,
  ParsedSearchConstraints,
  ScoutResponsePayload,
  StepTokenUsageSummary,
  StreamStage,
} from "@/lib/types";
import {
  runStep1IntentDiscovery,
  type CandidateCompanySeed,
} from "@/agents/step1-intent-discovery";
import {
  analyzeSingleCandidateInIsolation,
  buildStep2SystemInstruction,
  type SingleCompanyTaskOutcome,
  type VerifiedGatekeeperCompany,
} from "@/agents/step2-gatekeeper";
import {
  mergeCandidateWithMapsVerification,
  verifySingleCandidateOnMaps,
  type MapsVerifiedCompany,
} from "@/agents/step3-maps-verification";
import {
  buildStep4SystemInstruction,
  enrichSingleCompanyStep4,
  type SingleCompanyStep4Result,
} from "@/agents/step4-enrichment-cxi";
import {
  buildStep5SystemInstruction,
  scoreSingleCompanyStep5,
  type SingleCompanyStep5Result,
} from "@/agents/step5-scoring-pitch";

/**
 * Orchestrator ad Alta Velocità e Pipelining Asincrono (`gemini-3.8-flash`).
 *
 * Architettura delle 4 Ottimizzazioni implementate:
 * 1. Accorpamento Step 0 (Guardrail) + Step 1 (Intent & Discovery SERP) in un'unica chiamata LLM con Search Grounding.
 * 2. Esecuzione simultanea di Step 2 (LLM Data Extraction + Cross-Check ReportAziende/FatturatoItalia)
 *    e Step 3 (Google Maps Places API) tramite `Promise.allSettled()` per ogni candidata.
 * 3. Pipelining asincrono (`for await...of`) tra Step 2/3 e Step 4/5: non appena la prima azienda
 *    termina Step 2 + Step 3, entra immediatamente nello Step 4 e Step 5 e viene inviata in streaming
 *    al frontend (`callbacks?.onCompany?.(rankedCompany)`) mentre le altre stanno ancora elaborando.
 * 4. Cross-check parallelo deterministico per Partita IVA tra `reportaziende.it` e `fatturatoitalia.it`.
 */

export interface OrchestratorCallbacks {
  onStage?: (stage: StreamStage, message: string) => void;
  onIntent?: (constraints: ParsedSearchConstraints) => void;
  onCompany?: (company: CompanyResult) => void;
  onTraceUpdate?: (trace: DebugTrace) => void;
}

const DOWNSTREAM_STEPS_AFTER_STEP1 = [
  AGENT_MODEL_ASSIGNMENT.gatekeeper_extraction,
  AGENT_MODEL_ASSIGNMENT.maps_verification,
  AGENT_MODEL_ASSIGNMENT.enrichment_cxi,
  AGENT_MODEL_ASSIGNMENT.scoring_pitch,
] as const;

interface ConcurrentStep2AndStep3Item {
  candidateIndex: number;
  candidateId: string;
  candidateSeed: CandidateCompanySeed;
  step2Settled: PromiseSettledResult<SingleCompanyTaskOutcome>;
  step2Calls: GeminiCallCostMetrics[];
  step2DurationMs: number;
  step3Settled: PromiseSettledResult<{
    verification: SingleCompanyMapsVerification;
    apiStatus: ApiConnectionStatus;
    warningMessage?: string;
  }>;
  step3DurationMs: number;
}

/**
 * Generatore asincrono (`for await...of`) che lancia simultaneamente Step 2 (LLM + Portali Bilancio)
 * e Step 3 (Google Maps Places API) con `Promise.allSettled()` per tutte le candidate e restituisce
 * ogni singola azienda nell'istante esatto in cui la sua coppia `[Step 2, Step 3]` termina,
 * senza attendere le candidate più lente.
 */
async function* streamConcurrentStep2AndStep3(
  candidates: CandidateCompanySeed[],
  constraints: ParsedSearchConstraints,
  step2SystemInstruction: string
): AsyncGenerator<ConcurrentStep2AndStep3Item, void, unknown> {
  const pending = new Map<
    number,
    Promise<{ index: number; item: ConcurrentStep2AndStep3Item }>
  >();

  candidates.forEach((candidateSeed, index) => {
    const candidateId = `cmp_${index + 1}`;

    const taskPromise = (async (): Promise<{
      index: number;
      item: ConcurrentStep2AndStep3Item;
    }> => {
      let step2Calls: GeminiCallCostMetrics[] = [];
      let step2DurationMs = 0;
      let step3DurationMs = 0;

      const step2Task = (async () => {
        const t0 = performance.now();
        try {
          const { result, calls } = await runWithStepUsageCollector(() =>
            analyzeSingleCandidateInIsolation(
              candidateSeed,
              constraints,
              step2SystemInstruction
            )
          );
          step2Calls = calls;
          step2DurationMs = Math.max(1, Math.round(performance.now() - t0));
          return result;
        } catch (err) {
          step2DurationMs = Math.max(1, Math.round(performance.now() - t0));
          throw err;
        }
      })();

      const step3Task = (async () => {
        const t0 = performance.now();
        try {
          const res = await verifySingleCandidateOnMaps({
            companyId: candidateId,
            ragioneSociale: candidateSeed.ragioneSociale,
            sedeCitta: candidateSeed.sedeCittaHint,
          });
          step3DurationMs = Math.max(1, Math.round(performance.now() - t0));
          return res;
        } catch (err) {
          step3DurationMs = Math.max(1, Math.round(performance.now() - t0));
          throw err;
        }
      })();

      // OTTIMIZZAZIONE #1: Esecuzione simultanea di Step 2 e Step 3 con Promise.allSettled()
      const [step2Settled, step3Settled] = await Promise.allSettled([
        step2Task,
        step3Task,
      ]);

      return {
        index,
        item: {
          candidateIndex: index,
          candidateId,
          candidateSeed,
          step2Settled,
          step2Calls,
          step2DurationMs,
          step3Settled,
          step3DurationMs,
        },
      };
    })();

    pending.set(index, taskPromise);
  });

  while (pending.size > 0) {
    const { index, item } = await Promise.race(pending.values());
    pending.delete(index);
    yield item;
  }
}

function buildTokenUsageSummary(params: {
  stepNumber: number;
  stepLabel: string;
  model: string;
  wallClockDurationMs: number;
  calls: GeminiCallCostMetrics[];
}): StepTokenUsageSummary | undefined {
  const aggregated = aggregateStepCallMetrics({
    stepNumber: params.stepNumber,
    stepLabel: params.stepLabel,
    model: params.model,
    stepWallClockDurationMs: params.wallClockDurationMs,
    calls: params.calls,
  });
  if (!aggregated) return undefined;
  if (params.calls.length > 1) {
    console.info(aggregated.formattedDebugLine);
  }
  return {
    promptTokenCount: aggregated.usageMetadata.promptTokenCount,
    candidatesTokenCount: aggregated.usageMetadata.candidatesTokenCount,
    cachedContentTokenCount: aggregated.usageMetadata.cachedContentTokenCount,
    thoughtsTokenCount: aggregated.usageMetadata.thoughtsTokenCount,
    toolUsePromptTokenCount: aggregated.usageMetadata.toolUsePromptTokenCount,
    totalTokenCount: aggregated.usageMetadata.totalTokenCount,
    tier: aggregated.tier,
    totalCostUsd: aggregated.totalCostUsd,
    apiCallsCount: params.calls.length,
    formattedDebugLine: aggregated.formattedDebugLine,
  };
}

export async function executeB2BScoutingPipeline(
  rawPrompt: string,
  callbacks?: OrchestratorCallbacks,
  mandatoryParams?: MandatorySearchInput
): Promise<ScoutResponsePayload> {
  const prompt = rawPrompt.trim();
  const hasGeminiKey = Boolean(getGeminiApiKey());
  const hasMapsKey = Boolean(getGoogleMapsApiKey());

  const telemetry = new ZeroTokenTelemetry({
    initialRequestedCount: getDefaultCompaniesCount(),
    hasGeminiKey,
    hasGoogleMapsKey: hasMapsKey,
    onUpdate: (snapshot) => callbacks?.onTraceUpdate?.(snapshot),
  });

  if (!hasGeminiKey) {
    telemetry.setApiStatus(
      "gemini",
      "missing_key",
      "GEMINI_API_KEY non configurata in .env.local."
    );
    throw new Error(
      "Chiave GEMINI_API_KEY mancante in .env.local. Inserisci GEMINI_API_KEY (e GOOGLE_MAPS_API_KEY) in .env.local e riavvia il server per eseguire lo scouting live."
    );
  }

  try {
    // =========================================================================
    // OTTIMIZZAZIONE #3: Accorpamento di Step 0 (Guardrail) e Step 1 (Intent & Discovery)
    // in un'unica chiamata LLM con Search Grounding
    // =========================================================================
    callbacks?.onStage?.(
      "DISCOVERY",
      "Step 0+1/6 — Controllore B2B, validazione 3 parametri obbligatori e Discovery SERP unificata..."
    );

    const guardrailCfg = AGENT_MODEL_ASSIGNMENT.guardrail;
    const step1Cfg = AGENT_MODEL_ASSIGNMENT.intent_discovery;

    const step1Out = await telemetry.traceSubagentStep(
      {
        stepNumber: step1Cfg.stepNumber,
        agentName:
          "Step 0+1 — Unified Guardrail, Mandatory Params & Discovery SERP",
        defaultModel: step1Cfg.resolveModel(),
        inputPayload: { prompt, mandatoryParams: mandatoryParams ?? null },
      },
      () => runStep1IntentDiscovery({ prompt, mandatoryParams })
    );

    // Registra anche lo stato logico dello Step 0 Guardrail (0ms extra, fuso nello Step 1)
    telemetry.recordCustomStep({
      step_number: guardrailCfg.stepNumber,
      agent_name: `${guardrailCfg.agentName} (Accorpato in Step 1 — 0 round-trip extra)`,
      model_used: UNIFIED_GEMINI_MODEL,
      fallback_triggered: false,
      duration_ms: 0,
      input_payload: { mergedIntoStep1: true },
      output_payload: {
        isB2BScoutingRequest: step1Out.isB2BScoutingRequest,
        hasAllMandatoryParams: step1Out.hasAllMandatoryParams,
        missingMandatoryParams: step1Out.missingMandatoryParams,
        guardrailReason: step1Out.guardrailReason,
      },
      status: "success",
    });

    if (
      !step1Out.isB2BScoutingRequest ||
      !step1Out.hasAllMandatoryParams ||
      step1Out.missingMandatoryParams.length > 0
    ) {
      telemetry.setGuardrailPassed(false);
      const skipReason = !step1Out.isB2BScoutingRequest
        ? "Bloccato a monte dallo Step 0+1 (Input fuori contesto B2B Scouting). Zero chiamate downstream."
        : `Bloccato a monte dallo Step 0+1 (Controllore B2B): parametri obbligatori mancanti (${step1Out.missingMandatoryParams.join(", ")}).`;

      for (const stepCfg of DOWNSTREAM_STEPS_AFTER_STEP1) {
        telemetry.recordSkippedStep({
          stepNumber: stepCfg.stepNumber,
          agentName: stepCfg.agentName,
          configuredModel: stepCfg.resolveModel(),
          reason: skipReason,
        });
      }

      return {
        response_type: "text_only",
        text_response:
          step1Out.politeReplyIfBlocked ??
          step1Out.validationErrorMessage ??
          `Per avviare la ricerca devono essere presenti tutti e 3 i parametri obbligatori: Categoria/Settore Azienda, Area Geografica e Dimensione Aziendale. Mancano: ${step1Out.missingMandatoryParams.join(", ")}.`,
        slider_weights: { w_target: 0.5, w_trigger: 0.5 },
        ranked_companies: [],
        debug_trace: telemetry.getSnapshot(),
      };
    }

    telemetry.setGuardrailPassed(true);

    const { constraints, candidates, mergedDuplicates } = step1Out;
    telemetry.setRequestedCount(constraints.requestedCount);

    for (const mergedDup of mergedDuplicates ?? []) {
      telemetry.recordDiscardedCompany(
        mergedDup.ragioneSociale,
        mergedDup.stage,
        mergedDup.reason
      );
    }

    callbacks?.onIntent?.(constraints);

    for (const candidate of candidates) {
      telemetry.recordConsideredCompany(
        candidate.ragioneSociale,
        "Step 1 — Discovery SERP",
        candidate.primaryUrl || undefined
      );
    }

    const wTrigger = clampWeight(constraints.suggestedTriggerWeight);
    const wTarget = Number((1.0 - wTrigger).toFixed(4));

    if (candidates.length === 0) {
      return {
        response_type: "ranking",
        text_response:
          "La ricerca Grounded non ha individuato aziende candidate conformi ai criteri specificati. Prova ad ampliare l'area geografica o il range dimensionale.",
        slider_weights: { w_target: wTarget, w_trigger: wTrigger },
        ranked_companies: [],
        debug_trace: telemetry.getSnapshot(),
      };
    }

    // =========================================================================
    // OTTIMIZZAZIONE #1 & #2:
    // - Esecuzione simultanea di Step 2 (LLM + Cross-check ReportAziende/FatturatoItalia)
    //   e Step 3 (Google Maps Places API) tramite `Promise.allSettled()`.
    // - Pipelining asincrono (`for await...of`) verso Step 4 e Step 5 con streaming
    //   immediato al frontend (`callbacks?.onCompany?.(rankedCompany)`) appena una singola
    //   azienda completa la sua catena!
    // =========================================================================
    callbacks?.onStage?.(
      "GATEKEEPER",
      `Step 2+3/6 — Estrazione Bilanci (ReportAziende + FatturatoItalia) e Verifica Google Maps simultanee con streaming in tempo reale su ${candidates.length} candidate...`
    );

    const step2SystemInstruction = buildStep2SystemInstruction();
    const step4SystemInstruction = buildStep4SystemInstruction();
    const step5SystemInstruction = buildStep5SystemInstruction();

    const maxCap = getMaxCompaniesCap();
    const comparisonPoolCap =
      constraints.candidatePoolTarget ??
      Math.min(maxCap, constraints.requestedCount * 2);

    const step2QualifiedList: VerifiedGatekeeperCompany[] = [];
    const step2DiscardedList: DiscardedCompanyTrace[] = [];
    const step2AllCalls: GeminiCallCostMetrics[] = [];
    let step2MaxDurationMs = 0;
    let step2FallbackTriggered = false;

    const step3QualifiedList: MapsVerifiedCompany[] = [];
    const step3DiscardedList: DiscardedCompanyTrace[] = [];
    const step3PlacesDetails: SingleCompanyMapsVerification[] = [];
    let step3MaxDurationMs = 0;
    let mapsApiStatus: ApiConnectionStatus = hasMapsKey
      ? "connected"
      : "missing_key";
    let mapsWarningMessage: string | undefined;

    const step4EnrichedList: EnrichedCompanyDraft[] = [];
    const step4AllCalls: GeminiCallCostMetrics[] = [];
    let step4MaxDurationMs = 0;
    let step4FallbackTriggered = false;

    const step5ScoreItems: LightweightCompanyScoreItem[] = [];
    const step5AllCalls: GeminiCallCostMetrics[] = [];
    let step5MaxDurationMs = 0;
    let step5FallbackTriggered = false;
    let firstIntroSummary = "";

    const streamedCompaniesBuffer: CompanyResult[] = [];
    const downstreamPipelineTasks: Promise<void>[] = [];
    const seenQualifiedStep23Keys = new Set<string>();
    const STAGE_STEP2 = "Step 2 — Gatekeeper & Parallel Data Extraction";

    const phaseStartMs = performance.now();

    // Generatore asincrono `for await...of`: processa ogni candidata nell'istante stesso
    // in cui i suoi Step 2 e Step 3 paralleli terminano
    for await (const settledPair of streamConcurrentStep2AndStep3(
      candidates,
      constraints,
      step2SystemInstruction
    )) {
      step2AllCalls.push(...settledPair.step2Calls);
      step2MaxDurationMs = Math.max(
        step2MaxDurationMs,
        settledPair.step2DurationMs
      );
      step3MaxDurationMs = Math.max(
        step3MaxDurationMs,
        settledPair.step3DurationMs
      );

      // 1. Raccogli esito Step 3 (Google Maps)
      let mapsVerification: SingleCompanyMapsVerification | undefined;
      if (settledPair.step3Settled.status === "fulfilled") {
        mapsVerification = settledPair.step3Settled.value.verification;
        step3PlacesDetails.push(mapsVerification);
        if (settledPair.step3Settled.value.apiStatus !== "connected") {
          mapsApiStatus = settledPair.step3Settled.value.apiStatus;
        }
        if (
          settledPair.step3Settled.value.warningMessage &&
          !mapsWarningMessage
        ) {
          mapsWarningMessage = settledPair.step3Settled.value.warningMessage;
        }
      }

      // 2. Valuta esito Step 2 (Gatekeeper & Bilanci)
      if (settledPair.step2Settled.status === "rejected") {
        const errMsg =
          settledPair.step2Settled.reason instanceof Error
            ? settledPair.step2Settled.reason.message
            : String(settledPair.step2Settled.reason);
        const disc: DiscardedCompanyTrace = {
          ragioneSociale: settledPair.candidateSeed.ragioneSociale,
          stage: STAGE_STEP2,
          reason: `Analisi isolata fallita senza bloccare lo stream (${errMsg}).`,
        };
        step2DiscardedList.push(disc);
        telemetry.recordDiscardedCompany(
          disc.ragioneSociale,
          disc.stage,
          disc.reason
        );
        continue;
      }

      const step2Outcome = settledPair.step2Settled.value;
      if (step2Outcome.fallbackTriggered) {
        step2FallbackTriggered = true;
      }
      if (step2Outcome.warningMessage) {
        telemetry.addWarning(step2Outcome.warningMessage);
      }

      if (step2Outcome.discardedTrace || !step2Outcome.qualifiedCompany) {
        const disc = step2Outcome.discardedTrace ?? {
          ragioneSociale: step2Outcome.candidateName,
          stage: STAGE_STEP2,
          reason: "Azienda non qualificata dallo Step 2.",
        };
        step2DiscardedList.push(disc);
        telemetry.recordDiscardedCompany(
          disc.ragioneSociale,
          disc.stage,
          disc.reason
        );
        continue;
      }

      const gatekeeperCompany: VerifiedGatekeeperCompany = {
        id: settledPair.candidateId,
        ...step2Outcome.qualifiedCompany,
      };
      step2QualifiedList.push(gatekeeperCompany);
      telemetry.recordConsideredCompany(
        gatekeeperCompany.ragioneSociale,
        `Step 2 — ${gatekeeperCompany.cluster_macro} (${gatekeeperCompany.sub_cluster_specifico})`,
        gatekeeperCompany.sources[0]?.url
      );

      // 3. Unisci immediatamente con il risultato dello Step 3 (Google Maps) già pronto
      const mergedMaps = mergeCandidateWithMapsVerification(
        gatekeeperCompany,
        mapsVerification,
        constraints
      );

      if (mergedMaps.discardedTrace || !mergedMaps.qualifiedCompany) {
        const disc = mergedMaps.discardedTrace!;
        step3DiscardedList.push(disc);
        telemetry.recordDiscardedCompany(
          disc.ragioneSociale,
          disc.stage,
          disc.reason
        );
        continue;
      }

      const mapsVerifiedCompany = mergedMaps.qualifiedCompany;

      // Deduplicazione rapida in streaming su Partita IVA / Ragione Sociale
      const dedupKey =
        mapsVerifiedCompany.partitaIva &&
        mapsVerifiedCompany.partitaIva !== "N.D."
          ? `vat:${mapsVerifiedCompany.partitaIva}`
          : `name:${mapsVerifiedCompany.ragioneSociale.trim().toLowerCase()}`;

      if (seenQualifiedStep23Keys.has(dedupKey)) {
        const dupDisc: DiscardedCompanyTrace = {
          ragioneSociale: mapsVerifiedCompany.ragioneSociale,
          stage: "Step 3 — Google Maps Verification",
          reason: `Duplicato societario (${dedupKey}) già presente nel flusso attivo.`,
        };
        step3DiscardedList.push(dupDisc);
        telemetry.recordDiscardedCompany(
          dupDisc.ragioneSociale,
          dupDisc.stage,
          dupDisc.reason
        );
        continue;
      }

      if (step3QualifiedList.length >= comparisonPoolCap) {
        telemetry.recordDiscardedCompany(
          mapsVerifiedCompany.ragioneSociale,
          "Step 3 — Selezione Cap Pool 2X",
          `Eccedenza rispetto al pool comparativo massimo (${comparisonPoolCap} aziende)`
        );
        continue;
      }

      seenQualifiedStep23Keys.add(dedupKey);
      step3QualifiedList.push(mapsVerifiedCompany);
      telemetry.recordConsideredCompany(
        mapsVerifiedCompany.ragioneSociale,
        `Step 3 — Google Maps (${mapsVerifiedCompany.mapsStatus})`,
        mapsVerifiedCompany.sources[0]?.url
      );

      // 4. PIPELINING ASINCRONO IMMEDIATO: passa subito l'azienda allo Step 4 -> Step 5 -> Stream UI
      // mentre le altre candidate stanno ancora terminando Step 2/3!
      callbacks?.onStage?.(
        "ENRICHING",
        `Pipeline Streaming attiva — Profilazione CXI & Scoring in corso per ${mapsVerifiedCompany.ragioneSociale}...`
      );

      const downstreamTask = (async () => {
        // Step 4 per questa singola azienda
        const t4Start = performance.now();
        const { result: step4Res, calls: s4Calls } =
          await runWithStepUsageCollector<SingleCompanyStep4Result>(() =>
            enrichSingleCompanyStep4(
              mapsVerifiedCompany,
              constraints,
              step4SystemInstruction
            )
          );
        const s4Duration = Math.max(1, Math.round(performance.now() - t4Start));
        step4AllCalls.push(...s4Calls);
        step4MaxDurationMs = Math.max(step4MaxDurationMs, s4Duration);
        if (step4Res.fallbackTriggered) step4FallbackTriggered = true;
        if (step4Res.warningMessage) {
          telemetry.addWarning(step4Res.warningMessage);
        }

        const enrichedDraft = step4Res.enrichedCompany;
        step4EnrichedList.push(enrichedDraft);
        telemetry.recordConsideredCompany(
          enrichedDraft.ragioneSociale,
          `Step 4 — ${enrichedDraft.cxi_primaria_draft.nome_soluzione} + ${enrichedDraft.cxi_secondaria.nome_soluzione}`,
          enrichedDraft.sources[0]?.url
        );

        // Step 5 per questa singola azienda (immediatamente dopo lo Step 4)
        const t5Start = performance.now();
        const { result: step5Res, calls: s5Calls } =
          await runWithStepUsageCollector<SingleCompanyStep5Result>(() =>
            scoreSingleCompanyStep5({
              originalPrompt: prompt,
              constraints,
              company: enrichedDraft,
              systemInstruction: step5SystemInstruction,
            })
          );
        const s5Duration = Math.max(1, Math.round(performance.now() - t5Start));
        step5AllCalls.push(...s5Calls);
        step5MaxDurationMs = Math.max(step5MaxDurationMs, s5Duration);
        if (step5Res.fallbackTriggered) step5FallbackTriggered = true;
        if (!firstIntroSummary && step5Res.introSummary) {
          firstIntroSummary = step5Res.introSummary;
        }
        if (step5Res.scoreItem) {
          step5ScoreItems.push(step5Res.scoreItem);
        }

        // Step 6 (Merge O(1) immediato per la singola azienda e invio istantaneo al frontend!)
        const [singleRanked] = mergeAndComputeFinalRanking(
          [enrichedDraft],
          step5Res.scoreItem ? [step5Res.scoreItem] : [],
          wTrigger
        );

        if (singleRanked) {
          streamedCompaniesBuffer.push(singleRanked);
          // Invia immediatamente al frontend se rientra provvisoriamente nelle top X richieste
          const currentTopIds = new Set(
            [...streamedCompaniesBuffer]
              .sort((a, b) => b.scoreFinal - a.scoreFinal)
              .slice(0, constraints.requestedCount)
              .map((c) => c.id)
          );
          if (currentTopIds.has(singleRanked.id)) {
            callbacks?.onCompany?.(singleRanked);
          }
        }
      })();

      downstreamPipelineTasks.push(downstreamTask);
    }

    // Attende che tutti i task di Step 4/5 lanciati in streaming abbiano terminato
    await Promise.allSettled(downstreamPipelineTasks);

    const totalConcurrentPhaseMs = Math.max(
      1,
      Math.round(performance.now() - phaseStartMs)
    );

    telemetry.setApiStatus("google_maps", mapsApiStatus, mapsWarningMessage);

    // Registra nella telemetria i 4 step (Step 2, Step 3, Step 4, Step 5) con i rispettivi token e costi esatti
    const step2Cfg = AGENT_MODEL_ASSIGNMENT.gatekeeper_extraction;
    telemetry.recordCustomStep({
      step_number: step2Cfg.stepNumber,
      agent_name: `${step2Cfg.agentName} (Simultaneo a Step 3 + Cross-Check Dual Portal)`,
      model_used: UNIFIED_GEMINI_MODEL,
      fallback_triggered: step2FallbackTriggered,
      duration_ms: step2MaxDurationMs || totalConcurrentPhaseMs,
      token_usage: buildTokenUsageSummary({
        stepNumber: step2Cfg.stepNumber,
        stepLabel: step2Cfg.agentName,
        model: UNIFIED_GEMINI_MODEL,
        wallClockDurationMs: step2MaxDurationMs || totalConcurrentPhaseMs,
        calls: step2AllCalls,
      }),
      input_payload: {
        mode: "CONCURRENT_WITH_STEP3_PROMISE_ALL_SETTLED",
        candidatesCount: candidates.length,
      },
      output_payload: {
        qualifiedCount: step2QualifiedList.length,
        discardedCount: step2DiscardedList.length,
        qualified: step2QualifiedList,
      },
      status: "success",
    });

    const step3Cfg = AGENT_MODEL_ASSIGNMENT.maps_verification;
    telemetry.recordCustomStep({
      step_number: step3Cfg.stepNumber,
      agent_name: `${step3Cfg.agentName} (Simultaneo a Step 2)`,
      model_used: GOOGLE_MAPS_PLACES_API_ID,
      fallback_triggered: false,
      duration_ms: step3MaxDurationMs,
      input_payload: {
        mode: "CONCURRENT_WITH_STEP2_PROMISE_ALL_SETTLED",
        endpoint: "https://places.googleapis.com/v1/places:searchText",
        candidatesCount: candidates.length,
      },
      output_payload: {
        mapsApiStatus,
        verifiedCount: step3QualifiedList.length,
        discardedCount: step3DiscardedList.length,
        placesDetails: step3PlacesDetails,
      },
      status: "success",
    });

    if (step3QualifiedList.length === 0) {
      return {
        response_type: "ranking",
        text_response:
          step2QualifiedList.length === 0
            ? "Tutte le aziende candidate sono state scartate per assenza di fonti URL ufficiali verificabili o mancato rispetto dei vincoli obbligatori. Controlla il pannello Developer Debug Trace per i dettagli."
            : "Nessuna azienda è risultata operativa o conforme al vincolo geografico stretto dopo la verifica incrociata su Google Maps Places API. La graduatoria resta libera.",
        slider_weights: { w_target: wTarget, w_trigger: wTrigger },
        ranked_companies: [],
        debug_trace: telemetry.getSnapshot(),
      };
    }

    const step4Cfg = AGENT_MODEL_ASSIGNMENT.enrichment_cxi;
    telemetry.recordCustomStep({
      step_number: step4Cfg.stepNumber,
      agent_name: `${step4Cfg.agentName} (Streaming for-await-of)`,
      model_used: UNIFIED_GEMINI_MODEL,
      fallback_triggered: step4FallbackTriggered,
      duration_ms: step4MaxDurationMs,
      token_usage: buildTokenUsageSummary({
        stepNumber: step4Cfg.stepNumber,
        stepLabel: step4Cfg.agentName,
        model: UNIFIED_GEMINI_MODEL,
        wallClockDurationMs: step4MaxDurationMs,
        calls: step4AllCalls,
      }),
      input_payload: {
        mode: "ASYNC_STREAM_FOR_AWAIT_OF",
        companiesCount: step4EnrichedList.length,
      },
      output_payload: {
        enrichedCount: step4EnrichedList.length,
        companies: step4EnrichedList.map((c) => ({
          companyId: c.id,
          ragioneSociale: c.ragioneSociale,
          cxi_primaria: c.cxi_primaria_draft.nome_soluzione,
          cxi_secondaria: c.cxi_secondaria.nome_soluzione,
        })),
      },
      status: "success",
    });

    const step5Cfg = AGENT_MODEL_ASSIGNMENT.scoring_pitch;
    telemetry.recordCustomStep({
      step_number: step5Cfg.stepNumber,
      agent_name: `${step5Cfg.agentName} (Streaming for-await-of)`,
      model_used: UNIFIED_GEMINI_MODEL,
      fallback_triggered: step5FallbackTriggered,
      duration_ms: step5MaxDurationMs,
      token_usage: buildTokenUsageSummary({
        stepNumber: step5Cfg.stepNumber,
        stepLabel: step5Cfg.agentName,
        model: UNIFIED_GEMINI_MODEL,
        wallClockDurationMs: step5MaxDurationMs,
        calls: step5AllCalls,
      }),
      input_payload: {
        mode: "ASYNC_STREAM_FOR_AWAIT_OF",
        companiesCount: step4EnrichedList.length,
      },
      output_payload: {
        scoredCount: step5ScoreItems.length,
        items: step5ScoreItems,
      },
      status: "success",
    });

    // =========================================================================
    // STEP 6 — Consolidamento Finale, Deduplicazione Multi-Annualità & Cut-off Top X
    // =========================================================================
    const rawRanked = mergeAndComputeFinalRanking(
      step4EnrichedList,
      step5ScoreItems,
      wTrigger
    );

    const finalDedup = deduplicateCompaniesKeepMostRecent(
      rawRanked,
      "Step 6 — Deduplicazione Finale Tabella"
    );
    for (const dup of finalDedup.discardedDuplicates) {
      telemetry.recordDiscardedCompany(
        dup.ragioneSociale,
        dup.stage,
        dup.reason
      );
    }

    const allRanked = finalDedup.deduplicated.sort(
      (a, b) => b.scoreFinal - a.scoreFinal
    );
    const finalRanked = allRanked.slice(0, constraints.requestedCount);

    for (const extraRanked of allRanked.slice(constraints.requestedCount)) {
      telemetry.recordDiscardedCompany(
        extraRanked.ragioneSociale,
        "Step 6 — Ranking Cut-off",
        `Score finale (${extraRanked.scoreFinal.toFixed(1)}) inferiore alle top ${constraints.requestedCount} aziende richieste`
      );
    }

    for (const winner of finalRanked) {
      telemetry.recordConsideredCompany(
        winner.ragioneSociale,
        `Qualificata in Tabella (Score ${winner.scoreFinal.toFixed(1)}/10)`,
        winner.sources[0]?.url
      );
    }

    callbacks?.onStage?.(
      "COMPLETED",
      `Scouting completato: ${finalRanked.length} aziende qualificate e pronte per Dashboard ed Export Excel a 5 Schede.`
    );

    const introSummary =
      firstIntroSummary ||
      sanitizeTextFields(
        `Analisi completata in streaming: qualificate ${finalRanked.length} aziende B2B con dati di bilancio incrociati (ReportAziende + FatturatoItalia), 2 Buyer Personas e doppio matching CXI.`
      );

    return {
      response_type: "ranking",
      text_response: introSummary,
      slider_weights: {
        w_target: wTarget,
        w_trigger: wTrigger,
      },
      ranked_companies: finalRanked,
      debug_trace: telemetry.getSnapshot(),
    };
  } catch (error) {
    telemetry.setApiStatus("gemini", "error");
    throw Object.assign(
      error instanceof Error ? error : new Error(String(error)),
      { debug_trace: telemetry.getSnapshot() }
    );
  } finally {
    await cleanupSessionCaches();
  }
}
