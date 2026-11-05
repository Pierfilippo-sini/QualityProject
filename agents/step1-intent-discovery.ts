import {
  clampRequestedCompaniesCount,
  getDefaultCompaniesCount,
  getMaxCompaniesCap,
} from "@/lib/agent-config";
import {
  computeDiscoveryPoolTarget,
  deduplicateAndMergeCandidates,
  normalizeCompanyBrandKey,
  verifyStrictGeographyConstraint,
  type PreliminaryCandidateSeed,
} from "@/lib/company-dedup-and-geo";
import { callGeminiStructured, type GroundingCitation } from "@/lib/gemini";
import { sanitizeTextFields } from "@/lib/html-cleaner";
import { clampWeight } from "@/lib/scoring";
import type { StepExecutionResult } from "@/lib/telemetry";
import type {
  DiscardedCompanyTrace,
  MandatorySearchInput,
  ParsedSearchConstraints,
} from "@/lib/types";

/**
 * Step 0+1 Unificato — Guardrail B2B, Validazione 3 Parametri Obbligatori & Discovery SERP (`gemini-3.8-flash`).
 *
 * OTTIMIZZAZIONE ARCHITETTURALE #3 (Accorpamento di Step 0 e Step 1 tramite Tool Calling / Search Grounding):
 * - Invece di spendere due round-trip LLM sequenziali (Step 0 Guardrail + Step 1 Discovery),
 *   fonde le due fasi in un'unica chiamata a `gemini-3.8-flash` dotata del tool di Search Grounding.
 * - Nella stessa esecuzione, il modello:
 *   1. Valuta se il prompt riguarda lo scouting B2B (`isB2BScoutingRequest`).
 *   2. Verifica la presenza dei 3 parametri obbligatori (Categoria/Settore, Area Geografica, Dimensione Aziendale)
 *      combinando i campi del form e il prompt testuale.
 *   3. Se la richiesta è fuori tema o manca anche solo uno dei 3 parametri, restituisce `politeReplyIfBlocked`
 *      e `candidates: []` senza invocare ricerche inutili.
 *   4. Se tutti e 3 i parametri sono presenti, invoca direttamente il tool di Search Grounding nella stessa chiamata
 *      e popola il pool di candidati grezzi (`N + 4`), risparmiando un intero round-trip LLM (2-4 secondi di latenza).
 */

export type CandidateCompanySeed = PreliminaryCandidateSeed;

export interface Step1IntentDiscoveryInput {
  prompt: string;
  mandatoryParams?: MandatorySearchInput;
}

export interface Step1IntentDiscoveryOutput {
  isB2BScoutingRequest: boolean;
  hasAllMandatoryParams: boolean;
  politeReplyIfBlocked: string | null;
  guardrailReason: string;
  constraints: ParsedSearchConstraints;
  missingMandatoryParams: string[];
  validationErrorMessage: string | null;
  candidates: CandidateCompanySeed[];
  mergedDuplicates: DiscardedCompanyTrace[];
  groundingQueries: string[];
  groundingCitations: GroundingCitation[];
}

interface RawStep1LLMResponse {
  isB2BScoutingRequest: boolean;
  hasCategoriaSettore: boolean;
  hasAreaGeografica: boolean;
  hasDimensioneAziendale: boolean;
  guardrailReason: string;
  politeReplyIfBlocked: string | null;
  settore: string | null;
  atecoCodice: string | null;
  dimensioneAziendale: string | null;
  fatturatoMin: number | null;
  fatturatoMax: number | null;
  dipendentiMin: number | null;
  dipendentiMax: number | null;
  macroArea: string | null;
  regioni: string[];
  province: string[];
  specificCompanyNames: string[];
  requestedCompaniesCount: number | null;
  suggestedTriggerWeight: number;
  keywords: string[];
  candidates: Array<{
    ragioneSociale: string;
    primaryUrl: string;
    financialUrl?: string | null;
    sedeCittaHint: string;
    sedeRegioneHint: string;
    selectionNote: string;
  }>;
}

const STEP1_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    isB2BScoutingRequest: {
      type: "boolean",
      description:
        "True SOLO se la richiesta riguarda ricerca/scouting di aziende, analisi imprese, settori merceologici, mercati B2B/retail energetico/industriale o lead generation. False per domande fuori tema (politica, cultura generale, meteo, sport, cucina, ecc.).",
    },
    hasCategoriaSettore: {
      type: "boolean",
      description:
        "True se l'utente ha specificato (nei campi o nel prompt) la Categoria o il Settore Azienda (es. vendita luce e gas, manifatturiero, ICT, logistica, ecc.).",
    },
    hasAreaGeografica: {
      type: "boolean",
      description:
        "True se l'utente ha specificato (nei campi o nel prompt) l'Area Geografica (città, provincia, regione, macro-area come Nord Italia anche con refusi come 'Nora Italia', o nazione).",
    },
    hasDimensioneAziendale: {
      type: "boolean",
      description:
        "True se l'utente ha specificato (nei campi o nel prompt) la Dimensione Aziendale: accetta fasce numeriche di dipendenti, soglie di clienti o fatturato (es. 'almeno 500.000 clienti', '20M-80M€'), oppure categorie dimensionali/mercato come PMI, Mid-Cap, Grandi Imprese, Aziende Quotate, Startup.",
    },
    guardrailReason: {
      type: "string",
      description:
        "Breve motivazione tecnica (1 frase conclusa con punto fermo) sull'esito della verifica Guardrail B2B e dei 3 parametri obbligatori.",
    },
    politeReplyIfBlocked: {
      type: ["string", "null"],
      description:
        "Se isB2BScoutingRequest è false OPPURE se manca uno o più dei 3 parametri obbligatori, messaggio cortese in italiano che spiega perché la ricerca è bloccata e indica chiaramente quali dei 3 parametri mancano. Se tutto è valido, null.",
    },
    settore: {
      type: ["string", "null"],
      description:
        "Categoria o settore merceologico/industriale estratto dai campi o dal prompt, oppure null se assente.",
    },
    atecoCodice: {
      type: ["string", "null"],
      description:
        "Codice o prefisso ATECO se esplicitato o associabile, altrimenti null.",
    },
    dimensioneAziendale: {
      type: ["string", "null"],
      description:
        "Descrizione normalizzata della Dimensione Aziendale estratta dai campi o dal prompt (es. 'PMI', 'Mid-Cap', 'Grandi Imprese', 'Aziende Quotate', 'Startup', '50-250 dipendenti', 'Almeno 500.000 clienti'), oppure null se assente.",
    },
    fatturatoMin: {
      type: ["number", "null"],
      description:
        "Fatturato minimo annuo in Euro (numero intero, es. 20000000 per 20M€), o null se non specificato.",
    },
    fatturatoMax: {
      type: ["number", "null"],
      description:
        "Fatturato massimo annuo in Euro (numero intero), o null se non specificato.",
    },
    dipendentiMin: {
      type: ["number", "null"],
      description: "Numero minimo di dipendenti o null se non specificato.",
    },
    dipendentiMax: {
      type: ["number", "null"],
      description: "Numero massimo di dipendenti o null se non specificato.",
    },
    macroArea: {
      type: ["string", "null"],
      description:
        "Macro-area geografica normalizzata (es. 'Nord Italia' anche se scritto 'Nora Italia', 'Centro Italia', 'Sud Italia', 'Italia') o null.",
    },
    regioni: {
      type: "array",
      items: { type: "string" },
      description:
        "Lista di regioni italiane richieste (se l'utente chiede una città specifica come 'Torino', metti ['Piemonte'] qui e ['Torino'] in province).",
    },
    province: {
      type: "array",
      items: { type: "string" },
      description:
        "Città o province specifiche richieste dall'utente (es. ['Torino']). Lascia [] se l'utente chiede un'intera regione o macro-area.",
    },
    specificCompanyNames: {
      type: "array",
      items: { type: "string" },
      description:
        "Nomi delle aziende specifiche richieste esplicitamente dall'utente. DEVE essere [] se l'utente fa una ricerca per categoria/settore senza nominare aziende specifiche.",
    },
    requestedCompaniesCount: {
      type: ["number", "null"],
      description:
        "Numero esatto X di aziende richieste dall'utente nel prompt, oppure null se non specificato.",
    },
    suggestedTriggerWeight: {
      type: "number",
      description:
        "Peso consigliato W_trigger tra 0.0 e 1.0: usa 0.65-0.80 se enfatizza eventi/volumi operativi recenti, 0.20-0.35 se solo parametri strutturali, 0.50 se bilanciato.",
    },
    keywords: {
      type: "array",
      items: { type: "string" },
      description: "Parole chiave di ricerca B2B estratte dal prompt.",
    },
    candidates: {
      type: "array",
      description:
        "Se isB2BScoutingRequest è true E tutti e 3 i parametri obbligatori sono presenti (nei campi o nel prompt), invoca il tool di Search Grounding e popola il pool di aziende reali; altrimenti restituisci [] senza cercare.",
      items: {
        type: "object",
        properties: {
          ragioneSociale: {
            type: "string",
            description:
              "Ragione sociale principale dell'azienda (1 sola entità operativa pertinente per gruppo/brand).",
          },
          primaryUrl: {
            type: "string",
            description:
              "URL pubblico reale verificato tramite Google Search (sito istituzionale ufficiale dell'azienda).",
          },
          financialUrl: {
            type: ["string", "null"],
            description:
              "URL della scheda camerale o di bilancio (es. fatturatoitalia.it, reportaziende.it, ufficiocamerale.it, registroimprese) contenente fatturato e dipendenti, se reperito durante la discovery, altrimenti null.",
          },
          sedeCittaHint: {
            type: "string",
            description: "Città effettiva della sede dell'azienda.",
          },
          sedeRegioneHint: {
            type: "string",
            description: "Regione effettiva della sede dell'azienda.",
          },
          selectionNote: {
            type: "string",
            description:
              "Breve nota sul perché rispetta settore, area geografica e dimensione richiesta.",
          },
        },
        required: [
          "ragioneSociale",
          "primaryUrl",
          "sedeCittaHint",
          "sedeRegioneHint",
          "selectionNote",
        ],
      },
    },
  },
  required: [
    "isB2BScoutingRequest",
    "hasCategoriaSettore",
    "hasAreaGeografica",
    "hasDimensioneAziendale",
    "guardrailReason",
    "politeReplyIfBlocked",
    "settore",
    "atecoCodice",
    "dimensioneAziendale",
    "fatturatoMin",
    "fatturatoMax",
    "dipendentiMin",
    "dipendentiMax",
    "macroArea",
    "regioni",
    "province",
    "specificCompanyNames",
    "requestedCompaniesCount",
    "suggestedTriggerWeight",
    "keywords",
    "candidates",
  ],
};

function isNonEmptyParam(val: string | null | undefined): boolean {
  if (!val) return false;
  const trimmed = val.trim();
  return (
    trimmed.length >= 2 &&
    trimmed.toUpperCase() !== "N.D." &&
    trimmed.toUpperCase() !== "NULL" &&
    trimmed.toUpperCase() !== "NESSUNO"
  );
}

export async function runStep1IntentDiscovery(
  input: Step1IntentDiscoveryInput
): Promise<StepExecutionResult<Step1IntentDiscoveryOutput>> {
  const defaultCount = getDefaultCompaniesCount();
  const maxCap = getMaxCompaniesCap();
  const mp = input.mandatoryParams;

  const systemInstruction = `Sei il Subagente Unificato Step 0+1 (Guardrail B2B, Validazione 3 Parametri Obbligatori & Discovery SERP) alimentato da gemini-3.8-flash.
In un'UNICA chiamata analizzi il prompt e i campi dell'utente e, SOLO SE la richiesta è valida e completa, invochi il tool di Google Search Grounding per estrarre le aziende target.

Rispetta queste 6 REGOLE TASSATIVE:
1. GUARDRAIL PERTINENZA B2B (\`isB2BScoutingRequest\`):
   - \`true\` SOLO se l'utente cerca o analizza aziende, fornitori, utility, imprese o lead commerciali.
   - \`false\` per domande fuori tema (es. "Chi è il presidente degli Stati Uniti?", politica, meteo, sport, ricette, cultura generale): in questo caso NON invocare Google Search, restituisci \`candidates: []\` e compila \`politeReplyIfBlocked\`.

2. ESTRAZIONE E VALIDAZIONE DEI 3 PARAMETRI OBBLIGATORI (DA CAMPI FORM O DA PROMPT CHAT, tollerando refusi come "famialie", "Nora Italia" -> "Nord Italia", "arandi volumi"):
   Verifica che nell'input complessivo siano presenti TUTTI E 3 questi parametri:
   - Categoria / Settore Azienda (\`hasCategoriaSettore\` + \`settore\`).
   - Area Geografica (\`hasAreaGeografica\` + \`macroArea\`/\`regioni\`/\`province\`).
   - Dimensione Aziendale (\`hasDimensioneAziendale\` + \`dimensioneAziendale\`): accetta sia fasce numeriche di dipendenti, sia soglie di clienti o fatturato (es. "almeno 500.000 clienti", "20M-80M€"), sia categorie dimensionali/mercato come PMI, Mid-Cap, Grandi Imprese, Aziende Quotate, Startup.
   SE MANCA ANCHE SOLO UNO DI QUESTI 3 PARAMETRI: imposta il relativo flag \`has...\` a \`false\`, NON invocare Google Search, restituisci \`candidates: []\` e spiega in \`politeReplyIfBlocked\` quali parametri mancano.

3. AZIENDE SPECIFICHE NOMINATE DALL'UTENTE (\`specificCompanyNames\`):
   - Se l'utente nomina specifiche aziende da valutare, inseriscile in \`specificCompanyNames\` e cerca ESCLUSIVAMENTE quelle singole aziende e NON DI PIÙ.

4. RICONOSCIMENTO ALIAS E DISTINZIONE CONTROLLANTE VS CONTROLLATA:
   - Unisci solo le varianti formali della STESSA persona giuridica (es. con o senza S.p.A. / S.r.l.).
   - Se un gruppo ha una Holding capogruppo (es. "Edison S.p.A.", "Iren S.p.A.", "A2A S.p.A.") e una Controllata operativa specifica per il business cercato dall'utente (es. "Edison Energia S.p.A.", "Iren Mercato S.p.A.", "A2A Energia S.p.A." per la vendita luce e gas), seleziona la società che opera effettivamente nel business richiesto (o mantienile distinte se entrambe pertinenti), SENZA MAI confondere o scambiare l'URL di bilancio (\`financialUrl\`) della capogruppo con quello della controllata.

5. SOVRA-CAMPIONAMENTO (N + 4 CANDIDATI GREZZI) PER RICERCHE GENERICHE (Default = ${defaultCount}, Cap Massimo = ${maxCap}):
   - Se tutti e 3 i parametri obbligatori sono presenti e l'utente chiede X aziende (default X = ${defaultCount}), il pool target N è \`min(${maxCap}, 2 * X)\` (es. N = 10 quando X = 5).
   - Individua tramite Google Search un buffer leggermente superiore di candidati grezzi pari a **N + 4 candidati** (es. 14 candidati grezzi quando ne servono N = 10), così da avere ricambi pronti dopo la deduplicazione e aggregazione preventiva.

6. VINCOLO GEOGRAFICO RIGIDO, REPERIBILITÀ BILANCIO E CHIUSURA FRASI:
   - Se l'utente specifica una città o provincia (es. "Torino"), inseriscila in \`province\` e cerca ESCLUSIVAMENTE aziende con sede in quella città/provincia.
   - Se durante la discovery identifichi la scheda su portali camerali (\`fatturatoitalia.it\`, \`reportaziende.it\`, \`ufficiocamerale.it\`), popola \`financialUrl\`.
   - Ogni campo testuale deve essere costituito da frasi complete, sintetiche e ben concluse che terminano sempre con un punto fermo (.). È severamente vietato troncare le frasi o usare i punti di sospensione (...).`;

  const promptSections: string[] = [];
  if (mp) {
    const filledFields: string[] = [];
    if (isNonEmptyParam(mp.categoriaSettore)) {
      filledFields.push(
        `- Campo Categoria / Settore Azienda: ${mp.categoriaSettore.trim()}`
      );
    }
    if (isNonEmptyParam(mp.areaGeografica)) {
      filledFields.push(
        `- Campo Area Geografica: ${mp.areaGeografica.trim()}`
      );
    }
    if (isNonEmptyParam(mp.dimensioneAziendale)) {
      filledFields.push(
        `- Campo Dimensione Aziendale: ${mp.dimensioneAziendale.trim()}`
      );
    }
    if (isNonEmptyParam(mp.noteStrategiche)) {
      filledFields.push(
        `- Campo Prompt / Obiettivi: ${mp.noteStrategiche?.trim()}`
      );
    }
    if (filledFields.length > 0) {
      promptSections.push(
        `Campi inseriti dall'utente:\n${filledFields.join("\n")}`
      );
    }
  }
  promptSections.push(`Prompt completo utente:\n${input.prompt}`);

  const res = await callGeminiStructured<RawStep1LLMResponse>({
    stepKey: "intent_discovery",
    systemInstruction,
    userPrompt: promptSections.join("\n\n"),
    jsonSchema: STEP1_SCHEMA,
    maxOutputTokens: 8192,
  });

  const isB2B = Boolean(res.data.isB2BScoutingRequest);

  const resolvedSettore =
    res.data.settore?.trim() || mp?.categoriaSettore?.trim() || null;
  const resolvedDimensione =
    res.data.dimensioneAziendale?.trim() ||
    mp?.dimensioneAziendale?.trim() ||
    null;
  const resolvedMacroArea = res.data.macroArea?.trim() || null;
  const resolvedRegioni = Array.isArray(res.data.regioni)
    ? res.data.regioni.filter(Boolean)
    : [];
  const resolvedProvince = Array.isArray(res.data.province)
    ? res.data.province.filter(Boolean)
    : [];

  const validSettore =
    Boolean(res.data.hasCategoriaSettore && isNonEmptyParam(resolvedSettore)) ||
    isNonEmptyParam(mp?.categoriaSettore);

  const validGeografia =
    Boolean(
      res.data.hasAreaGeografica &&
        (isNonEmptyParam(resolvedMacroArea) ||
          resolvedRegioni.length > 0 ||
          resolvedProvince.length > 0)
    ) || isNonEmptyParam(mp?.areaGeografica);

  const validDimensione =
    Boolean(
      res.data.hasDimensioneAziendale &&
        (isNonEmptyParam(resolvedDimensione) ||
          typeof res.data.dipendentiMin === "number" ||
          typeof res.data.dipendentiMax === "number" ||
          typeof res.data.fatturatoMin === "number" ||
          typeof res.data.fatturatoMax === "number")
    ) || isNonEmptyParam(mp?.dimensioneAziendale);

  const missingMandatoryParams: string[] = [];
  if (isB2B) {
    if (!validSettore) {
      missingMandatoryParams.push("Categoria / Settore Azienda");
    }
    if (!validGeografia) {
      missingMandatoryParams.push("Area Geografica");
    }
    if (!validDimensione) {
      missingMandatoryParams.push(
        "Dimensione Aziendale (es. fascia dipendenti, soglia clienti/fatturato, PMI, Mid-Cap, Grandi Imprese, Aziende Quotate, Startup)"
      );
    }
  }

  const hasAllMandatoryParams = isB2B && missingMandatoryParams.length === 0;

  const specificCompanyNames = Array.isArray(res.data.specificCompanyNames)
    ? res.data.specificCompanyNames
        .map((n) => n?.trim())
        .filter((n): n is string => Boolean(n && n.length > 0))
    : [];

  const rawRequested = clampRequestedCompaniesCount(
    res.data.requestedCompaniesCount ?? defaultCount
  );

  const { effectiveRequestedCount, candidatePoolTarget } =
    computeDiscoveryPoolTarget({
      requestedCount: rawRequested,
      specificCompanyNames,
      maxCap,
    });

  const suggestedTriggerWeight = clampWeight(
    res.data.suggestedTriggerWeight ?? 0.5
  );

  const constraints: ParsedSearchConstraints = {
    settore: resolvedSettore,
    atecoCodice: res.data.atecoCodice ?? null,
    dimensioneAziendale: resolvedDimensione,
    areaGeograficaRaw:
      mp?.areaGeografica?.trim() ||
      resolvedProvince.join(", ") ||
      resolvedRegioni.join(", ") ||
      resolvedMacroArea ||
      null,
    fatturatoMin:
      typeof res.data.fatturatoMin === "number" ? res.data.fatturatoMin : null,
    fatturatoMax:
      typeof res.data.fatturatoMax === "number" ? res.data.fatturatoMax : null,
    dipendentiMin:
      typeof res.data.dipendentiMin === "number"
        ? res.data.dipendentiMin
        : null,
    dipendentiMax:
      typeof res.data.dipendentiMax === "number"
        ? res.data.dipendentiMax
        : null,
    macroArea: resolvedMacroArea,
    regioni: resolvedRegioni,
    province: resolvedProvince,
    specificCompanyNames,
    missingMandatoryParams,
    requestedCount: effectiveRequestedCount,
    candidatePoolTarget,
    suggestedTriggerWeight,
    keywords: Array.isArray(res.data.keywords) ? res.data.keywords : [],
  };

  if (!isB2B || !hasAllMandatoryParams) {
    const fallbackOffTopic =
      "Sono un assistente specializzato esclusivamente nello Scouting Aziendale B2B e nella Qualificazione Commerciale CXI. Inserisci una richiesta inerente alla ricerca di imprese indicando Categoria/Settore, Area Geografica e Dimensione Aziendale (negli appositi campi oppure direttamente nel prompt).";

    const fallbackMissingParams = `La tua richiesta è pertinente allo scouting B2B, ma non può partire perché mancano i seguenti parametri obbligatori (inseribili negli appositi campi oppure direttamente nel prompt): ${missingMandatoryParams.join("; ")}.`;

    const politeReply = !isB2B
      ? sanitizeTextFields(res.data.politeReplyIfBlocked) || fallbackOffTopic
      : res.data.politeReplyIfBlocked?.trim() &&
          res.data.politeReplyIfBlocked.trim().length > 15
        ? `${sanitizeTextFields(res.data.politeReplyIfBlocked)} (Parametri mancanti: ${missingMandatoryParams.join(", ")}).`
        : fallbackMissingParams;

    return {
      output: {
        isB2BScoutingRequest: isB2B,
        hasAllMandatoryParams,
        politeReplyIfBlocked: politeReply,
        guardrailReason:
          sanitizeTextFields(res.data.guardrailReason) ||
          (!isB2B
            ? "Richiesta fuori contesto B2B."
            : `Parametri obbligatori mancanti: ${missingMandatoryParams.join(", ")}.`),
        constraints,
        missingMandatoryParams,
        validationErrorMessage: politeReply,
        candidates: [],
        mergedDuplicates: [],
        groundingQueries: res.searchQueries,
        groundingCitations: res.citations,
      },
      modelUsed: res.modelUsed,
      fallbackTriggered: res.fallbackTriggered,
      warningMessage: res.warningMessage,
    };
  }

  // 1. Filtra candidati grezzi per aziende specifiche nominate e vincolo geografico rigido
  const filteredRawSeeds: CandidateCompanySeed[] = [];

  for (const raw of res.data.candidates ?? []) {
    const name = raw?.ragioneSociale?.trim();
    if (!name) continue;

    const brandKey = normalizeCompanyBrandKey(name);
    if (!brandKey) continue;

    if (specificCompanyNames.length > 0) {
      const matchesRequestedName = specificCompanyNames.some((reqName) => {
        const reqBrand = normalizeCompanyBrandKey(reqName);
        return (
          reqBrand &&
          (brandKey.includes(reqBrand) ||
            reqBrand.includes(brandKey) ||
            name.toLowerCase().includes(reqName.toLowerCase()))
        );
      });
      if (!matchesRequestedName) {
        continue;
      }
    }

    const cityHint = raw.sedeCittaHint?.trim() || "N.D.";
    const regionHint = raw.sedeRegioneHint?.trim() || "N.D.";

    if (cityHint !== "N.D.") {
      const geoCheck = verifyStrictGeographyConstraint({
        ragioneSociale: name,
        sedeCitta: cityHint,
        sedeRegione: regionHint,
        constraints,
      });
      if (!geoCheck.passes) {
        continue;
      }
    }

    filteredRawSeeds.push({
      ragioneSociale: name,
      primaryUrl: raw.primaryUrl?.trim() || "",
      financialUrl: raw.financialUrl?.trim() || undefined,
      sedeCittaHint: cityHint,
      sedeRegioneHint: regionHint,
      selectionNote: sanitizeTextFields(raw.selectionNote),
    });
  }

  // 2. Modulo di Deduplicazione e Aggregazione Preventiva (Pre-Step 2/3 Entity Resolution)
  const { mergedCandidates, mergedDuplicatesTrace } =
    deduplicateAndMergeCandidates(filteredRawSeeds, candidatePoolTarget);

  return {
    output: {
      isB2BScoutingRequest: true,
      hasAllMandatoryParams: true,
      politeReplyIfBlocked: null,
      guardrailReason:
        sanitizeTextFields(res.data.guardrailReason) ||
        "Richiesta B2B valida e completa di tutti e 3 i parametri obbligatori.",
      constraints,
      missingMandatoryParams: [],
      validationErrorMessage: null,
      candidates: mergedCandidates,
      mergedDuplicates: mergedDuplicatesTrace,
      groundingQueries: res.searchQueries,
      groundingCitations: res.citations,
    },
    modelUsed: res.modelUsed,
    fallbackTriggered: res.fallbackTriggered,
    warningMessage: res.warningMessage,
  };
}
