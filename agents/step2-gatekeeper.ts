import { UNIFIED_GEMINI_MODEL } from "@/lib/agent-config";
import {
  deduplicateAndMergeCandidates,
  deduplicateCompaniesKeepMostRecent,
  isCompanyExcluded,
  normalizeCompanyBrandKey,
  normalizePartitaIva,
  verifyStrictGeographyConstraint,
} from "@/lib/company-dedup-and-geo";
import { callGeminiStructured, type GroundingCitation } from "@/lib/gemini";
import {
  fetchCleanWebsiteContext,
  fetchFinancialDirectoryContext,
  sanitizeTextFields,
} from "@/lib/html-cleaner";
import { resolveReportAziendeFinancials } from "@/lib/report-aziende";
import type { StepExecutionResult } from "@/lib/telemetry";
import {
  CLUSTER_MACRO_OPTIONS,
  type ClusterMacro,
  type DiscardedCompanyTrace,
  type ParsedSearchConstraints,
  type Source,
  type SourceType,
} from "@/lib/types";
import type { CandidateCompanySeed } from "@/agents/step1-intent-discovery";

/**
 * Step 2 (Data Extraction Parallela & Gatekeeper) — alimentato da `gemini-3.8-flash`.
 *
 * Regole implementate:
 * 1. Esecuzione in parallelo (`Promise.allSettled()`) isolando ogni singola azienda candidata.
 * 2. Clusterizzazione Standardizzata GICS/ATECO B2B a tassonomia chiusa (`cluster_macro` enum di 12 voci + `sub_cluster_specifico` max 3-4 parole) per evitare categorie duplicate tra i sub-agenti in parallelo.
 * 3. Estrazione dati chiave per Scheda 1 Excel (`bacinoClientiODimensione` + `altriDatiChiave`), Partita IVA e bilancio dell'ULTIMO anno disponibile.
 * 4. Rimozione totale di qualsiasi riferimento o URL LinkedIn.
 */

export interface VerifiedGatekeeperCompany {
  id: string;
  ragioneSociale: string;
  partitaIva: string | "N.D.";
  sedeCitta: string;
  sedeRegione: string;
  atecoCodice: string | "N.D.";
  cluster_macro: ClusterMacro;
  sub_cluster_specifico: string;
  bacinoClientiODimensione: string;
  altriDatiChiave: string;
  fatturatoValore: number | null;
  fatturatoAnno: number | null;
  dipendenti: number | null;
  logoUrl?: string | null;
  sources: Source[];
}

export interface Step2GatekeeperInput {
  constraints: ParsedSearchConstraints;
  candidates: CandidateCompanySeed[];
}

export interface Step2GatekeeperOutput {
  qualified: VerifiedGatekeeperCompany[];
  discarded: DiscardedCompanyTrace[];
  groundingQueries: string[];
  groundingCitations: GroundingCitation[];
}

interface SingleCompanyExtractionResponse {
  ragioneSociale: string;
  partitaIva: string | null;
  sedeCitta: string;
  sedeRegione: string;
  atecoCodice: string;
  cluster_macro: ClusterMacro;
  sub_cluster_specifico: string;
  bacinoClientiODimensione: string;
  altriDatiChiave: string;
  fatturatoValore: number | null;
  fatturatoAnno: number | null;
  dipendenti: number | null;
  passesHardConstraints: boolean;
  discardReason: string | null;
  sources: Array<{
    title: string;
    url: string;
    sourceType: "FINANCIAL" | "NEWS" | "INSTITUTIONAL";
  }>;
}

const SINGLE_COMPANY_EXTRACTION_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    ragioneSociale: {
      type: "string",
      description: "Ragione sociale ufficiale verificata dell'azienda.",
    },
    partitaIva: {
      type: ["string", "null"],
      description:
        "Partita IVA / Codice Fiscale a 11 cifre dell'azienda se reperibile da fonti pubbliche, altrimenti null.",
    },
    sedeCitta: {
      type: "string",
      description: "Città effettiva della sede operativa o legale verificata.",
    },
    sedeRegione: {
      type: "string",
      description: "Regione italiana della sede operativa o legale.",
    },
    atecoCodice: {
      type: "string",
      description:
        "Codice ATECO verificato da fonti pubbliche oppure 'N.D.' se non reperibile.",
    },
    cluster_macro: {
      type: "string",
      enum: [...CLUSTER_MACRO_OPTIONS],
      description:
        "Macro-categoria obbligatoria dell'azienda secondo tassonomia standardizzata GICS/ATECO B2B.",
    },
    sub_cluster_specifico: {
      type: "string",
      description:
        "Stringa breve (MASSIMO 3-4 parole) che descrive la nicchia esatta di business (es. 'Vendita Luce e Gas', 'Automazione Packaging Industriale', 'Software Gestionale Cloud').",
    },
    bacinoClientiODimensione: {
      type: "string",
      description:
        "Fascia dimensionale verificata (es. 'Mid-Cap • 420 dipendenti') o bacino clienti se noto (parametro secondario rispetto a fatturato e dipendenti).",
    },
    altriDatiChiave: {
      type: "string",
      description:
        "Sintesi fattuale in 1-2 brevi proposizioni dei principali numeri verificati (ricavi effettivi + anno, dipendenti registrati).",
    },
    fatturatoValore: {
      type: ["number", "null"],
      description:
        "OBBLIGATORIO: Fatturato annuo in Euro interi DELL'ULTIMO ANNO DISPONIBILE reperito su portali camerali (fatturatoitalia, reportaziende, ufficiocamerale) o sito societario. Non impostare null se reperibile.",
    },
    fatturatoAnno: {
      type: ["number", "null"],
      description:
        "Anno solare di riferimento del bilancio più recente (es. 2024 o 2025).",
    },
    dipendenti: {
      type: ["number", "null"],
      description:
        "OBBLIGATORIO: Numero intero di dipendenti o addetti della rilevazione più recente disponibile. Non impostare null se reperibile.",
    },
    passesHardConstraints: {
      type: "boolean",
      description:
        "True SOLO se l'azienda esiste, ha fonti URL pubbliche ufficiali e rispetta rigorosamente settore, area geografica e dimensione aziendale richiesti.",
    },
    discardReason: {
      type: ["string", "null"],
      description:
        "Se passesHardConstraints è false, motivo tecnico preciso dello scarto; altrimenti null.",
    },
    sources: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          url: { type: "string" },
          sourceType: {
            type: "string",
            enum: ["FINANCIAL", "NEWS", "INSTITUTIONAL"],
          },
        },
        required: ["title", "url", "sourceType"],
      },
    },
  },
  required: [
    "ragioneSociale",
    "partitaIva",
    "sedeCitta",
    "sedeRegione",
    "atecoCodice",
    "cluster_macro",
    "sub_cluster_specifico",
    "bacinoClientiODimensione",
    "altriDatiChiave",
    "fatturatoValore",
    "fatturatoAnno",
    "dipendenti",
    "passesHardConstraints",
    "discardReason",
    "sources",
  ],
};

const BLOCKED_OR_FAKE_DOMAINS = [
  "example.com",
  "example.org",
  "example.it",
  "test.com",
  "localhost",
  "placeholder",
  "linkedin.com", // Rimosso completamente qualsiasi scraping/URL LinkedIn
];

const VALID_CLUSTER_SET = new Set<string>(CLUSTER_MACRO_OPTIONS);

function normalizeClusterMacro(raw: string | undefined | null): ClusterMacro {
  if (raw && VALID_CLUSTER_SET.has(raw.trim())) {
    return raw.trim() as ClusterMacro;
  }
  return "Servizi Professionali & Consulenza B2B";
}

function clampSubClusterWords(raw: string | undefined | null): string {
  const cleaned = sanitizeTextFields(raw, { ensureTerminalPeriod: false });
  if (!cleaned) return "Servizi B2B Specializzati";
  const words = cleaned.split(/\s+/).filter(Boolean);
  return words.slice(0, 4).join(" ");
}

export function sanitizeValidSources(
  rawSources: Array<{
    title?: string;
    url?: string;
    sourceType?: string;
  }> | undefined
): Source[] {
  if (!Array.isArray(rawSources)) return [];
  const validTypes = new Set<SourceType>([
    "FINANCIAL",
    "NEWS",
    "INSTITUTIONAL",
    "GOOGLE_MAPS",
  ]);
  const dedup = new Map<string, Source>();

  for (const item of rawSources) {
    const rawUrl = item?.url?.trim();
    if (!rawUrl) continue;
    try {
      const parsed = new URL(rawUrl);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") continue;
      const host = parsed.hostname.toLowerCase();
      if (BLOCKED_OR_FAKE_DOMAINS.some((bad) => host.includes(bad))) continue;

      const candidateType = (item.sourceType ?? "").toUpperCase() as SourceType;
      const sourceType: SourceType = validTypes.has(candidateType)
        ? candidateType
        : "INSTITUTIONAL";

      if (!dedup.has(parsed.href)) {
        dedup.set(parsed.href, {
          title: sanitizeTextFields(item.title, { ensureTerminalPeriod: false }) || host,
          url: parsed.href,
          sourceType,
        });
      }
    } catch {
      // URL malformato -> scartato
    }
  }

  return Array.from(dedup.values());
}

export async function verifyReachableSources(
  sources: Source[]
): Promise<Source[]> {
  if (sources.length === 0) return [];

  const checks = await Promise.all(
    sources.map(async (src) => {
      try {
        const res = await fetch(src.url, {
          method: "GET",
          redirect: "follow",
          headers: {
            "User-Agent":
              "Mozilla/5.0 (compatible; QualityScoutVerifier/2.0; +https://localhost)",
            Accept: "text/html,application/xhtml+xml,*/*",
          },
          signal: AbortSignal.timeout(2500),
        });
        await res.body?.cancel().catch(() => undefined);

        if (res.status === 404 || res.status === 410 || res.status >= 500) {
          return null;
        }
        return src;
      } catch {
        return null;
      }
    })
  );

  return checks.filter((item): item is Source => item !== null);
}

export interface SingleCompanyTaskOutcome {
  candidateName: string;
  qualifiedCompany?: Omit<VerifiedGatekeeperCompany, "id">;
  discardedTrace?: DiscardedCompanyTrace;
  searchQueries: string[];
  citations: GroundingCitation[];
  fallbackTriggered: boolean;
  warningMessage?: string;
}

export function buildStep2SystemInstruction(): string {
  return `Sei il Subagente di Data Extraction & Gatekeeper in Parallelo alimentato da ${UNIFIED_GEMINI_MODEL}.
Analizzi UNA SINGOLA AZIENDA alla volta esaminando i dati forniti nel prompt (scheda ReportAziende/portali bilancio, testo del sito ufficiale, dati camerali e note preliminari, SENZA MAI usare né citare LinkedIn) per estrarre:
1. Ragione Sociale principale esattamente corrispondente alla persona giuridica analizzata, Partita IVA (11 cifre), Città e Regione effettive della sede, Codice ATECO.
   - ATTENZIONE CONTROLLANTE VS CONTROLLATA: Non mescolare MAI i dati di bilancio (fatturato, dipendenti, P.IVA, ATECO) della Holding capogruppo con quelli della Controllata operativa o viceversa (es. "Edison S.p.A." P.IVA 08263330014 vs "Edison Energia S.p.A." P.IVA 08526440154; "Iren S.p.A." vs "Iren Mercato S.p.A."; "A2A S.p.A." vs "A2A Energia S.p.A."). La Partita IVA, il fatturato, i dipendenti e il codice ATECO devono appartenere ESCLUSIVAMENTE alla specifica Ragione Sociale indicata in \`ragioneSociale\`.
2. CLUSTERIZZAZIONE STANDARDIZZATA OBBLIGATORIA (tassonomia chiusa GICS/ATECO B2B):
   - \`cluster_macro\`: scegli rigorosamente UNO dei 12 valori dell'enum: ${CLUSTER_MACRO_OPTIONS.map((c) => `"${c}"`).join(", ")}.
   - \`sub_cluster_specifico\`: stringa breve di MASSIMO 3-4 parole che descrive la nicchia esatta dell'azienda.
3. DATI DI BILANCIO OBBLIGATORI (FATTURATO E DIPENDENTI - PRIORITÀ ASSOLUTA):
   - Devi SEMPRE estrarre il Fatturato dell'ULTIMO anno disponibile (\`fatturatoValore\` in Euro) e il numero dei Dipendenti (\`dipendenti\`) più recente della specifica società analizzata.
   - Se nel prompt sono già forniti i dati da ReportAziende o fonti camerali, usa esattamente quei valori di fatturato, anno, dipendenti, Partita IVA e ATECO.
   - Il bacino clienti è secondario; il fatturato numerico e i dipendenti sono TASSATIVAMENTE OBBLIGATORI.
   - \`altriDatiChiave\`: sintesi secca dei numeri chiave (es. "Fatturato 2025: 7.315.516.457 €; 564 dipendenti.").

REGOLE TASSATIVE:
- PREVALENZA DATI RECENTI: riporta ESCLUSIVAMENTE i dati di bilancio più recenti disponibili nei testi forniti.
- VALIDAZIONE DIMENSIONE E GEOGRAFIA: verifica sia fasce numeriche sia categorie dimensionali/mercato (PMI, Mid-Cap, Grandi Imprese, Aziende Quotate, Startup) e il vincolo geografico rigido.
- DIVIETO LINKEDIN E OBBLIGO BILANCIO: estrai con esattezza fatturato e dipendenti dalle fonti ufficiali/camerali fornite; non includere mai URL di linkedin.com.
- REGOLA ANTI-TRONCAMENTO: Ogni campo testuale deve essere costituito da frasi complete, sintetiche e ben concluse che terminano sempre con un punto fermo (.). È severamente vietato troncare le frasi o usare i punti di sospensione (...).
- Rispondi ESCLUSIVAMENTE con l'oggetto JSON conforme allo schema.`;
}

export async function analyzeSingleCandidateInIsolation(
  candidate: CandidateCompanySeed,
  constraints: ParsedSearchConstraints,
  systemInstruction = buildStep2SystemInstruction()
): Promise<SingleCompanyTaskOutcome> {
  const STAGE_LABEL = "Step 2 — Gatekeeper & Parallel Data Extraction";

  // Controllo preventivo: se l'azienda è nella lista di esclusione, salta immediatamente
  // senza effettuare alcuna ricerca, scraping o chiamata LLM
  if (isCompanyExcluded(candidate.ragioneSociale, constraints.excludedCompanies)) {
    return {
      candidateName: candidate.ragioneSociale,
      discardedTrace: {
        ragioneSociale: candidate.ragioneSociale,
        stage: STAGE_LABEL,
        reason: `Azienda esclusa esplicitamente dall'utente (${candidate.ragioneSociale}).`,
      },
      searchQueries: [],
      citations: [],
      fallbackTriggered: false,
    };
  }
  const cleanName = sanitizeTextFields(candidate.ragioneSociale, {
    ensureTerminalPeriod: false,
  });
  const cleanCity = sanitizeTextFields(candidate.sedeCittaHint, {
    ensureTerminalPeriod: false,
  });
  const cleanRegion = sanitizeTextFields(candidate.sedeRegioneHint, {
    ensureTerminalPeriod: false,
  });
  const cleanNote = sanitizeTextFields(candidate.selectionNote);
  const primaryUrl = candidate.primaryUrl?.trim() || "";
  const extraAliases = (candidate.aliases ?? [])
    .filter((al) => al !== cleanName)
    .join(", ");
  const extraUrls = (candidate.additionalUrls ?? [])
    .filter((u) => u !== primaryUrl)
    .join(", ");
  const extraLocs = (candidate.extraLocations ?? []).join(", ");

  const candidateUrls = [
    candidate.financialUrl,
    primaryUrl,
    ...(candidate.additionalUrls ?? []),
  ].filter((u): u is string => Boolean(u?.trim()));

  const [siteCtx, finCtx] = await Promise.all([
    fetchCleanWebsiteContext(primaryUrl, 2500),
    fetchFinancialDirectoryContext(candidateUrls, 2800),
  ]);

  const preliminaryVat =
    normalizePartitaIva(finCtx?.financials?.partitaIva) ??
    normalizePartitaIva(siteCtx.financials?.partitaIva) ??
    normalizePartitaIva(siteCtx.extractedVat);

  // Fase 1 Lookup deterministico su reportaziende.it (tramite P.IVA estratta dal sito, URL noti o Ragione Sociale)
  let reportAziendeData = await resolveReportAziendeFinancials({
    ragioneSociale: cleanName,
    partitaIva: preliminaryVat,
    sedeCittaHint: cleanCity,
    sedeRegioneHint: cleanRegion,
    provinceHints: constraints.province,
    knownUrls: candidateUrls,
    timeoutMs: 3200,
  });

  const cleanUserPrompt = [
    `AZIENDA SINGOLA DA ANALIZZARE: ${cleanName}`,
    extraAliases
      ? `Alias / varianti societarie aggregate nella stessa entità: ${extraAliases}`
      : "",
    `Città/Regione indicativa: ${cleanCity} (${cleanRegion})`,
    extraLocs && extraLocs !== `${cleanCity} (${cleanRegion})`
      ? `Sedi/stabilimenti rilevati in fase di discovery: ${extraLocs}`
      : "",
    primaryUrl ? `URL primario noto: ${primaryUrl}` : "",
    candidate.financialUrl ? `URL scheda camerale nota: ${candidate.financialUrl}` : "",
    reportAziendeData?.sourceUrl
      ? `URL scheda ufficiale ReportAziende.it: ${reportAziendeData.sourceUrl}`
      : "",
    extraUrls ? `Altri URL associati alla stessa entità: ${extraUrls}` : "",
    reportAziendeData?.partitaIva || preliminaryVat
      ? `Partita IVA rilevata: ${reportAziendeData?.partitaIva || preliminaryVat}`
      : "",
    cleanNote ? `Note e trigger preliminari aggregati: ${cleanNote}` : "",
    reportAziendeData?.summaryTextForPrompt
      ? `${reportAziendeData.summaryTextForPrompt}\nATTENZIONE: I dati certificati qui sopra da reportaziende.it (Fatturato € ${(reportAziendeData.fatturatoValore ?? 0).toLocaleString("it-IT")} dell'anno ${reportAziendeData.fatturatoAnno ?? "ultimo"} e ${reportAziendeData.dipendenti ?? "N.D."} dipendenti) sono UFFICIALI E PRIORITARI: devi riportare esattamente questi valori numerici e l'anno ${reportAziendeData.fatturatoAnno ?? "ultimo"} senza inventare né usare annualità precedenti.`
      : "",
    siteCtx.cleanText
      ? `Testo grezzo estratto dal sito ufficiale (HTML/CSS rimossi):\n${siteCtx.cleanText}`
      : "",
    finCtx?.cleanText
      ? `Dati camerali e di bilancio estratti da portale pubblico:\n${finCtx.cleanText}`
      : "",
    finCtx?.financials?.fatturatoValore && !reportAziendeData?.fatturatoValore
      ? `Fatturato estratto da fonte camerale: € ${finCtx.financials.fatturatoValore.toLocaleString("it-IT")} (anno ${finCtx.financials.fatturatoAnno ?? "ultimo"})`
      : "",
    finCtx?.financials?.dipendenti && !reportAziendeData?.dipendenti
      ? `Dipendenti estratti da fonte camerale: ${finCtx.financials.dipendenti}`
      : "",
    siteCtx.financials?.fatturatoValore && !reportAziendeData?.fatturatoValore && !finCtx?.financials?.fatturatoValore
      ? `Fatturato estratto dal sito ufficiale: € ${siteCtx.financials.fatturatoValore.toLocaleString("it-IT")} (anno ${siteCtx.financials.fatturatoAnno ?? "ultimo"})`
      : "",
    siteCtx.financials?.dipendenti && !reportAziendeData?.dipendenti && !finCtx?.financials?.dipendenti
      ? `Dipendenti estratti dal sito ufficiale: ${siteCtx.financials.dipendenti}`
      : "",
    (reportAziendeData?.atecoCodice || finCtx?.financials?.atecoCodice || siteCtx.financials?.atecoCodice)
      ? `Codice ATECO estratto da fonte verificata: ${reportAziendeData?.atecoCodice || finCtx?.financials?.atecoCodice || siteCtx.financials?.atecoCodice}`
      : "",
    `Vincoli obbligatori utente: Settore=${constraints.settore ?? "N.D."} | Dimensione=${constraints.dimensioneAziendale ?? "N.D."} | Città/Province=${(constraints.province ?? []).join(", ") || "Nessuna specifica"} | Regioni=${constraints.regioni.join(", ") || constraints.macroArea || "Italia"} | FatturatoMin=${constraints.fatturatoMin ?? "Nessuno"} | FatturatoMax=${constraints.fatturatoMax ?? "Nessuno"} | DipendentiMin=${constraints.dipendentiMin ?? "Nessuno"} | DipendentiMax=${constraints.dipendentiMax ?? "Nessuno"}`,
    `Estrai dai dati forniti nel prompt (scheda ReportAziende, testo del sito ufficiale, dati camerali e note preliminari) le informazioni verificate di "${cleanName}": Partita IVA, Fatturato in Euro dell'ULTIMO anno disponibile (OBBLIGATORIO), Anno di bilancio (OBBLIGATORIO), Dipendenti (OBBLIGATORIO), Codice ATECO, sede effettiva e classificazione standardizzata \`cluster_macro\` + \`sub_cluster_specifico\` (max 3-4 parole). Se sono presenti dati certificati nei testi sopra, riportali con precisione. Ogni campo testuale descrittivo deve terminare sempre con un punto fermo (.) senza alcun troncamento o punti di sospensione (...).`,
  ]
    .filter(Boolean)
    .join("\n");

  const res = await callGeminiStructured<SingleCompanyExtractionResponse>({
    stepKey: "gatekeeper_extraction",
    systemInstruction,
    userPrompt: cleanUserPrompt,
    jsonSchema: SINGLE_COMPANY_EXTRACTION_SCHEMA,
    maxOutputTokens: 8192,
  });

  const item = res.data;
  const llmExtractedVat = normalizePartitaIva(item?.partitaIva);

  // Fase 2 Lookup deterministico su reportaziende.it:
  // - se non avevamo dati reportaziende.it prima della chiamata LLM, OPPURE
  // - se l'LLM ha precisato una Ragione Sociale diversa (es. da "Edison" a "Edison Energia S.p.A."),
  //   rieseguiamo il lookup per la specifica società individuata così che Nome, P.IVA, Fatturato, Dipendenti e ATECO appartengano tutti alla stessa persona giuridica!
  const llmResolvedBrand = item?.ragioneSociale
    ? normalizeCompanyBrandKey(item.ragioneSociale)
    : "";
  const raBrand = reportAziendeData?.ragioneSociale
    ? normalizeCompanyBrandKey(reportAziendeData.ragioneSociale)
    : "";
  const brandChangedByLlm =
    Boolean(llmResolvedBrand && raBrand && llmResolvedBrand !== raBrand);

  if (!reportAziendeData || brandChangedByLlm) {
    const postLlmUrls = [
      ...res.citations.map((c) => c.url),
      ...(item?.sources ?? []).map((s) => s.url),
    ];
    // Se il nome della società è cambiato (es. da Holding a Controllata), cerca per il nuovo nome senza forzare la vecchia P.IVA
    const refreshedData = await resolveReportAziendeFinancials({
      ragioneSociale: item?.ragioneSociale || cleanName,
      partitaIva: brandChangedByLlm
        ? llmExtractedVat
        : llmExtractedVat ?? preliminaryVat,
      sedeCittaHint: item?.sedeCitta || cleanCity,
      sedeRegioneHint: item?.sedeRegione || cleanRegion,
      provinceHints: constraints.province,
      knownUrls: postLlmUrls,
      timeoutMs: 3200,
    });
    if (refreshedData) {
      reportAziendeData = refreshedData;
    }
  }

  const resolvedName =
    sanitizeTextFields(item?.ragioneSociale, { ensureTerminalPeriod: false }) ||
    reportAziendeData?.ragioneSociale ||
    cleanName;
  const resolvedCity =
    sanitizeTextFields(item?.sedeCitta, { ensureTerminalPeriod: false }) ||
    reportAziendeData?.sedeCitta ||
    cleanCity ||
    "N.D.";
  const resolvedRegion =
    sanitizeTextFields(item?.sedeRegione, { ensureTerminalPeriod: false }) ||
    reportAziendeData?.sedeRegione ||
    cleanRegion ||
    "N.D.";
  const resolvedVat =
    normalizePartitaIva(reportAziendeData?.partitaIva) ??
    llmExtractedVat ??
    preliminaryVat ??
    "N.D.";

  const verifiedPortalSources = (
    reportAziendeData?.verifiedUrls ??
    (reportAziendeData?.sourceUrl
      ? [
          {
            title: `${resolvedName} — Bilancio Ufficiale`,
            url: reportAziendeData.sourceUrl,
          },
        ]
      : [])
  ).map((portalEntry) => ({
    title: `${resolvedName} — ${portalEntry.title}`,
    url: portalEntry.url,
    sourceType: "FINANCIAL" as const,
  }));

  const mergedRawSources = [
    ...verifiedPortalSources,
    ...(item?.sources ?? []),
    ...(primaryUrl && siteCtx.reachable
      ? [
          {
            title: `${resolvedName} — Sito Ufficiale`,
            url: primaryUrl,
            sourceType: "INSTITUTIONAL" as const,
          },
        ]
      : []),
    ...(candidate.financialUrl
      ? [
          {
            title: `${resolvedName} — Scheda Camerale / Bilancio`,
            url: candidate.financialUrl,
            sourceType: "FINANCIAL" as const,
          },
        ]
      : []),
    ...(candidate.additionalUrls ?? [])
      .filter((u) => u && u !== primaryUrl && u !== candidate.financialUrl)
      .map((u) => ({
        title: `${resolvedName} — Fonte Aggregata`,
        url: u,
        sourceType: "INSTITUTIONAL" as const,
      })),
    ...res.citations.map((cit) => ({
      title: cit.title,
      url: cit.url,
      sourceType: "FINANCIAL" as const,
    })),
  ];

  const sanitizedSources = sanitizeValidSources(mergedRawSources);
  const validSources =
    siteCtx.reachable && sanitizedSources.length > 0
      ? sanitizedSources
      : await verifyReachableSources(sanitizedSources);

  if (validSources.length === 0) {
    return {
      candidateName: resolvedName,
      discardedTrace: {
        ragioneSociale: resolvedName,
        stage: STAGE_LABEL,
        reason: "Assenza fonti URL ufficiali verificabili.",
      },
      searchQueries: res.searchQueries,
      citations: res.citations,
      fallbackTriggered: res.fallbackTriggered,
      warningMessage: res.warningMessage,
    };
  }

  const geoVerification = verifyStrictGeographyConstraint({
    ragioneSociale: resolvedName,
    sedeCitta: resolvedCity,
    sedeRegione: resolvedRegion,
    sedeCittaHint: candidate.sedeCittaHint || resolvedCity,
    constraints,
  });

  if (!geoVerification.passes) {
    return {
      candidateName: resolvedName,
      discardedTrace: {
        ragioneSociale: resolvedName,
        stage: STAGE_LABEL,
        reason:
          geoVerification.reason ??
          `Sede operativa (${resolvedCity}) fuori dal vincolo geografico richiesto.`,
      },
      searchQueries: res.searchQueries,
      citations: res.citations,
      fallbackTriggered: res.fallbackTriggered,
      warningMessage: res.warningMessage,
    };
  }

  if (!item.passesHardConstraints) {
    return {
      candidateName: resolvedName,
      discardedTrace: {
        ragioneSociale: resolvedName,
        stage: STAGE_LABEL,
        reason:
          sanitizeTextFields(item.discardReason) ||
          "Violazione dei vincoli rigidi (Settore / Geografia / Dimensione).",
      },
      searchQueries: res.searchQueries,
      citations: res.citations,
      fallbackTriggered: res.fallbackTriggered,
      warningMessage: res.warningMessage,
    };
  }

  // Risoluzione Fatturato: priorità assoluta al dato deterministico più recente da reportaziende.it / scheda camerale
  const rawRevFromItem =
    typeof item.fatturatoValore === "number" &&
    Number.isFinite(item.fatturatoValore) &&
    item.fatturatoValore > 0
      ? Math.round(item.fatturatoValore)
      : null;

  const rev =
    reportAziendeData?.fatturatoValore ??
    finCtx?.financials?.fatturatoValore ??
    rawRevFromItem ??
    siteCtx.financials?.fatturatoValore ??
    null;

  // Risoluzione Dipendenti: priorità assoluta al dato deterministico più recente da reportaziende.it / scheda camerale
  const rawEmployeesFromItem =
    typeof item.dipendenti === "number" &&
    Number.isFinite(item.dipendenti) &&
    item.dipendenti > 0
      ? Math.round(item.dipendenti)
      : null;

  const employees =
    reportAziendeData?.dipendenti ??
    finCtx?.financials?.dipendenti ??
    rawEmployeesFromItem ??
    siteCtx.financials?.dipendenti ??
    null;

  // REQUISITO IMPERATIVO: Il modello deve sempre restituire sia fatturato sia dipendenti
  if (rev === null || employees === null) {
    const missingDesc =
      rev === null && employees === null
        ? "Fatturato e numero dipendenti non reperiti"
        : rev === null
        ? "Fatturato non reperibile"
        : "Numero dipendenti non reperibile";

    return {
      candidateName: resolvedName,
      discardedTrace: {
        ragioneSociale: resolvedName,
        stage: STAGE_LABEL,
        reason: `${missingDesc} da fonti ufficiali/camerali (candidata scartata per garantire 100% dati di bilancio completi).`,
      },
      searchQueries: res.searchQueries,
      citations: res.citations,
      fallbackTriggered: res.fallbackTriggered,
      warningMessage: res.warningMessage,
    };
  }

  if (
    constraints.fatturatoMin !== null &&
    rev < constraints.fatturatoMin * 0.85
  ) {
    return {
      candidateName: resolvedName,
      discardedTrace: {
        ragioneSociale: resolvedName,
        stage: STAGE_LABEL,
        reason: `Fatturato fuori range (${rev.toLocaleString("it-IT")} € inferiore al minimo richiesto).`,
      },
      searchQueries: res.searchQueries,
      citations: res.citations,
      fallbackTriggered: res.fallbackTriggered,
      warningMessage: res.warningMessage,
    };
  }

  if (
    constraints.fatturatoMax !== null &&
    rev > constraints.fatturatoMax * 1.15
  ) {
    return {
      candidateName: resolvedName,
      discardedTrace: {
        ragioneSociale: resolvedName,
        stage: STAGE_LABEL,
        reason: `Fatturato fuori range (${rev.toLocaleString("it-IT")} € superiore al massimo richiesto).`,
      },
      searchQueries: res.searchQueries,
      citations: res.citations,
      fallbackTriggered: res.fallbackTriggered,
      warningMessage: res.warningMessage,
    };
  }

  const rawRevYearFromItem =
    typeof item.fatturatoAnno === "number" &&
    item.fatturatoAnno >= 2018 &&
    item.fatturatoAnno <= 2030
      ? Math.round(item.fatturatoAnno)
      : null;

  const revYear =
    reportAziendeData?.fatturatoAnno ??
    finCtx?.financials?.fatturatoAnno ??
    rawRevYearFromItem ??
    siteCtx.financials?.fatturatoAnno ??
    2024;

  const fallbackDim = `${employees.toLocaleString("it-IT")} dipendenti`;

  const verifiedKeyDataString = `Fatturato ${revYear}: ${rev.toLocaleString("it-IT")} €; ${employees.toLocaleString("it-IT")} dipendenti.`;

  const resolvedAteco =
    reportAziendeData?.atecoCodice ??
    (item.atecoCodice?.trim() &&
    item.atecoCodice.trim().toUpperCase() !== "NULL" &&
    item.atecoCodice.trim().toUpperCase() !== "N.D."
      ? sanitizeTextFields(item.atecoCodice, { ensureTerminalPeriod: false })
      : finCtx?.financials?.atecoCodice ??
        siteCtx.financials?.atecoCodice ??
        "N.D.");

  // Se reportAziendeData ha sovrascritto fatturato o dipendenti con i valori certificati più recenti,
  // garantisce che anche altriDatiChiave riporti i numeri esatti verificati senza discrepanze testuali
  const resolvedAltriDatiChiave =
    reportAziendeData?.fatturatoValore !== null &&
    reportAziendeData?.fatturatoValore !== undefined
      ? verifiedKeyDataString
      : sanitizeTextFields(item.altriDatiChiave) || verifiedKeyDataString;

  return {
    candidateName: resolvedName,
    qualifiedCompany: {
      ragioneSociale: resolvedName,
      partitaIva: resolvedVat,
      sedeCitta: resolvedCity,
      sedeRegione: resolvedRegion,
      atecoCodice: resolvedAteco,
      cluster_macro: normalizeClusterMacro(item.cluster_macro),
      sub_cluster_specifico: clampSubClusterWords(item.sub_cluster_specifico),
      bacinoClientiODimensione:
        sanitizeTextFields(item.bacinoClientiODimensione, {
          ensureTerminalPeriod: false,
        }) || fallbackDim,
      altriDatiChiave: resolvedAltriDatiChiave,
      fatturatoValore: rev,
      fatturatoAnno: revYear,
      dipendenti: employees,
      logoUrl: siteCtx.logoUrl ?? null,
      sources: validSources,
    },
    searchQueries: res.searchQueries,
    citations: res.citations,
    fallbackTriggered: res.fallbackTriggered,
    warningMessage: res.warningMessage,
  };
}

export async function runStep2Gatekeeper(
  input: Step2GatekeeperInput
): Promise<StepExecutionResult<Step2GatekeeperOutput>> {
  const STAGE_LABEL = "Step 2 — Gatekeeper & Parallel Data Extraction";

  if (input.candidates.length === 0) {
    return {
      output: {
        qualified: [],
        discarded: [],
        groundingQueries: [],
        groundingCitations: [],
      },
      modelUsed: UNIFIED_GEMINI_MODEL,
      fallbackTriggered: false,
    };
  }

  // Deduplicazione e Aggregazione Preventiva (Pre-Step 2/3 Entity Resolution)
  // prima di lanciare le chiamate parallele di estrazione profonda, tagliando a N aziende uniche
  const maxUniquePool =
    input.constraints.candidatePoolTarget ?? input.candidates.length;
  const { mergedCandidates, mergedDuplicatesTrace } =
    deduplicateAndMergeCandidates(input.candidates, maxUniquePool);

  const systemInstruction = buildStep2SystemInstruction();

  const settledResults = await Promise.allSettled(
    mergedCandidates.map((candidate) =>
      analyzeSingleCandidateInIsolation(
        candidate,
        input.constraints,
        systemInstruction
      )
    )
  );

  const rawQualified: VerifiedGatekeeperCompany[] = [];
  const discarded: DiscardedCompanyTrace[] = [...mergedDuplicatesTrace];
  const allQueries = new Set<string>();
  const citationsMap = new Map<string, GroundingCitation>();
  const warningsSet = new Set<string>();
  let anyFallbackTriggered = false;
  let idCounter = 1;

  settledResults.forEach((result, idx) => {
    const fallbackName =
      mergedCandidates[idx]?.ragioneSociale || `Candidata #${idx + 1}`;

    if (result.status === "rejected") {
      const errMsg =
        result.reason instanceof Error
          ? result.reason.message
          : String(result.reason);
      discarded.push({
        ragioneSociale: fallbackName,
        stage: STAGE_LABEL,
        reason: `Analisi isolata fallita senza bloccare il batch (${errMsg}).`,
      });
      return;
    }

    const outcome = result.value;
    if (outcome.fallbackTriggered) {
      anyFallbackTriggered = true;
    }
    if (outcome.warningMessage) {
      warningsSet.add(outcome.warningMessage);
    }
    for (const q of outcome.searchQueries) {
      allQueries.add(q);
    }
    for (const cit of outcome.citations) {
      if (!cit.url.toLowerCase().includes("linkedin.com") && !citationsMap.has(cit.url)) {
        citationsMap.set(cit.url, cit);
      }
    }

    if (outcome.discardedTrace) {
      discarded.push(outcome.discardedTrace);
      return;
    }

    if (outcome.qualifiedCompany) {
      rawQualified.push({
        id: `cmp_${idCounter++}`,
        ...outcome.qualifiedCompany,
      });
    }
  });

  const { deduplicated, discardedDuplicates } =
    deduplicateCompaniesKeepMostRecent(rawQualified, STAGE_LABEL);

  discarded.push(...discardedDuplicates);

  const qualified = deduplicated.map((comp, index) => ({
    ...comp,
    id: `cmp_${index + 1}`,
  }));

  return {
    output: {
      qualified,
      discarded,
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
