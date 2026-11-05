import {
  aggregateStepCallMetrics,
  runWithStepUsageCollector,
} from "@/lib/gemini-usage-tracker";
import type {
  ApiConnectionStatus,
  ConsideredCompanyTrace,
  DebugTrace,
  DiscardedCompanyTrace,
  StepTokenUsageSummary,
  SubagentStepTrace,
} from "@/lib/types";

/**
 * Middleware di Telemetria Sviluppatore "Zero-Token" (Fase 2).
 *
 * VINCOLO ARCHITETTURALE:
 * Non chiede MAI all'LLM di spiegare o rendicontare il proprio processo interno.
 * Cattura esclusivamente lato TypeScript:
 * - Input/Output JSON strutturati di ogni subagente
 * - Latenza esatta in millisecondi (`performance.now()`)
 * - Modello effettivamente utilizzato e attivazione eventuale del fallback Anti-429 (`SMART` -> `FAST`)
 * - Aziende prese in considerazione (`considered_companies`) e aziende scartate (`discarded_companies`)
 */

export interface StepExecutionResult<TOutput> {
  output: TOutput;
  modelUsed: string;
  fallbackTriggered?: boolean;
  warningMessage?: string;
  outputPayloadForTrace?: unknown;
}

export class ZeroTokenTelemetry {
  private guardrailPassed = false;
  private requestedCount: number;
  private apiStatus: {
    gemini: ApiConnectionStatus;
    google_maps: ApiConnectionStatus;
  };
  private apiWarnings: string[] = [];
  private consideredMap = new Map<string, ConsideredCompanyTrace>();
  private discardedList: DiscardedCompanyTrace[] = [];
  private subagentSteps: SubagentStepTrace[] = [];
  private onUpdate?: (snapshot: DebugTrace) => void;

  constructor(options: {
    initialRequestedCount: number;
    hasGeminiKey: boolean;
    hasGoogleMapsKey: boolean;
    onUpdate?: (snapshot: DebugTrace) => void;
  }) {
    this.requestedCount = options.initialRequestedCount;
    this.apiStatus = {
      gemini: options.hasGeminiKey ? "connected" : "missing_key",
      google_maps: options.hasGoogleMapsKey ? "connected" : "missing_key",
    };
    this.onUpdate = options.onUpdate;
  }

  setGuardrailPassed(passed: boolean): void {
    this.guardrailPassed = passed;
    this.emitUpdate();
  }

  setRequestedCount(count: number): void {
    this.requestedCount = count;
    this.emitUpdate();
  }

  setApiStatus(
    service: "gemini" | "google_maps",
    status: ApiConnectionStatus,
    warningMessage?: string
  ): void {
    this.apiStatus[service] = status;
    if (warningMessage && !this.apiWarnings.includes(warningMessage)) {
      this.apiWarnings.push(warningMessage);
    }
    this.emitUpdate();
  }

  addWarning(warningMessage: string): void {
    if (warningMessage && !this.apiWarnings.includes(warningMessage)) {
      this.apiWarnings.push(warningMessage);
      this.emitUpdate();
    }
  }

  recordConsideredCompany(
    ragioneSociale: string,
    stageReached: string,
    url?: string
  ): void {
    const key = ragioneSociale.trim().toLowerCase();
    if (!key) return;
    const existing = this.consideredMap.get(key);
    this.consideredMap.set(key, {
      ragioneSociale: existing?.ragioneSociale ?? ragioneSociale.trim(),
      url: url ?? existing?.url,
      stage_reached: stageReached,
    });
  }

  recordDiscardedCompany(
    ragioneSociale: string,
    stage: string,
    reason: string
  ): void {
    const cleanName = ragioneSociale.trim() || "Azienda senza denominazione";
    this.discardedList.push({
      ragioneSociale: cleanName,
      stage,
      reason,
    });
  }

  recordSkippedStep(params: {
    stepNumber: number;
    agentName: string;
    configuredModel: string;
    reason: string;
  }): void {
    this.subagentSteps.push({
      step_number: params.stepNumber,
      agent_name: params.agentName,
      model_used: params.configuredModel,
      fallback_triggered: false,
      duration_ms: 0,
      input_payload: { skipped: true },
      output_payload: { reason: params.reason },
      status: "skipped",
    });
    this.emitUpdate();
  }

  recordCustomStep(step: SubagentStepTrace): void {
    this.subagentSteps.push(step);
    this.emitUpdate();
  }

  /**
   * Avvolge l'esecuzione di un subagente registrando tempi, payload JSON, modello,
   * conteggio token (`usageMetadata`) e costo dinamico (Tier 1 / Tier 2 > 128k).
   */
  async traceSubagentStep<TOutput>(
    params: {
      stepNumber: number;
      agentName: string;
      defaultModel: string;
      inputPayload: unknown;
    },
    executor: () => Promise<StepExecutionResult<TOutput>>
  ): Promise<TOutput> {
    const startedAt = performance.now();
    try {
      const { result, calls } = await runWithStepUsageCollector(executor);
      const durationMs = Math.max(
        1,
        Math.round(performance.now() - startedAt)
      );

      if (result.warningMessage) {
        this.addWarning(result.warningMessage);
      }

      const aggregatedMetrics = aggregateStepCallMetrics({
        stepNumber: params.stepNumber,
        stepLabel: params.agentName,
        model: result.modelUsed,
        stepWallClockDurationMs: durationMs,
        calls,
      });

      if (aggregatedMetrics && calls.length > 1) {
        console.info(aggregatedMetrics.formattedDebugLine);
      }

      const tokenUsage: StepTokenUsageSummary | undefined = aggregatedMetrics
        ? {
            promptTokenCount: aggregatedMetrics.usageMetadata.promptTokenCount,
            candidatesTokenCount:
              aggregatedMetrics.usageMetadata.candidatesTokenCount,
            cachedContentTokenCount:
              aggregatedMetrics.usageMetadata.cachedContentTokenCount,
            thoughtsTokenCount:
              aggregatedMetrics.usageMetadata.thoughtsTokenCount,
            toolUsePromptTokenCount:
              aggregatedMetrics.usageMetadata.toolUsePromptTokenCount,
            totalTokenCount: aggregatedMetrics.usageMetadata.totalTokenCount,
            tier: aggregatedMetrics.tier,
            totalCostUsd: aggregatedMetrics.totalCostUsd,
            nominalCostUsd: aggregatedMetrics.totalCostUsd,
            inputCostUsd: aggregatedMetrics.inputCostUsd,
            outputCostUsd: aggregatedMetrics.outputCostUsd,
            cachedCostUsd: aggregatedMetrics.cachedCostUsd,
            groundingQueriesCount: aggregatedMetrics.groundingQueriesCount,
            groundingCostUsd: aggregatedMetrics.groundingCostUsd,
            costBreakdown: {
              inputTokensCostUsd: aggregatedMetrics.inputCostUsd,
              outputTokensCostUsd: aggregatedMetrics.outputCostUsd,
              cachedTokensCostUsd: aggregatedMetrics.cachedCostUsd,
              tokensTotalCostUsd: aggregatedMetrics.tokensCostUsd,
              groundingQueriesCount: aggregatedMetrics.groundingQueriesCount,
              groundingCostUsd: aggregatedMetrics.groundingCostUsd,
              billedCostUsd: aggregatedMetrics.totalCostUsd,
              nominalCostUsd: aggregatedMetrics.totalCostUsd,
            },
            apiCallsCount: calls.length,
            formattedDebugLine: aggregatedMetrics.formattedDebugLine,
          }
        : undefined;

      this.subagentSteps.push({
        step_number: params.stepNumber,
        agent_name: params.agentName,
        model_used: result.modelUsed,
        fallback_triggered: Boolean(result.fallbackTriggered),
        duration_ms: durationMs,
        ...(tokenUsage ? { token_usage: tokenUsage } : {}),
        input_payload: params.inputPayload,
        output_payload:
          result.outputPayloadForTrace !== undefined
            ? result.outputPayloadForTrace
            : result.output,
        status: "success",
      });
      this.emitUpdate();
      return result.output;
    } catch (error) {
      const durationMs = Math.max(
        1,
        Math.round(performance.now() - startedAt)
      );
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      this.subagentSteps.push({
        step_number: params.stepNumber,
        agent_name: params.agentName,
        model_used: params.defaultModel,
        fallback_triggered: false,
        duration_ms: durationMs,
        input_payload: params.inputPayload,
        output_payload: { error: errorMessage },
        status: "error",
      });
      this.emitUpdate();
      throw error;
    }
  }

  getSnapshot(): DebugTrace {
    let totalCostUsd = 0;
    let totalNominalCostUsd = 0;
    let mapsCreditSavedUsd = 0;
    let totalGroundingCostUsd = 0;
    let totalTokensCostUsd = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalCachedTokens = 0;

    for (const step of this.subagentSteps) {
      if (step.token_usage) {
        totalCostUsd += step.token_usage.totalCostUsd;
        totalNominalCostUsd +=
          step.token_usage.nominalCostUsd ?? step.token_usage.totalCostUsd;
        mapsCreditSavedUsd += step.token_usage.mapsCreditCoveredUsd ?? 0;
        totalGroundingCostUsd += step.token_usage.groundingCostUsd ?? 0;

        const tokensCost =
          step.token_usage.costBreakdown?.tokensTotalCostUsd ??
          (step.token_usage.inputCostUsd ?? 0) +
            (step.token_usage.outputCostUsd ?? 0) +
            (step.token_usage.cachedCostUsd ?? 0);
        totalTokensCostUsd += tokensCost;

        totalInputTokens += step.token_usage.promptTokenCount;
        totalOutputTokens += step.token_usage.candidatesTokenCount;
        totalCachedTokens += step.token_usage.cachedContentTokenCount;
      }
    }

    return {
      guardrail_passed: this.guardrailPassed,
      requested_count: this.requestedCount,
      total_cost_usd: Number(totalCostUsd.toFixed(6)),
      total_nominal_cost_usd: Number(totalNominalCostUsd.toFixed(6)),
      maps_credit_saved_usd: Number(mapsCreditSavedUsd.toFixed(6)),
      total_grounding_cost_usd: Number(totalGroundingCostUsd.toFixed(6)),
      total_tokens_cost_usd: Number(totalTokensCostUsd.toFixed(6)),
      total_input_tokens: totalInputTokens,
      total_output_tokens: totalOutputTokens,
      total_cached_tokens: totalCachedTokens,
      api_status: { ...this.apiStatus },
      ...(this.apiWarnings.length > 0
        ? { api_warnings: [...this.apiWarnings] }
        : {}),
      considered_companies: Array.from(this.consideredMap.values()),
      discarded_companies: [...this.discardedList],
      subagent_steps: [...this.subagentSteps],
    };
  }

  private emitUpdate(): void {
    if (this.onUpdate) {
      this.onUpdate(this.getSnapshot());
    }
  }
}
