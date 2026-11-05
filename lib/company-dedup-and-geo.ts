import type {
  DiscardedCompanyTrace,
  ParsedSearchConstraints,
  Source,
} from "@/lib/types";

/**
 * Motore Deterministico di:
 * 1. Deduplicazione Aziendale & Prevalenza Annualità Recente (elimina doppioni con stessa P.IVA,
 *    stesso dominio ufficiale, stesso indirizzo Maps o stessa radice societaria come "Bending Spoons S.p.A."
 *    vs "Bending Spoons Operations S.p.A.", mantenendo sempre e solo il bilancio dell'anno più recente).
 * 2. Verifica Rigida del Vincolo Geografico (Città/Provincia/Regione: es. se richiesto "Torino",
 *    scarta rigorosamente Alessandria, Cuneo, Milano, ecc., lasciando piuttosto libere le posizioni in classifica).
 * 3. Calcolo Pool di Ricerca (Regola 2X fino a max 20 per ricerche generiche; solo le aziende nominate se specifiche).
 */

const DIRECTORY_AND_NEWS_DOMAINS = new Set([
  "ufficiocamerale.it",
  "fatturatoitalia.it",
  "reportaziende.it",
  "registroimprese.it",
  "aziende.it",
  "informazione-aziende.it",
  "guidamonaci.it",
  "kompass.com",
  "paginegialle.it",
  "cerved.com",
  "atoka.io",
  "creditsafe.com",
  "cribis.com",
  "dnb.com",
  "linkedin.com",
  "google.com",
  "google.it",
  "maps.google.com",
  "goo.gl",
  "wikipedia.org",
  "ilsole24ore.com",
  "milano-finanza.it",
  "repubblica.it",
  "corriere.it",
  "ansa.it",
  "forbes.it",
  "wired.it",
  "startupitalia.eu",
  "bebeez.it",
]);

const LEGAL_AND_VEHICLE_SUFFIXES = [
  "societa per azioni",
  "società per azioni",
  "s.p.a.",
  "s.p.a",
  "spa",
  "societa a responsabilita limitata",
  "società a responsabilità limitata",
  "s.r.l.s.",
  "s.r.l.",
  "s.r.l",
  "srls",
  "srl",
  "s.a.p.a.",
  "sapa",
  "s.a.s.",
  "sas",
  "s.n.c.",
  "snc",
  "soc. coop.",
  "societa cooperativa",
  "società cooperativa",
  "societa benefit",
  "società benefit",
  "s.b.",
  "unipersonale",
  "con socio unico",
  "a socio unico",
  "in liquidazione",
];

/**
 * Normalizza la Partita IVA / Codice Fiscale a 11 cifre numeriche se presente.
 */
export function normalizePartitaIva(
  rawVat: string | null | undefined
): string | null {
  if (!rawVat) return null;
  const match = rawVat.replace(/\s+/g, "").match(/(?:IT)?(\d{11})\b/i);
  return match ? match[1] : null;
}

/**
 * Estrae la chiave canonica del brand aziendale (es. "Bending Spoons S.p.A." e
 * "Bending Spoons Operations S.p.A." -> "bending spoons").
 */
export function normalizeCompanyBrandKey(ragioneSociale: string): string {
  let s = ragioneSociale
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[.,/#!$%^&*;:{}=\-_`~()'"[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // Rimuove iterativamente suffissi societari e veicoli operativi in coda
  let changed = true;
  while (changed) {
    changed = false;
    for (const suffix of LEGAL_AND_VEHICLE_SUFFIXES) {
      const cleanSuffix = suffix
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[.,]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      if (s === cleanSuffix) continue; // Non svuotare l'intero nome se coincide
      if (s.endsWith(` ${cleanSuffix}`)) {
        const candidate = s.slice(0, s.length - cleanSuffix.length).trim();
        if (candidate.length >= 2) {
          s = candidate;
          changed = true;
        }
      }
    }
  }

  return s.replace(/\s+/g, " ").trim();
}

/**
 * Verifica se un'azienda corrisponde a uno dei nomi presenti nella lista di esclusione (`excludedCompanies`).
 * Supporta confronto per brand canonico normalizzato, sottostringa su nome normalizzato e corrispondenza alfanumerica.
 */
export function isCompanyExcluded(
  companyName: string | null | undefined,
  excludedCompanies?: string[] | null
): boolean {
  if (!companyName || !excludedCompanies || excludedCompanies.length === 0) {
    return false;
  }

  const cleanName = companyName.trim();
  if (!cleanName) return false;

  const compBrand = normalizeCompanyBrandKey(cleanName);
  const compLower = cleanName.toLowerCase();
  const strip = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const compStripped = strip(cleanName);

  for (const rawExc of excludedCompanies) {
    const excClean = rawExc?.trim();
    if (!excClean) continue;

    const excBrand = normalizeCompanyBrandKey(excClean);
    const excLower = excClean.toLowerCase();
    const excStripped = strip(excClean);

    // 1. Corrispondenza esatta su brand canonico
    if (compBrand && excBrand && compBrand === excBrand) {
      return true;
    }

    // 2. Corrispondenza per sottostringa tra brand canonici (es. "enel" in "enel energia")
    if (
      compBrand &&
      excBrand &&
      (compBrand.includes(excBrand) || excBrand.includes(compBrand))
    ) {
      return true;
    }

    // 3. Corrispondenza diretta su stringa lowercase
    if (compLower.includes(excLower) || excLower.includes(compLower)) {
      return true;
    }

    // 4. Corrispondenza su stringa alfanumerica ripulita (es. "E.ON" vs "Eon")
    if (compStripped.length >= 2 && excStripped.length >= 2) {
      if (compStripped === excStripped) {
        return true;
      }
      if (
        excStripped.length >= 3 &&
        (compStripped.includes(excStripped) || excStripped.includes(compStripped))
      ) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Estrae il dominio web ufficiale dell'azienda (escludendo portali bilanci, social e news).
 */
export function extractCorporateDomainKey(
  urls: Array<string | null | undefined>
): string | null {
  for (const raw of urls) {
    const trimmed = raw?.trim();
    if (!trimmed) continue;
    try {
      const parsed = new URL(trimmed);
      const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
      if (!host || host.length < 4) continue;
      const isAggregator = Array.from(DIRECTORY_AND_NEWS_DOMAINS).some(
        (agg) => host === agg || host.endsWith(`.${agg}`)
      );
      if (!isAggregator) {
        return host;
      }
    } catch {
      // ignora URL malformati
    }
  }
  return null;
}

export interface DeduplicableCompanyRecord {
  ragioneSociale: string;
  partitaIva?: string | "N.D." | null;
  sedeCitta: string;
  sedeRegione: string;
  indirizzoVerificatoMaps?: string | "N.D.";
  fatturatoValore: number | null;
  fatturatoAnno: number | null;
  dipendenti: number | null;
  mapsWebsiteUri?: string | null;
  sources: Source[];
}

/**
 * Confronta due record della stessa azienda e determina quale sia il più recente e completo.
 * REGOLA UTENTE: se il modello ha a disposizione dati recenti (es. bilancio 2025),
 * quelli di anni precedenti (es. 2024) sono obsoleti e NON devono essere considerati.
 */
function pickMoreRecentCompanyRecord<T extends DeduplicableCompanyRecord>(
  a: T,
  b: T
): { winner: T; obsolete: T; reason: string } {
  const yearA = a.fatturatoAnno ?? 0;
  const yearB = b.fatturatoAnno ?? 0;

  let winner = a;
  let obsolete = b;

  if (yearB > yearA) {
    winner = b;
    obsolete = a;
  } else if (yearA === yearB) {
    // A parità di anno, preferisci quello con fatturato valorizzato e più completo
    const scoreA =
      (a.fatturatoValore !== null ? 2 : 0) +
      (a.dipendenti !== null ? 1 : 0) +
      (normalizePartitaIva(a.partitaIva) ? 1 : 0);
    const scoreB =
      (b.fatturatoValore !== null ? 2 : 0) +
      (b.dipendenti !== null ? 1 : 0) +
      (normalizePartitaIva(b.partitaIva) ? 1 : 0);

    if (
      scoreB > scoreA ||
      (scoreB === scoreA &&
        (b.fatturatoValore ?? 0) > (a.fatturatoValore ?? 0))
    ) {
      winner = b;
      obsolete = a;
    }
  }

  // Unisci le fonti uniche e mantieni eventuale P.IVA / Maps info se mancante sul winner
  const mergedSourcesMap = new Map<string, Source>();
  for (const src of [...winner.sources, ...obsolete.sources]) {
    if (!mergedSourcesMap.has(src.url)) {
      mergedSourcesMap.set(src.url, src);
    }
  }

  const enrichedWinner: T = {
    ...winner,
    partitaIva:
      normalizePartitaIva(winner.partitaIva) ??
      normalizePartitaIva(obsolete.partitaIva) ??
      winner.partitaIva,
    sources: Array.from(mergedSourcesMap.values()),
  };

  const yearExplanation =
    yearA > 0 && yearB > 0 && yearA !== yearB
      ? `dati bilancio ${obsolete.fatturatoAnno} obsoleti rispetto al bilancio più recente ${winner.fatturatoAnno} di ${winner.ragioneSociale}`
      : `entità duplicata / stesso gruppo riconoscitivo di ${winner.ragioneSociale}`;

  return {
    winner: enrichedWinner,
    obsolete,
    reason: `Azienda duplicata scartata (${yearExplanation})`,
  };
}

/**
 * Deduplica una lista di aziende basandosi su:
 * 1. Partita IVA / Codice Fiscale (11 cifre)
 * 2. Dominio web ufficiale dell'azienda
 * 3. Indirizzo fisico certificato Google Maps
 * 4. Radice canonica della Ragione Sociale (es. "Bending Spoons S.p.A." vs "Bending Spoons Operations S.p.A.")
 * Mantiene esclusivamente il record con i dati finanziari più recenti.
 */
export function deduplicateCompaniesKeepMostRecent<
  T extends DeduplicableCompanyRecord,
>(
  companies: T[],
  stageLabel: string
): {
  deduplicated: T[];
  discardedDuplicates: DiscardedCompanyTrace[];
} {
  const deduplicated: T[] = [];
  const discardedDuplicates: DiscardedCompanyTrace[] = [];

  for (const current of companies) {
    const currentVat = normalizePartitaIva(current.partitaIva);
    const currentBrand = normalizeCompanyBrandKey(current.ragioneSociale);
    const currentDomain = extractCorporateDomainKey([
      current.mapsWebsiteUri,
      ...current.sources.map((s) => s.url),
    ]);
    const currentAddress =
      current.indirizzoVerificatoMaps &&
      current.indirizzoVerificatoMaps !== "N.D."
        ? current.indirizzoVerificatoMaps.trim().toLowerCase()
        : null;

    const existingIdx = deduplicated.findIndex((existing) => {
      const existingVat = normalizePartitaIva(existing.partitaIva);
      if (currentVat && existingVat) {
        // Se entrambe hanno una Partita IVA verificata:
        // - stessa P.IVA -> sono esattamente la stessa società (duplicato certo)
        // - P.IVA diverse -> sono due persone giuridiche distinte (es. Edison S.p.A. vs Edison Energia S.p.A.):
        //   NON devono MAI essere fuse tra loro!
        return currentVat === existingVat;
      }

      const existingBrand = normalizeCompanyBrandKey(existing.ragioneSociale);
      if (currentBrand && existingBrand && currentBrand === existingBrand) {
        return true;
      }

      const existingDomain = extractCorporateDomainKey([
        existing.mapsWebsiteUri,
        ...existing.sources.map((s) => s.url),
      ]);
      // Considera lo stesso dominio web solo se i nomi normalizzati coincidono,
      // per evitare di fondere due società distinte dello stesso gruppo che condividono il portale corporate
      if (
        currentDomain &&
        existingDomain &&
        currentDomain === existingDomain &&
        currentBrand === existingBrand
      ) {
        return true;
      }

      const existingAddress =
        existing.indirizzoVerificatoMaps &&
        existing.indirizzoVerificatoMaps !== "N.D."
          ? existing.indirizzoVerificatoMaps.trim().toLowerCase()
          : null;
      if (
        currentAddress &&
        existingAddress &&
        currentAddress === existingAddress &&
        currentBrand === existingBrand
      ) {
        return true;
      }

      return false;
    });

    if (existingIdx === -1) {
      deduplicated.push(current);
      continue;
    }

    const existing = deduplicated[existingIdx];
    const { winner, obsolete, reason } = pickMoreRecentCompanyRecord(
      existing,
      current
    );
    deduplicated[existingIdx] = winner;
    discardedDuplicates.push({
      ragioneSociale: obsolete.ragioneSociale,
      stage: stageLabel,
      reason,
    });
  }

  return { deduplicated, discardedDuplicates };
}

/**
 * Mappa delle principali province italiane -> sigla automobilistica e regione,
 * usata per il controllo geografico deterministico (es. se richiesto "Torino",
 * rifiuta "Alessandria", "Cuneo", "Milano", ecc.).
 */
const ITALIAN_PROVINCE_INFO: Record<
  string,
  { code: string; region: string; aliases: string[] }
> = {
  torino: { code: "TO", region: "piemonte", aliases: ["torino", "turin"] },
  alessandria: { code: "AL", region: "piemonte", aliases: ["alessandria"] },
  asti: { code: "AT", region: "piemonte", aliases: ["asti"] },
  biella: { code: "BI", region: "piemonte", aliases: ["biella"] },
  cuneo: { code: "CN", region: "piemonte", aliases: ["cuneo"] },
  novara: { code: "NO", region: "piemonte", aliases: ["novara"] },
  vercelli: { code: "VC", region: "piemonte", aliases: ["vercelli"] },
  verbania: {
    code: "VB",
    region: "piemonte",
    aliases: ["verbania", "verbano", "cusio", "ossola"],
  },
  milano: { code: "MI", region: "lombardia", aliases: ["milano", "milan"] },
  bergamo: { code: "BG", region: "lombardia", aliases: ["bergamo"] },
  brescia: { code: "BS", region: "lombardia", aliases: ["brescia"] },
  como: { code: "CO", region: "lombardia", aliases: ["como"] },
  cremona: { code: "CR", region: "lombardia", aliases: ["cremona"] },
  lecco: { code: "LC", region: "lombardia", aliases: ["lecco"] },
  lodi: { code: "LO", region: "lombardia", aliases: ["lodi"] },
  mantova: { code: "MN", region: "lombardia", aliases: ["mantova"] },
  monza: {
    code: "MB",
    region: "lombardia",
    aliases: ["monza", "brianza", "monza e brianza"],
  },
  pavia: { code: "PV", region: "lombardia", aliases: ["pavia"] },
  sondrio: { code: "SO", region: "lombardia", aliases: ["sondrio"] },
  varese: { code: "VA", region: "lombardia", aliases: ["varese"] },
  genova: { code: "GE", region: "liguria", aliases: ["genova", "genoa"] },
  savona: { code: "SV", region: "liguria", aliases: ["savona"] },
  imperia: { code: "IM", region: "liguria", aliases: ["imperia"] },
  "la spezia": { code: "SP", region: "liguria", aliases: ["la spezia", "spezia"] },
  venezia: { code: "VE", region: "veneto", aliases: ["venezia", "venice"] },
  verona: { code: "VR", region: "veneto", aliases: ["verona"] },
  padova: { code: "PD", region: "veneto", aliases: ["padova", "padua"] },
  vicenza: { code: "VI", region: "veneto", aliases: ["vicenza"] },
  treviso: { code: "TV", region: "veneto", aliases: ["treviso"] },
  rovigo: { code: "RO", region: "veneto", aliases: ["rovigo"] },
  belluno: { code: "BL", region: "veneto", aliases: ["belluno"] },
  trento: {
    code: "TN",
    region: "trentino-alto adige",
    aliases: ["trento", "trentino"],
  },
  bolzano: {
    code: "BZ",
    region: "trentino-alto adige",
    aliases: ["bolzano", "bozen", "alto adige"],
  },
  trieste: {
    code: "TS",
    region: "friuli-venezia giulia",
    aliases: ["trieste"],
  },
  udine: { code: "UD", region: "friuli-venezia giulia", aliases: ["udine"] },
  pordenone: {
    code: "PN",
    region: "friuli-venezia giulia",
    aliases: ["pordenone"],
  },
  gorizia: {
    code: "GO",
    region: "friuli-venezia giulia",
    aliases: ["gorizia"],
  },
  bologna: {
    code: "BO",
    region: "emilia-romagna",
    aliases: ["bologna"],
  },
  modena: { code: "MO", region: "emilia-romagna", aliases: ["modena"] },
  parma: { code: "PR", region: "emilia-romagna", aliases: ["parma"] },
  "reggio emilia": {
    code: "RE",
    region: "emilia-romagna",
    aliases: ["reggio emilia", "reggio nell'emilia"],
  },
  piacenza: { code: "PC", region: "emilia-romagna", aliases: ["piacenza"] },
  ferrara: { code: "FE", region: "emilia-romagna", aliases: ["ferrara"] },
  ravenna: { code: "RA", region: "emilia-romagna", aliases: ["ravenna"] },
  forli: {
    code: "FC",
    region: "emilia-romagna",
    aliases: ["forli", "cesena", "forli-cesena"],
  },
  rimini: { code: "RN", region: "emilia-romagna", aliases: ["rimini"] },
  firenze: {
    code: "FI",
    region: "toscana",
    aliases: ["firenze", "florence"],
  },
  pisa: { code: "PI", region: "toscana", aliases: ["pisa"] },
  lucca: { code: "LU", region: "toscana", aliases: ["lucca"] },
  arezzo: { code: "AR", region: "toscana", aliases: ["arezzo"] },
  siena: { code: "SI", region: "toscana", aliases: ["siena"] },
  prato: { code: "PO", region: "toscana", aliases: ["prato"] },
  livorno: { code: "LI", region: "toscana", aliases: ["livorno"] },
  roma: { code: "RM", region: "lazio", aliases: ["roma", "rome"] },
  napoli: { code: "NA", region: "campania", aliases: ["napoli", "naples"] },
  salerno: { code: "SA", region: "campania", aliases: ["salerno"] },
  bari: { code: "BA", region: "puglia", aliases: ["bari"] },
  lecce: { code: "LE", region: "puglia", aliases: ["lecce"] },
  palermo: { code: "PA", region: "sicilia", aliases: ["palermo"] },
  catania: { code: "CT", region: "sicilia", aliases: ["catania"] },
  cagliari: { code: "CA", region: "sardegna", aliases: ["cagliari"] },
  sassari: { code: "SS", region: "sardegna", aliases: ["sassari"] },
  olbia: {
    code: "SS",
    region: "sardegna",
    aliases: ["olbia", "olbia-tempio", "tempio pausania", "tempio", "ot"],
  },
  nuoro: { code: "NU", region: "sardegna", aliases: ["nuoro"] },
  oristano: { code: "OR", region: "sardegna", aliases: ["oristano"] },
  perugia: { code: "PG", region: "umbria", aliases: ["perugia"] },
  ancona: { code: "AN", region: "marche", aliases: ["ancona"] },
  pescara: { code: "PE", region: "abruzzo", aliases: ["pescara"] },
};

export function cleanGeoToken(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

/**
 * Confronta in modo flessibile ma controllato due token geografici (es. città e vincolo target/keyword/provincia).
 * Riconosce corrispondenza esatta, confini di parola e inclusioni controllate per evitare falsi positivi.
 */
export function matchesGeoToken(city: string, target: string): boolean {
  const c = cleanGeoToken(city);
  const t = cleanGeoToken(target);
  if (!c || !t) return false;
  if (c === t) return true;

  // Corrispondenza con confini di parola (evita che "re" corrisponda a "reti" o "pi" a "pisa")
  const escapedC = c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const escapedT = t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  const regexC = new RegExp(`(^|\\s|[,./\\-_])${escapedC}($|\\s|[,./\\-_])`, "i");
  const regexT = new RegExp(`(^|\\s|[,./\\-_])${escapedT}($|\\s|[,./\\-_])`, "i");

  if (regexC.test(t) || regexT.test(c)) return true;

  // Se entrambi i termini hanno lunghezza sufficiente (>= 4 caratteri), ammette l'inclusione di stringa
  if (c.length >= 4 && t.length >= 4 && (c.includes(t) || t.includes(c))) {
    return true;
  }

  return false;
}

/**
 * Verifica in modo deterministico se la sede dell'azienda rispetta il vincolo geografico richiesto.
 *
 * SOFTENING GEOGRAFICO:
 * Un'azienda supera sempre la validazione geografica se il suo `sedeCittaHint` (o `sedeCitta`)
 * coincide con o è contenuto in:
 * - `constraints.province`
 * - `constraints.areaGeograficaRaw`
 * - `constraints.cittaTarget`
 * - `constraints.keywords`
 *
 * Se non soddisfa il match diretto ammorbidito, vengono applicati i vincoli di esclusione
 * per provincia specifica / città target / regione richiesta.
 */
export function verifyStrictGeographyConstraint(params: {
  ragioneSociale: string;
  sedeCitta: string;
  sedeRegione: string;
  indirizzoVerificatoMaps?: string | "N.D." | null;
  constraints: ParsedSearchConstraints;
  sedeCittaHint?: string | null;
}): { passes: boolean; reason?: string } {
  const {
    ragioneSociale,
    sedeCitta,
    sedeRegione,
    indirizzoVerificatoMaps,
    constraints,
    sedeCittaHint,
  } = params;

  // Se l'utente ha chiesto specificamente una determinata azienda per nome (es. "Valuta Bending Spoons e Vodafone Italia"),
  // non scartarla per un filtro geografico globale salvo che l'azienda stessa sia in una città diversa da quella richiesta per lei.
  const specificList = constraints.specificCompanyNames ?? [];
  if (specificList.length > 0) {
    const companyBrand = normalizeCompanyBrandKey(ragioneSociale);
    const isExplicitlyNamed = specificList.some((named) => {
      const nb = normalizeCompanyBrandKey(named);
      return (
        nb &&
        (companyBrand.includes(nb) ||
          nb.includes(companyBrand) ||
          ragioneSociale.toLowerCase().includes(named.toLowerCase()))
      );
    });
    if (isExplicitlyNamed) {
      return { passes: true };
    }
  }

  const candidateCity = (sedeCittaHint || sedeCitta || "").trim();
  const cityHintNorm = cleanGeoToken(candidateCity);

  // =========================================================================
  // SOFTENING GEOGRAFICO IMMEDIATO:
  // Se `sedeCittaHint` (o `sedeCitta`) matcha province, areaGeograficaRaw,
  // cittaTarget o keywords, la validazione geografica viene superata immediatamente.
  // =========================================================================
  if (cityHintNorm && cityHintNorm !== "n.d." && cityHintNorm !== "nd") {
    const matchesProvince = (constraints.province ?? []).some((prov) =>
      matchesGeoToken(cityHintNorm, prov)
    );

    const matchesAreaGeograficaRaw = Boolean(
      constraints.areaGeograficaRaw &&
        matchesGeoToken(cityHintNorm, constraints.areaGeograficaRaw)
    );

    const matchesCittaTarget = (constraints.cittaTarget ?? []).some((targetCity) =>
      matchesGeoToken(cityHintNorm, targetCity)
    );

    const matchesKeywords = (constraints.keywords ?? []).some((kw) =>
      matchesGeoToken(cityHintNorm, kw)
    );

    if (
      matchesProvince ||
      matchesAreaGeograficaRaw ||
      matchesCittaTarget ||
      matchesKeywords
    ) {
      return { passes: true };
    }
  }

  const requestedTargets = [
    ...(constraints.cittaTarget ?? []),
    ...(constraints.province ?? []),
  ]
    .map(cleanGeoToken)
    .filter(Boolean);
  const requestedRegions = (constraints.regioni ?? [])
    .map(cleanGeoToken)
    .filter(Boolean);

  const cityNorm = cleanGeoToken(sedeCitta);
  const regionNorm = cleanGeoToken(sedeRegione);
  const mapsAddrRaw =
    indirizzoVerificatoMaps && indirizzoVerificatoMaps !== "N.D."
      ? indirizzoVerificatoMaps
      : "";
  const mapsAddrNorm = cleanGeoToken(mapsAddrRaw);

  // 1. Vincolo rigido su Città / Provincia specifica o Città Target
  if (requestedTargets.length > 0) {
    const matchedTarget = requestedTargets.some((reqTarget) => {
      const provEntry = Object.values(ITALIAN_PROVINCE_INFO).find(
        (info) =>
          info.aliases.includes(reqTarget) ||
          info.code.toLowerCase() === reqTarget
      );

      // Controllo 1: il nome della città coincide o contiene la città/provincia target
      if (
        matchesGeoToken(cityNorm, reqTarget) ||
        matchesGeoToken(cityHintNorm, reqTarget)
      ) {
        return true;
      }

      // Controllo 2: se abbiamo l'indirizzo certificato Google Maps, verifica che contenga la città o la sigla provincia (es. "10121 Torino TO" o " TO,")
      if (mapsAddrRaw) {
        if (matchesGeoToken(mapsAddrNorm, reqTarget)) {
          return true;
        }
        if (provEntry) {
          const codeRegex = new RegExp(`\\b${provEntry.code}\\b`);
          if (codeRegex.test(mapsAddrRaw)) {
            return true;
          }
        }
      }

      return false;
    });

    if (!matchedTarget) {
      return {
        passes: false,
        reason: `Sede operativa fuori dal vincolo geografico richiesto: trovata a "${candidateCity || sedeCitta}" anziché in "${[...(constraints.cittaTarget ?? []), ...(constraints.province ?? [])].join(", ")}"`,
      };
    }
  }

  // 2. Vincolo rigido su Regione (quando non sono specificate province o città target specifiche)
  if (requestedRegions.length > 0 && requestedTargets.length === 0) {
    // Risale anche alla regione a partire dalla città se sedeRegione non è precisa
    let inferredRegion = regionNorm;
    for (const [, info] of Object.entries(ITALIAN_PROVINCE_INFO)) {
      if (
        info.aliases.some(
          (alias) => cityNorm.includes(alias) || cityHintNorm.includes(alias)
        )
      ) {
        inferredRegion = info.region;
        break;
      }
    }

    const matchedRegion = requestedRegions.some(
      (reqReg) =>
        inferredRegion.includes(reqReg) ||
        reqReg.includes(inferredRegion) ||
        regionNorm.includes(reqReg) ||
        mapsAddrNorm.includes(reqReg)
    );

    if (!matchedRegion && inferredRegion && inferredRegion !== "n.d.") {
      return {
        passes: false,
        reason: `Sede operativa fuori regione target: "${candidateCity || sedeCitta} (${sedeRegione})" non appartiene a "${constraints.regioni.join(", ")}"`,
      };
    }
  }

  return { passes: true };
}

/**
 * Calcola quante aziende candidate il modello deve cercare nello Step 1/2 (Discovery):
 * - Se l'utente ha chiesto aziende specifiche per nome (`specificCompanyNames.length > 0`):
 *   cerca ESATTAMENTE quelle singole aziende e non di più (fino al cap massimo di 20).
 * - Se l'utente ha chiesto X aziende generiche (default X = 5):
 *   imposta `candidatePoolTarget` = `min(20, 2 * X)` (es. N = 10 quando X = 5) e richiede
 *   al motore di Discovery un sovra-campionamento grezzo `discoveryOversampleTarget` = `N + 4`
 *   (es. 14 candidati grezzi quando ne servono N = 10) così da avere ricambi pronti dopo
 *   la deduplicazione e aggregazione preventiva (`deduplicateAndMergeCandidates`).
 */
export function computeDiscoveryPoolTarget(params: {
  requestedCount: number;
  specificCompanyNames: string[];
  maxCap: number;
}): {
  effectiveRequestedCount: number;
  candidatePoolTarget: number;
  discoveryOversampleTarget: number;
} {
  const { requestedCount, specificCompanyNames, maxCap } = params;

  if (specificCompanyNames.length > 0) {
    const exactSpecificCount = Math.min(maxCap, specificCompanyNames.length);
    return {
      effectiveRequestedCount: exactSpecificCount,
      candidatePoolTarget: exactSpecificCount,
      discoveryOversampleTarget: exactSpecificCount,
    };
  }

  const effectiveRequestedCount = Math.max(1, Math.min(maxCap, requestedCount));
  const candidatePoolTarget = Math.min(maxCap, effectiveRequestedCount * 2);
  const discoveryOversampleTarget = Math.min(24, candidatePoolTarget + 4);

  return {
    effectiveRequestedCount,
    candidatePoolTarget,
    discoveryOversampleTarget,
  };
}

export interface PreliminaryCandidateSeed {
  ragioneSociale: string;
  primaryUrl: string;
  financialUrl?: string;
  sedeCittaHint: string;
  sedeRegioneHint: string;
  selectionNote: string;
  aliases?: string[];
  additionalUrls?: string[];
  extraLocations?: string[];
}

const GENERIC_BRAND_STOPWORDS = new Set([
  "azienda",
  "imprese",
  "impresa",
  "societa",
  "servizi",
  "sistemi",
  "prodotti",
  "industria",
  "industriale",
  "italiana",
  "italiano",
  "nord",
  "sud",
  "centro",
]);

function extractSignificantBrandTokens(brandKey: string): string[] {
  return brandKey
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2 && !GENERIC_BRAND_STOPWORDS.has(t));
}

/**
 * Verifica se due chiavi brand normalizzate rappresentano ESATTAMENTE la stessa persona giuridica
 * (es. "edison energia" vs "edison energia" con o senza S.p.A./S.r.l., oppure "eni plenitude" vs "eni plenitude").
 *
 * IMPORTANTE: NON unisce mai una Holding capogruppo con una sua Controllata operativa
 * (es. "edison" !== "edison energia", "iren" !== "iren mercato", "a2a" !== "a2a energia",
 * "bending spoons" !== "bending spoons operations") per evitare che i bilanci di due società
 * distinte vengano mescolati tra loro.
 */
export function areSameCompanyBrandEntities(
  brandA: string,
  brandB: string
): boolean {
  if (!brandA || !brandB) return false;
  if (brandA === brandB) return true;

  const tokensA = extractSignificantBrandTokens(brandA);
  const tokensB = extractSignificantBrandTokens(brandB);

  if (tokensA.length === 0 || tokensB.length === 0) {
    return false;
  }

  // Due denominazioni sono la stessa entità solo se hanno esattamente gli stessi token significativi
  if (tokensA.length !== tokensB.length) {
    return false;
  }

  return tokensA.every((tok, idx) => tok === tokensB[idx]);
}

/**
 * Modulo di Deduplicazione e Aggregazione Preventiva (Pre-Step 3 Entity Resolution):
 * Agisce PRIMA di lanciare i sub-agenti di estrazione profonda per:
 * 1. Normalizzare i nomi rimuovendo forme societarie (S.p.A., S.r.l., Group, Holding, Italia, Italy, ecc.),
 *    punteggiatura e spazi, e confrontare anche il dominio web o la somiglianza sui token principali del brand.
 * 2. Riconoscere come un'unica azienda il nome commerciale e la ragione sociale storica, oppure due stabilimenti/sedi
 *    della stessa azienda in Italia.
 * 3. NON scartare le informazioni dei duplicati, ma AGGREGARE in un unico oggetto aziendale tutti gli snippet,
 *    i siti web, le sedi e i trigger preliminari trovati, contandola come 1 sola azienda.
 */
export function deduplicateAndMergeCandidates<T extends PreliminaryCandidateSeed>(
  candidates: T[],
  maxUniqueCount?: number
): {
  mergedCandidates: T[];
  mergedDuplicatesTrace: DiscardedCompanyTrace[];
} {
  const mergedList: T[] = [];
  const mergedDuplicatesTrace: DiscardedCompanyTrace[] = [];

  for (const current of candidates) {
    const currentName = current.ragioneSociale?.trim();
    if (!currentName) continue;

    const currentBrand = normalizeCompanyBrandKey(currentName);
    const currentDomain = extractCorporateDomainKey([
      current.primaryUrl,
      ...(current.additionalUrls ?? []),
    ]);

    const existingIdx = mergedList.findIndex((existing) => {
      const existingBrand = normalizeCompanyBrandKey(existing.ragioneSociale);
      if (areSameCompanyBrandEntities(currentBrand, existingBrand)) {
        return true;
      }

      // Controlla anche eventuali alias già registrati
      if (
        (existing.aliases ?? []).some((al) =>
          areSameCompanyBrandEntities(currentBrand, normalizeCompanyBrandKey(al))
        )
      ) {
        return true;
      }

      const existingDomain = extractCorporateDomainKey([
        existing.primaryUrl,
        ...(existing.additionalUrls ?? []),
      ]);
      if (
        currentDomain &&
        existingDomain &&
        currentDomain === existingDomain &&
        areSameCompanyBrandEntities(currentBrand, existingBrand)
      ) {
        return true;
      }

      return false;
    });

    if (existingIdx === -1) {
      mergedList.push({
        ...current,
        aliases: Array.from(
          new Set([currentName, ...(current.aliases ?? [])].filter(Boolean))
        ),
        additionalUrls: Array.from(
          new Set(
            [current.primaryUrl, ...(current.additionalUrls ?? [])]
              .map((u) => u?.trim())
              .filter((u): u is string => Boolean(u))
          )
        ),
        extraLocations: Array.from(
          new Set(
            [
              current.sedeCittaHint && current.sedeCittaHint !== "N.D."
                ? `${current.sedeCittaHint} (${current.sedeRegioneHint || "Italia"})`
                : "",
              ...(current.extraLocations ?? []),
            ].filter(Boolean)
          )
        ),
      });
      continue;
    }

    // AGGREGAZIONE (MERGE) DEI DATI PRELIMINARI IN UN'UNICA ENTITÀ AZIENDALE
    const existing = mergedList[existingIdx];

    // Preferisci come denominazione principale quella più completa/formale (es. con S.p.A. / S.r.l.)
    const hasFormalLegalCurrent = /\b(?:s\.?p\.?a\.?|s\.?r\.?l\.?|societ[aà])\b/i.test(
      currentName
    );
    const hasFormalLegalExisting = /\b(?:s\.?p\.?a\.?|s\.?r\.?l\.?|societ[aà])\b/i.test(
      existing.ragioneSociale
    );
    const primaryName =
      !hasFormalLegalExisting && hasFormalLegalCurrent
        ? currentName
        : existing.ragioneSociale;

    const combinedAliases = Array.from(
      new Set(
        [
          existing.ragioneSociale,
          currentName,
          ...(existing.aliases ?? []),
          ...(current.aliases ?? []),
        ].filter(Boolean)
      )
    );

    const combinedUrls = Array.from(
      new Set(
        [
          existing.primaryUrl,
          current.primaryUrl,
          ...(existing.additionalUrls ?? []),
          ...(current.additionalUrls ?? []),
        ]
          .map((u) => u?.trim())
          .filter((u): u is string => Boolean(u))
      )
    );

    const combinedLocations = Array.from(
      new Set(
        [
          existing.sedeCittaHint && existing.sedeCittaHint !== "N.D."
            ? `${existing.sedeCittaHint} (${existing.sedeRegioneHint || "Italia"})`
            : "",
          current.sedeCittaHint && current.sedeCittaHint !== "N.D."
            ? `${current.sedeCittaHint} (${current.sedeRegioneHint || "Italia"})`
            : "",
          ...(existing.extraLocations ?? []),
          ...(current.extraLocations ?? []),
        ].filter(Boolean)
      )
    );

    const noteParts = Array.from(
      new Set(
        [existing.selectionNote?.trim(), current.selectionNote?.trim()].filter(
          (n): n is string => Boolean(n && n.length > 0)
        )
      )
    );

    mergedList[existingIdx] = {
      ...existing,
      ragioneSociale: primaryName,
      primaryUrl: existing.primaryUrl?.trim() || current.primaryUrl?.trim() || "",
      sedeCittaHint:
        existing.sedeCittaHint && existing.sedeCittaHint !== "N.D."
          ? existing.sedeCittaHint
          : current.sedeCittaHint,
      sedeRegioneHint:
        existing.sedeRegioneHint && existing.sedeRegioneHint !== "N.D."
          ? existing.sedeRegioneHint
          : current.sedeRegioneHint,
      selectionNote: noteParts.join(" | "),
      financialUrl: existing.financialUrl || current.financialUrl,
      aliases: combinedAliases,
      additionalUrls: combinedUrls,
      extraLocations: combinedLocations,
    };

    mergedDuplicatesTrace.push({
      ragioneSociale: currentName,
      stage: "Pre-Step 2/3 — Entity Resolution & Aggregazione Duplicati",
      reason: `Entità aggregata preventivamente in "${primaryName}" (uniti alias, siti web, sedi e note preliminari senza sprecare chiamate API duplicate).`,
    });
  }

  const finalSlice =
    typeof maxUniqueCount === "number" && maxUniqueCount > 0
      ? mergedList.slice(0, maxUniqueCount)
      : mergedList;

  return {
    mergedCandidates: finalSlice,
    mergedDuplicatesTrace,
  };
}
