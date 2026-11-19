import {
  areSameCompanyBrandEntities,
  normalizeCompanyBrandKey,
} from "@/lib/company-dedup-and-geo";
import { resolveCXISolutionName } from "@/lib/cxiMatrix";
import { sanitizeTextFields } from "@/lib/html-cleaner";
import type {
  BuyerPersonaProfile,
  ClusterMacro,
  CompanyResult,
  CXIPackage,
  CXIPrimarySolution,
  CXISecondarySolution,
  MapsOperationalStatus,
  ScoreBreakdown,
  Source,
} from "@/lib/types";

/**
 * Motore Matematico di Scoring, Merge O(n) "ID + Score Only" & Slider Dinamico.
 *
 * Formula aggiornata:
 * S_raw = (W_target * S_target) + (W_trigger * S_trigger) - M_persona
 * dove M_persona in [0.0, 0.5] (max 0.5 pt applicato solo se ruoli target parziali o generici).
 * scoreFinal = max(1.0, min(10.0, round(S_raw, 1)))
 */

export const MAX_PERSONA_MALUS = 0.5;
export const PARTIAL_PERSONA_MALUS = 0.25;
export const MIN_SCORE = 1.0;
export const MAX_SCORE = 10.0;

const GENERIC_ROLE_ONLY_TERMS = new Set([
  "n.d.",
  "nd",
  "n/a",
  "non disponibile",
  "non reperibile",
  "direzione",
  "direzione aziendale",
  "direzione generale",
  "management",
  "referente",
  "referente aziendale",
  "responsabile",
  "ufficio",
  "segreteria",
  "amministrazione",
]);

export function clampWeight(weight: number): number {
  if (!Number.isFinite(weight)) return 0.5;
  return Math.max(0, Math.min(1, weight));
}

export function clampSubScore(
  score: number,
  minBound: number,
  maxBound: number
): number {
  if (!Number.isFinite(score)) return minBound;
  const rounded = Math.round(score * 10) / 10;
  return Math.max(minBound, Math.min(maxBound, rounded));
}

/**
 * Verifica se una singola Buyer Persona ha un ruolo professionale specifico (non generico)
 * e tutti i campi strategici compilati.
 */
export function isSingleBuyerPersonaComplete(
  persona: BuyerPersonaProfile | undefined | null
): boolean {
  if (!persona) return false;

  const roleNorm = persona.ruolo_e_nome?.trim().toLowerCase() ?? "";
  if (roleNorm.length < 4 || GENERIC_ROLE_ONLY_TERMS.has(roleNorm)) {
    return false;
  }

  const hasValidDetail = (field: string | undefined) => {
    const val = field?.trim() ?? "";
    return (
      val.length >= 10 &&
      val.toUpperCase() !== "N.D." &&
      val.toUpperCase() !== "ND" &&
      val.toUpperCase() !== "NON DISPONIBILE"
    );
  };

  return (
    hasValidDetail(persona.livello_decisionale) &&
    hasValidDetail(persona.cosa_gli_interessa) &&
    hasValidDetail(persona.primo_messaggio_utile)
  );
}

/**
 * Valuta le 2 figure professionali dell'azienda e calcola il Malus Buyer Persona (max 0.5 pt):
 * - 0.0 pt se entrambe le 2 figure sono distinte, specifiche e complete.
 * - 0.25 pt se 1 figura è specifica/completa e l'altra è parziale, generica o duplicata.
 * - 0.50 pt se entrambe le figure sono parziali, generiche o assenti.
 */
export function evaluateBuyerPersonasMalus(
  personas: readonly BuyerPersonaProfile[] | undefined | null
): { malus: number; motivo: string | null } {
  if (!Array.isArray(personas) || personas.length === 0) {
    return {
      malus: MAX_PERSONA_MALUS,
      motivo: "Ruoli target assenti (-0.50 pt)",
    };
  }

  const p1 = personas[0];
  const p2 = personas[1];
  const p1Ok = isSingleBuyerPersonaComplete(p1);
  const p2Ok = isSingleBuyerPersonaComplete(p2);

  const areDistinct =
    Boolean(p1 && p2) &&
    p1.ruolo_e_nome.trim().toLowerCase() !==
      p2.ruolo_e_nome.trim().toLowerCase();

  if (p1Ok && p2Ok && areDistinct) {
    return { malus: 0.0, motivo: null };
  }

  if (p1Ok || p2Ok) {
    return {
      malus: PARTIAL_PERSONA_MALUS,
      motivo: !areDistinct
        ? "Ruoli target non distinti tra le 2 figure (-0.25 pt)"
        : "Dati parziali o generici su 1 delle 2 Buyer Personas (-0.25 pt)",
    };
  }

  return {
    malus: MAX_PERSONA_MALUS,
    motivo: "Dati sui ruoli target parziali o generici (-0.50 pt)",
  };
}

export function isBuyerPersonaIdentified(
  company: Pick<CompanyResult, "buyer_personas">
): boolean {
  const { malus } = evaluateBuyerPersonasMalus(company.buyer_personas);
  return malus < MAX_PERSONA_MALUS;
}

export interface ScoreComputationInput {
  scoreTarget: number;
  scoreTrigger: number;
  triggerWeight: number; // W_trigger in [0.0, 1.0]
  malusApplied?: number;
  motivoMalus?: string | null;
}

export interface ScoreComputationResult {
  targetWeight: number;
  triggerWeight: number;
  malusApplied: number;
  rawScore: number;
  scoreFinal: number;
  breakdown: ScoreBreakdown;
}

export function computeWeightedScore({
  scoreTarget,
  scoreTrigger,
  triggerWeight,
  malusApplied = 0,
  motivoMalus = null,
}: ScoreComputationInput): ScoreComputationResult {
  const wTrigger = clampWeight(triggerWeight);
  const wTarget = Number((1.0 - wTrigger).toFixed(4));
  const safeTarget = clampSubScore(scoreTarget, 1.0, 10.0);
  const safeTrigger = clampSubScore(scoreTrigger, 0.0, 10.0);
  const safeMalus = Math.max(
    0,
    Math.min(MAX_PERSONA_MALUS, Math.round(malusApplied * 100) / 100)
  );

  const contributoTarget = Math.round(wTarget * safeTarget * 100) / 100;
  const contributoTrigger = Math.round(wTrigger * safeTrigger * 100) / 100;
  const rawScore = contributoTarget + contributoTrigger - safeMalus;
  const rounded = Math.round(rawScore * 10) / 10;
  const scoreFinal = Math.max(MIN_SCORE, Math.min(MAX_SCORE, rounded));

  const breakdown: ScoreBreakdown = {
    score_target: safeTarget,
    score_trigger: safeTrigger,
    peso_target: wTarget,
    peso_trigger: wTrigger,
    contributo_target: contributoTarget,
    contributo_trigger: contributoTrigger,
    malus_buyer_persona: safeMalus,
    motivo_malus: safeMalus > 0 ? motivoMalus : null,
    score_totale: scoreFinal,
  };

  return {
    targetWeight: wTarget,
    triggerWeight: wTrigger,
    malusApplied: safeMalus,
    rawScore: Math.round(rawScore * 100) / 100,
    scoreFinal,
    breakdown,
  };
}

export function buildExplainabilityText(
  company: Pick<
    CompanyResult,
    "scoreTarget" | "scoreTrigger" | "malusApplied" | "score_breakdown"
  >,
  triggerWeight: number
): string {
  const { targetWeight, scoreFinal, malusApplied } = computeWeightedScore({
    scoreTarget: company.scoreTarget,
    scoreTrigger: company.scoreTrigger,
    triggerWeight,
    malusApplied: company.malusApplied,
    motivoMalus: company.score_breakdown?.motivo_malus ?? null,
  });

  const targetPct = Math.round(targetWeight * 100);
  const triggerPct = Math.round(clampWeight(triggerWeight) * 100);
  const malusNote =
    malusApplied > 0
      ? ` con malus Buyer Persona -${malusApplied.toFixed(2)} pt (max -0.50)`
      : " con 2 Buyer Personas complete (malus 0)";

  return `Score Totale ${scoreFinal.toFixed(1)}/10 = ${targetPct}% Fit Target (${company.scoreTarget.toFixed(1)}) + ${triggerPct}% Potenza Trigger (${company.scoreTrigger.toFixed(1)})${malusNote}.`;
}

/**
 * Profilo aziendale arricchito (output combinato degli Step 2, 3 e 4) prima dello Step 5/6.
 */
export interface EnrichedCompanyDraft {
  id: string;
  ragioneSociale: string;
  partitaIva?: string | "N.D.";
  sedeCitta: string;
  sedeRegione: string;
  indirizzoVerificatoMaps: string | "N.D.";
  mapsStatus: MapsOperationalStatus;
  mapsRating: number | null;
  mapsCoordinates?: { latitude: number; longitude: number } | null;
  mapsPhone?: string | null;
  mapsWebsiteUri?: string | null;
  logoUrl?: string | null;
  atecoCodice: string | "N.D.";
  cluster_macro: ClusterMacro;
  sub_cluster_specifico: string;
  bacinoClientiODimensione: string;
  altriDatiChiave: string;
  cosaSapere: string;
  fatturatoValore: number | null;
  fatturatoAnno: number | null;
  dipendenti: number | null;
  cxi_primaria_draft: Omit<CXIPrimarySolution, "gancio_mail">;
  cxi_secondaria: CXISecondarySolution;
  buyer_personas: [BuyerPersonaProfile, BuyerPersonaProfile];
  sources: Source[];
}

/**
 * Payload ultraleggero "ID + Score Only" restituito dallo Step 5 (`gemini-3.8-flash`).
 */
export interface LightweightCompanyScoreItem {
  companyId: string;
  ragioneSociale?: string;
  scoreTarget: number;
  scoreTrigger: number;
  companyDescription: string;
  explainability: string;
  gancio_mail: string;
}

/**
 * Ricerca un elemento di `scoreItems` corrispondente all'azienda `draft` usando:
 * 1. Matching su `companyId` esatto o normalizzato (es. "cmp_1", "1", "cmp-1").
 * 2. Fallback sul nome azienda normalizzato (`normalizeCompanyBrandKey` + `areSameCompanyBrandEntities`).
 */
export function matchScoreItemForCompany(
  draft: Pick<EnrichedCompanyDraft, "id" | "ragioneSociale">,
  scoreItems: LightweightCompanyScoreItem[]
): LightweightCompanyScoreItem | undefined {
  const targetIdNorm = draft.id.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  const targetNumMatch = draft.id.match(/(\d+)/);
  const targetNum = targetNumMatch ? targetNumMatch[1] : null;
  const draftBrand = normalizeCompanyBrandKey(draft.ragioneSociale);

  // 1. Match esatto su companyId
  for (const item of scoreItems) {
    if (!item) continue;
    if (item.companyId?.trim().toLowerCase() === draft.id.trim().toLowerCase()) {
      return item;
    }
  }

  // 2. Match tollerante su companyId normalizzato o indice numerico se companyId è es. "1" o "cmp-1"
  for (const item of scoreItems) {
    if (!item?.companyId) continue;
    const itemIdClean = item.companyId
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
    if (itemIdClean && itemIdClean === targetIdNorm) {
      return item;
    }
    const itemNumMatch = item.companyId.match(/^(?:cmp[_-\s]*)?(\d+)$/i);
    if (targetNum && itemNumMatch && itemNumMatch[1] === targetNum) {
      return item;
    }
  }

  // 3. Fallback sul nome azienda normalizzato (sia in `item.ragioneSociale` sia se l'LLM ha messo il nome in `item.companyId`)
  for (const item of scoreItems) {
    if (!item) continue;
    const candidateNames = [item.ragioneSociale, item.companyId].filter(
      (s): s is string => Boolean(s && s.trim().length > 1)
    );
    for (const rawName of candidateNames) {
      const itemBrand = normalizeCompanyBrandKey(rawName);
      if (
        draftBrand &&
        itemBrand &&
        (draftBrand === itemBrand ||
          areSameCompanyBrandEntities(draftBrand, itemBrand))
      ) {
        return item;
      }
    }
  }

  return undefined;
}

/**
 * Step 6 — Merge in memoria O(n) tra anagrafiche arricchite e payload compatto "ID + Score Only",
 * usando sia l'`id` esatto sia il fallback sul nome azienda normalizzato, applicando `sanitizeTextFields`,
 * il malus Buyer Persona (max 0.5) e ordinando per `scoreFinal` decrescente.
 */
export function mergeAndComputeFinalRanking(
  drafts: EnrichedCompanyDraft[],
  scoreItems: LightweightCompanyScoreItem[],
  triggerWeight: number
): CompanyResult[] {
  const merged: CompanyResult[] = drafts.map((draft) => {
    const scored = matchScoreItemForCompany(draft, scoreItems);
    const primaryPkg: CXIPackage = draft.cxi_primaria_draft.pacchetto;

    const scoreTarget = clampSubScore(scored?.scoreTarget ?? 7.0, 1.0, 10.0);
    const scoreTrigger = clampSubScore(
      scored?.scoreTrigger ?? (primaryPkg !== "NONE" ? 7.0 : 3.0),
      0.0,
      10.0
    );

    const { malus, motivo } = evaluateBuyerPersonasMalus(draft.buyer_personas);
    const { scoreFinal, breakdown } = computeWeightedScore({
      scoreTarget,
      scoreTrigger,
      triggerWeight,
      malusApplied: malus,
      motivoMalus: motivo,
    });

    const primaryPersonaRole =
      draft.buyer_personas[0]?.ruolo_e_nome || "Direzione Aziendale";
    const primarySolutionLabel = resolveCXISolutionName(
      primaryPkg,
      draft.cxi_primaria_draft.nome_soluzione
    );

    const sanitizedTriggerPrimario = sanitizeTextFields(
      draft.cxi_primaria_draft.trigger_fatto
    );
    const sanitizedServizio1RigaPrimario = sanitizeTextFields(
      draft.cxi_primaria_draft.servizio_personalizzato_1_riga
    );

    const gancioMail =
      sanitizeTextFields(scored?.gancio_mail) ||
      sanitizeTextFields(
        `Oggetto: Supporto ${primarySolutionLabel} per ${draft.ragioneSociale}\n\nGentile ${primaryPersonaRole},\nabbiamo seguito con attenzione i recenti sviluppi di ${draft.ragioneSociale} (${sanitizedTriggerPrimario}). Con la nostra linea ${primarySolutionLabel} possiamo affiancarvi con un intervento mirato: ${sanitizedServizio1RigaPrimario} Saremmo lieti di condividere un breve confronto dedicato.`
      );

    const cxi_primaria: CXIPrimarySolution = {
      ...draft.cxi_primaria_draft,
      nome_soluzione: primarySolutionLabel,
      trigger_fatto: sanitizedTriggerPrimario,
      servizio_personalizzato_1_riga: sanitizedServizio1RigaPrimario,
      gancio_mail: gancioMail,
    };

    const cxi_secondaria: CXISecondarySolution = {
      ...draft.cxi_secondaria,
      trigger_fatto: sanitizeTextFields(draft.cxi_secondaria.trigger_fatto),
      servizio_personalizzato_1_riga: sanitizeTextFields(
        draft.cxi_secondaria.servizio_personalizzato_1_riga
      ),
    };

    const companyDescription =
      sanitizeTextFields(scored?.companyDescription) ||
      sanitizeTextFields(draft.cosaSapere) ||
      sanitizeTextFields(
        `${draft.ragioneSociale} è un'impresa attiva nel cluster ${draft.cluster_macro} (${draft.sub_cluster_specifico}) con sede a ${draft.sedeCitta} (${draft.sedeRegione}).`
      );

    const cosaSapere =
      sanitizeTextFields(draft.cosaSapere) || companyDescription;

    return {
      id: draft.id,
      ragioneSociale: draft.ragioneSociale,
      partitaIva: draft.partitaIva,
      companyDescription,
      cosaSapere,
      altriDatiChiave: sanitizeTextFields(draft.altriDatiChiave),
      bacinoClientiODimensione: sanitizeTextFields(
        draft.bacinoClientiODimensione,
        { ensureTerminalPeriod: false }
      ),
      sedeCitta: draft.sedeCitta,
      sedeRegione: draft.sedeRegione,
      indirizzoVerificatoMaps: draft.indirizzoVerificatoMaps,
      mapsStatus: draft.mapsStatus,
      mapsRating: draft.mapsRating,
      mapsCoordinates: draft.mapsCoordinates,
      mapsPhone: draft.mapsPhone,
      mapsWebsiteUri: draft.mapsWebsiteUri,
      logoUrl: draft.logoUrl ?? null,
      atecoCodice: draft.atecoCodice,
      cluster_macro: draft.cluster_macro,
      sub_cluster_specifico: draft.sub_cluster_specifico,
      fatturatoValore: draft.fatturatoValore,
      fatturatoAnno: draft.fatturatoAnno,
      dipendenti: draft.dipendenti,
      cxi_primaria,
      cxi_secondaria,
      cxiPackage: cxi_primaria.pacchetto,
      triggerSummary: cxi_primaria.trigger_fatto,
      triggerDate: cxi_primaria.trigger_data,
      salesPitchText: cxi_primaria.gancio_mail,
      buyer_personas: draft.buyer_personas,
      scoreTarget,
      scoreTrigger,
      malusApplied: malus,
      scoreFinal,
      score_breakdown: breakdown,
      explainability:
        sanitizeTextFields(scored?.explainability) ||
        buildExplainabilityText(
          {
            scoreTarget,
            scoreTrigger,
            malusApplied: malus,
            score_breakdown: breakdown,
          },
          triggerWeight
        ),
      sources: draft.sources,
    };
  });

  return recalculateAndSortCompanies(merged, triggerWeight);
}

/**
 * Ricalcola istantaneamente in memoria tutte le componenti di `score_breakdown`, `scoreFinal`
 * e riordina le aziende in modo decrescente senza effettuare chiamate API.
 */
export function recalculateAndSortCompanies(
  companies: CompanyResult[],
  triggerWeight: number
): CompanyResult[] {
  return companies
    .map((company) => {
      const { malus, motivo } = evaluateBuyerPersonasMalus(
        company.buyer_personas
      );
      const { scoreFinal, breakdown } = computeWeightedScore({
        scoreTarget: company.scoreTarget,
        scoreTrigger: company.scoreTrigger,
        triggerWeight,
        malusApplied: malus,
        motivoMalus: motivo,
      });

      return {
        ...company,
        malusApplied: malus,
        scoreFinal,
        score_breakdown: breakdown,
      };
    })
    .sort((a, b) => {
      if (b.scoreFinal !== a.scoreFinal) {
        return b.scoreFinal - a.scoreFinal;
      }
      if (b.scoreTrigger !== a.scoreTrigger) {
        return b.scoreTrigger - a.scoreTrigger;
      }
      return b.scoreTarget - a.scoreTarget;
    });
}
