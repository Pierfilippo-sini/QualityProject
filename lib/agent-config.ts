/**
 * Configurazione Centralizzata API, Routing Modelli e Limiti Operativi.
 *
 * Tutti i sub-agenti e l'orchestratore sono inizializzati per utilizzare
 * esclusivamente il modello `gemini-3.8-flash`.
 */

export const UNIFIED_GEMINI_MODEL = "gemini-3.8-flash" as const;

export const DEFAULT_GUARDRAIL_MODEL = UNIFIED_GEMINI_MODEL;
export const DEFAULT_FAST_MODEL = UNIFIED_GEMINI_MODEL;
export const DEFAULT_FAST_FALLBACK_MODEL = UNIFIED_GEMINI_MODEL;
export const DEFAULT_SMART_MODEL = UNIFIED_GEMINI_MODEL;

export const GOOGLE_MAPS_PLACES_API_ID = "GOOGLE_MAPS_PLACES_API" as const;
export const GOOGLE_MAPS_TEXT_SEARCH_ENDPOINT =
  "https://places.googleapis.com/v1/places:searchText";
export const GOOGLE_MAPS_SOLUTION_ID = "gmp_git_agentskills_v1";

/**
 * Restituisce sempre `gemini-3.8-flash` per garantire che l'intero workflow agentico
 * operi esclusivamente con il modello richiesto.
 */
export function normalizeGeminiModelId(
  rawModel?: string | undefined,
  tier?: "fast" | "smart"
): string {
  void rawModel;
  void tier;
  return UNIFIED_GEMINI_MODEL;
}

export function getGuardrailModel(): string {
  return UNIFIED_GEMINI_MODEL;
}

export function getFastModel(): string {
  return UNIFIED_GEMINI_MODEL;
}

export function getFastFallbackModel(): string {
  return UNIFIED_GEMINI_MODEL;
}

export function getSmartModel(): string {
  return UNIFIED_GEMINI_MODEL;
}

export const GUARDRAIL_MODEL = UNIFIED_GEMINI_MODEL;
export const FAST_MODEL = UNIFIED_GEMINI_MODEL;
export const FAST_FALLBACK_MODEL = UNIFIED_GEMINI_MODEL;
export const SMART_MODEL = UNIFIED_GEMINI_MODEL;

export type AgentStepKey =
  | "guardrail"
  | "intent_discovery"
  | "gatekeeper_extraction"
  | "maps_verification"
  | "enrichment_cxi"
  | "scoring_pitch";

export interface AgentStepRoutingConfig {
  stepNumber: number;
  agentName: string;
  tier: "FAST_MODEL" | "SMART_MODEL" | "GOOGLE_MAPS_PLACES_API";
  useSearchGrounding: boolean;
  allowFallbackToFast: boolean;
  resolveModel: () => string;
}

/**
 * Mappa di Routing Centralizzata (`AGENT_MODEL_ASSIGNMENT`):
 * Tutti i sub-agenti LLM utilizzano esclusivamente `gemini-3.8-flash`.
 */
export const AGENT_MODEL_ASSIGNMENT: Record<
  AgentStepKey,
  AgentStepRoutingConfig
> = {
  guardrail: {
    stepNumber: 0,
    agentName: "Step 0 — Input Guardrail (B2B Scope Classifier)",
    tier: "FAST_MODEL",
    useSearchGrounding: false,
    allowFallbackToFast: false,
    resolveModel: () => UNIFIED_GEMINI_MODEL,
  },
  intent_discovery: {
    stepNumber: 1,
    agentName: "Step 1 — Intent Parser, Mandatory Check & Discovery SERP",
    tier: "FAST_MODEL",
    useSearchGrounding: true,
    allowFallbackToFast: false,
    resolveModel: () => UNIFIED_GEMINI_MODEL,
  },
  gatekeeper_extraction: {
    stepNumber: 2,
    agentName: "Step 2 — Parallel Data Extraction & GICS Clustering",
    tier: "FAST_MODEL",
    useSearchGrounding: false,
    allowFallbackToFast: false,
    resolveModel: () => UNIFIED_GEMINI_MODEL,
  },
  maps_verification: {
    stepNumber: 3,
    agentName: "Step 3 — Google Maps Verification (Places API New)",
    tier: "GOOGLE_MAPS_PLACES_API",
    useSearchGrounding: false,
    allowFallbackToFast: false,
    resolveModel: () => GOOGLE_MAPS_PLACES_API_ID,
  },
  enrichment_cxi: {
    stepNumber: 4,
    agentName: "Step 4 — Dual CXI Matching & 2 Buyer Personas (No LinkedIn)",
    tier: "FAST_MODEL",
    useSearchGrounding: false,
    allowFallbackToFast: false,
    resolveModel: () => UNIFIED_GEMINI_MODEL,
  },
  scoring_pitch: {
    stepNumber: 5,
    agentName: "Step 5 — Scoring Breakdown & Primary CXI Email Hook",
    tier: "SMART_MODEL",
    useSearchGrounding: false,
    allowFallbackToFast: false,
    resolveModel: () => UNIFIED_GEMINI_MODEL,
  },
} as const;

export function getGeminiApiKey(): string | null {
  const key = process.env.GEMINI_API_KEY?.trim();
  return key && key.length > 0 ? key : null;
}

export function getGoogleMapsApiKey(): string | null {
  const key = process.env.GOOGLE_MAPS_API_KEY?.trim();
  return key && key.length > 0 ? key : null;
}

export function getDefaultCompaniesCount(): number {
  const parsed = Number.parseInt(
    process.env.DEFAULT_COMPANIES_COUNT ?? "5",
    10
  );
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 5;
}

export function getMaxCompaniesCap(): number {
  const parsed = Number.parseInt(process.env.MAX_COMPANIES_CAP ?? "20", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 20;
}

export function clampRequestedCompaniesCount(
  requested: number | null | undefined
): number {
  const defaultCount = getDefaultCompaniesCount();
  const maxCap = getMaxCompaniesCap();
  if (
    requested === null ||
    requested === undefined ||
    !Number.isFinite(requested) ||
    requested <= 0
  ) {
    return Math.min(defaultCount, maxCap);
  }
  return Math.max(1, Math.min(maxCap, Math.round(requested)));
}
