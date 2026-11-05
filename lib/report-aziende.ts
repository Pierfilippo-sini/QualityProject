/**
 * Modulo Deterministico di Ricerca, Risoluzione URL e Cross-Check Bilanci in Parallelo
 * su `reportaziende.it` + `fatturatoitalia.it`.
 *
 * Vantaggi architetturali del doppio portale in parallelo:
 * A. Risolve il problema dei "cambi di denominazione" (Rebranding societario):
 *    - Esempio reale (P.IVA 01812630224):
 *      - su `fatturatoitalia.it` usa la nuova denominazione commerciale:
 *        `https://www.fatturatoitalia.it/dolomiti-energia-mercato-spa-01812630224` (Dolomiti Energia Mercato S.p.A.)
 *      - su `reportaziende.it` usa la denominazione storica/estesa:
 *        `https://www.reportaziende.it/dolomiti_energia_societa_per_azioni_tn_01812630224` (Dolomiti Energia Società per Azioni)
 *    - Cercando in parallelo per nome su entrambi i portali, almeno uno dei due fa match immediato;
 *      una volta ottenuta la Partita IVA (01812630224), interroga istantaneamente anche l'altro portale per P.IVA!
 * B. Costruzione URL deterministica:
 *    - `fatturatoitalia.it`: `/{nome-con-trattini}-{partita_iva}` (non richiede nemmeno la sigla provincia)
 *    - `reportaziende.it`: `/{nome_con_underscore}_{sigla_provincia}_{partita_iva}`
 * C. Cross-check sull'annualità più recente e sui dipendenti:
 *    - Confronta `fatturatoAnno` tra `reportaziende.it` e `fatturatoitalia.it` e seleziona automaticamente
 *      il bilancio dell'anno più recente;
 *    - Integra il numero esatto di dipendenti (da `datiGraficoOrig` di `reportaziende.it`, che fornisce il valore
 *      puntuale es. 225 anziché la fascia "da 100 a 249") e restituisce entrambi gli URL verificati in `verifiedUrls`.
 */

import {
  normalizeCompanyBrandKey,
  normalizePartitaIva,
} from "./company-dedup-and-geo";

export interface ReportAziendeVerifiedData {
  sourceUrl: string;
  verifiedUrls: Array<{ title: string; url: string }>;
  ragioneSociale: string | null;
  partitaIva: string | null;
  sedeCitta: string | null;
  sedeProvinciaSigla: string | null;
  sedeRegione: string | null;
  atecoCodice: string | null;
  atecoDescrizione: string | null;
  fatturatoValore: number | null;
  fatturatoAnno: number | null;
  utileValore: number | null;
  dipendenti: number | null;
  dipendentiAnno: number | null;
  historicalRevenues: Array<{ anno: number; valore: number }>;
  historicalEmployees: Array<{ anno: number; dipendenti: number }>;
  summaryTextForPrompt: string;
}

export interface ReportAziendeSearchRow {
  path: string;
  url: string;
  titleName: string;
  shortName: string;
  partitaIva: string | null;
  localita: string | null;
  provinciaSigla: string | null;
  utileValore: number | null;
  fatturatoValore: number | null;
  dipendenti: number | null;
  anno: number | null;
}

export interface FatturatoItaliaSearchResultItem {
  name: string;
  province: string;
  tax_code: string;
  url: string;
}

const REPORT_AZIENDE_BASE_URL = "https://www.reportaziende.it";
const REPORT_AZIENDE_SEARCH_ENDPOINT = `${REPORT_AZIENDE_BASE_URL}/assets/components/tabellaRicerca.php`;

const FATTURATO_ITALIA_BASE_URL = "https://www.fatturatoitalia.it";
const FATTURATO_ITALIA_SEARCH_ENDPOINT = `${FATTURATO_ITALIA_BASE_URL}/risultato-di-ricerca`;

const PROVINCE_CODE_TO_REGION: Record<string, string> = {
  TO: "Piemonte",
  AL: "Piemonte",
  AT: "Piemonte",
  BI: "Piemonte",
  CN: "Piemonte",
  NO: "Piemonte",
  VC: "Piemonte",
  VB: "Piemonte",
  MI: "Lombardia",
  BG: "Lombardia",
  BS: "Lombardia",
  CO: "Lombardia",
  CR: "Lombardia",
  LC: "Lombardia",
  LO: "Lombardia",
  MN: "Lombardia",
  MB: "Lombardia",
  PV: "Lombardia",
  SO: "Lombardia",
  VA: "Lombardia",
  GE: "Liguria",
  SV: "Liguria",
  IM: "Liguria",
  SP: "Liguria",
  VE: "Veneto",
  VR: "Veneto",
  PD: "Veneto",
  VI: "Veneto",
  TV: "Veneto",
  RO: "Veneto",
  BL: "Veneto",
  TN: "Trentino-Alto Adige",
  BZ: "Trentino-Alto Adige",
  TS: "Friuli-Venezia Giulia",
  UD: "Friuli-Venezia Giulia",
  PN: "Friuli-Venezia Giulia",
  GO: "Friuli-Venezia Giulia",
  BO: "Emilia-Romagna",
  MO: "Emilia-Romagna",
  PR: "Emilia-Romagna",
  RE: "Emilia-Romagna",
  PC: "Emilia-Romagna",
  FE: "Emilia-Romagna",
  RA: "Emilia-Romagna",
  FC: "Emilia-Romagna",
  RN: "Emilia-Romagna",
  FI: "Toscana",
  PI: "Toscana",
  LU: "Toscana",
  AR: "Toscana",
  SI: "Toscana",
  PO: "Toscana",
  LI: "Toscana",
  MS: "Toscana",
  PT: "Toscana",
  GR: "Toscana",
  RM: "Lazio",
  VT: "Lazio",
  RI: "Lazio",
  LT: "Lazio",
  FR: "Lazio",
  NA: "Campania",
  SA: "Campania",
  CE: "Campania",
  AV: "Campania",
  BN: "Campania",
  BA: "Puglia",
  LE: "Puglia",
  TA: "Puglia",
  BR: "Puglia",
  FG: "Puglia",
  BT: "Puglia",
  PA: "Sicilia",
  CT: "Sicilia",
  ME: "Sicilia",
  SR: "Sicilia",
  RG: "Sicilia",
  TP: "Sicilia",
  AG: "Sicilia",
  CL: "Sicilia",
  EN: "Sicilia",
  CA: "Sardegna",
  SS: "Sardegna",
  NU: "Sardegna",
  OR: "Sardegna",
  SU: "Sardegna",
  PG: "Umbria",
  TR: "Umbria",
  AN: "Marche",
  PU: "Marche",
  MC: "Marche",
  AP: "Marche",
  FM: "Marche",
  PE: "Abruzzo",
  AQ: "Abruzzo",
  CH: "Abruzzo",
  TE: "Abruzzo",
  CB: "Molise",
  IS: "Molise",
  PZ: "Basilicata",
  MT: "Basilicata",
  CS: "Calabria",
  CZ: "Calabria",
  RC: "Calabria",
  KR: "Calabria",
  VV: "Calabria",
  AO: "Valle d'Aosta",
};

const CITY_OR_PROV_NAME_TO_CODE: Record<string, string> = {
  torino: "TO",
  alessandria: "AL",
  asti: "AT",
  biella: "BI",
  cuneo: "CN",
  novara: "NO",
  caltignaga: "NO",
  vercelli: "VC",
  verbania: "VB",
  milano: "MI",
  bergamo: "BG",
  brescia: "BS",
  como: "CO",
  cremona: "CR",
  lecco: "LC",
  lodi: "LO",
  mantova: "MN",
  monza: "MB",
  pavia: "PV",
  sondrio: "SO",
  varese: "VA",
  genova: "GE",
  savona: "SV",
  imperia: "IM",
  "la spezia": "SP",
  venezia: "VE",
  verona: "VR",
  padova: "PD",
  vicenza: "VI",
  treviso: "TV",
  rovigo: "RO",
  belluno: "BL",
  trento: "TN",
  bolzano: "BZ",
  trieste: "TS",
  udine: "UD",
  pordenone: "PN",
  gorizia: "GO",
  bologna: "BO",
  modena: "MO",
  parma: "PR",
  "reggio emilia": "RE",
  piacenza: "PC",
  ferrara: "FE",
  ravenna: "RA",
  forli: "FC",
  cesena: "FC",
  rimini: "RN",
  firenze: "FI",
  pisa: "PI",
  lucca: "LU",
  arezzo: "AR",
  siena: "SI",
  prato: "PO",
  livorno: "LI",
  roma: "RM",
  napoli: "NA",
  salerno: "SA",
  bari: "BA",
  lecce: "LE",
  palermo: "PA",
  catania: "CT",
  cagliari: "CA",
  perugia: "PG",
  ancona: "AN",
  pescara: "PE",
};

function toTitleCaseCity(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const cleaned = raw.replace(/\s*\([A-Za-zÀ-ÿ\s]{2,}\)\s*$/i, "").trim();
  if (!cleaned) return null;
  return cleaned
    .toLowerCase()
    .split(/\s+/)
    .map((w) => (w.length > 0 ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

function inferProvinceCodeFromHint(
  cityOrProvHint: string | null | undefined
): string | null {
  if (!cityOrProvHint) return null;
  const trimmed = cityOrProvHint.trim();
  const parenMatch = trimmed.match(/\(([A-Z]{2})\)/i);
  if (parenMatch?.[1]) {
    return parenMatch[1].toUpperCase();
  }
  if (/^[A-Z]{2}$/i.test(trimmed)) {
    return trimmed.toUpperCase();
  }
  const lower = trimmed
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  for (const [cityKey, code] of Object.entries(CITY_OR_PROV_NAME_TO_CODE)) {
    if (lower === cityKey || lower.includes(cityKey)) {
      return code;
    }
  }
  return null;
}

/**
 * Costruisce i possibili slug URL di `reportaziende.it`:
 * `https://www.reportaziende.it/{nome_con_underscore}_{sigla_provincia}_{partita_iva}`
 */
export function buildReportAziendeCandidateUrls(params: {
  ragioneSociale: string;
  partitaIva?: string | null;
  sedeCittaHint?: string | null;
  provinceHints?: string[];
}): string[] {
  const vat = normalizePartitaIva(params.partitaIva);
  if (!vat) return [];

  const rawSlug = params.ragioneSociale
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/s\.?\s*r\.?\s*l\.?\s*s\.?/g, "srls")
    .replace(/s\.?\s*r\.?\s*l\.?/g, "srl")
    .replace(/s\.?\s*p\.?\s*a\.?/g, "spa")
    .replace(/s\.?\s*n\.?\s*c\.?/g, "snc")
    .replace(/s\.?\s*a\.?\s*s\.?/g, "sas")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  if (!rawSlug) return [];

  const slugVariants = new Set<string>([rawSlug]);
  if (!rawSlug.endsWith("_srl") && !rawSlug.endsWith("_spa")) {
    slugVariants.add(`${rawSlug}_srl`);
    slugVariants.add(`${rawSlug}_spa`);
  }

  const provCodes = new Set<string>();
  const fromCity = inferProvinceCodeFromHint(params.sedeCittaHint);
  if (fromCity) provCodes.add(fromCity.toLowerCase());
  for (const hint of params.provinceHints ?? []) {
    const code = inferProvinceCodeFromHint(hint);
    if (code) provCodes.add(code.toLowerCase());
  }

  const urls: string[] = [];
  for (const prov of provCodes) {
    for (const slug of slugVariants) {
      urls.push(`${REPORT_AZIENDE_BASE_URL}/${slug}_${prov}_${vat}`);
    }
  }
  return urls;
}

/**
 * Costruisce i possibili slug URL di `fatturatoitalia.it`:
 * `https://www.fatturatoitalia.it/{nome-con-trattini}-{partita_iva}` (non richiede la sigla della provincia!).
 */
export function buildFatturatoItaliaCandidateUrls(params: {
  ragioneSociale: string;
  partitaIva?: string | null;
}): string[] {
  const vat = normalizePartitaIva(params.partitaIva);
  if (!vat) return [];

  const rawSlug = params.ragioneSociale
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/societa\s+per\s+azioni/g, "spa")
    .replace(/societa\s+a\s+responsabilita\s+limitata/g, "srl")
    .replace(/s\.?\s*r\.?\s*l\.?\s*s\.?/g, "srls")
    .replace(/s\.?\s*r\.?\s*l\.?/g, "srl")
    .replace(/s\.?\s*p\.?\s*a\.?/g, "spa")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (!rawSlug) return [];

  const variants = new Set<string>([rawSlug]);
  if (!rawSlug.endsWith("-srl") && !rawSlug.endsWith("-spa")) {
    variants.add(`${rawSlug}-spa`);
    variants.add(`${rawSlug}-srl`);
  }

  return Array.from(variants).map(
    (slug) => `${FATTURATO_ITALIA_BASE_URL}/${slug}-${vat}`
  );
}

/**
 * Estrae le righe della tabella HTML restituita da `tabellaRicerca.php` su `reportaziende.it`.
 */
export function parseReportAziendeSearchTableHtml(
  html: string
): ReportAziendeSearchRow[] {
  if (!html || html.includes("Nessuna azienda trovata")) {
    return [];
  }

  const rows: ReportAziendeSearchRow[] = [];
  const tbodyMatch = html.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i);
  const tableBody = tbodyMatch ? tbodyMatch[1] : html;

  const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let trMatch: RegExpExecArray | null;

  while ((trMatch = trRegex.exec(tableBody)) !== null) {
    const rowHtml = trMatch[1];
    const linkMatch = rowHtml.match(
      /<a[^>]+href=['"]([^'"]+)['"][^>]*title=['"]([^'"]*)['"][^>]*>([\s\S]*?)<\/a>/i
    );
    if (!linkMatch) continue;

    const rawHref = linkMatch[1].trim();
    const titleName = linkMatch[2].trim();
    const shortName = linkMatch[3].replace(/<[^>]+>/g, "").trim();

    const path = rawHref.startsWith("/") ? rawHref : `/${rawHref}`;
    const fullUrl = `${REPORT_AZIENDE_BASE_URL}${path}`;

    const pivaMatch =
      rowHtml.match(/P\.?\s*iva\s*:\s*(\d{11})/i) ||
      path.match(/_(\d{11})$/);
    const partitaIva = pivaMatch?.[1] ?? null;

    const tdRegex = /<td([^>]*)>([\s\S]*?)<\/td>/gi;
    const tds: Array<{ attrs: string; content: string }> = [];
    let tdMatch: RegExpExecArray | null;
    while ((tdMatch = tdRegex.exec(rowHtml)) !== null) {
      tds.push({
        attrs: tdMatch[1] || "",
        content: tdMatch[2] || "",
      });
    }

    const rawLocalita = tds[1]?.content.replace(/<[^>]+>/g, "").trim() || null;
    const provMatch =
      rawLocalita?.match(/\(([A-Z]{2})\)/i) ||
      path.match(/_([a-z]{2})_\d{11}$/i);
    const provinciaSigla = provMatch?.[1] ? provMatch[1].toUpperCase() : null;

    const parseDataOrderNumber = (td?: {
      attrs: string;
      content: string;
    }): number | null => {
      if (!td) return null;
      const orderMatch = td.attrs.match(/data-order=['"]([-0-9.]+)['"]/i);
      if (orderMatch?.[1]) {
        const parsed = Math.round(Number.parseFloat(orderMatch[1]));
        if (Number.isFinite(parsed)) return parsed;
      }
      const cleanDigits = td.content
        .replace(/<[^>]+>/g, "")
        .replace(/[^0-9-]/g, "");
      if (!cleanDigits) return null;
      const fallbackNum = Number.parseInt(cleanDigits, 10);
      return Number.isFinite(fallbackNum) ? fallbackNum : null;
    };

    const utileValore = parseDataOrderNumber(tds[2]);
    const fatturatoValore = parseDataOrderNumber(tds[3]);
    const dipendenti = parseDataOrderNumber(tds[4]);
    const anno = parseDataOrderNumber(tds[5]);

    rows.push({
      path,
      url: fullUrl,
      titleName: titleName || shortName,
      shortName,
      partitaIva,
      localita: rawLocalita,
      provinciaSigla,
      utileValore,
      fatturatoValore:
        fatturatoValore !== null && fatturatoValore > 0
          ? fatturatoValore
          : null,
      dipendenti:
        dipendenti !== null && dipendenti > 0 ? dipendenti : null,
      anno: anno !== null && anno >= 2015 && anno <= 2030 ? anno : null,
    });
  }

  return rows;
}

/**
 * Interroga `reportaziende.it/assets/components/tabellaRicerca.php` per P.IVA o Denominazione.
 */
export async function searchReportAziendeTable(
  queryTerm: string,
  timeoutMs = 3000
): Promise<ReportAziendeSearchRow[]> {
  const cleanTerm = queryTerm
    .replace(/[^a-zA-Z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (cleanTerm.length < 3) return [];

  try {
    const body = new URLSearchParams({
      tipoQuery: "avanzata",
      comuni: "",
      comuniIstat: "",
      province: "",
      regioni: "",
      cercaStringa: cleanTerm,
      cercaTesto: cleanTerm,
      titoloNome: "avanzata",
      ateco: "",
      statoUtente: "0",
    });

    const res = await fetch(REPORT_AZIENDE_SEARCH_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "User-Agent":
          "Mozilla/5.0 (compatible; QualityScoutVerifier/2.0; +https://localhost)",
        Accept: "text/html, */*; q=0.01",
        "X-Requested-With": "XMLHttpRequest",
      },
      body: body.toString(),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!res.ok) {
      await res.body?.cancel().catch(() => undefined);
      return [];
    }

    const html = await res.text();
    return parseReportAziendeSearchTableHtml(html);
  } catch {
    return [];
  }
}

/**
 * Interroga l'endpoint JSON di `fatturatoitalia.it/risultato-di-ricerca` per `piva` o `denominazione`.
 */
export async function searchFatturatoItaliaJson(
  searchType: "piva" | "denominazione",
  queryTerm: string,
  timeoutMs = 3000
): Promise<FatturatoItaliaSearchResultItem[]> {
  const cleanTerm = queryTerm.trim();
  if (cleanTerm.length < 3) return [];

  try {
    const body = new URLSearchParams({
      search_action: "run",
      search_type: searchType,
      search_query: cleanTerm,
    });

    const res = await fetch(FATTURATO_ITALIA_SEARCH_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "User-Agent":
          "Mozilla/5.0 (compatible; QualityScoutVerifier/2.0; +https://localhost)",
        Accept: "application/json",
        "X-Requested-With": "XMLHttpRequest",
      },
      body: body.toString(),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!res.ok) {
      await res.body?.cancel().catch(() => undefined);
      return [];
    }

    const json = (await res.json().catch(() => null)) as {
      success?: boolean;
      results?: FatturatoItaliaSearchResultItem[];
    } | null;

    if (!json?.success || !Array.isArray(json.results)) {
      return [];
    }

    return json.results.map((item) => ({
      name: String(item.name ?? "").trim(),
      province: String(item.province ?? "").trim(),
      tax_code: normalizePartitaIva(item.tax_code) ?? String(item.tax_code ?? "").trim(),
      url: item.url?.startsWith("http")
        ? item.url
        : `${FATTURATO_ITALIA_BASE_URL}${item.url?.startsWith("/") ? item.url : `/${item.url}`}`,
    }));
  } catch {
    return [];
  }
}

/**
 * Seleziona il risultato migliore dalla ricerca JSON di `fatturatoitalia.it`.
 */
function pickBestFatturatoItaliaItem(
  items: FatturatoItaliaSearchResultItem[],
  params: {
    ragioneSociale: string;
    partitaIva?: string | null;
    sedeCittaHint?: string | null;
    provinceHints?: string[];
  }
): FatturatoItaliaSearchResultItem | null {
  if (items.length === 0) return null;

  const targetVat = normalizePartitaIva(params.partitaIva);
  if (targetVat) {
    const exactVat = items.find((i) => normalizePartitaIva(i.tax_code) === targetVat);
    if (exactVat) return exactVat;
  }

  const targetBrand = normalizeCompanyBrandKey(params.ragioneSociale);
  const hintCityNorm = (params.sedeCittaHint || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

  let bestItem: FatturatoItaliaSearchResultItem | null = null;
  let bestScore = -999;

  for (const item of items) {
    let score = 0;
    const itemBrand = normalizeCompanyBrandKey(item.name);
    if (itemBrand === targetBrand) {
      score += 60;
    } else {
      score -= 80;
    }

    const provNorm = (item.province || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

    if (hintCityNorm && hintCityNorm !== "n.d." && provNorm.includes(hintCityNorm)) {
      score += 25;
    }

    if (score > bestScore) {
      bestScore = score;
      bestItem = item;
    }
  }

  return bestScore >= 40 ? bestItem : null;
}

/**
 * Seleziona la riga migliore dalla ricerca `reportaziende.it` confrontando P.IVA,
 * nome azienda, località/provincia ed evitando società in liquidazione o senza bilancio.
 */
function pickBestReportAziendeRow(
  rows: ReportAziendeSearchRow[],
  params: {
    ragioneSociale: string;
    partitaIva?: string | null;
    sedeCittaHint?: string | null;
    sedeRegioneHint?: string | null;
    provinceHints?: string[];
  }
): ReportAziendeSearchRow | null {
  if (rows.length === 0) return null;

  const targetVat = normalizePartitaIva(params.partitaIva);
  if (targetVat) {
    const exactVatRow = rows.find((r) => r.partitaIva === targetVat);
    if (exactVatRow) return exactVatRow;
  }

  const targetBrand = normalizeCompanyBrandKey(params.ragioneSociale);
  const rawUpperName = params.ragioneSociale.toUpperCase();
  const wantsSrl = /\bS\.?R\.?L\.?\b/.test(rawUpperName);
  const wantsSpa = /\bS\.?P\.?A\.?\b/.test(rawUpperName);

  const hintCityNorm = (params.sedeCittaHint || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
  const hintRegionNorm = (params.sedeRegioneHint || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
  const hintProvCode = inferProvinceCodeFromHint(params.sedeCittaHint);
  const allowedProvCodes = new Set<string>(
    [
      hintProvCode,
      ...(params.provinceHints ?? []).map((p) => inferProvinceCodeFromHint(p)),
    ].filter((c): c is string => Boolean(c))
  );

  let bestRow: ReportAziendeSearchRow | null = null;
  let bestScore = -999;

  for (const row of rows) {
    let score = 0;
    const rowBrand = normalizeCompanyBrandKey(row.titleName);
    const rowUpper = row.titleName.toUpperCase();

    if (rowBrand === targetBrand) {
      score += 60;
    } else {
      score -= 80;
    }

    if (wantsSrl && /\bS\.?R\.?L\.?\b/.test(rowUpper)) score += 10;
    if (wantsSpa && /\bS\.?P\.?A\.?\b/.test(rowUpper)) score += 10;
    if (rowUpper.includes("IN LIQUIDAZIONE")) score -= 40;

    if (row.fatturatoValore !== null && row.fatturatoValore > 0) {
      score += 25;
    } else {
      score -= 20;
    }

    if (row.anno !== null) {
      score += Math.max(0, (row.anno - 2020) * 3);
    }

    const rowLocNorm = (row.localita || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

    if (
      hintCityNorm &&
      hintCityNorm !== "n.d." &&
      rowLocNorm.includes(hintCityNorm)
    ) {
      score += 35;
    }

    if (
      row.provinciaSigla &&
      allowedProvCodes.size > 0 &&
      allowedProvCodes.has(row.provinciaSigla)
    ) {
      score += 30;
    }

    if (row.provinciaSigla && hintRegionNorm && hintRegionNorm !== "n.d.") {
      const mappedRegion = (
        PROVINCE_CODE_TO_REGION[row.provinciaSigla] || ""
      ).toLowerCase();
      if (mappedRegion && mappedRegion.includes(hintRegionNorm)) {
        score += 20;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestRow = row;
    }
  }

  return bestScore >= 40 ? bestRow : null;
}

/**
 * Estrae in modo deterministico tutti i dati finanziari, occupazionali e anagrafici
 * dall'HTML grezzo di una scheda aziendale `reportaziende.it`.
 *
 * Prende SEMPRE l'ULTIMO anno disponibile nella serie storica (es. 2025).
 */
export function parseReportAziendeCompanyHtml(
  rawHtml: string,
  sourceUrl: string
): ReportAziendeVerifiedData | null {
  if (!rawHtml || rawHtml.length < 500) return null;

  let ragioneSociale: string | null = null;
  let partitaIva: string | null = null;
  let sedeCitta: string | null = null;
  let sedeProvinciaSigla: string | null = null;
  let sedeRegione: string | null = null;
  let atecoCodice: string | null = null;
  let atecoDescrizione: string | null = null;
  const utileValore: number | null = null;

  const historicalRevenuesMap = new Map<number, number>();
  const historicalEmployeesMap = new Map<number, number>();

  // 1. Estrazione variabili JS inline (cfOnDemand, provinceOnDemand, codAtOnDemand, denominazioneShortOnDemand)
  const cfMatch = rawHtml.match(/const\s+cfOnDemand\s*=\s*["'](\d{11})["']/i);
  if (cfMatch?.[1]) {
    partitaIva = cfMatch[1];
  }

  const provMatch = rawHtml.match(
    /const\s+provinceOnDemand\s*=\s*["']([A-Z]{2})["']/i
  );
  if (provMatch?.[1]) {
    sedeProvinciaSigla = provMatch[1].toUpperCase();
    sedeRegione = PROVINCE_CODE_TO_REGION[sedeProvinciaSigla] ?? null;
  }

  const atecoJsMatch = rawHtml.match(
    /const\s+codAtOnDemand\s*=\s*["']([0-9]{2}(?:\.[0-9]{1,2}){1,2})["']/i
  );
  if (atecoJsMatch?.[1]) {
    atecoCodice = atecoJsMatch[1];
  }

  const denomJsMatch = rawHtml.match(
    /const\s+denominazioneShortOnDemand\s*=\s*["']([^"']+)["']/i
  );
  if (denomJsMatch?.[1]) {
    ragioneSociale = denomJsMatch[1].trim();
  }

  // 2. Estrazione da `<p class="company-meta">P.IVA 01533840037 · Caltignaga (NO) · Installazione ... (33.20.03)</p>`
  const companyMetaMatch = rawHtml.match(
    /<p[^>]*class=["'][^"']*company-meta[^"']*["'][^>]*>([\s\S]*?)<\/p>/i
  );
  if (companyMetaMatch?.[1]) {
    const metaText = companyMetaMatch[1].replace(/<[^>]+>/g, "").trim();
    const parts = metaText.split("·").map((p) => p.trim());
    for (const part of parts) {
      const vatPart = part.match(/P\.?\s*IVA\s*(\d{11})/i);
      if (vatPart?.[1] && !partitaIva) {
        partitaIva = vatPart[1];
        continue;
      }
      const cityProvPart = part.match(/^([A-Za-zÀ-ÿ'’\s-]+)\s*\(([A-Z]{2})\)$/);
      if (cityProvPart) {
        if (!sedeCitta) sedeCitta = cityProvPart[1].trim();
        if (!sedeProvinciaSigla) {
          sedeProvinciaSigla = cityProvPart[2].toUpperCase();
          sedeRegione =
            sedeRegione ?? PROVINCE_CODE_TO_REGION[sedeProvinciaSigla] ?? null;
        }
        continue;
      }
      const atecoPart = part.match(
        /^(.+?)\s*\(([0-9]{2}(?:\.[0-9]{1,2}){1,2})\)$/
      );
      if (atecoPart) {
        atecoDescrizione = atecoPart[1].trim();
        if (!atecoCodice) atecoCodice = atecoPart[2].trim();
      }
    }
  }

  // 3. Estrazione serie storica Dipendenti da `const datiGraficoOrig = [...];`
  const datiGraficoMatch = rawHtml.match(
    /const\s+datiGraficoOrig\s*=\s*(\[[\s\S]*?\]);/i
  );
  if (datiGraficoMatch?.[1]) {
    try {
      const parsedArray = JSON.parse(datiGraficoMatch[1]) as Array<{
        anno?: string | number;
        numero_dipendenti?: string | number | null;
      }>;
      if (Array.isArray(parsedArray)) {
        for (const item of parsedArray) {
          const year = Number.parseInt(String(item.anno ?? ""), 10);
          // Rimuove virgole e punti usati come separatori delle migliaia (es. "1,773" -> "1773")
          const rawEmpStr = String(item.numero_dipendenti ?? "")
            .replace(/\.\d+$/, "")
            .replace(/[.,\s]/g, "")
            .trim();
          const emp = Number.parseInt(rawEmpStr, 10);
          if (
            Number.isFinite(year) &&
            year >= 2015 &&
            year <= 2030 &&
            Number.isFinite(emp) &&
            emp > 0
          ) {
            historicalEmployeesMap.set(year, emp);
          }
        }
      }
    } catch {
      // ignora errori di parse JSON parziale
    }
  }

  // 4. Estrazione JSON-LD `<script type="application/ld+json">` (contiene `@graph` con `variableMeasured` e `FAQPage`)
  const ldJsonRegex =
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let ldMatch: RegExpExecArray | null;
  while ((ldMatch = ldJsonRegex.exec(rawHtml)) !== null) {
    const jsonText = ldMatch[1]?.trim();
    if (!jsonText) continue;
    try {
      const parsed = JSON.parse(jsonText) as Record<string, unknown>;
      const graph = Array.isArray(parsed["@graph"])
        ? (parsed["@graph"] as Array<Record<string, unknown>>)
        : [parsed];

      for (const node of graph) {
        const about = node.about as Record<string, unknown> | undefined;
        if (about && about["@type"] === "Organization") {
          if (!ragioneSociale && typeof about.legalName === "string") {
            ragioneSociale = about.legalName.trim();
          } else if (!ragioneSociale && typeof about.name === "string") {
            ragioneSociale = about.name.trim();
          }
          if (!partitaIva && typeof about.vatID === "string") {
            partitaIva = normalizePartitaIva(about.vatID);
          }
          const addr = about.address as Record<string, unknown> | undefined;
          if (addr) {
            if (!sedeCitta && typeof addr.addressLocality === "string") {
              sedeCitta = addr.addressLocality.trim();
            }
            if (!sedeRegione && typeof addr.addressRegion === "string") {
              sedeRegione = addr.addressRegion.trim();
            }
          }

          const subjectOf = about.subjectOf as
            | Record<string, unknown>
            | undefined;
          const variableMeasured = Array.isArray(subjectOf?.variableMeasured)
            ? (subjectOf.variableMeasured as Array<Record<string, unknown>>)
            : [];

          for (const metric of variableMeasured) {
            const metricName = String(metric.name ?? "");
            const yearMatch = metricName.match(/Fatturato\s+(\d{4})/i);
            const rawVal = metric.value;
            const numVal =
              typeof rawVal === "number"
                ? Math.round(rawVal)
                : Number.parseInt(String(rawVal ?? "").replace(/\./g, ""), 10);

            if (yearMatch?.[1] && Number.isFinite(numVal) && numVal > 0) {
              const year = Number.parseInt(yearMatch[1], 10);
              if (year >= 2015 && year <= 2030) {
                historicalRevenuesMap.set(year, numVal);
              }
            }
          }
        }

        if (node["@type"] === "FAQPage" && Array.isArray(node.mainEntity)) {
          for (const q of node.mainEntity as Array<Record<string, unknown>>) {
            const ans = q.acceptedAnswer as Record<string, unknown> | undefined;
            const text = typeof ans?.text === "string" ? ans.text : "";
            const faqRevMatch = text.match(
              /fatturato\s+dichiarato[\s\S]*?è\s+di\s+([0-9]{1,3}(?:\.[0-9]{3})+|[0-9]+)\s*EUR\s*\(anno\s*(\d{4})\)/i
            );
            if (faqRevMatch?.[1] && faqRevMatch?.[2]) {
              const val = Number.parseInt(
                faqRevMatch[1].replace(/\./g, ""),
                10
              );
              const yr = Number.parseInt(faqRevMatch[2], 10);
              if (
                Number.isFinite(val) &&
                val > 0 &&
                yr >= 2015 &&
                yr <= 2030 &&
                !historicalRevenuesMap.has(yr)
              ) {
                historicalRevenuesMap.set(yr, val);
              }
            }
          }
        }
      }
    } catch {
      // ignora JSON-LD non valido
    }
  }

  // 5. Fallback da `<meta name="description">`
  const metaDescMatch = rawHtml.match(
    /<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i
  );
  if (metaDescMatch?.[1] && historicalRevenuesMap.size === 0) {
    const desc = metaDescMatch[1];
    const mlnMatch = desc.match(
      /Fatturato\s*€?\s*([0-9]+(?:,[0-9]+)?)\s*(Mln|Md|K)\s*nel\s*(\d{4})/i
    );
    if (mlnMatch) {
      const base = Number.parseFloat(mlnMatch[1].replace(",", "."));
      const unit = mlnMatch[2].toLowerCase();
      const mult =
        unit === "md" ? 1_000_000_000 : unit === "mln" ? 1_000_000 : 1_000;
      const year = Number.parseInt(mlnMatch[3], 10);
      if (Number.isFinite(base) && base > 0 && year >= 2015 && year <= 2030) {
        historicalRevenuesMap.set(year, Math.round(base * mult));
      }
    }
  }

  const historicalRevenues = Array.from(historicalRevenuesMap.entries())
    .map(([anno, valore]) => ({ anno, valore }))
    .sort((a, b) => b.anno - a.anno);

  const historicalEmployees = Array.from(historicalEmployeesMap.entries())
    .map(([anno, dipendenti]) => ({ anno, dipendenti }))
    .sort((a, b) => b.anno - a.anno);

  const latestRev = historicalRevenues[0] ?? null;
  const latestEmp = historicalEmployees[0] ?? null;

  if (!latestRev && !latestEmp && !partitaIva) {
    return null;
  }

  const resolvedCity = toTitleCaseCity(sedeCitta);
  const resolvedRegion =
    sedeRegione ??
    (sedeProvinciaSigla
      ? PROVINCE_CODE_TO_REGION[sedeProvinciaSigla] ?? null
      : null);

  const revHistorySummary = historicalRevenues
    .slice(0, 4)
    .map((r) => `${r.anno}: € ${r.valore.toLocaleString("it-IT")}`)
    .join(" | ");
  const empHistorySummary = historicalEmployees
    .slice(0, 4)
    .map((e) => `${e.anno}: ${e.dipendenti} dipendenti`)
    .join(" | ");

  const summaryLines = [
    `[DATI CERTIFICATI DA REPORTAZIENDE.IT (${sourceUrl})]`,
    ragioneSociale ? `- Ragione Sociale: ${ragioneSociale}` : "",
    partitaIva ? `- Partita IVA: ${partitaIva}` : "",
    resolvedCity
      ? `- Sede Legale: ${resolvedCity}${sedeProvinciaSigla ? ` (${sedeProvinciaSigla})` : ""}${resolvedRegion ? ` — ${resolvedRegion}` : ""}`
      : "",
    atecoCodice
      ? `- Codice ATECO: ${atecoCodice}${atecoDescrizione ? ` (${atecoDescrizione})` : ""}`
      : "",
    latestRev
      ? `- ULTIMO FATTURATO UFFICIALE (${latestRev.anno}): € ${latestRev.valore.toLocaleString("it-IT")} (Serie storica: ${revHistorySummary})`
      : "",
    latestEmp
      ? `- ULTIMO DATO DIPENDENTI (${latestEmp.anno}): ${latestEmp.dipendenti} addetti (Serie storica: ${empHistorySummary})`
      : "",
  ].filter(Boolean);

  return {
    sourceUrl,
    verifiedUrls: [
      {
        title: `${ragioneSociale ?? "Azienda"} — Bilancio Ufficiale ReportAziende`,
        url: sourceUrl,
      },
    ],
    ragioneSociale,
    partitaIva,
    sedeCitta: resolvedCity,
    sedeProvinciaSigla,
    sedeRegione: resolvedRegion,
    atecoCodice,
    atecoDescrizione,
    fatturatoValore: latestRev?.valore ?? null,
    fatturatoAnno: latestRev?.anno ?? null,
    utileValore,
    dipendenti: latestEmp?.dipendenti ?? null,
    dipendentiAnno: latestEmp?.anno ?? null,
    historicalRevenues,
    historicalEmployees,
    summaryTextForPrompt: summaryLines.join("\n"),
  };
}

/**
 * Estrae in modo deterministico tutti i dati finanziari e anagrafici dall'HTML grezzo
 * di una scheda aziendale `fatturatoitalia.it` (es. `https://www.fatturatoitalia.it/dolomiti-energia-mercato-spa-01812630224`).
 */
export function parseFatturatoItaliaCompanyHtml(
  rawHtml: string,
  sourceUrl: string
): ReportAziendeVerifiedData | null {
  if (!rawHtml || rawHtml.length < 500) return null;

  let ragioneSociale: string | null = null;
  let partitaIva: string | null = null;
  let sedeCitta: string | null = null;
  let sedeProvinciaSigla: string | null = null;
  let sedeRegione: string | null = null;
  let atecoCodice: string | null = null;
  let atecoDescrizione: string | null = null;
  let fatturatoValore: number | null = null;
  let fatturatoAnno: number | null = null;
  let utileValore: number | null = null;
  let dipendenti: number | null = null;

  // 1. Nome da `<h1>Dolomiti Energia Mercato Spa: fatturato, utile e dati di bilancio</h1>`
  const h1Match = rawHtml.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1Match?.[1]) {
    const h1Text = h1Match[1]
      .replace(/<[^>]+>/g, "")
      .replace(/:\s*fatturato[\s\S]*$/i, "")
      .trim();
    if (h1Text) ragioneSociale = h1Text;
  }

  // 2. P.IVA da `data-piva-azienda="01812630224"` o `Partita IVA 01812630224`
  const pivaAttrMatch =
    rawHtml.match(/data-piva-azienda=["'](\d{11})["']/i) ||
    rawHtml.match(/Partita\s+IVA\s+(\d{11})/i) ||
    sourceUrl.match(/-(\d{11})$/);
  if (pivaAttrMatch?.[1]) {
    partitaIva = pivaAttrMatch[1];
  }

  // 3. Riepilogo header: `Sede VIA FERSINA 23, Trento (Trento) · ATECO 35.15.00 - Commercio di energia elettrica · Partita IVA 01812630224 · ... · fatturato 2025 1.197.314.038 € · utile 2025 45.354.184 €.`
  const sedeMatch = rawHtml.match(
    /Sede\s+[^·]+?,\s*([A-Za-zÀ-ÿ'’\s-]+?)\s*\(([A-Za-zÀ-ÿ'’\s-]+)\)\s*·/i
  );
  if (sedeMatch) {
    sedeCitta = toTitleCaseCity(sedeMatch[1]);
    const provCode =
      inferProvinceCodeFromHint(sedeMatch[2]) ??
      inferProvinceCodeFromHint(sedeMatch[1]);
    if (provCode) {
      sedeProvinciaSigla = provCode;
      sedeRegione = PROVINCE_CODE_TO_REGION[provCode] ?? null;
    }
  }

  const atecoLinkMatch =
    rawHtml.match(
      /ATECO\s*([0-9]{2}\.[0-9]{1,2}(?:\.[0-9]{1,2})?)\s*-\s*([^·<\n]+)/i
    ) ||
    rawHtml.match(
      /title=["']([0-9]{2}\.[0-9]{1,2}(?:\.[0-9]{1,2})?)\s*-\s*([^"']+)["']/i
    );
  if (atecoLinkMatch) {
    atecoCodice = atecoLinkMatch[1].trim();
    atecoDescrizione = atecoLinkMatch[2].trim();
  }

  // 4. Estrazione Fatturato e Anno da `<dt>Fatturato 2025</dt><dd>1.197.314.038 &euro;</dd>` o testo inline
  const dtRevMatch = rawHtml.match(
    /<dt>\s*Fatturato\s*(\d{4})\s*<\/dt>\s*<dd[^>]*>\s*([0-9]{1,3}(?:\.[0-9]{3})+|[0-9]+)\s*(?:&euro;|€)/i
  );
  if (dtRevMatch?.[1] && dtRevMatch?.[2]) {
    fatturatoAnno = Number.parseInt(dtRevMatch[1], 10);
    fatturatoValore = Number.parseInt(dtRevMatch[2].replace(/\./g, ""), 10);
  } else {
    const inlineRevMatch = rawHtml.match(
      /fatturato\s+(\d{4})\s+([0-9]{1,3}(?:\.[0-9]{3})+|[0-9]+)\s*(?:&euro;|€)/i
    );
    if (inlineRevMatch?.[1] && inlineRevMatch?.[2]) {
      fatturatoAnno = Number.parseInt(inlineRevMatch[1], 10);
      fatturatoValore = Number.parseInt(
        inlineRevMatch[2].replace(/\./g, ""),
        10
      );
    }
  }

  const dtUtileMatch = rawHtml.match(
    /<dt>\s*Utile\s*(?:\d{4})?\s*<\/dt>\s*<dd[^>]*>\s*([-0-9.]+)\s*(?:&euro;|€)/i
  );
  if (dtUtileMatch?.[1]) {
    const parsedUtile = Number.parseInt(dtUtileMatch[1].replace(/\./g, ""), 10);
    if (Number.isFinite(parsedUtile)) utileValore = parsedUtile;
  }

  // 5. Estrazione Dipendenti da `<dt>Dipendenti</dt><dd>...</dd>`
  const dtEmpMatch = rawHtml.match(
    /<dt>\s*Dipendenti\s*<\/dt>\s*<dd[^>]*>([\s\S]*?)<\/dd>/i
  );
  if (dtEmpMatch?.[1]) {
    const empRaw = dtEmpMatch[1].replace(/<[^>]+>/g, "").trim();
    // Se è un numero puntuale es. "225" o "1.500", usalo; se è una fascia "da 100 a 249", calcola la mediana come stima solo se reportaziende non ha il valore puntuale
    const exactEmpMatch = empRaw.match(/^([0-9]{1,3}(?:\.[0-9]{3})*|[0-9]+)$/);
    if (exactEmpMatch?.[1]) {
      const val = Number.parseInt(exactEmpMatch[1].replace(/\./g, ""), 10);
      if (Number.isFinite(val) && val > 0) dipendenti = val;
    } else {
      const rangeMatch = empRaw.match(/da\s+(\d+)\s+a\s+(\d+)/i);
      if (rangeMatch?.[1] && rangeMatch?.[2]) {
        const low = Number.parseInt(rangeMatch[1], 10);
        const high = Number.parseInt(rangeMatch[2], 10);
        if (Number.isFinite(low) && Number.isFinite(high) && low > 0) {
          dipendenti = Math.round((low + high) / 2);
        }
      }
    }
  }

  if (!fatturatoValore && !dipendenti && !partitaIva) {
    return null;
  }

  const summaryLines = [
    `[DATI CERTIFICATI DA FATTURATOITALIA.IT (${sourceUrl})]`,
    ragioneSociale ? `- Ragione Sociale: ${ragioneSociale}` : "",
    partitaIva ? `- Partita IVA: ${partitaIva}` : "",
    sedeCitta
      ? `- Sede Legale: ${sedeCitta}${sedeProvinciaSigla ? ` (${sedeProvinciaSigla})` : ""}${sedeRegione ? ` — ${sedeRegione}` : ""}`
      : "",
    atecoCodice
      ? `- Codice ATECO: ${atecoCodice}${atecoDescrizione ? ` (${atecoDescrizione})` : ""}`
      : "",
    fatturatoValore
      ? `- ULTIMO FATTURATO UFFICIALE (${fatturatoAnno ?? "ultimo"}): € ${fatturatoValore.toLocaleString("it-IT")}`
      : "",
    dipendenti ? `- DIPENDENTI: ${dipendenti}` : "",
  ].filter(Boolean);

  return {
    sourceUrl,
    verifiedUrls: [
      {
        title: `${ragioneSociale ?? "Azienda"} — Bilancio Ufficiale FatturatoItalia`,
        url: sourceUrl,
      },
    ],
    ragioneSociale,
    partitaIva,
    sedeCitta,
    sedeProvinciaSigla,
    sedeRegione,
    atecoCodice,
    atecoDescrizione,
    fatturatoValore,
    fatturatoAnno,
    utileValore,
    dipendenti,
    dipendentiAnno: fatturatoAnno,
    historicalRevenues:
      fatturatoValore && fatturatoAnno
        ? [{ anno: fatturatoAnno, valore: fatturatoValore }]
        : [],
    historicalEmployees:
      dipendenti && fatturatoAnno
        ? [{ anno: fatturatoAnno, dipendenti }]
        : [],
    summaryTextForPrompt: summaryLines.join("\n"),
  };
}

/**
 * Scarica direttamente una pagina di `reportaziende.it` o `fatturatoitalia.it` e ne estrae i dati strutturati.
 */
export async function fetchAndParseReportAziendeUrl(
  url: string,
  timeoutMs = 3000
): Promise<ReportAziendeVerifiedData | null> {
  try {
    const parsed = new URL(url.trim());
    const host = parsed.hostname.toLowerCase();
    const isReportAziende = host.includes("reportaziende.it");
    const isFatturatoItalia = host.includes("fatturatoitalia.it");

    if (!isReportAziende && !isFatturatoItalia) {
      return null;
    }
    if (
      parsed.pathname === "/" ||
      parsed.pathname.includes("cerca") ||
      parsed.pathname.includes("search") ||
      parsed.pathname.includes("risultato-di-ricerca")
    ) {
      return null;
    }

    const res = await fetch(parsed.href, {
      method: "GET",
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; QualityScoutExtractor/2.0; +https://localhost)",
        Accept: "text/html,application/xhtml+xml,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!res.ok) {
      await res.body?.cancel().catch(() => undefined);
      return null;
    }

    const rawHtml = await res.text();
    if (isReportAziende) {
      return parseReportAziendeCompanyHtml(rawHtml, parsed.href);
    }
    return parseFatturatoItaliaCompanyHtml(rawHtml, parsed.href);
  } catch {
    return null;
  }
}

/**
 * Combina e fa il cross-check tra i dati estratti da `reportaziende.it` e `fatturatoitalia.it`
 * per la STESSA Partita IVA:
 * - Prende il fatturato con `fatturatoAnno` più recente tra i due portali;
 * - Preferisce il dato puntuale dei dipendenti di `reportaziende.it` (`datiGraficoOrig`) rispetto alla fascia di `fatturatoitalia.it`;
 * - Conserva entrambi gli URL verificati in `verifiedUrls` per arricchire le citazioni della Dashboard e dell'Excel.
 */
function mergeDualPortalFinancials(
  ra: ReportAziendeVerifiedData | null,
  fi: ReportAziendeVerifiedData | null
): ReportAziendeVerifiedData | null {
  if (!ra && !fi) return null;
  if (ra && !fi) return ra;
  if (!ra && fi) return fi;

  const r = ra!;
  const f = fi!;

  // Verifica che se entrambi hanno una P.IVA non siano due società diverse
  if (r.partitaIva && f.partitaIva && r.partitaIva !== f.partitaIva) {
    // Se per qualsiasi motivo hanno P.IVA diverse, mantieni quello con l'anno più recente
    return (f.fatturatoAnno ?? 0) > (r.fatturatoAnno ?? 0) ? f : r;
  }

  const rYear = r.fatturatoAnno ?? 0;
  const fYear = f.fatturatoAnno ?? 0;

  const bestFatturatoValore =
    fYear > rYear && f.fatturatoValore !== null
      ? f.fatturatoValore
      : r.fatturatoValore ?? f.fatturatoValore;
  const bestFatturatoAnno =
    fYear > rYear && f.fatturatoValore !== null
      ? f.fatturatoAnno
      : r.fatturatoAnno ?? f.fatturatoAnno;

  // ReportAziende ha il numero puntuale di dipendenti in datiGraficoOrig, quindi ha priorità su FatturatoItalia
  const bestDipendenti = r.dipendenti ?? f.dipendenti;
  const bestDipendentiAnno = r.dipendentiAnno ?? f.dipendentiAnno;

  const verifiedUrlsMap = new Map<string, { title: string; url: string }>();
  for (const u of [...r.verifiedUrls, ...f.verifiedUrls]) {
    if (!verifiedUrlsMap.has(u.url)) {
      verifiedUrlsMap.set(u.url, u);
    }
  }
  const verifiedUrls = Array.from(verifiedUrlsMap.values());

  // Preferisci la denominazione aggiornata di FatturatoItalia se presente (gestione Rebranding es. Dolomiti Energia Mercato S.p.A.)
  const mergedName = f.ragioneSociale || r.ragioneSociale;
  const mergedVat = r.partitaIva || f.partitaIva;
  const mergedCity = r.sedeCitta || f.sedeCitta;
  const mergedProv = r.sedeProvinciaSigla || f.sedeProvinciaSigla;
  const mergedRegion = r.sedeRegione || f.sedeRegione;
  const mergedAteco = r.atecoCodice || f.atecoCodice;
  const mergedAtecoDesc = r.atecoDescrizione || f.atecoDescrizione;

  const combinedSummary = [
    `[DATI DI BILANCIO CERTIFICATI CON CROSS-CHECK SU REPORTAZIENDE.IT + FATTURATOITALIA.IT]`,
    mergedName ? `- Ragione Sociale: ${mergedName}` : "",
    mergedVat ? `- Partita IVA Verificata: ${mergedVat}` : "",
    mergedCity
      ? `- Sede Legale: ${mergedCity}${mergedProv ? ` (${mergedProv})` : ""}${mergedRegion ? ` — ${mergedRegion}` : ""}`
      : "",
    mergedAteco
      ? `- Codice ATECO: ${mergedAteco}${mergedAtecoDesc ? ` (${mergedAtecoDesc})` : ""}`
      : "",
    bestFatturatoValore
      ? `- ULTIMO FATTURATO UFFICIALE (${bestFatturatoAnno ?? "ultimo"}): € ${bestFatturatoValore.toLocaleString("it-IT")}`
      : "",
    bestDipendenti
      ? `- ULTIMO DATO DIPENDENTI (${bestDipendentiAnno ?? bestFatturatoAnno ?? "ultimo"}): ${bestDipendenti} addetti`
      : "",
    `- Fonti Bilancio Verificate: ${verifiedUrls.map((v) => v.url).join(" , ")}`,
  ]
    .filter(Boolean)
    .join("\n");

  return {
    sourceUrl: r.sourceUrl || f.sourceUrl,
    verifiedUrls,
    ragioneSociale: mergedName,
    partitaIva: mergedVat,
    sedeCitta: mergedCity,
    sedeProvinciaSigla: mergedProv,
    sedeRegione: mergedRegion,
    atecoCodice: mergedAteco,
    atecoDescrizione: mergedAtecoDesc,
    fatturatoValore: bestFatturatoValore,
    fatturatoAnno: bestFatturatoAnno,
    utileValore: r.utileValore ?? f.utileValore,
    dipendenti: bestDipendenti,
    dipendentiAnno: bestDipendentiAnno,
    historicalRevenues:
      r.historicalRevenues.length > 0
        ? r.historicalRevenues
        : f.historicalRevenues,
    historicalEmployees:
      r.historicalEmployees.length > 0
        ? r.historicalEmployees
        : f.historicalEmployees,
    summaryTextForPrompt: combinedSummary,
  };
}

/**
 * Risolve ed estrae in parallelo i dati ufficiali da `reportaziende.it` + `fatturatoitalia.it`
 * effettuando il cross-check tramite Partita IVA (gestendo automaticamente rebranding societari
 * come "Dolomiti Energia Mercato S.p.A." -> P.IVA 01812630224 -> "Dolomiti Energia Società per Azioni").
 */
export async function resolveReportAziendeFinancials(params: {
  ragioneSociale: string;
  partitaIva?: string | null;
  sedeCittaHint?: string | null;
  sedeRegioneHint?: string | null;
  provinceHints?: string[];
  knownUrls?: Array<string | null | undefined>;
  timeoutMs?: number;
}): Promise<ReportAziendeVerifiedData | null> {
  const timeoutMs = params.timeoutMs ?? 3000;
  const targetBrandKey = normalizeCompanyBrandKey(params.ragioneSociale);
  let discoveredVat = normalizePartitaIva(params.partitaIva);

  let raData: ReportAziendeVerifiedData | null = null;
  let fiData: ReportAziendeVerifiedData | null = null;

  // 1. Controlla in parallelo eventuali URL diretti già noti (reportaziende.it o fatturatoitalia.it)
  const directPortalUrls = (params.knownUrls ?? [])
    .map((u) => u?.trim())
    .filter(
      (u): u is string =>
        Boolean(u) &&
        (u!.toLowerCase().includes("reportaziende.it") ||
          u!.toLowerCase().includes("fatturatoitalia.it"))
    );

  if (directPortalUrls.length > 0) {
    const directResults = await Promise.allSettled(
      directPortalUrls.map((u) => fetchAndParseReportAziendeUrl(u, timeoutMs))
    );
    for (const res of directResults) {
      if (res.status === "fulfilled" && res.value) {
        const d = res.value;
        const parsedBrand = d.ragioneSociale
          ? normalizeCompanyBrandKey(d.ragioneSociale)
          : "";
        const vatMatches =
          discoveredVat && d.partitaIva && discoveredVat === d.partitaIva;
        const brandMatches =
          !parsedBrand || !targetBrandKey || parsedBrand === targetBrandKey;

        if (vatMatches || brandMatches) {
          if (!discoveredVat && d.partitaIva) {
            discoveredVat = d.partitaIva;
          }
          if (d.sourceUrl.includes("reportaziende.it") && !raData) {
            raData = d;
          } else if (d.sourceUrl.includes("fatturatoitalia.it") && !fiData) {
            fiData = d;
          }
        }
      }
    }
  }

  // 2. Se non abbiamo ancora la Partita IVA, cerca per Denominazione in PARALLELO su ReportAziende e FatturatoItalia
  if (!discoveredVat && targetBrandKey && targetBrandKey.length >= 3) {
    const [raRowsSettled, fiItemsSettled] = await Promise.allSettled([
      raData
        ? Promise.resolve([])
        : searchReportAziendeTable(targetBrandKey, timeoutMs),
      fiData
        ? Promise.resolve([])
        : searchFatturatoItaliaJson("denominazione", targetBrandKey, timeoutMs),
    ]);

    const raRows =
      raRowsSettled.status === "fulfilled" ? raRowsSettled.value : [];
    const fiItems =
      fiItemsSettled.status === "fulfilled" ? fiItemsSettled.value : [];

    const bestRaRow = pickBestReportAziendeRow(raRows, params);
    const bestFiItem = pickBestFatturatoItaliaItem(fiItems, params);

    discoveredVat =
      normalizePartitaIva(bestFiItem?.tax_code) ??
      normalizePartitaIva(bestRaRow?.partitaIva) ??
      null;

    // Scarica in parallelo le pagine già individuate per nome
    const [raPageSettled, fiPageSettled] = await Promise.allSettled([
      !raData && bestRaRow
        ? fetchAndParseReportAziendeUrl(bestRaRow.url, timeoutMs)
        : Promise.resolve(null),
      !fiData && bestFiItem
        ? fetchAndParseReportAziendeUrl(bestFiItem.url, timeoutMs)
        : Promise.resolve(null),
    ]);

    if (raPageSettled.status === "fulfilled" && raPageSettled.value) {
      raData = raPageSettled.value;
    }
    if (fiPageSettled.status === "fulfilled" && fiPageSettled.value) {
      fiData = fiPageSettled.value;
    }
  }

  // 3. CROSS-LOOKUP TRAMITE PARTITA IVA:
  // Una volta nota la Partita IVA (da input, da FatturatoItalia o da ReportAziende),
  // interroga in parallelo il portale mancante usando la P.IVA esatta (risolvendo ogni rebranding societario!)
  if (discoveredVat && (!raData || !fiData)) {
    const [raByVatSettled, fiByVatSettled] = await Promise.allSettled([
      raData
        ? Promise.resolve(raData)
        : (async () => {
            // Prova prima la tabella di ricerca per P.IVA (restituisce l'URL esatto anche se il nome storico è diverso!)
            const rows = await searchReportAziendeTable(
              discoveredVat!,
              timeoutMs
            );
            const exactRow = rows.find((r) => r.partitaIva === discoveredVat);
            if (exactRow) {
              const page = await fetchAndParseReportAziendeUrl(
                exactRow.url,
                timeoutMs
              );
              if (page) return page;
            }
            // Fallback su costruzione slug
            const slugUrls = buildReportAziendeCandidateUrls({
              ragioneSociale: params.ragioneSociale,
              partitaIva: discoveredVat,
              sedeCittaHint: params.sedeCittaHint,
              provinceHints: params.provinceHints,
            });
            for (const u of slugUrls.slice(0, 2)) {
              const page = await fetchAndParseReportAziendeUrl(u, timeoutMs);
              if (page) return page;
            }
            return null;
          })(),
      fiData
        ? Promise.resolve(fiData)
        : (async () => {
            // Prova prima lo slug deterministico /{nome-con-trattini}-{partita_iva} o la ricerca JSON per P.IVA
            const slugUrls = buildFatturatoItaliaCandidateUrls({
              ragioneSociale: params.ragioneSociale,
              partitaIva: discoveredVat,
            });
            for (const u of slugUrls.slice(0, 2)) {
              const page = await fetchAndParseReportAziendeUrl(u, timeoutMs);
              if (page) return page;
            }
            const items = await searchFatturatoItaliaJson(
              "piva",
              discoveredVat!,
              timeoutMs
            );
            const exactItem = items.find(
              (i) => normalizePartitaIva(i.tax_code) === discoveredVat
            );
            if (exactItem) {
              return fetchAndParseReportAziendeUrl(exactItem.url, timeoutMs);
            }
            return null;
          })(),
    ]);

    if (raByVatSettled.status === "fulfilled" && raByVatSettled.value) {
      raData = raByVatSettled.value;
    }
    if (fiByVatSettled.status === "fulfilled" && fiByVatSettled.value) {
      fiData = fiByVatSettled.value;
    }
  }

  return mergeDualPortalFinancials(raData, fiData);
}
