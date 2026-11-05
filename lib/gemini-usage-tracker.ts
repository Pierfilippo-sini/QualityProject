import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Modulo di Monitoraggio Granulare Performance, Token (`usageMetadata`) & Calcolo Dinamico dei Costi Gemini.
 *
 * Architettura implementata:
 * 1. Wrapper/Interceptor per ogni singola chiamata API Gemini (`withGeminiUsageTracker`).
 * 2. Estrazione normalizzata di `usageMetadata` (compatibile sia con `GenerateContentResponse.usageMetadata`
 *    sia con `Interaction.usage` del nuovo SDK `@google/genai`):
 *    - `promptTokenCount`
 *    - `candidatesTokenCount`
 *    - `cachedContentTokenCount`
 *    - `thoughtsTokenCount` / `toolUsePromptTokenCount` / `totalTokenCount`
 * 3. Calcolo Dinamico dei Costi con Configurazione Prezzi (sovrascrivibile da variabili d'ambiente)
 *    e Logica Condizionale Soglia 128k (`promptTokenCount > 128_000` -> `Tier 2`, altrimenti `Tier 1`).
 * 4. Output di Debug formattato su console:
 *    `[DEBUG Agente - Step X] Tempo: 1200ms | Costo: $0.004500 | Input: 1500 (Tier 1) | Output: 450`
 * 5. `AsyncLocalStorage` Collector per aggregare automaticamente tutte le chiamate (anche in parallelo con
 *    `Promise.allSettled`) eseguite all'interno di ciascuno Step dell'orchestratore, esponendo i dati
 *    anche nel pannello UI "Developer Debug Trace".
 */

export const TIER_2_PROMPT_TOKEN_THRESHOLD = 128_000;

/**
 * Prezzo ufficiale di Google Search Grounding per query ($35.00 per 1.000 query = $0.035 USD / query).
 */
export const DEFAULT_SEARCH_GROUNDING_PRICE_PER_QUERY = 0.035;

export function getSearchGroundingPricePerQuery(): number {
  return parseEnvFloat(
    process.env.GEMINI_PRICE_SEARCH_GROUNDING_PER_QUERY,
    DEFAULT_SEARCH_GROUNDING_PRICE_PER_QUERY
  );
}

export type PricingTierLabel = "Tier 1" | "Tier 2";

/**
 * Configurazione prezzi in USD per 1.000.000 di token (1M tokens).
 * Valori configurabili tramite variabili d'ambiente:
 * - `GEMINI_PRICE_INPUT_TIER1_PER_1M` (default: $0.15 / 1M token per serie Flash)
 * - `GEMINI_PRICE_OUTPUT_TIER1_PER_1M` (default: $0.60 / 1M token)
 * - `GEMINI_PRICE_CACHED_TIER1_PER_1M` (default: $0.0375 / 1M token)
 * - `GEMINI_PRICE_INPUT_TIER2_PER_1M` (default: $0.30 / 1M token per prompt > 128k)
 * - `GEMINI_PRICE_OUTPUT_TIER2_PER_1M` (default: $1.20 / 1M token per prompt > 128k)
 * - `GEMINI_PRICE_CACHED_TIER2_PER_1M` (default: $0.075 / 1M token per prompt > 128k)
 */
export interface TierRatePerMillion {
  inputPerMillionUsd: number;
  outputPerMillionUsd: number;
  cachedPerMillionUsd: number;
}

export interface ModelPricingConfig {
  modelPattern: string;
  tierThresholdTokens: number;
  tier1: TierRatePerMillion; // <= 128.000 prompt tokens
  tier2: TierRatePerMillion; // > 128.000 prompt tokens
}

function parseEnvFloat(envValue: string | undefined, fallback: number): number {
  if (!envValue) return fallback;
  const parsed = Number.parseFloat(envValue);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

/**
 * Restituisce la tabella prezzi corrente per il modello specificato,
 * dando priorità a eventuali override definiti nelle variabili d'ambiente.
 */
export function getGeminiPricingConfig(modelId: string): ModelPricingConfig {
  const lower = modelId.toLowerCase();
  const isProTier = lower.includes("pro") || lower.includes("ultra");
  const isLiteTier = lower.includes("lite");

  // Default basati sul listino Google Gemini API (USD per 1M token)
  const defaultTier1: TierRatePerMillion = isProTier
    ? {
        inputPerMillionUsd: 1.25,
        outputPerMillionUsd: 5.0,
        cachedPerMillionUsd: 0.3125,
      }
    : isLiteTier
      ? {
          inputPerMillionUsd: 0.075,
          outputPerMillionUsd: 0.3,
          cachedPerMillionUsd: 0.01875,
        }
      : {
          // Default per gemini-3.8-flash / flash series
          inputPerMillionUsd: 0.15,
          outputPerMillionUsd: 0.6,
          cachedPerMillionUsd: 0.0375,
        };

  const defaultTier2: TierRatePerMillion = isProTier
    ? {
        inputPerMillionUsd: 2.5,
        outputPerMillionUsd: 10.0,
        cachedPerMillionUsd: 0.625,
      }
    : isLiteTier
      ? {
          inputPerMillionUsd: 0.15,
          outputPerMillionUsd: 0.6,
          cachedPerMillionUsd: 0.0375,
        }
      : {
          // Default Tier 2 (> 128k token) per gemini-3.8-flash / flash series
          inputPerMillionUsd: 0.3,
          outputPerMillionUsd: 1.2,
          cachedPerMillionUsd: 0.075,
        };

  return {
    modelPattern: modelId,
    tierThresholdTokens: parseEnvFloat(
      process.env.GEMINI_TIER2_THRESHOLD_TOKENS,
      TIER_2_PROMPT_TOKEN_THRESHOLD
    ),
    tier1: {
      inputPerMillionUsd: parseEnvFloat(
        process.env.GEMINI_PRICE_INPUT_TIER1_PER_1M,
        defaultTier1.inputPerMillionUsd
      ),
      outputPerMillionUsd: parseEnvFloat(
        process.env.GEMINI_PRICE_OUTPUT_TIER1_PER_1M,
        defaultTier1.outputPerMillionUsd
      ),
      cachedPerMillionUsd: parseEnvFloat(
        process.env.GEMINI_PRICE_CACHED_TIER1_PER_1M,
        defaultTier1.cachedPerMillionUsd
      ),
    },
    tier2: {
      inputPerMillionUsd: parseEnvFloat(
        process.env.GEMINI_PRICE_INPUT_TIER2_PER_1M,
        defaultTier2.inputPerMillionUsd
      ),
      outputPerMillionUsd: parseEnvFloat(
        process.env.GEMINI_PRICE_OUTPUT_TIER2_PER_1M,
        defaultTier2.outputPerMillionUsd
      ),
      cachedPerMillionUsd: parseEnvFloat(
        process.env.GEMINI_PRICE_CACHED_TIER2_PER_1M,
        defaultTier2.cachedPerMillionUsd
      ),
    },
  };
}

/**
 * Struttura normalizzata dell'oggetto `usageMetadata` estratto dalla risposta Gemini.
 */
export interface NormalizedUsageMetadata {
  promptTokenCount: number;
  candidatesTokenCount: number;
  cachedContentTokenCount: number;
  thoughtsTokenCount: number;
  toolUsePromptTokenCount: number;
  totalTokenCount: number;
}

/**
 * Risultato completo del calcolo costi e performance di una singola chiamata o di uno step aggregato.
 */
export interface GeminiCallCostMetrics {
  stepLabel: string;
  stepNumber?: number;
  model: string;
  durationMs: number;
  usageMetadata: NormalizedUsageMetadata;
  tier: PricingTierLabel;
  inputNonCachedTokens: number;
  inputCostUsd: number;
  cachedCostUsd: number;
  outputCostUsd: number;
  tokensCostUsd: number;
  groundingQueriesCount: number;
  groundingCostUsd: number;
  totalCostUsd: number;
  formattedDebugLine: string;
}

function toSafeInt(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.round(value)
    : 0;
}

/**
 * Estrae il numero di query Google Search Grounding eseguite dalla risposta di Gemini:
 * - Supporta `interaction.steps` (`step.type === "google_search_call"`) del client `@google/genai`.
 * - Supporta `groundingMetadata.webSearchQueries` dello standard `generateContent`.
 */
export function extractGroundingSearchQueriesCount(rawResponse: unknown): number {
  if (!rawResponse || typeof rawResponse !== "object") {
    return 0;
  }

  const root = rawResponse as Record<string, unknown>;
  let totalQueries = 0;

  // 1. Interactions API format: root.steps
  const steps = root.steps as unknown[] | undefined;
  if (Array.isArray(steps)) {
    for (const step of steps) {
      if (!step || typeof step !== "object") continue;
      const stepRecord = step as Record<string, unknown>;
      if (
        stepRecord.type === "google_search_call" ||
        stepRecord.type === "search_call"
      ) {
        const args = (stepRecord.arguments ?? stepRecord.args) as
          | Record<string, unknown>
          | undefined;
        if (Array.isArray(args?.queries)) {
          totalQueries += args.queries.length;
        } else if (typeof args?.query === "string" && args.query.trim()) {
          totalQueries += 1;
        } else {
          totalQueries += 1;
        }
      }
    }
  }

  // 2. Classic generateContent format o nested response
  const responseObj =
    (root.response as Record<string, unknown> | undefined) ?? root;
  const candidates = responseObj.candidates as unknown[] | undefined;
  const firstCandidate =
    Array.isArray(candidates) &&
    candidates[0] &&
    typeof candidates[0] === "object"
      ? (candidates[0] as Record<string, unknown>)
      : undefined;

  const groundingMeta =
    (firstCandidate?.groundingMetadata as Record<string, unknown> | undefined) ??
    (firstCandidate?.grounding_metadata as Record<string, unknown> | undefined) ??
    (responseObj.groundingMetadata as Record<string, unknown> | undefined) ??
    (responseObj.grounding_metadata as Record<string, unknown> | undefined);

  if (groundingMeta) {
    const webSearchQueries =
      (groundingMeta.webSearchQueries as unknown[] | undefined) ??
      (groundingMeta.web_search_queries as unknown[] | undefined);
    if (Array.isArray(webSearchQueries)) {
      totalQueries = Math.max(totalQueries, webSearchQueries.length);
    }
  }

  return totalQueries;
}

/**
 * Estrae `usageMetadata` in modo universale dalla risposta dell'API Gemini:
 * - Supporta `response.usageMetadata` (`promptTokenCount`, `candidatesTokenCount`, `cachedContentTokenCount`)
 *   dello standard `generateContent`.
 * - Supporta `interaction.usage` (`total_input_tokens`, `total_output_tokens`, `total_cached_tokens`)
 *   dello standard `client.interactions.create`.
 */
export function extractGeminiUsageMetadata(
  rawResponse: unknown
): NormalizedUsageMetadata {
  if (!rawResponse || typeof rawResponse !== "object") {
    return {
      promptTokenCount: 0,
      candidatesTokenCount: 0,
      cachedContentTokenCount: 0,
      thoughtsTokenCount: 0,
      toolUsePromptTokenCount: 0,
      totalTokenCount: 0,
    };
  }

  const root = rawResponse as Record<string, unknown>;

  // 1. Cerca `usageMetadata` (formato classico generateContent o annidato in response)
  const usageMetaObj =
    (root.usageMetadata as Record<string, unknown> | undefined) ??
    ((root.response as Record<string, unknown> | undefined)?.usageMetadata as
      | Record<string, unknown>
      | undefined);

  // 2. Cerca `usage` (formato Interactions API `@google/genai`)
  const interactionUsageObj = root.usage as Record<string, unknown> | undefined;

  const promptTokenCount = toSafeInt(
    usageMetaObj?.promptTokenCount ??
      usageMetaObj?.prompt_token_count ??
      interactionUsageObj?.total_input_tokens ??
      interactionUsageObj?.initial_input_tokens
  );

  const candidatesTokenCount = toSafeInt(
    usageMetaObj?.candidatesTokenCount ??
      usageMetaObj?.candidates_token_count ??
      interactionUsageObj?.total_output_tokens
  );

  const cachedContentTokenCount = toSafeInt(
    usageMetaObj?.cachedContentTokenCount ??
      usageMetaObj?.cached_content_token_count ??
      interactionUsageObj?.total_cached_tokens
  );

  const thoughtsTokenCount = toSafeInt(
    usageMetaObj?.thoughtsTokenCount ??
      usageMetaObj?.thoughts_token_count ??
      interactionUsageObj?.total_thought_tokens
  );

  const toolUsePromptTokenCount = toSafeInt(
    usageMetaObj?.toolUsePromptTokenCount ??
      usageMetaObj?.tool_use_prompt_token_count ??
      interactionUsageObj?.total_tool_use_tokens
  );

  const rawTotal = toSafeInt(
    usageMetaObj?.totalTokenCount ??
      usageMetaObj?.total_token_count ??
      interactionUsageObj?.total_tokens
  );

  const totalTokenCount =
    rawTotal > 0
      ? rawTotal
      : promptTokenCount +
        candidatesTokenCount +
        thoughtsTokenCount +
        toolUsePromptTokenCount;

  return {
    promptTokenCount,
    candidatesTokenCount,
    cachedContentTokenCount,
    thoughtsTokenCount,
    toolUsePromptTokenCount,
    totalTokenCount,
  };
}

/**
 * Calcola il costo esatto in USD applicando la logica condizionale della soglia 128k:
 * - Se `promptTokenCount > 128.000`, applica la fascia di prezzo superiore (`Tier 2`).
 * - Altrimenti applica la fascia base (`Tier 1`).
 * - Se sono presenti token in cache (`cachedContentTokenCount`), li scorpora dai token di input standard
 *   applicando la tariffa ridotta `cachedPerMillionUsd`.
 */
export function calculateGeminiCallCost(params: {
  stepLabel: string;
  stepNumber?: number;
  model: string;
  durationMs: number;
  usageMetadata: NormalizedUsageMetadata;
  groundingQueriesCount?: number;
}): GeminiCallCostMetrics {
  const { stepLabel, stepNumber, model, durationMs, usageMetadata } = params;
  const pricing = getGeminiPricingConfig(model);

  const isTier2 =
    usageMetadata.promptTokenCount > pricing.tierThresholdTokens;
  const tier: PricingTierLabel = isTier2 ? "Tier 2" : "Tier 1";
  const activeRates = isTier2 ? pricing.tier2 : pricing.tier1;

  // Nei metadati Gemini, `promptTokenCount` include anche `cachedContentTokenCount`.
  // Scorporiamo la quota cached per non addebitarla due volte al prezzo pieno di input.
  const boundedCachedTokens = Math.min(
    usageMetadata.cachedContentTokenCount,
    usageMetadata.promptTokenCount
  );
  const inputNonCachedTokens = Math.max(
    0,
    usageMetadata.promptTokenCount - boundedCachedTokens
  );

  // Include eventuali token di tool-use nell'input e thoughts nell'output come da fatturazione Gemini
  const billableInputTokens =
    inputNonCachedTokens + usageMetadata.toolUsePromptTokenCount;
  const billableOutputTokens =
    usageMetadata.candidatesTokenCount + usageMetadata.thoughtsTokenCount;

  const inputCostUsd =
    (billableInputTokens / 1_000_000) * activeRates.inputPerMillionUsd;
  const cachedCostUsd =
    (boundedCachedTokens / 1_000_000) * activeRates.cachedPerMillionUsd;
  const outputCostUsd =
    (billableOutputTokens / 1_000_000) * activeRates.outputPerMillionUsd;

  const tokensCostUsd = inputCostUsd + cachedCostUsd + outputCostUsd;

  const groundingQueriesCount = Math.max(0, params.groundingQueriesCount ?? 0);
  const groundingPricePerQuery = getSearchGroundingPricePerQuery();
  const groundingCostUsd = groundingQueriesCount * groundingPricePerQuery;

  const totalCostUsd = tokensCostUsd + groundingCostUsd;

  const formattedDebugLine = formatGeminiDebugLog({
    stepLabel,
    stepNumber,
    durationMs,
    totalCostUsd,
    promptTokenCount: usageMetadata.promptTokenCount,
    candidatesTokenCount: usageMetadata.candidatesTokenCount,
    cachedContentTokenCount: usageMetadata.cachedContentTokenCount,
    tier,
    groundingQueriesCount,
    groundingCostUsd,
  });

  return {
    stepLabel,
    stepNumber,
    model,
    durationMs,
    usageMetadata,
    tier,
    inputNonCachedTokens,
    inputCostUsd,
    cachedCostUsd,
    outputCostUsd,
    tokensCostUsd,
    groundingQueriesCount,
    groundingCostUsd,
    totalCostUsd,
    formattedDebugLine,
  };
}

/**
 * Formatta la stringa di debug leggibile per la console:
 * Es: `[DEBUG Agente - Step 2] Tempo: 1200ms | Costo: $0.004500 | Input: 1500 (Tier 1) | Output: 450`
 * (Se sono presenti query di Search Grounding o token in cache, include i relativi dettagli).
 */
export function formatGeminiDebugLog(params: {
  stepLabel: string;
  stepNumber?: number;
  durationMs: number;
  totalCostUsd: number;
  promptTokenCount: number;
  candidatesTokenCount: number;
  cachedContentTokenCount?: number;
  tier: PricingTierLabel;
  groundingQueriesCount?: number;
  groundingCostUsd?: number;
}): string {
  const stepHeader =
    typeof params.stepNumber === "number"
      ? `Step ${params.stepNumber} (${params.stepLabel})`
      : params.stepLabel;

  const cachedSuffix =
    params.cachedContentTokenCount && params.cachedContentTokenCount > 0
      ? ` | Cached: ${params.cachedContentTokenCount}`
      : "";

  const groundingSuffix =
    params.groundingQueriesCount && params.groundingQueriesCount > 0
      ? ` (incluso Grounding: ${params.groundingQueriesCount} query $${(params.groundingCostUsd ?? 0).toFixed(6)})`
      : "";

  return `[DEBUG Agente - ${stepHeader}] Tempo: ${Math.round(params.durationMs)}ms | Costo: $${params.totalCostUsd.toFixed(6)}${groundingSuffix} | Input: ${params.promptTokenCount} (${params.tier}) | Output: ${params.candidatesTokenCount}${cachedSuffix}`;
}

/**
 * Contesto AsyncLocalStorage per raccogliere automaticamente tutte le chiamate Gemini
 * eseguite all'interno di uno Step dell'orchestratore (incluse le chiamate in parallelo `Promise.allSettled`).
 */
const stepMetricsStorage = new AsyncLocalStorage<GeminiCallCostMetrics[]>();

export async function runWithStepUsageCollector<T>(
  fn: () => Promise<T>
): Promise<{ result: T; calls: GeminiCallCostMetrics[] }> {
  const calls: GeminiCallCostMetrics[] = [];
  const result = await stepMetricsStorage.run(calls, fn);
  return { result, calls };
}

/**
 * Aggrega una lista di metriche di chiamate API (es. 10 chiamate parallele nello Step 2 o Step 4)
 * in un unico riepilogo di Step per la telemetria e la console.
 */
export function aggregateStepCallMetrics(params: {
  stepNumber: number;
  stepLabel: string;
  model: string;
  stepWallClockDurationMs: number;
  calls: GeminiCallCostMetrics[];
}): GeminiCallCostMetrics | null {
  const { stepNumber, stepLabel, model, stepWallClockDurationMs, calls } =
    params;
  if (calls.length === 0) return null;

  const aggregatedUsage: NormalizedUsageMetadata = {
    promptTokenCount: 0,
    candidatesTokenCount: 0,
    cachedContentTokenCount: 0,
    thoughtsTokenCount: 0,
    toolUsePromptTokenCount: 0,
    totalTokenCount: 0,
  };

  let inputNonCachedTokens = 0;
  let inputCostUsd = 0;
  let cachedCostUsd = 0;
  let outputCostUsd = 0;
  let tokensCostUsd = 0;
  let groundingQueriesCount = 0;
  let groundingCostUsd = 0;
  let totalCostUsd = 0;
  let hasAnyTier2 = false;

  for (const call of calls) {
    aggregatedUsage.promptTokenCount += call.usageMetadata.promptTokenCount;
    aggregatedUsage.candidatesTokenCount +=
      call.usageMetadata.candidatesTokenCount;
    aggregatedUsage.cachedContentTokenCount +=
      call.usageMetadata.cachedContentTokenCount;
    aggregatedUsage.thoughtsTokenCount += call.usageMetadata.thoughtsTokenCount;
    aggregatedUsage.toolUsePromptTokenCount +=
      call.usageMetadata.toolUsePromptTokenCount;
    aggregatedUsage.totalTokenCount += call.usageMetadata.totalTokenCount;

    inputNonCachedTokens += call.inputNonCachedTokens;
    inputCostUsd += call.inputCostUsd;
    cachedCostUsd += call.cachedCostUsd;
    outputCostUsd += call.outputCostUsd;
    tokensCostUsd += call.tokensCostUsd ?? (call.inputCostUsd + call.cachedCostUsd + call.outputCostUsd);
    groundingQueriesCount += call.groundingQueriesCount ?? 0;
    groundingCostUsd += call.groundingCostUsd ?? 0;
    totalCostUsd += call.totalCostUsd;
    if (call.tier === "Tier 2") {
      hasAnyTier2 = true;
    }
  }

  const pricing = getGeminiPricingConfig(model);
  const tier: PricingTierLabel =
    hasAnyTier2 ||
    aggregatedUsage.promptTokenCount > pricing.tierThresholdTokens
      ? "Tier 2"
      : "Tier 1";

  const formattedDebugLine = formatGeminiDebugLog({
    stepLabel:
      calls.length > 1
        ? `${stepLabel} • ${calls.length} chiamate API`
        : stepLabel,
    stepNumber,
    durationMs: stepWallClockDurationMs,
    totalCostUsd,
    promptTokenCount: aggregatedUsage.promptTokenCount,
    candidatesTokenCount: aggregatedUsage.candidatesTokenCount,
    cachedContentTokenCount: aggregatedUsage.cachedContentTokenCount,
    tier,
    groundingQueriesCount,
    groundingCostUsd,
  });

  return {
    stepLabel,
    stepNumber,
    model,
    durationMs: stepWallClockDurationMs,
    usageMetadata: aggregatedUsage,
    tier,
    inputNonCachedTokens,
    inputCostUsd,
    cachedCostUsd,
    outputCostUsd,
    tokensCostUsd,
    groundingQueriesCount,
    groundingCostUsd,
    totalCostUsd,
    formattedDebugLine,
  };
}

/**
 * Wrapper/Interceptor ad ordine superiore che avvolge una singola chiamata all'API di Gemini:
 * 1. Misura il tempo di esecuzione esatto in millisecondi (`performance.now()`).
 * 2. Estrae `usageMetadata` (`promptTokenCount`, `candidatesTokenCount`, `cachedContentTokenCount`).
 * 3. Estrae il numero di query Google Search Grounding eseguite e ne calcola il costo ($0.035/query).
 * 4. Calcola il costo dinamico in USD con la soglia dei 128.000 token (Tier 1 vs Tier 2).
 * 5. Stampa immediatamente la riga di debug nella console server/terminale e la registra nel collector dello Step.
 */
export async function withGeminiUsageTracker<TResponse>(
  options: {
    stepLabel: string;
    stepNumber?: number;
    model: string;
    silentConsole?: boolean;
  },
  apiCall: () => Promise<TResponse>
): Promise<{
  response: TResponse;
  metrics: GeminiCallCostMetrics;
}> {
  const startMs = performance.now();
  const response = await apiCall();
  const durationMs = Math.max(1, Math.round(performance.now() - startMs));

  const usageMetadata = extractGeminiUsageMetadata(response);
  const groundingQueriesCount = extractGroundingSearchQueriesCount(response);
  const metrics = calculateGeminiCallCost({
    stepLabel: options.stepLabel,
    stepNumber: options.stepNumber,
    model: options.model,
    durationMs,
    usageMetadata,
    groundingQueriesCount,
  });

  // Registra automaticamente la metrica nello step corrente se attivo un AsyncLocalStorage collector
  const activeCollector = stepMetricsStorage.getStore();
  if (activeCollector) {
    activeCollector.push(metrics);
  }

  if (!options.silentConsole) {
    console.info(metrics.formattedDebugLine);
  }

  return { response, metrics };
}
