import {
  parseFatturatoItaliaCompanyHtml,
  parseReportAziendeCompanyHtml,
} from "@/lib/report-aziende";

/**
 * Utility di Pulizia Payload HTML/CSS e Risparmio Token per gli Agenti di Estrazione.
 *
 * Rimuove tutti i tag HTML, blocchi `<script>`, `<style>`, `<svg>`, attributi inline
 * e regole CSS ridondanti prima di inviare il testo ai sub-agenti `gemini-3.8-flash`,
 * lasciando esclusivamente testo grezzo / markdown leggero ed estraendo eventuale P.IVA dal footer.
 */

const HTML_ENTITY_MAP: Record<string, string> = {
  "&nbsp;": " ",
  "&amp;": "&",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&lt;": "<",
  "&gt;": ">",
  "&euro;": "€",
  "&ndash;": "-",
  "&mdash;": "—",
  "&copy;": "©",
  "&reg;": "®",
};

/**
 * Converte una stringa contenente eventuale HTML/CSS in testo grezzo / markdown compatto,
 * eliminando qualsiasi markup o stile inutile per massimizzare il risparmio token.
 * Se `maxChars` è specificato (es. su grandi pagine web HTML), taglia solo per il contesto raw.
 * Per i campi testuali estratti dagli agenti, usa `sanitizeTextFields()` senza alcun troncamento.
 */
export function stripHtmlAndCssToCleanText(
  rawInput: string | null | undefined,
  maxChars?: number
): string {
  if (!rawInput) return "";

  let cleaned = rawInput
    // Rimuove commenti HTML
    .replace(/<!--[\s\S]*?-->/g, " ")
    // Rimuove blocchi non informativi o pesanti (script, style, svg, noscript, iframe, head)
    .replace(/<(script|style|svg|noscript|iframe|canvas|head|meta|link)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    // Converte heading e blocchi strutturali in interruzioni di riga leggibili
    .replace(/<\/?(h[1-6]|p|div|section|article|header|footer|li|tr|br|hr)\b[^>]*>/gi, "\n")
    // Rimuove tutti i restanti tag HTML
    .replace(/<[^>]+>/g, " ")
    // Rimuove eventuali blocchi CSS residui tipo `.classe { color: red; ... }`
    .replace(/[.#@][a-zA-Z0-9_-]+[^{]{0,80}\{[^}]{1,600}\}/g, " ");

  // Decodifica entità HTML comuni
  cleaned = cleaned.replace(
    /&(nbsp|amp|quot|#39|apos|lt|gt|euro|ndash|mdash|copy|reg);/gi,
    (match) => HTML_ENTITY_MAP[match.toLowerCase()] ?? " "
  );

  // Normalizza spazi multipli e righe vuote
  cleaned = cleaned
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line.length > 0)
    .join("\n");

  if (typeof maxChars === "number" && maxChars > 0 && cleaned.length > maxChars) {
    return cleaned.slice(0, maxChars).trim();
  }

  return cleaned;
}

const NON_PROSE_SHORT_PATTERNS = /^(?:N\.?D\.?|NULL|NONE|\d{4}(?:-\d{2})?|[A-Z]{2,4}\s*\d[\d.]*)$/i;

/**
 * Post-processing sui campi testuali generati dagli agenti (descrizioni, trigger, pitch, buyer persona, dati chiave):
 * 1. Rimuove qualsiasi tag HTML/CSS residuo SENZA applicare alcun `.slice()` o `.substring()`.
 * 2. Elimina eventuali punti di sospensione finali (`...` o `…`) o punteggiatura sospesa (`,`, `;`, `:`, `-`).
 * 3. Garantisce che ogni frase/paragrafo descrittivo si chiuda sempre con un punto fermo (`.`),
 *    rispettando multi-paragrafo (es. nelle bozze email la riga `Oggetto:` resta intatta mentre il corpo chiude con `.`).
 */
export function sanitizeTextFields(
  rawInput: string | null | undefined,
  options?: { ensureTerminalPeriod?: boolean }
): string {
  const ensurePeriod = options?.ensureTerminalPeriod ?? true;
  const cleaned = stripHtmlAndCssToCleanText(rawInput);
  if (!cleaned) return "";

  const lines = cleaned
    .split(/\n/)
    .map((line) => {
      let s = line.trim();
      if (!s) return "";
      // Rimuove eventuali "..." o "…" in coda alla riga
      s = s.replace(/(?:\.{2,}|…+)\s*$/g, "").trim();
      // Rimuove virgole, punti e virgola o trattini sospesi a fine frase
      s = s.replace(/[,;:\-–—]+\s*$/g, "").trim();
      return s;
    })
    .filter((line) => line.length > 0);

  if (lines.length === 0) return "";

  if (!ensurePeriod) {
    return lines.join("\n");
  }

  // Assicura la chiusura con punteggiatura corretta sull'ultima riga (e sui paragrafi descrittivi che non sono l'Oggetto mail)
  const processedLines = lines.map((line, idx) => {
    const isLastLine = idx === lines.length - 1;
    const isSubjectLine = /^oggetto\s*:/i.test(line);
    const isGreetingLine = /^(?:gentile|caro|egregio|spett\.le|buongiorno)\b/i.test(line) && line.endsWith(",");

    if (isSubjectLine || isGreetingLine) {
      return line;
    }

    if (NON_PROSE_SHORT_PATTERNS.test(line)) {
      return line;
    }

    if (isLastLine || line.length > 35) {
      if (!/[.!?)"»]$/.test(line)) {
        return `${line}.`;
      }
    }

    return line;
  });

  return processedLines.join("\n");
}

export interface ExtractedFinancials {
  fatturatoValore: number | null;
  fatturatoAnno: number | null;
  dipendenti: number | null;
  atecoCodice: string | null;
  partitaIva: string | null;
}

export interface CleanWebsiteContext {
  reachable: boolean;
  cleanText: string;
  extractedVat: string | null;
  financials?: ExtractedFinancials;
}

export const FINANCIAL_DIRECTORY_DOMAINS = [
  "fatturatoitalia.it",
  "reportaziende.it",
  "ufficiocamerale.it",
  "registroimprese.it",
  "aziende.it",
  "informazione-aziende.it",
  "companyreports.it",
  "cerved.com",
];

/**
 * Estrae dal testo pulito di un sito web o di una scheda camerale (es. fatturatoitalia, reportaziende, ufficiocamerale)
 * i dati numerici verificati di fatturato, anno di bilancio, dipendenti, ATECO e Partita IVA.
 */
export function extractFinancialsFromCleanText(text: string): ExtractedFinancials {
  if (!text) {
    return {
      fatturatoValore: null,
      fatturatoAnno: null,
      dipendenti: null,
      atecoCodice: null,
      partitaIva: null,
    };
  }

  // 1. Estrazione Fatturato e Anno
  let fatturatoValore: number | null = null;
  let fatturatoAnno: number | null = null;

  // Es: "fatturato 2025 196.621.407 €" oppure "fatturato: 196.621.407 €" oppure "ricavi 2024: € 50.000.000"
  const revMatch = text.match(
    /(?:fatturato|ricavi|valore\s+della\s+produzione)\s*(?:(?:nel|dell['\s]anno)\s*)?(\d{4})?\s*[:\s]*€?\s*([0-9]{1,3}(?:\.[0-9]{3})+|[0-9]{5,12})\s*€?/i
  );

  if (revMatch) {
    const rawYear = revMatch[1];
    const rawVal = revMatch[2];
    if (rawYear) {
      const parsedYear = Number.parseInt(rawYear, 10);
      if (parsedYear >= 2018 && parsedYear <= 2030) {
        fatturatoAnno = parsedYear;
      }
    }
    if (rawVal) {
      const num = Number.parseInt(rawVal.replace(/\./g, ""), 10);
      if (Number.isFinite(num) && num > 0) {
        fatturatoValore = num;
      }
    }
  }

  // Se l'anno non era attaccato al fatturato, cerca un anno recente (2020-2026) associato a "bilancio"
  if (fatturatoValore !== null && fatturatoAnno === null) {
    const yearMatch = text.match(/bilancio\s*(?:d'esercizio\s*)?(\d{4})/i);
    if (yearMatch?.[1]) {
      const y = Number.parseInt(yearMatch[1], 10);
      if (y >= 2018 && y <= 2030) fatturatoAnno = y;
    }
  }

  // 2. Estrazione Dipendenti / Addetti
  let dipendenti: number | null = null;
  const empMatch = text.match(
    /(?:dipendenti|addetti|organico)\s*(?:(?:nel|dell['\s]anno)\s*)?(?:\d{4})?\s*[:\s]*([0-9]{1,3}(?:\.[0-9]{3})*|\d+)\b/i
  );
  if (empMatch?.[1]) {
    const rawEmp = empMatch[1].replace(/\./g, "");
    const parsedEmp = Number.parseInt(rawEmp, 10);
    if (Number.isFinite(parsedEmp) && parsedEmp > 0 && parsedEmp < 2_000_000) {
      dipendenti = parsedEmp;
    }
  }

  // 3. Estrazione ATECO
  let atecoCodice: string | null = null;
  const atecoMatch = text.match(
    /(?:ATECO|Codice\s*ATECO)\s*[:\s]*([0-9]{2}\.[0-9]{1,2}(?:\.[0-9]{1,2})?)/i
  );
  if (atecoMatch?.[1]) {
    atecoCodice = atecoMatch[1].trim();
  }

  // 4. Estrazione Partita IVA
  let partitaIva: string | null = null;
  const vatMatch = text.match(
    /(?:Partita\s*IVA|P\.?\s*IVA|C\.?\s*F\.?|Codice\s*Fiscale)[^0-9]{0,15}((?:IT\s*)?\d{11})\b/i
  );
  if (vatMatch?.[1]) {
    const rawVat = vatMatch[1].replace(/\s+/g, "").replace(/^IT/i, "");
    if (/^\d{11}$/.test(rawVat)) {
      partitaIva = rawVat;
    }
  }

  return {
    fatturatoValore,
    fatturatoAnno,
    dipendenti,
    atecoCodice,
    partitaIva,
  };
}

/**
 * Scarica in modo leggero la pagina primaria dell'azienda con timeout stretto,
 * strippa tutti i tag HTML/CSS e restituisce testo pulito + eventuale Partita IVA e dati finanziari.
 */
export async function fetchCleanWebsiteContext(
  url: string | null | undefined,
  timeoutMs = 2800
): Promise<CleanWebsiteContext> {
  const trimmedUrl = url?.trim();
  if (!trimmedUrl) {
    return { reachable: false, cleanText: "", extractedVat: null };
  }

  try {
    const parsed = new URL(trimmedUrl);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return { reachable: false, cleanText: "", extractedVat: null };
    }

    const res = await fetch(parsed.href, {
      method: "GET",
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; QualityScoutExtractor/2.0; +https://localhost)",
        Accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5",
      },
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (res.status === 404 || res.status === 410 || res.status >= 500) {
      await res.body?.cancel().catch(() => undefined);
      return { reachable: false, cleanText: "", extractedVat: null };
    }

    // Se il sito risponde ma blocca la lettura body (es. 403 WAF aziendale), il dominio è comunque esistente
    if (!res.ok) {
      await res.body?.cancel().catch(() => undefined);
      return { reachable: true, cleanText: "", extractedVat: null };
    }

    const rawHtml = await res.text();
    const lowerHost = parsed.hostname.toLowerCase();

    // Se l'URL appartiene a reportaziende.it o fatturatoitalia.it, usa il parser deterministico dedicato
    if (
      lowerHost.includes("reportaziende.it") ||
      lowerHost.includes("fatturatoitalia.it")
    ) {
      const portalData = lowerHost.includes("reportaziende.it")
        ? parseReportAziendeCompanyHtml(rawHtml, parsed.href)
        : parseFatturatoItaliaCompanyHtml(rawHtml, parsed.href);
      if (portalData) {
        return {
          reachable: true,
          cleanText: portalData.summaryTextForPrompt,
          extractedVat: portalData.partitaIva,
          financials: {
            fatturatoValore: portalData.fatturatoValore,
            fatturatoAnno: portalData.fatturatoAnno,
            dipendenti: portalData.dipendenti,
            atecoCodice: portalData.atecoCodice,
            partitaIva: portalData.partitaIva,
          },
        };
      }
    }

    // Estrai eventuali meta description o JSON-LD prima di tagliare/strippare gli script
    const metaDescMatch = rawHtml.match(
      /<meta\s+(?:name|property)=["'](?:description|og:description)["']\s+content=["']([^"']+)["']/i
    );
    const metaHeader = metaDescMatch?.[1] ? `${metaDescMatch[1].trim()}\n` : "";

    // Prende l'inizio (header/about) e la coda (footer con P.IVA e dati societari) evitando di processare megabyte
    const slicedHtml =
      rawHtml.length > 48_000
        ? `${rawHtml.slice(0, 28_000)}\n${rawHtml.slice(-20_000)}`
        : rawHtml;

    const cleanText = `${metaHeader}${stripHtmlAndCssToCleanText(slicedHtml, 3000)}`.trim();
    const financials = extractFinancialsFromCleanText(cleanText);
    const extractedVat = financials.partitaIva;

    return {
      reachable: true,
      cleanText,
      extractedVat,
      financials,
    };
  } catch {
    return { reachable: false, cleanText: "", extractedVat: null };
  }
}

/**
 * Cerca tra gli URL noti dell'azienda se è presente una scheda finanziaria/camerale
 * (es. fatturatoitalia.it, reportaziende.it, ufficiocamerale.it), la scarica direttamente
 * ed estrae i dati di bilancio ufficiali a costo zero di Grounding.
 */
export async function fetchFinancialDirectoryContext(
  urls: Array<string | null | undefined>,
  timeoutMs = 3000
): Promise<CleanWebsiteContext | null> {
  const candidateUrls = urls
    .map((u) => u?.trim())
    .filter((u): u is string => Boolean(u));

  for (const rawUrl of candidateUrls) {
    try {
      const parsed = new URL(rawUrl);
      const host = parsed.hostname.toLowerCase();
      const isDirectory = FINANCIAL_DIRECTORY_DOMAINS.some((d) => host.includes(d));

      if (isDirectory) {
        const ctx = await fetchCleanWebsiteContext(rawUrl, timeoutMs);
        if (ctx.reachable && (ctx.financials?.fatturatoValore !== null || ctx.financials?.dipendenti !== null)) {
          return ctx;
        }
      }
    } catch {
      // Ignora URL malformati
    }
  }

  return null;
}
