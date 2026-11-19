import { UNIFIED_GEMINI_MODEL } from "@/lib/agent-config";
import { CXI_MATRIX, resolveCXISolutionName } from "@/lib/cxiMatrix";
import { callGeminiStructured, type GroundingCitation } from "@/lib/gemini";
import { sanitizeTextFields } from "@/lib/html-cleaner";
import type { EnrichedCompanyDraft } from "@/lib/scoring";
import type { StepExecutionResult } from "@/lib/telemetry";
import type {
  BuyerPersonaProfile,
  CXIPackage,
  ParsedSearchConstraints,
} from "@/lib/types";
import {
  sanitizeValidSources,
  verifyReachableSources,
} from "@/agents/step2-gatekeeper";
import type { MapsVerifiedCompany } from "@/agents/step3-maps-verification";

/**
 * Step 4 — Profiling, Dual CXI Matching & 2 Buyer Personas (`gemini-3.8-flash` in Parallelo `Promise.allSettled`).
 *
 * Modifiche architetturali implementate:
 * 1. Rimozione totale di qualsiasi ricerca o scraping di profili/URL LinkedIn.
 * 2. Individuazione di 2 Figure Professionali distinte per ogni azienda (es. decisore di business/budget + referente operativo/tecnico),
 *    includendo il nome proprio SOLO se presente in fonti web ufficiali estratte, altrimenti il ruolo aziendale preciso.
 * 3. Doppio Matching CXI: Soluzione CXI Principale (`cxi_primaria`) + Soluzione CXI Secondaria complementare (`cxi_secondaria`),
 *    ciascuna con `nome_soluzione`, `trigger_fatto` e `servizio_personalizzato_1_riga`.
 */

export interface Step4EnrichmentInput {
  constraints: ParsedSearchConstraints;
  companies: MapsVerifiedCompany[];
}

export interface Step4EnrichmentOutput {
  enrichedCompanies: EnrichedCompanyDraft[];
  groundingQueries: string[];
  groundingCitations: GroundingCitation[];
}

interface RawPersonaItem {
  ruolo_e_nome: string;
  livello_decisionale: string;
  cosa_gli_interessa: string;
  primo_messaggio_utile: string;
}

interface SingleCompanyEnrichmentItem {
  companyId: string;
  cosa_sapere: string;
  cxi_primaria: {
    pacchetto: "CONSULTING" | "DIGITAL" | "OPERATIONS" | "ESG";
    nome_soluzione: string;
    trigger_fatto: string;
    trigger_data: string | null;
    servizio_personalizzato_1_riga: string;
  };
  cxi_secondaria: {
    pacchetto: "CONSULTING" | "DIGITAL" | "OPERATIONS" | "ESG";
    nome_soluzione: string;
    trigger_fatto: string;
    servizio_personalizzato_1_riga: string;
  };
  buyer_persona_1: RawPersonaItem;
  buyer_persona_2: RawPersonaItem;
  additionalSources: Array<{
    title: string;
    url: string;
    sourceType: "NEWS" | "INSTITUTIONAL" | "FINANCIAL";
  }>;
}

const PERSONA_ITEM_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    ruolo_e_nome: {
      type: "string",
      description:
        "Titolo professionale aziendale preciso (es. 'Direttore Customer Operations / Customer Care'). Includi il nome e cognome SOLO SE già presente con certezza nelle fonti web ufficiali estratte; NON usare LinkedIn e NON inventare mai nomi.",
    },
    livello_decisionale: {
      type: "string",
      description:
        "Breve frase che spiega il suo peso decisionale rispetto alla proposta CXI (es. 'Decisore economico finale con potere di firma sui progetti di trasformazione Customer Operations').",
    },
    cosa_gli_interessa: {
      type: "string",
      description:
        "Pain point, KPI e obiettivi specifici di quel ruolo in questa specifica azienda.",
    },
    primo_messaggio_utile: {
      type: "string",
      description:
        "NON è la mail: è l'angolo di attacco concettuale / argomento chiave con cui approcciare questa specifica figura (es. 'Approcciare facendo leva sull'assorbimento dei picchi di contatto post-acquisizione senza peggiorare il livello di servizio').",
    },
  },
  required: [
    "ruolo_e_nome",
    "livello_decisionale",
    "cosa_gli_interessa",
    "primo_messaggio_utile",
  ],
};

const SINGLE_COMPANY_ENRICHMENT_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    companyId: {
      type: "string",
      description: "ID esatto dell'azienda ricevuto in input (es. cmp_1).",
    },
    cosa_sapere: {
      type: "string",
      description:
        "Sintesi densa e fattuale (2-3 frasi) delle informazioni chiave sull'azienda: assetto societario/proprietà, posizionamento, numeri chiave e fatti strategici recenti (usata nella Scheda 3 Excel 'Informazioni chiave sulle aziende').",
    },
    cxi_primaria: {
      type: "object",
      description: "Soluzione CXI Principale più pertinente per l'azienda.",
      properties: {
        pacchetto: {
          type: "string",
          enum: ["CONSULTING", "DIGITAL", "OPERATIONS", "ESG"],
        },
        nome_soluzione: {
          type: "string",
          description:
            "Nome della soluzione CXI principale (es. 'Consulting X', 'Digital X', 'Operations X', 'ESG X').",
        },
        trigger_fatto: {
          type: "string",
          description:
            "Il fatto aziendale recente e reale (ultimi 12-24 mesi) che giustifica l'aggancio commerciale.",
        },
        trigger_data: {
          type: ["string", "null"],
          description: "Data indicativa del fatto in formato YYYY-MM o YYYY, oppure null.",
        },
        servizio_personalizzato_1_riga: {
          type: "string",
          description:
            "UNA SINGOLA RIGA secca che riassume come il servizio CXI principale viene declinato su misura per lo specifico caso aziendale.",
        },
      },
      required: [
        "pacchetto",
        "nome_soluzione",
        "trigger_fatto",
        "trigger_data",
        "servizio_personalizzato_1_riga",
      ],
    },
    cxi_secondaria: {
      type: "object",
      description:
        "Seconda Soluzione CXI complementare/alternativa (DEVE appartenere a un pacchetto CXI diverso da cxi_primaria).",
      properties: {
        pacchetto: {
          type: "string",
          enum: ["CONSULTING", "DIGITAL", "OPERATIONS", "ESG"],
        },
        nome_soluzione: {
          type: "string",
          description:
            "Nome della seconda soluzione CXI complementare (es. 'Operations X', 'Consulting X', 'Digital X', 'ESG X').",
        },
        trigger_fatto: {
          type: "string",
          description:
            "Il secondo trigger o l'esigenza operativa/organizzativa aziendale a cui si aggancia.",
        },
        servizio_personalizzato_1_riga: {
          type: "string",
          description:
            "UNA SINGOLA RIGA secca che riassume il servizio personalizzato proposto per questo secondo scenario.",
        },
      },
      required: [
        "pacchetto",
        "nome_soluzione",
        "trigger_fatto",
        "servizio_personalizzato_1_riga",
      ],
    },
    buyer_persona_1: {
      ...PERSONA_ITEM_SCHEMA,
      description:
        "Figura Professionale #1: Decisore principale di business / budget per la proposta CXI (es. Direttore Customer Operations, Direttore Commerciale Retail, COO, CEO).",
    },
    buyer_persona_2: {
      ...PERSONA_ITEM_SCHEMA,
      description:
        "Figura Professionale #2 (DISTINTA dalla #1): Referente / Sponsor operativo, digitale o organizzativo (es. CIO / Head of Digital CX, Responsabile CRM & Contact Center, HR / Learning & Development Director).",
    },
    additionalSources: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          url: { type: "string" },
          sourceType: {
            type: "string",
            enum: ["NEWS", "INSTITUTIONAL", "FINANCIAL"],
          },
        },
        required: ["title", "url", "sourceType"],
      },
    },
  },
  required: [
    "companyId",
    "cosa_sapere",
    "cxi_primaria",
    "cxi_secondaria",
    "buyer_persona_1",
    "buyer_persona_2",
  ],
};

const FAKE_NAME_PATTERNS = [
  "mario rossi",
  "giuseppe verdi",
  "marco bianchi",
  "luca bianchi",
  "nome cognome",
];

const VALID_ACTIVE_PACKAGES = new Set<CXIPackage>([
  "CONSULTING",
  "DIGITAL",
  "OPERATIONS",
  "ESG",
]);

function pickComplementaryFallbackPackage(primary: CXIPackage): CXIPackage {
  switch (primary) {
    case "OPERATIONS":
      return "CONSULTING";
    case "CONSULTING":
      return "OPERATIONS";
    case "DIGITAL":
      return "OPERATIONS";
    case "ESG":
      return "CONSULTING";
    default:
      return "DIGITAL";
  }
}

function sanitizePersonaProfile(
  raw: RawPersonaItem | undefined | null,
  fallbackRole: string,
  fallbackLevel: string,
  fallbackInterests: string,
  fallbackAngle: string
): BuyerPersonaProfile {
  let roleAndName = sanitizeTextFields(raw?.ruolo_e_nome, {
    ensureTerminalPeriod: false,
  });
  if (
    !roleAndName ||
    FAKE_NAME_PATTERNS.some((fake) => roleAndName.toLowerCase().includes(fake))
  ) {
    roleAndName = fallbackRole;
  }

  return {
    ruolo_e_nome: roleAndName,
    livello_decisionale:
      sanitizeTextFields(raw?.livello_decisionale) ||
      sanitizeTextFields(fallbackLevel),
    cosa_gli_interessa:
      sanitizeTextFields(raw?.cosa_gli_interessa) ||
      sanitizeTextFields(fallbackInterests),
    primo_messaggio_utile:
      sanitizeTextFields(raw?.primo_messaggio_utile) ||
      sanitizeTextFields(fallbackAngle),
  };
}

export function buildStep4SystemInstruction(): string {
  const matrixDescription = [
    CXI_MATRIX.CONSULTING,
    CXI_MATRIX.DIGITAL,
    CXI_MATRIX.OPERATIONS,
    CXI_MATRIX.ESG,
  ]
    .map(
      (pkg) =>
        `- ${pkg.id} (${pkg.label}): Trigger [${pkg.triggers.join("; ")}] -> Interlocutori tipici [${pkg.targetBuyerPersonas.join(", ")}]`
    )
    .join("\n");

  return `Sei il Subagente di Profiling, Dual CXI Matching & Buyer Personas alimentato da ${UNIFIED_GEMINI_MODEL}.
Analizzi UNA SINGOLA AZIENDA alla volta basandoti sull'anagrafica societaria verificata, cluster GICS/ATECO, dati di bilancio, dipendenti, sede e fonti ufficiali fornite nel prompt, rispettando queste regole:

1. DIVIETO ASSOLUTO DI LINKEDIN:
   - NON effettuare alcuna ricerca su linkedin.com e NON restituire mai URL di LinkedIn.

2. DOPPIO MATCHING SOLUZIONI CXI (PRINCIPALE + SECONDARIA):
   Usa questa Matrice CXI (Customer Experience Italia):
${matrixDescription}
   - \`cxi_primaria\`: seleziona la soluzione CXI principale più forte per il contesto e i numeri dell'azienda, indicando \`nome_soluzione\` (es. "Consulting X", "Digital X", "Operations X", "ESG X"), \`trigger_fatto\` reale o contestualizzato sulle dimensioni/settore e \`servizio_personalizzato_1_riga\` (1 sola riga secca su misura).
   - \`cxi_secondaria\`: seleziona una SECONDA soluzione CXI complementare/alternativa (diversa dalla primaria), con il relativo \`trigger_fatto\` ed \`servizio_personalizzato_1_riga\` (1 sola riga secca su misura).

3. 2 FIGURE PROFESSIONALI DISTINTE PER AZIENDA (\`buyer_persona_1\` e \`buyer_persona_2\`):
   - Individua 2 figure professionali distinte e complementari per ricevere la nostra proposta CXI (es. Figura 1 = decisore economico/business come Direttore Customer Operations, Direttore Commerciale o COO; Figura 2 = sponsor operativo/tecnico/formazione come CIO/CDO, Responsabile Contact Center/CRM o HR & Learning Director).
   - In \`ruolo_e_nome\`, includi il nome della persona SOLO SE è esplicitamente presente nelle fonti web ufficiali/istituzionali estratte; altrimenti indica il ruolo aziendale preciso (NON inventare mai nomi e NON scrivere 'N.D.').
   - In \`primo_messaggio_utile\`, NON scrivere una mail ma l'angolo d'attacco concettuale / argomento chiave con cui approcciare quella specifica figura.

4. REGOLA TASSATIVA ANTI-TRONCAMENTO:
   - Ogni campo testuale deve essere costituito da frasi complete, sintetiche e ben concluse che terminano sempre con un punto fermo (.). È severamente vietato troncare le frasi o usare i punti di sospensione (...).

5. Rispondi ESCLUSIVAMENTE con l'oggetto JSON conforme allo schema.`;
}

export interface SingleCompanyStep4Result {
  enrichedCompany: EnrichedCompanyDraft;
  searchQueries: string[];
  citations: GroundingCitation[];
  fallbackTriggered: boolean;
  warningMessage?: string;
}

/**
 * Arricchisce una singola azienda (Dual CXI Matching + 2 Buyer Personas) per supportare
 * sia il pipelining asincrono a stream (`for await...of`) sia l'esecuzione batch.
 */
export async function enrichSingleCompanyStep4(
  company: MapsVerifiedCompany,
  constraints: ParsedSearchConstraints,
  systemInstruction = buildStep4SystemInstruction()
): Promise<SingleCompanyStep4Result> {
  const cleanName = sanitizeTextFields(company.ragioneSociale, {
    ensureTerminalPeriod: false,
  });
  const cleanCity = sanitizeTextFields(company.sedeCitta, {
    ensureTerminalPeriod: false,
  });
  const cleanRegion = sanitizeTextFields(company.sedeRegione, {
    ensureTerminalPeriod: false,
  });
  const knownUrls = company.sources
    .slice(0, 3)
    .map((s) => s.url)
    .join(", ");

  const userPrompt = [
    `AZIENDA SINGOLA DA PROFILARE (companyId=${company.id}): ${cleanName}`,
    `Sede: ${cleanCity} (${cleanRegion}) | Indirizzo Verificato: ${company.indirizzoVerificatoMaps}`,
    `Cluster GICS/ATECO: ${company.cluster_macro} — ${company.sub_cluster_specifico} (Codice ATECO: ${company.atecoCodice})`,
    `Dati di Bilancio Ufficiali: Fatturato € ${company.fatturatoValore ? company.fatturatoValore.toLocaleString("it-IT") : "N.D."} (${company.fatturatoAnno ?? "ultimo bilancio"}) | Dipendenti: ${company.dipendenti ? company.dipendenti.toLocaleString("it-IT") : "N.D."}`,
    `Dati chiave & Sintesi: ${company.altriDatiChiave}`,
    knownUrls ? `Fonti ufficiali verificate: ${knownUrls}` : "",
    `Contesto ricerca utente: Settore=${constraints.settore ?? "B2B"} | Dimensione=${constraints.dimensioneAziendale ?? "N.D."} | Keywords=${constraints.keywords.join(", ") || "N.D."}`,
    `Analizza le specificità operative, i processi e le sfide di mercato di "${cleanName}" e genera \`cosa_sapere\`, \`cxi_primaria\`, \`cxi_secondaria\` e le 2 figure professionali distinte (\`buyer_persona_1\` e \`buyer_persona_2\`) perfettamente ritagliate sul suo profilo dimensionale e di business. Assicurati che ogni singola frase termini sempre con un punto fermo (.) senza mai usare punti di sospensione (...).`,
  ]
    .filter(Boolean)
    .join("\n");

  const res = await callGeminiStructured<SingleCompanyEnrichmentItem>({
    stepKey: "enrichment_cxi",
    systemInstruction,
    userPrompt,
    jsonSchema: SINGLE_COMPANY_ENRICHMENT_SCHEMA,
    maxOutputTokens: 8192,
  }).catch(() => null);

  const found = res?.data;

  const rawPrimaryPkg = found?.cxi_primaria?.pacchetto as
    | CXIPackage
    | undefined;
  const primaryPkg: CXIPackage =
    rawPrimaryPkg && VALID_ACTIVE_PACKAGES.has(rawPrimaryPkg)
      ? rawPrimaryPkg
      : "OPERATIONS";

  const rawSecondaryPkg = found?.cxi_secondaria?.pacchetto as
    | CXIPackage
    | undefined;
  const secondaryPkg: CXIPackage =
    rawSecondaryPkg &&
    VALID_ACTIVE_PACKAGES.has(rawSecondaryPkg) &&
    rawSecondaryPkg !== primaryPkg
      ? rawSecondaryPkg
      : pickComplementaryFallbackPackage(primaryPkg);

  const primaryDef = CXI_MATRIX[primaryPkg];
  const secondaryDef = CXI_MATRIX[secondaryPkg];

  const cxi_primaria_draft = {
    pacchetto: primaryPkg,
    nome_soluzione: resolveCXISolutionName(
      primaryPkg,
      sanitizeTextFields(found?.cxi_primaria?.nome_soluzione, {
        ensureTerminalPeriod: false,
      })
    ),
    trigger_fatto:
      sanitizeTextFields(found?.cxi_primaria?.trigger_fatto) ||
      sanitizeTextFields(company.altriDatiChiave) ||
      `Evoluzione operativa e consolidamento nel comparto ${company.sub_cluster_specifico}.`,
    trigger_data: !res?.groundingQuotaFallback
      ? found?.cxi_primaria?.trigger_data?.trim() || null
      : null,
    servizio_personalizzato_1_riga:
      sanitizeTextFields(
        found?.cxi_primaria?.servizio_personalizzato_1_riga
      ) ||
      `${primaryDef.label}: intervento mirato su processi e performance per ${company.ragioneSociale}.`,
  };

  const cxi_secondaria = {
    pacchetto: secondaryPkg,
    nome_soluzione: resolveCXISolutionName(
      secondaryPkg,
      rawSecondaryPkg === secondaryPkg
        ? sanitizeTextFields(found?.cxi_secondaria?.nome_soluzione, {
            ensureTerminalPeriod: false,
          })
        : secondaryDef.label
    ),
    trigger_fatto:
      sanitizeTextFields(found?.cxi_secondaria?.trigger_fatto) ||
      `Esigenza complementare di potenziamento nel segmento ${company.sub_cluster_specifico}.`,
    servizio_personalizzato_1_riga:
      sanitizeTextFields(
        found?.cxi_secondaria?.servizio_personalizzato_1_riga
      ) ||
      `${secondaryDef.label}: supporto specialistico complementare per ${company.ragioneSociale}.`,
  };

  const persona1 = sanitizePersonaProfile(
    found?.buyer_persona_1,
    primaryDef.targetBuyerPersonas[0] ?? "Direttore Customer Operations",
    "Decisore principale con responsabilità di budget e performance sui processi target.",
    "Qualità del servizio, efficienza operativa, assorbimento dei volumi e ritorno sull'investimento.",
    `Approcciare partendo da: ${cxi_primaria_draft.servizio_personalizzato_1_riga}`
  );

  let persona2 = sanitizePersonaProfile(
    found?.buyer_persona_2,
    secondaryDef.targetBuyerPersonas[0] ??
      "Direttore Sistemi Informativi & Trasformazione Digitale",
    "Sponsor operativo/tecnico che valuta fattibilità, strumenti e adozione interna.",
    "Integrazione fluida nei flussi di lavoro, scalabilità degli strumenti e riduzione delle frizioni operative.",
    `Approcciare proponendo un cantiere complementare su: ${cxi_secondaria.servizio_personalizzato_1_riga}`
  );

  if (
    persona1.ruolo_e_nome.trim().toLowerCase() ===
    persona2.ruolo_e_nome.trim().toLowerCase()
  ) {
    persona2 = {
      ...persona2,
      ruolo_e_nome:
        secondaryDef.targetBuyerPersonas[1] ??
        "Responsabile Sviluppo Processi & Trasformazione",
    };
  }

  const sanitizedExtra = sanitizeValidSources(found?.additionalSources ?? []);
  const verifiedExtra = await verifyReachableSources(sanitizedExtra);

  const mergedSources = sanitizeValidSources([
    ...company.sources,
    ...verifiedExtra,
  ]);

  const cosaSapere =
    sanitizeTextFields(found?.cosa_sapere) ||
    sanitizeTextFields(
      `${company.altriDatiChiave} ${cxi_primaria_draft.trigger_fatto}`
    );

  return {
    enrichedCompany: {
      id: company.id,
      ragioneSociale: company.ragioneSociale,
      partitaIva: company.partitaIva,
      sedeCitta: company.sedeCitta,
      sedeRegione: company.sedeRegione,
      indirizzoVerificatoMaps: company.indirizzoVerificatoMaps,
      mapsStatus: company.mapsStatus,
      mapsRating: company.mapsRating,
      mapsCoordinates: company.mapsCoordinates,
      mapsPhone: company.mapsPhone,
      mapsWebsiteUri: company.mapsWebsiteUri,
      logoUrl: company.logoUrl ?? null,
      atecoCodice: company.atecoCodice,
      cluster_macro: company.cluster_macro,
      sub_cluster_specifico: company.sub_cluster_specifico,
      bacinoClientiODimensione: company.bacinoClientiODimensione,
      altriDatiChiave: company.altriDatiChiave,
      cosaSapere,
      fatturatoValore: company.fatturatoValore,
      fatturatoAnno: company.fatturatoAnno,
      dipendenti: company.dipendenti,
      cxi_primaria_draft,
      cxi_secondaria,
      buyer_personas: [persona1, persona2],
      sources: mergedSources,
    },
    searchQueries: res?.searchQueries ?? [],
    citations: res?.citations ?? [],
    fallbackTriggered: Boolean(res?.fallbackTriggered),
    warningMessage: res?.warningMessage,
  };
}

export async function runStep4EnrichmentCxi(
  input: Step4EnrichmentInput
): Promise<StepExecutionResult<Step4EnrichmentOutput>> {
  if (input.companies.length === 0) {
    return {
      output: {
        enrichedCompanies: [],
        groundingQueries: [],
        groundingCitations: [],
      },
      modelUsed: UNIFIED_GEMINI_MODEL,
      fallbackTriggered: false,
    };
  }

  const systemInstruction = buildStep4SystemInstruction();

  const singleResults = await Promise.all(
    input.companies.map((company) =>
      enrichSingleCompanyStep4(company, input.constraints, systemInstruction)
    )
  );

  const allQueries = new Set<string>();
  const citationsMap = new Map<string, GroundingCitation>();
  const warningsSet = new Set<string>();
  let anyFallbackTriggered = false;

  const enrichedCompanies: EnrichedCompanyDraft[] = singleResults.map((res) => {
    if (res.fallbackTriggered) anyFallbackTriggered = true;
    if (res.warningMessage) warningsSet.add(res.warningMessage);
    for (const q of res.searchQueries) allQueries.add(q);
    for (const cit of res.citations) {
      if (
        !cit.url.toLowerCase().includes("linkedin.com") &&
        !citationsMap.has(cit.url)
      ) {
        citationsMap.set(cit.url, cit);
      }
    }
    return res.enrichedCompany;
  });

  return {
    output: {
      enrichedCompanies,
      groundingQueries: Array.from(allQueries),
      groundingCitations: Array.from(citationsMap.values()),
    },
    modelUsed: UNIFIED_GEMINI_MODEL,
    fallbackTriggered: anyFallbackTriggered,
    ...(warningsSet.size > 0
      ? { warningMessage: Array.from(warningsSet).join(" | ") }
      : {}),
  };
}
