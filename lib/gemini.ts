/**
 * Facade pubblica `lib/gemini.ts` (SAD Capitolo 9) — riesporta il client Gemini Interactions API
 * e i riferimenti di configurazione centralizzati in `lib/agent-config.ts`.
 */

export {
  FAST_MODEL,
  SMART_MODEL,
  AGENT_MODEL_ASSIGNMENT,
  getGeminiApiKey,
} from "@/lib/agent-config";

export {
  callGeminiStructured,
  type GeminiStructuredCallOptions,
  type GeminiStructuredCallResult,
  type GroundingCitation,
} from "@/lib/google-genai-runner";

export {
  TIER_2_PROMPT_TOKEN_THRESHOLD,
  getGeminiPricingConfig,
  extractGeminiUsageMetadata,
  calculateGeminiCallCost,
  formatGeminiDebugLog,
  withGeminiUsageTracker,
  runWithStepUsageCollector,
  aggregateStepCallMetrics,
  type PricingTierLabel,
  type TierRatePerMillion,
  type ModelPricingConfig,
  type NormalizedUsageMetadata,
  type GeminiCallCostMetrics,
} from "@/lib/gemini-usage-tracker";
