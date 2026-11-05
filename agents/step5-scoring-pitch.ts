import { UNIFIED_GEMINI_MODEL } from "@/lib/agent-config";
import { callGeminiStructured } from "@/lib/gemini";
import { sanitizeTextFields } from "@/lib/html-cleaner";
import {
  matchScoreItemForCompany,
  type EnrichedCompanyDraft,
  type LightweightCompanyScoreItem,
} from "@/lib/scoring";
import type { StepExecutionResult } from "@/lib/telemetry";
import type { ParsedSearchConstraints } from "@/lib/types";

/**
 * Step 5 — Lightweight Scoring, Company Description & Gancio Mail CXI Principale (`gemini-3.8-flash`).
 *
 * ARCHITETTURA ANTI-FALLBACK 7.0 & ANTI-TRONCAMENTO:
 * 1. Esecuzione suddivisa in micro-batch paralleli (2-3 aziende per chiamata usando `Promise.allSettled()`)
 *    invece di un unico grande blocco da 10+ aziende, evitando omissioni di elementi o troncamento token.
 * 2. Matching robusto tramite `matchScoreItemForCompany` usando sia l'`id` esatto sia il fallback sul nome azienda normalizzato.
 * 3. Retry Mirato: se dopo il primo passaggio un'azienda risulta ancora priva di punteggio (`!scored`),
 *    esegue automaticamente una singola chiamata di recupero specifica per le sole aziende mancanti.
 * 4. `maxOutputTokens: 8192` e post-processing `sanitizeTextFields` per frasi complete chiuse con punto fermo (`.`).
 */

export interface Step5ScoringInput {
  originalPrompt: string;
  constraints: ParsedSearchConstraints;
  companies: EnrichedCompanyDraft[];
}

export interface Step5ScoringOutput {
  introSummary: string;
  items: LightweightCompanyScoreItem[];
}

interface RawStep5Response {
  introSummary: string;
  items: LightweightCompanyScoreItem[];
}

const STEP5_MICRO_BATCH_SIZE = 3;

const STEP5_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    introSummary: {
      type: "string",
      description:
        "Breve messaggio introduttivo professionale in italiano (2 frasi complete terminate con punto fermo) che sintetizza la clusterizzazione, il ranking e le soluzioni CXI (principali e secondarie) individuate.",
    },
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          companyId: {
            type: "string",
            description: "ID esatto dell'azienda nel micro-batch (es. cmp_1).",
          },
          ragioneSociale: {
            type: "string",
            description: "Ragione sociale esatta dell'azienda corrispondente a companyId.",
          },
          scoreTarget: {
            type: "number",
            description:
              "Fit Target da 1.0 a 10.0: aderenza a Categoria/Settore, Area Geografica e Dimensione Aziendale richiesti.",
          },
          scoreTrigger: {
            type: "number",
            description:
              "Potenza Trigger da 0.0 a 10.0: urgenza, rilevanza strategica e bisogno concreto legato al trigger_fatto per la nostra proposta CXI.",
          },
          companyDescription: {
            type: "string",
            description:
              "Breve descrizione contestualizzata dell'azienda (posizionamento, scala clienti/operativa e peculiarità in 2-3 frasi complete che terminano con punto fermo).",
          },
          explainability: {
            type: "string",
            description:
              "Spiegazione trasparente del perché l'azienda ha ottenuto quei valori di Fit Target e Potenza Trigger (1-2 frasi complete che terminano con punto fermo).",
          },
          gancio_mail: {
            type: "string",
            description:
              "Bozza di mail / pitch commerciale completa in italiano (Oggetto + Corpo di 4-6 frasi complete chiuse con punto fermo) scritta ESCLUSIVAMENTE per la Soluzione CXI Principale (cxi_primaria), agganciata al trigger_fatto e rivolta alla Figura Professionale #1.",
          },
        },
        required: [
          "companyId",
          "ragioneSociale",
          "scoreTarget",
          "scoreTrigger",
          "companyDescription",
          "explainability",
          "gancio_mail",
        ],
      },
    },
  },
  required: ["introSummary", "items"],
};

function chunkCompanies<T>(items: T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    chunks.push(items.slice(i, i + chunkSize));
  }
  return chunks;
}

function buildCompactProfiles(companies: EnrichedCompanyDraft[]) {
  return companies.map((c) => ({
    companyId: c.id,
    ragioneSociale: c.ragioneSociale,
    sede: `${c.sedeCitta} (${c.sedeRegione})`,
    cluster_macro: c.cluster_macro,
    sub_cluster_specifico: c.sub_cluster_specifico,
    bacinoClientiODimensione: c.bacinoClientiODimensione,
    altriDatiChiave: c.altriDatiChiave,
    cosaSapere: c.cosaSapere,
    fatturatoEUR: c.fatturatoValore,
    fatturatoAnno: c.fatturatoAnno,
    dipendenti: c.dipendenti,
    cxi_primaria: c.cxi_primaria_draft,
    cxi_secondaria: c.cxi_secondaria,
    buyer_persona_1: {
      ruolo_e_nome: c.buyer_personas[0].ruolo_e_nome,
      cosa_gli_interessa: c.buyer_personas[0].cosa_gli_interessa,
    },
    buyer_persona_2: {
      ruolo_e_nome: c.buyer_personas[1].ruolo_e_nome,
    },
  }));
}

function sanitizeScoreItem(
  item: LightweightCompanyScoreItem,
  canonicalId: string,
  canonicalName: string
): LightweightCompanyScoreItem {
  return {
    companyId: canonicalId,
    ragioneSociale: canonicalName,
    scoreTarget: item.scoreTarget,
    scoreTrigger: item.scoreTrigger,
    companyDescription: sanitizeTextFields(item.companyDescription),
    explainability: sanitizeTextFields(item.explainability),
    gancio_mail: sanitizeTextFields(item.gancio_mail),
  };
}

export function buildStep5SystemInstruction(): string {
  return `Sei il Senior B2B Sales Strategist CXI (Step 5 — Scoring & Primary CXI Email Generator) alimentato da ${UNIFIED_GEMINI_MODEL}.
Ricevi un micro-batch di aziende già verificate con ID univoco (\`companyId\`) e \`ragioneSociale\`.
DEVI restituire ESCLUSIVAMENTE l'oggetto JSON compatto (\`introSummary\` + \`items\`) assicurandoti che OGNI SINGOLA AZIENDA del micro-batch sia presente nell'array \`items\` con il suo esatto \`companyId\` e \`ragioneSociale\`.

CRITERI DI SCORING E REDAZIONE GANCIO MAIL:
1. \`scoreTarget\` (Fit Target, 1.0 - 10.0): valuta quanto l'azienda rispecchia Categoria/Settore, Area Geografica e Dimensione Aziendale richiesti dall'utente, premiando anche l'accessibilità decisionale e la scala operativa congruente. Usa punteggi differenziati e precisi al decimale (es. 9.4, 8.7, 8.2) evitando valori piatti.
2. \`scoreTrigger\` (Potenza Trigger, 0.0 - 10.0): valuta l'intensità del cambiamento/bisogno visibile (\`cxi_primaria.trigger_fatto\`) e la pertinenza per i servizi CXI. NON applicare qui il malus Buyer Persona (viene calcolato dal motore matematico TypeScript nello Step 6 con max -0.5 pt).
3. \`companyDescription\`: 2-3 frasi chiare su posizionamento, bacino clienti/scala e tratti distintivi dell'azienda.
4. \`gancio_mail\`: scrivi la bozza completa di email commerciale (con riga \`Oggetto: ...\` + corpo professionale di 4-6 frasi) dedicata **ESCLUSIVAMENTE alla Soluzione CXI Principale (\`cxi_primaria\`)**, facendo riferimento concreto al \`trigger_fatto\` e a \`servizio_personalizzato_1_riga\`, indirizzata a \`buyer_persona_1.ruolo_e_nome\`. NON mescolare la soluzione secondaria nella mail.
5. REGOLA TASSATIVA ANTI-TRONCAMENTO: Ogni campo testuale deve essere costituito da frasi complete, sintetiche e ben concluse che terminano sempre con un punto fermo (.). È severamente vietato troncare le frasi o usare i punti di sospensione (...).`;
}

export interface SingleCompanyStep5Result {
  scoreItem: LightweightCompanyScoreItem | undefined;
  introSummary: string;
  modelUsed: string;
  fallbackTriggered: boolean;
}

/**
 * Calcola punteggio (`scoreTarget`, `scoreTrigger`), descrizione e gancio mail per una singola azienda
 * non appena termina lo Step 4 nel flusso a stream (`for await...of`), con retry automatico mirato.
 */
export async function scoreSingleCompanyStep5(params: {
  originalPrompt: string;
  constraints: ParsedSearchConstraints;
  company: EnrichedCompanyDraft;
  systemInstruction?: string;
}): Promise<SingleCompanyStep5Result> {
  const sysInstruction =
    params.systemInstruction ?? buildStep5SystemInstruction();
  const compactProfiles = buildCompactProfiles([params.company]);
  const promptText = `Prompt originale dell'Account Manager:
"""
${params.originalPrompt}
"""

Parametri obbligatori validati:
- Settore: ${params.constraints.settore ?? "N.D."}
- Area Geografica: ${params.constraints.areaGeograficaRaw ?? "N.D."}
- Dimensione Aziendale: ${params.constraints.dimensioneAziendale ?? "N.D."}

Azienda singola in streaming da valutare (DEVI restituire esattamente 1 elemento in \`items\` con \`companyId="${params.company.id}"\`):
${JSON.stringify(compactProfiles, null, 2)}`;

  let anyFallbackTriggered = false;
  let modelUsed: string = UNIFIED_GEMINI_MODEL;
  let introSummary = "";

  const firstAttempt = await callGeminiStructured<RawStep5Response>({
    stepKey: "scoring_pitch",
    systemInstruction: sysInstruction,
    userPrompt: promptText,
    jsonSchema: STEP5_SCHEMA,
    maxOutputTokens: 8192,
  }).catch(() => null);

  if (firstAttempt) {
    modelUsed = firstAttempt.modelUsed;
    if (firstAttempt.fallbackTriggered) anyFallbackTriggered = true;
    if (firstAttempt.data?.introSummary?.trim()) {
      introSummary = sanitizeTextFields(firstAttempt.data.introSummary);
    }
    const items = Array.isArray(firstAttempt.data?.items)
      ? firstAttempt.data.items
      : [];
    const matched =
      matchScoreItemForCompany(params.company, items) ?? items[0];
    if (
      matched &&
      typeof matched.scoreTarget === "number" &&
      Number.isFinite(matched.scoreTarget) &&
      typeof matched.scoreTrigger === "number" &&
      Number.isFinite(matched.scoreTrigger)
    ) {
      return {
        scoreItem: sanitizeScoreItem(
          matched,
          params.company.id,
          params.company.ragioneSociale
        ),
        introSummary,
        modelUsed,
        fallbackTriggered: anyFallbackTriggered,
      };
    }
  }

  // Retry mirato automatico se il primo tentativo non ha prodotto score validi
  const retryAttempt = await callGeminiStructured<RawStep5Response>({
    stepKey: "scoring_pitch",
    systemInstruction: sysInstruction,
    userPrompt: `${promptText}\n\nRETRY MIRATO: restituisci obbligatoriamente scoreTarget e scoreTrigger numerici per companyId="${params.company.id}".`,
    jsonSchema: STEP5_SCHEMA,
    maxOutputTokens: 8192,
  }).catch(() => null);

  if (retryAttempt) {
    modelUsed = retryAttempt.modelUsed;
    if (retryAttempt.fallbackTriggered) anyFallbackTriggered = true;
    if (!introSummary && retryAttempt.data?.introSummary?.trim()) {
      introSummary = sanitizeTextFields(retryAttempt.data.introSummary);
    }
    const items = Array.isArray(retryAttempt.data?.items)
      ? retryAttempt.data.items
      : [];
    const matched =
      matchScoreItemForCompany(params.company, items) ?? items[0];
    if (
      matched &&
      typeof matched.scoreTarget === "number" &&
      Number.isFinite(matched.scoreTarget) &&
      typeof matched.scoreTrigger === "number" &&
      Number.isFinite(matched.scoreTrigger)
    ) {
      return {
        scoreItem: sanitizeScoreItem(
          matched,
          params.company.id,
          params.company.ragioneSociale
        ),
        introSummary,
        modelUsed,
        fallbackTriggered: anyFallbackTriggered,
      };
    }
  }

  return {
    scoreItem: undefined,
    introSummary,
    modelUsed,
    fallbackTriggered: anyFallbackTriggered,
  };
}

export async function runStep5ScoringPitch(
  input: Step5ScoringInput
): Promise<StepExecutionResult<Step5ScoringOutput>> {
  if (input.companies.length === 0) {
    return {
      output: {
        introSummary:
          "Nessuna azienda ha superato contemporaneamente i controlli sulle fonti ufficiali e i vincoli obbligatori impostati.",
        items: [],
      },
      modelUsed: "skipped (0 companies)",
      fallbackTriggered: false,
    };
  }

  const systemInstruction = buildStep5SystemInstruction();

  const buildBatchPrompt = (
    batchCompanies: EnrichedCompanyDraft[],
    batchLabel: string
  ) => {
    const compactProfiles = buildCompactProfiles(batchCompanies);
    return `Prompt originale dell'Account Manager:
"""
${input.originalPrompt}
"""

Parametri obbligatori validati:
- Settore: ${input.constraints.settore ?? "N.D."}
- Area Geografica: ${input.constraints.areaGeograficaRaw ?? "N.D."}
- Dimensione Aziendale: ${input.constraints.dimensioneAziendale ?? "N.D."}

Micro-batch (${batchLabel}) da valutare — ${compactProfiles.length} aziende (DEVI restituire esattamente ${compactProfiles.length} elementi in \`items\`, uno per ciascun \`companyId\`):
${JSON.stringify(compactProfiles, null, 2)}`;
  };

  // 1. Suddivisione in micro-batch paralleli (2-3 aziende per chiamata con Promise.allSettled)
  const microBatches = chunkCompanies(input.companies, STEP5_MICRO_BATCH_SIZE);

  const settledBatches = await Promise.allSettled(
    microBatches.map((batch, idx) =>
      callGeminiStructured<RawStep5Response>({
        stepKey: "scoring_pitch",
        systemInstruction,
        userPrompt: buildBatchPrompt(
          batch,
          `Batch ${idx + 1}/${microBatches.length}`
        ),
        jsonSchema: STEP5_SCHEMA,
        maxOutputTokens: 8192,
      })
    )
  );

  const collectedRawItems: LightweightCompanyScoreItem[] = [];
  let firstIntroSummary = "";
  let anyFallbackTriggered = false;
  let modelUsed: string = UNIFIED_GEMINI_MODEL;

  for (const res of settledBatches) {
    if (res.status === "fulfilled") {
      modelUsed = res.value.modelUsed;
      if (res.value.fallbackTriggered) {
        anyFallbackTriggered = true;
      }
      if (!firstIntroSummary && res.value.data?.introSummary?.trim()) {
        firstIntroSummary = sanitizeTextFields(res.value.data.introSummary);
      }
      if (Array.isArray(res.value.data?.items)) {
        collectedRawItems.push(...res.value.data.items);
      }
    }
  }

  // 2. Primo passaggio di matching (ID esatto + fallback su nome azienda normalizzato)
  const matchedById = new Map<string, LightweightCompanyScoreItem>();
  const missingCompanies: EnrichedCompanyDraft[] = [];

  for (const company of input.companies) {
    const matched = matchScoreItemForCompany(company, collectedRawItems);
    if (
      matched &&
      typeof matched.scoreTarget === "number" &&
      Number.isFinite(matched.scoreTarget) &&
      typeof matched.scoreTrigger === "number" &&
      Number.isFinite(matched.scoreTrigger)
    ) {
      matchedById.set(
        company.id,
        sanitizeScoreItem(matched, company.id, company.ragioneSociale)
      );
    } else {
      missingCompanies.push(company);
    }
  }

  // 3. RETRY MIRATO: se dopo il primo passaggio una o più aziende risultano prive di punteggio (!scored),
  // esegue automaticamente una chiamata di recupero specifica per le sole aziende mancanti.
  if (missingCompanies.length > 0) {
    const retryBatches = chunkCompanies(
      missingCompanies,
      STEP5_MICRO_BATCH_SIZE
    );
    const settledRetries = await Promise.allSettled(
      retryBatches.map((retryBatch, rIdx) =>
        callGeminiStructured<RawStep5Response>({
          stepKey: "scoring_pitch",
          systemInstruction,
          userPrompt: buildBatchPrompt(
            retryBatch,
            `Retry Mirato ${rIdx + 1}/${retryBatches.length} per aziende mancanti`
          ),
          jsonSchema: STEP5_SCHEMA,
          maxOutputTokens: 8192,
        })
      )
    );

    const retryItems: LightweightCompanyScoreItem[] = [];
    for (const rRes of settledRetries) {
      if (rRes.status === "fulfilled") {
        if (rRes.value.fallbackTriggered) {
          anyFallbackTriggered = true;
        }
        if (!firstIntroSummary && rRes.value.data?.introSummary?.trim()) {
          firstIntroSummary = sanitizeTextFields(rRes.value.data.introSummary);
        }
        if (Array.isArray(rRes.value.data?.items)) {
          retryItems.push(...rRes.value.data.items);
        }
      }
    }

    for (const missingComp of missingCompanies) {
      const recovered = matchScoreItemForCompany(missingComp, retryItems);
      if (
        recovered &&
        typeof recovered.scoreTarget === "number" &&
        Number.isFinite(recovered.scoreTarget) &&
        typeof recovered.scoreTrigger === "number" &&
        Number.isFinite(recovered.scoreTrigger)
      ) {
        matchedById.set(
          missingComp.id,
          sanitizeScoreItem(
            recovered,
            missingComp.id,
            missingComp.ragioneSociale
          )
        );
      }
    }
  }

  const finalItems: LightweightCompanyScoreItem[] = input.companies
    .map((c) => matchedById.get(c.id))
    .filter((item): item is LightweightCompanyScoreItem => Boolean(item));

  return {
    output: {
      introSummary:
        firstIntroSummary ||
        sanitizeTextFields(
          `Analisi completata: qualificate ${input.companies.length} aziende B2B con clusterizzazione GICS, 2 Buyer Personas e doppio matching CXI.`
        ),
      items: finalItems,
    },
    modelUsed,
    fallbackTriggered: anyFallbackTriggered,
  };
}
