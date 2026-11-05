/**
 * Modello Dati Stateless & JSON Contract (Refactoring Architetturale B2B CXI).
 * Nessun database: contratto condiviso tra Gemini (`gemini-3.8-flash`), Google Maps Places API,
 * Route Handler SSE, Telemetria Zero-Token, Dashboard UI e Export Excel a 5 Schede.
 */

export type CXIPackage =
  | "CONSULTING"
  | "DIGITAL"
  | "OPERATIONS"
  | "ESG"
  | "NONE";

/**
 * Tassonomia chiusa basata su standard GICS / ATECO B2B (12 macro-categorie)
 * per evitare categorie duplicate o incoerenti tra i sub-agenti in parallelo.
 */
export const CLUSTER_MACRO_OPTIONS = [
  "Manifatturiero & Meccanica Industriale",
  "IT, Software & Digital Services",
  "Banking, Finanza & Assicurazioni",
  "Retail, E-commerce & GDO",
  "Energy, Utilities & Ambiente",
  "Healthcare, Pharma & Life Sciences",
  "Automotive, Aerospazio & Mobility",
  "Agroalimentare & Food & Beverage",
  "Logistica, Trasporti & Supply Chain",
  "Telco, Media & Entertainment",
  "Costruzioni, Real Estate & Infrastrutture",
  "Servizi Professionali & Consulenza B2B",
] as const;

export type ClusterMacro = (typeof CLUSTER_MACRO_OPTIONS)[number];

/**
 * Tipi di fonte verificata (rimosso qualsiasi riferimento o scraping LinkedIn).
 */
export type SourceType =
  | "FINANCIAL"
  | "NEWS"
  | "INSTITUTIONAL"
  | "GOOGLE_MAPS";

export interface Source {
  title: string;
  url: string;
  sourceType: SourceType;
}

export type MapsOperationalStatus = "OPERATIONAL" | "CLOSED" | "UNVERIFIED";

/**
 * Figura professionale target (2 per azienda: es. decisore di business/budget + sponsor operativo/tecnico).
 */
export interface BuyerPersonaProfile {
  ruolo_e_nome: string;
  livello_decisionale: string;
  cosa_gli_interessa: string;
  primo_messaggio_utile: string;
}

/**
 * Soluzione CXI Principale (con trigger, sintesi servizio 1 riga e bozza mail completa).
 */
export interface CXIPrimarySolution {
  pacchetto: CXIPackage;
  nome_soluzione: string;
  trigger_fatto: string;
  trigger_data: string | null;
  servizio_personalizzato_1_riga: string;
  gancio_mail: string;
}

/**
 * Soluzione CXI Secondaria complementare/alternativa (con trigger e sintesi servizio 1 riga).
 */
export interface CXISecondarySolution {
  pacchetto: CXIPackage;
  nome_soluzione: string;
  trigger_fatto: string;
  servizio_personalizzato_1_riga: string;
}

/**
 * Componenti complete dello score esposte nel JSON per Dashboard e Scheda 2 Excel.
 */
export interface ScoreBreakdown {
  score_target: number; // Fit Target [1.0, 10.0]
  score_trigger: number; // Potenza Trigger [0.0, 10.0]
  peso_target: number; // W_target [0.0, 1.0]
  peso_trigger: number; // W_trigger [0.0, 1.0]
  contributo_target: number; // W_target * score_target
  contributo_trigger: number; // W_trigger * score_trigger
  malus_buyer_persona: number; // [0.0, 0.5] (max 0.5 pt se ruoli parziali/generici)
  motivo_malus: string | null;
  score_totale: number; // Score Finale [1.0, 10.0]
}

/**
 * Parametri obbligatori richiesti dal form UI e validati dallo Step 1.
 */
export interface MandatorySearchInput {
  categoriaSettore: string;
  areaGeografica: string;
  dimensioneAziendale: string;
  noteStrategiche?: string;
}

export interface CompanyResult {
  id: string;
  // Dati Identificativi & Descrizione
  ragioneSociale: string;
  partitaIva?: string | "N.D.";
  companyDescription: string;
  cosaSapere: string; // Sintesi informazioni chiave per Scheda 3 Excel & Drawer
  altriDatiChiave: string; // Dati chiave sintetici per Scheda 1 Excel ("Output - New names")
  bacinoClientiODimensione: string; // Clienti serviti o metrica dimensionale per Scheda 1 Excel
  sedeCitta: string;
  sedeRegione: string;
  indirizzoVerificatoMaps?: string | "N.D.";
  mapsStatus?: MapsOperationalStatus;
  mapsRating?: number | null;
  mapsCoordinates?: { latitude: number; longitude: number } | null;
  mapsPhone?: string | null;
  mapsWebsiteUri?: string | null;
  atecoCodice: string | "N.D.";

  // Clusterizzazione Standardizzata GICS/ATECO B2B
  cluster_macro: ClusterMacro;
  sub_cluster_specifico: string;

  // Metriche Target Numeriche
  fatturatoValore: number | null;
  fatturatoAnno: number | null;
  dipendenti: number | null;

  // Doppio Matching Soluzioni CXI (Principale + Secondaria)
  cxi_primaria: CXIPrimarySolution;
  cxi_secondaria: CXISecondarySolution;

  // Campi di compatibilità rapida derivati da cxi_primaria
  cxiPackage: CXIPackage;
  triggerSummary: string;
  triggerDate: string | null;
  salesPitchText: string;

  // 2 Figure Professionali Distinte per Azienda (Senza LinkedIn)
  buyer_personas: [BuyerPersonaProfile, BuyerPersonaProfile];

  // Valutazioni Numeriche & Breakdown Completo (Malus max 0.5)
  scoreTarget: number;
  scoreTrigger: number;
  malusApplied: number; // Max 0.5 se dati ruoli parziali/generici, altrimenti 0
  scoreFinal: number;
  score_breakdown: ScoreBreakdown;
  explainability: string;

  // Fonti Grounding Verificate (Obbligatorie)
  sources: Source[];
}

export type ApiConnectionStatus = "connected" | "missing_key" | "error";

export interface ConsideredCompanyTrace {
  ragioneSociale: string;
  url?: string;
  stage_reached: string;
}

export interface DiscardedCompanyTrace {
  ragioneSociale: string;
  stage: string;
  reason: string;
}

export interface StepCostBreakdown {
  inputTokensCostUsd: number;
  outputTokensCostUsd: number;
  cachedTokensCostUsd: number;
  tokensTotalCostUsd: number;
  groundingQueriesCount?: number;
  groundingCostUsd?: number;
  mapsCallsCount?: number;
  mapsNominalCostUsd?: number;
  mapsCreditCoveredUsd?: number;
  billedCostUsd: number;
  nominalCostUsd: number;
}

export interface StepTokenUsageSummary {
  promptTokenCount: number;
  candidatesTokenCount: number;
  cachedContentTokenCount: number;
  thoughtsTokenCount?: number;
  toolUsePromptTokenCount?: number;
  totalTokenCount: number;
  tier: "Tier 1" | "Tier 2";
  totalCostUsd: number; // Costo effettivo addebitato (Google Maps escluso perché coperto da 300€ di credito gratuito)
  nominalCostUsd?: number; // Costo nominale completo (incluso Maps e Grounding)
  inputCostUsd?: number;
  outputCostUsd?: number;
  cachedCostUsd?: number;
  groundingQueriesCount?: number;
  groundingCostUsd?: number;
  mapsCallsCount?: number;
  mapsNominalCostUsd?: number;
  mapsCreditCoveredUsd?: number;
  costBreakdown?: StepCostBreakdown;
  apiCallsCount: number;
  formattedDebugLine: string;
}

export interface SubagentStepTrace {
  step_number: number;
  agent_name: string;
  model_used: string;
  fallback_triggered: boolean;
  duration_ms: number;
  token_usage?: StepTokenUsageSummary;
  input_payload: unknown;
  output_payload: unknown;
  status: "success" | "skipped" | "error";
}

export interface DebugTrace {
  guardrail_passed: boolean;
  requested_count: number;
  total_cost_usd?: number; // Costo effettivo addebitato (escluso Maps coperto da credito gratuito)
  total_nominal_cost_usd?: number; // Costo nominale totale
  maps_credit_saved_usd?: number; // Risparmio Maps coperto da credito gratuito 300€
  total_grounding_cost_usd?: number; // Costo totale query Google Search Grounding ($0.035 / query)
  total_tokens_cost_usd?: number; // Costo totale token Gemini
  total_input_tokens?: number;
  total_output_tokens?: number;
  total_cached_tokens?: number;
  api_status: {
    gemini: ApiConnectionStatus;
    google_maps: ApiConnectionStatus;
  };
  api_warnings?: string[];
  considered_companies: ConsideredCompanyTrace[];
  discarded_companies: DiscardedCompanyTrace[];
  subagent_steps: SubagentStepTrace[];
}

export interface ScoutResponsePayload {
  response_type: "text_only" | "ranking";
  text_response: string;
  slider_weights: { w_target: number; w_trigger: number };
  ranked_companies: CompanyResult[];
  debug_trace: DebugTrace;
}

export interface ParsedSearchConstraints {
  settore: string | null;
  atecoCodice: string | null;
  dimensioneAziendale: string | null; // Es. "PMI", "Mid-Cap", "Grandi Imprese", "Aziende Quotate", "Startup", "50-250 dipendenti", "500.000+ clienti"
  areaGeograficaRaw?: string | null;
  fatturatoMin: number | null;
  fatturatoMax: number | null;
  dipendentiMin: number | null;
  dipendentiMax: number | null;
  macroArea: string | null;
  regioni: string[];
  province?: string[];
  cittaTarget?: string[];
  excludedCompanies?: string[];
  specificCompanyNames?: string[];
  missingMandatoryParams?: string[];
  requestedCount: number;
  candidatePoolTarget?: number;
  suggestedTriggerWeight: number; // [0.0, 1.0]
  keywords: string[];
}

export type StreamStage =
  | "IDLE"
  | "GUARDRAIL"
  | "PARSING"
  | "DISCOVERY"
  | "GATEKEEPER"
  | "MAPS_VERIFICATION"
  | "ENRICHING"
  | "SCORING"
  | "COMPLETED"
  | "ERROR";

export type ScoutStreamEvent =
  | {
      type: "stage";
      stage: StreamStage;
      message: string;
    }
  | {
      type: "intent";
      constraints: ParsedSearchConstraints;
    }
  | {
      type: "company";
      company: CompanyResult;
    }
  | {
      type: "trace";
      debug_trace: DebugTrace;
    }
  | {
      type: "result";
      payload: ScoutResponsePayload;
    }
  | {
      type: "done";
      totalQualified: number;
    }
  | {
      type: "error";
      message: string;
      debug_trace?: DebugTrace;
    };
