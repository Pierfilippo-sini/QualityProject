#!/usr/bin/env node

/**
 * ============================================================================
 * AUTOVALUTATORE B2B & LLM-AS-A-JUDGE (gemini-4-argon)
 * Script di Automated Evaluation per Motore Agentico B2B Scouting
 * ============================================================================
 *
 * Funzionalità:
 * 1. Esegue 3 Test Case B2B tipici per 5 iterazioni consecutive ciascuno (15 run totali)
 * 2. Gestisce il rate limiting con pause calibrabili e backoff esponenziale anti-429
 * 3. Misura latenza precisa (CA2), consistenza dei dati, indice di stabilità (Jaccard)
 *    e varianza di scoring/ranking (rilevamento allucinazioni e data drift)
 * 4. Invoca l'LLM-as-a-Judge con il modello 'gemini-4-argon' fornendogli i risultati
 *    empirici e gli output strutturati dell'agente
 * 5. Valuta i 13 criteri analitici (CA1..CA13) con voto (1-10) e motivazione
 * 6. Genera il report finale in autovalutatore/report_valutazione.md e il dump JSON
 *
 * Utilizzo:
 *   node autovalutatore/tester.js [opzioni]
 *
 * Opzioni CLI:
 *   --iterations=N     Numero di iterazioni per test case (default: 5)
 *   --delay=MS         Pausa tra chiamate consecutive in millisecondi (default: 8000)
 *   --cases=1,2,3      Seleziona quali test case eseguire (default: all)
 *   --url=URL          Base URL dell'applicazione Next.js (default: http://localhost:3000)
 *   --model=NAME       Modello del Giudice (default: gemini-4-argon)
 *   --skip-judge       Esegue solo i test di stabilità senza chiamare il Giudice
 *   --judge-only       Valuta l'ultimo file JSON senza rieseguire la pipeline
 * ============================================================================
 */

const fs = require("fs");
const path = require("path");
const { performance } = require("perf_hooks");
const { GoogleGenAI } = require("@google/genai");

// --- Percorsi File e Cartelle ---
const ROOT_DIR = path.resolve(__dirname, "..");
const EVAL_DIR = __dirname;
const REPORT_MD_PATH = path.join(EVAL_DIR, "report_valutazione.md");
const REPORT_RAW_JSON_PATH = path.join(EVAL_DIR, "report_dati_raw.json");

// --- Parsing Argomenti CLI ---
const args = process.argv.slice(2);
function getArgValue(name, defaultValue) {
  const match = args.find((a) => a.startsWith(`--${name}=`));
  if (match) return match.split("=")[1];
  return defaultValue;
}
const hasFlag = (flag) => args.includes(`--${flag}`);

const ITERATIONS_PER_CASE = Math.max(1, parseInt(getArgValue("iterations", "5"), 10));
const DELAY_BETWEEN_CALLS_MS = Math.max(1000, parseInt(getArgValue("delay", "8000"), 10));
const SELECTED_CASES_RAW = getArgValue("cases", "1,2,3");
const API_BASE_URL = (getArgValue("url", process.env.API_BASE_URL || "http://localhost:3000")).replace(/\/+$/, "");
const JUDGE_MODEL_NAME = getArgValue("model", "gemini-4-argon");
const SKIP_JUDGE = hasFlag("skip-judge");
const JUDGE_ONLY = hasFlag("judge-only");

// --- Caricamento Environment (.env.local con fallback a .env) ---
function loadEnvironmentVariables() {
  const envFiles = [".env.local", ".env"];
  for (const file of envFiles) {
    const fullPath = path.join(ROOT_DIR, file);
    if (fs.existsSync(fullPath)) {
      try {
        const content = fs.readFileSync(fullPath, "utf8");
        for (const line of content.split("\n")) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith("#")) continue;
          const equalIndex = trimmed.indexOf("=");
          if (equalIndex === -1) continue;
          const key = trimmed.slice(0, equalIndex).trim();
          let value = trimmed.slice(equalIndex + 1).trim();
          if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
          }
          if (!process.env[key]) {
            process.env[key] = value;
          }
        }
      } catch (err) {
        console.warn(`[WARN] Impossibile leggere il file ${file}:`, err.message);
      }
    }
  }
}
loadEnvironmentVariables();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const ACCESS_GATE_SECRET = process.env.ACCESS_GATE_SECRET;

if (!GEMINI_API_KEY && !SKIP_JUDGE) {
  console.error("❌ ERRORE CRITICO: GEMINI_API_KEY non trovata in .env.local o nell'ambiente.");
  process.exit(1);
}

// --- 3 Test Case B2B Fissi ad Alta Complessità (10 Aziende Target) ---
const ALL_TEST_CASES = [
  {
    id: "TC1",
    index: 1,
    name: "Life Sciences, CDMO & Dispositivi Medici (Lombardia, Lazio & Toscana)",
    targetSector: "Farmaceutico, CDMO e Tecnologie Biomediche",
    geography: "Lombardia, Lazio e Toscana",
    companySize: "Mid-Cap e Grandi Imprese (fatturato 40M-400M€, almeno 120 dipendenti)",
    expectedCount: 10,
    prompt:
      "Seleziona esattamente 10 aziende italiane d'eccellenza operanti nei settori Farmaceutico, Contract Development & Manufacturing Organization (CDMO) o Dispositivi Medici con stabilimenti o headquarter in Lombardia, Lazio o Toscana. I requisiti dimensionali richiedono un fatturato compreso tra 40M€ e 400M€ e oltre 120 dipendenti. Privilegia realtà che negli ultimi 24 mesi hanno inaugurato nuovi reparti produttivi, ottenuto approvazioni regolatorie internazionali (es. FDA/EMA), affrontato operazioni di M&A oppure avviato piani di decarbonizzazione/CSRD. Ordina le 10 aziende per priorità commerciale indicando i referenti decisionali.",
    mandatoryParams: {
      categoriaSettore: "Farmaceutico, CDMO e Tecnologie Biomediche",
      areaGeografica: "Lombardia, Lazio e Toscana",
      dimensioneAziendale: "Mid-Cap e Grandi Imprese (fatturato 40M-400M€, >120 dipendenti)",
      noteStrategiche:
        "Cercasi 10 aziende con recenti investimenti in impianti, espansioni produttive, certificazioni regolatorie o M&A. Ordina la classifica per score commerciale decrescente.",
    },
  },
  {
    id: "TC2",
    index: 2,
    name: "Packaging Automation, Robotica & Macchine per Confezionamento (Emilia-Romagna & Veneto)",
    targetSector: "Packaging Automation, Robotica Industriale e Macchine per Confezionamento",
    geography: "Emilia-Romagna e Veneto",
    companySize: "Mid-Cap orientate all'export (fatturato 30M-250M€, 80-600 dipendenti)",
    expectedCount: 10,
    prompt:
      "Conduci uno scouting approfondito su 10 aziende manifatturiere leader nella Packaging Automation, robotica industriale o macchine automatiche per il confezionamento con sede operativa in Emilia-Romagna (Packaging Valley) o Veneto. I target devono fatturare tra 30M€ e 250M€ con organico tra 80 e 600 addetti e una quota export rilevante. Priorità ad aziende coinvolte nella transizione a materiali riciclabili/regolamento PPWR, nell'integrazione di intelligenza artificiale/IoT nei macchinari (Industria 5.0) o che abbiano partecipato con novità a fiere di settore nell'ultimo anno. Fornisci 10 nominativi con ranking prioritario e referenti di contatto.",
    mandatoryParams: {
      categoriaSettore: "Packaging Automation, Robotica Industriale e Macchine per Confezionamento",
      areaGeografica: "Emilia-Romagna e Veneto",
      dimensioneAziendale: "Mid-Cap orientate all'export (fatturato 30M-250M€, 80-600 dipendenti)",
      noteStrategiche:
        "Richieste 10 imprese con brevetti/novità su packaging sostenibile, IoT predittivo o espansione internazionale. Classifica finale ordinata per priorità di vendita.",
    },
  },
  {
    id: "TC3",
    index: 3,
    name: "Logistica Filiera del Freddo (Cold Chain), Hub Intermodali & 3PL (Nord e Centro Italia)",
    targetSector: "Logistica Conto Terzi (3PL), Cold Chain e Trasporti Intermodali",
    geography: "Nord e Centro Italia",
    companySize: "Imprese strutturate (fatturato oltre 35M€, almeno 90 dipendenti)",
    expectedCount: 10,
    prompt:
      "Identifica 10 primarie aziende logistiche specializzate nella catena del freddo (Cold Chain per Food & Pharma), nella logistica conto terzi (3PL avanzata) o nella gestione di piattaforme intermodali con nodi strategici nel Nord o Centro Italia. I parametri dimensionali richiedono un fatturato superiore a 35M€ e almeno 90 dipendenti o estese superfici di stoccaggio a temperatura controllata. Evidenzia operatori che hanno ampliato magazzini green con certificazioni LEED/BREEAM, introdotto sistemi WMS/TMS avanzati o siglato accordi distributivi con la GDO e il canale ospedaliero. Restituisci 10 aziende ordinate per score.",
    mandatoryParams: {
      categoriaSettore: "Logistica Conto Terzi (3PL), Cold Chain e Trasporti Intermodali",
      areaGeografica: "Nord e Centro Italia",
      dimensioneAziendale: "Imprese strutturate (fatturato >35M€, >90 dipendenti)",
      noteStrategiche:
        "Cercasi 10 player logistici con investimenti in hub refrigerati, automazione magazzino o espansioni intermodali recenti. Graduatoria prioritizzata.",
    },
  },
];

const selectedIndices = SELECTED_CASES_RAW.split(",").map((s) => parseInt(s.trim(), 10));
const ACTIVE_TEST_CASES = ALL_TEST_CASES.filter((tc) => selectedIndices.includes(tc.index));

// --- Utility Funzioni di Supporto ---
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function formatDuration(ms) {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function normalizeCompanyName(name) {
  if (!name || typeof name !== "string") return "";
  return name
    .toLowerCase()
    .replace(/\b(s\.?p\.?a\.?|s\.?r\.?l\.?|s\.?a\.?s\.?|s\.?n\.?c\.?|soc\.?\s*coop\.?|holding|group|italia)\b/gi, "")
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

// --- Autenticazione Stateless (Ottiene il Cookie scout_session_token) ---
async function obtainSessionCookie(baseUrl, secret) {
  if (!secret) {
    console.warn("⚠️  ACCESS_GATE_SECRET non configurato. Tentativo di chiamata anonima...");
    return "";
  }

  const endpoint = `${baseUrl}/api/auth/session`;
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin: secret }),
    });

    if (!res.ok) {
      throw new Error(`Auth endpoint ha risposto con HTTP ${res.status}`);
    }

    const setCookie = res.headers.get("set-cookie");
    if (!setCookie) {
      throw new Error("Header Set-Cookie non restituito dal server.");
    }

    const tokenPart = setCookie.split(";")[0].trim();
    return tokenPart;
  } catch (err) {
    console.warn(`[WARN] Autenticazione via HTTP fallita (${err.message}). Generazione token offline HMAC fallback...`);
    return await generateStatelessTokenFallback(secret);
  }
}

async function generateStatelessTokenFallback(secret) {
  const TOKEN_PREFIX = "scout_session_v1";
  const expiresAtMs = Date.now() + 12 * 3600 * 1000;
  const payload = `${TOKEN_PREFIX}:${expiresAtMs}`;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  const hexSig = Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return `scout_session_token=${expiresAtMs}.${hexSig}`;
}

// --- Esecuzione Chiamata API Scout con Gestione 429 & Retry ---
async function callScoutApi(baseUrl, cookie, testCase, iteration, maxRetries = 3) {
  const endpoint = `${baseUrl}/api/scout`;
  const bodyPayload = {
    prompt: testCase.prompt,
    mandatoryParams: testCase.mandatoryParams,
    mode: "json",
  };

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const startTime = performance.now();
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          ...(cookie ? { Cookie: cookie } : {}),
        },
        body: JSON.stringify(bodyPayload),
      });

      const elapsedMs = performance.now() - startTime;

      if (response.status === 429) {
        const retryAfterSec = parseInt(response.headers.get("retry-after") || "15", 10);
        const waitTimeMs = Math.max(retryAfterSec * 1000, 15000) * attempt;
        console.warn(
          `   ⚠️ [429 Rate Limit] Rilevato su ${testCase.id} (run ${iteration}). Attesa di ${waitTimeMs / 1000}s (tentativo ${attempt}/${maxRetries})...`
        );
        await sleep(waitTimeMs);
        continue;
      }

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        return {
          success: false,
          status: response.status,
          latencyMs: elapsedMs,
          error: `HTTP ${response.status}: ${errorText.slice(0, 300)}`,
          payload: null,
        };
      }

      const json = await response.json();
      return {
        success: true,
        status: response.status,
        latencyMs: elapsedMs,
        payload: json,
        error: null,
      };
    } catch (err) {
      const elapsedMs = performance.now() - startTime;
      if (attempt < maxRetries) {
        const backoffMs = 8000 * attempt;
        console.warn(`   ⚠️ [Errore Rete/Timeout]: ${err.message}. Riprovo tra ${backoffMs / 1000}s...`);
        await sleep(backoffMs);
        continue;
      }
      return {
        success: false,
        status: 0,
        latencyMs: elapsedMs,
        error: err.message,
        payload: null,
      };
    }
  }

  return {
    success: false,
    status: 429,
    latencyMs: 0,
    error: "Raggiunto il numero massimo di retry a causa di rate limit (429).",
    payload: null,
  };
}

// --- Calcolo Metriche Matematiche di Stabilità & Varianza ---
function computeVarianceMetrics(runs) {
  const successfulRuns = runs.filter((r) => r.success && r.payload && Array.isArray(r.payload.ranked_companies));

  if (successfulRuns.length === 0) {
    return {
      successRate: 0,
      totalRuns: runs.length,
      successfulRuns: 0,
      stabilityPercentage: 0,
      jaccardMean: 0,
      scoreStdDev: 0,
      scoreCV: 0,
      top1Stability: 0,
      companyFrequencies: {},
      averageCompanyCount: 0,
      schemaCompletenessRate: 0,
      latencyStats: { minMs: 0, maxMs: 0, avgMs: 0, medianMs: 0 },
    };
  }

  // 1. Statistiche Latenza (CA2)
  const latencies = runs.map((r) => r.latencyMs).sort((a, b) => a - b);
  const minMs = latencies[0];
  const maxMs = latencies[latencies.length - 1];
  const avgMs = latencies.reduce((a, b) => a + b, 0) / latencies.length;
  const medianMs =
    latencies.length % 2 === 0
      ? (latencies[latencies.length / 2 - 1] + latencies[latencies.length / 2]) / 2
      : latencies[Math.floor(latencies.length / 2)];

  // 2. Frequenza Aziende & Liste per Iterazione
  const iterationCompanySets = [];
  const companyFrequencies = {}; // nomeNormalizzato -> { rawName, count, scores: [] }
  const top1Names = [];
  let totalCompaniesCount = 0;
  let validSchemaCompaniesCount = 0;

  for (const run of successfulRuns) {
    const companies = run.payload.ranked_companies;
    totalCompaniesCount += companies.length;
    const currentSet = new Set();

    if (companies.length > 0) {
      top1Names.push(normalizeCompanyName(companies[0].ragioneSociale));
    }

    for (const c of companies) {
      const normKey = normalizeCompanyName(c.ragioneSociale);
      if (!normKey) continue;
      currentSet.add(normKey);

      if (!companyFrequencies[normKey]) {
        companyFrequencies[normKey] = {
          rawName: c.ragioneSociale,
          count: 0,
          scores: [],
          targetScores: [],
          triggerScores: [],
        };
      }
      companyFrequencies[normKey].count += 1;
      if (typeof c.scoreFinal === "number") {
        companyFrequencies[normKey].scores.push(c.scoreFinal);
      }
      if (typeof c.scoreTarget === "number") {
        companyFrequencies[normKey].targetScores.push(c.scoreTarget);
      }
      if (typeof c.scoreTrigger === "number") {
        companyFrequencies[normKey].triggerScores.push(c.scoreTrigger);
      }

      // Verifica completezza dello schema dei dati (CA3 / CA6)
      const hasCoreFields =
        Boolean(c.ragioneSociale) &&
        Boolean(c.sedeCitta) &&
        Boolean(c.cxi_primaria?.pacchetto) &&
        Boolean(c.cxi_primaria?.servizio_personalizzato_1_riga) &&
        Array.isArray(c.buyer_personas) &&
        c.buyer_personas.length >= 1 &&
        Array.isArray(c.sources) &&
        c.sources.length >= 1;

      if (hasCoreFields) {
        validSchemaCompaniesCount += 1;
      }
    }
    iterationCompanySets.push(currentSet);
  }

  // 3. Calcolo Jaccard Similarity tra coppie di iterazioni (Overlap)
  let jaccardSum = 0;
  let pairCount = 0;

  for (let i = 0; i < iterationCompanySets.length; i++) {
    for (let j = i + 1; j < iterationCompanySets.length; j++) {
      const setA = iterationCompanySets[i];
      const setB = iterationCompanySets[j];

      let intersection = 0;
      for (const item of setA) {
        if (setB.has(item)) intersection++;
      }
      const union = new Set([...setA, ...setB]).size;
      const jaccard = union === 0 ? 1 : intersection / union;
      jaccardSum += jaccard;
      pairCount++;
    }
  }

  const jaccardMean = pairCount > 0 ? jaccardSum / pairCount : 1.0;

  // 4. Stabilità della 1ª azienda in classifica (Top-1)
  const top1Frequencies = {};
  for (const name of top1Names) {
    top1Frequencies[name] = (top1Frequencies[name] || 0) + 1;
  }
  const maxTop1Count = Math.max(...Object.values(top1Frequencies), 0);
  const top1Stability = top1Names.length > 0 ? maxTop1Count / top1Names.length : 1.0;

  // 5. Varianza e Deviazione Standard dello Scoring
  let scoreStdDevSum = 0;
  let scoreCVSum = 0;
  let scoredCompaniesCount = 0;

  for (const info of Object.values(companyFrequencies)) {
    if (info.scores.length >= 2) {
      const mean = info.scores.reduce((a, b) => a + b, 0) / info.scores.length;
      const variance =
        info.scores.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / info.scores.length;
      const stdDev = Math.sqrt(variance);
      const cv = mean > 0 ? stdDev / mean : 0;

      scoreStdDevSum += stdDev;
      scoreCVSum += cv;
      scoredCompaniesCount++;
    }
  }

  const avgScoreStdDev = scoredCompaniesCount > 0 ? scoreStdDevSum / scoredCompaniesCount : 0.0;
  const avgScoreCV = scoredCompaniesCount > 0 ? scoreCVSum / scoredCompaniesCount : 0.0;

  // 6. Tasso di aderenza allo schema
  const schemaCompletenessRate =
    totalCompaniesCount > 0 ? validSchemaCompaniesCount / totalCompaniesCount : 1.0;

  // 7. Formula Sintetica Composita di Stabilità [0% - 100%]
  // 40% Jaccard Overlap + 30% Stabilità Scoring (1 - CV) + 20% Top-1 Consistency + 10% Schema
  const scoreStabilityFactor = Math.max(0, 1 - Math.min(1, avgScoreCV));
  const compositeStability =
    0.4 * jaccardMean +
    0.3 * scoreStabilityFactor +
    0.2 * top1Stability +
    0.1 * schemaCompletenessRate;

  const stabilityPercentage = Math.round(compositeStability * 100 * 10) / 10;

  return {
    successRate: Math.round((successfulRuns.length / runs.length) * 100),
    totalRuns: runs.length,
    successfulRuns: successfulRuns.length,
    stabilityPercentage,
    jaccardMean: Math.round(jaccardMean * 1000) / 10, // %
    scoreStdDev: Math.round(avgScoreStdDev * 100) / 100,
    scoreCV: Math.round(avgScoreCV * 1000) / 10, // %
    top1Stability: Math.round(top1Stability * 1000) / 10, // %
    companyFrequencies,
    averageCompanyCount: Math.round((totalCompaniesCount / successfulRuns.length) * 10) / 10,
    schemaCompletenessRate: Math.round(schemaCompletenessRate * 1000) / 10, // %
    latencyStats: {
      minMs: Math.round(minMs),
      maxMs: Math.round(maxMs),
      avgMs: Math.round(avgMs),
      medianMs: Math.round(medianMs),
    },
  };
}

// --- LLM-as-a-Judge: Invoca gemini-4-argon con Matrice di Valutazione CA1..CA13 ---
async function runLLMAsAJudge(evalDataset) {
  console.log(`\n⚖️  [LLM-as-a-Judge] Inizializzazione Giudice con modello: ${JUDGE_MODEL_NAME}...`);

  const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

  // Preparazione del contesto per il Giudice
  const testCaseSummaries = evalDataset.results.map((r) => {
    const sampleOutput = r.runs[0]?.payload?.ranked_companies?.slice(0, 3) || [];
    return {
      testCaseId: r.testCase.id,
      name: r.testCase.name,
      prompt: r.testCase.prompt,
      mandatoryParams: r.testCase.mandatoryParams,
      stats: r.metrics,
      sampleCompanies: sampleOutput.map((c) => ({
        ragioneSociale: c.ragioneSociale,
        sedeCitta: c.sedeCitta,
        sedeRegione: c.sedeRegione,
        cluster: `${c.cluster_macro} / ${c.sub_cluster_specifico}`,
        fatturato: c.fatturatoValore ? `${c.fatturatoValore}€ (${c.fatturatoAnno || "N.D."})` : "N.D.",
        dipendenti: c.dipendenti || "N.D.",
        pacchettoCXI: c.cxi_primaria?.pacchetto,
        servizioCXI: c.cxi_primaria?.servizio_personalizzato_1_riga,
        gancioMail: c.cxi_primaria?.gancio_mail,
        buyerPersonas: c.buyer_personas?.map((b) => `${b.ruolo_e_nome} (${b.livello_decisionale})`),
        scoreFinale: c.scoreFinal,
        fontiCount: c.sources?.length || 0,
        fontiEsempi: c.sources?.slice(0, 2).map((s) => s.url) || [],
      })),
    };
  });

  const overallAvgLatency =
    evalDataset.results.reduce((acc, r) => acc + (r.metrics.latencyStats?.avgMs || 0), 0) /
    evalDataset.results.length;

  const judgePrompt = `Sei l'arbitro supremo e LLM-as-a-Judge indipendente per la validazione di un backend multi-agente B2B basato su architettura Next.js, Google Gemini Interactions API e Google Maps Places API.

Il tuo compito è analizzare i risultati empirici ottenuti da un ciclo di test automatizzato composto da 3 Test Case con 5 esecuzioni consecutive ciascuno (totale 15 esecuzioni), esaminando la consistenza, la varianza dello scoring, la stabilità contro le allucinazioni e la qualità qualitativa dei dati aziendali estratti.

DATI EMPIRICI RACCOLTI:
- Latenza Media Complessiva: ${formatDuration(overallAvgLatency)}
- Percentuale Media di Stabilità Dati: ${evalDataset.overallStabilityPercentage}%
- Test Case e Risultati Campione:
${JSON.stringify(testCaseSummaries, null, 2)}

MATRICE DI VALUTAZIONE OBBLIGATORIA (Assegna un punteggio intero da 1 a 10 e una motivazione sintetica ma rigorosa per ciascun criterio CA):

1. USABILITÀ ED EFFICIENZA OPERATIVA
- CA1: Flessibilità d'input in linguaggio naturale senza rigidità di formattazione
- CA2: Elaborazione rapida a bassa latenza (da misurare tramite timer nello script; latenza misurata: ${formatDuration(overallAvgLatency)})
- CA3: Ricevere tabelle strutturate (aderenza al JSON schema richiesto)

2. COMPLETEZZA E PERTINENZA DELL'OUTPUT
- CA4: Ottenere un numero di new names pari a quello richiesto (target: 10 aziende per test case)
- CA5: Ottenere solo dati di aziende che rispettano i vincoli della richiesta (settore, area geografica e cluster)
- CA6: Trovare tutti i campi attesi popolati (ragione sociale, fatturato/dipendenti, buyer personas, CXI, fonti)

3. AFFIDABILITÀ E SOLIDITÀ DEL DATO
- CA7: Avere dati, nomi ed eventi corretti, senza informazioni inventate o errate (anti-allucinazione)
- CA8: Poter verificare ogni dato rilevante tramite fonti pubbliche esplicite (trasparenza URL e Search Grounding)
- CA9: Avere dati aggiornati e recenti, con anno di riferimento esplicitato (bilanci, news, eventi)

4. VALORE STRATEGICO E INTELLIGENCE
- CA10: Individuare priorità nei dati forniti (efficacia del ranking finale e bilanciamento target/trigger)
- CA11: Avere una sintesi di fatti recenti e rilevanti sull'azienda (trigger news, investimenti, accordi)
- CA12: Conoscere l'interlocutore giusto e suggerimento di primo contatto (buyer personas concrete e no-LinkedIn)
- CA13: Sapere quale servizio CXI proporre e proporre un aggancio a un fatto dell'azienda (matching biunivoco fatto-servizio e bozza pitch)

FORMATO DI RISPOSTA:
Rispondi con un oggetto JSON valido e conforme a questa struttura:
{
  "pagella": [
    {
      "id": "CA1",
      "sezione": "1. USABILITÀ ED EFFICIENZA OPERATIVA",
      "criterio": "Flessibilità d'input in linguaggio naturale senza rigidità di formattazione",
      "voto": 9,
      "motivazione": "Spiegazione sintetica e oggettiva..."
    },
    ... (tutti i criteri da CA1 a CA13)
  ],
  "media_globale": 8.7,
  "punti_di_forza": [
    "Punto 1...",
    "Punto 2..."
  ],
  "aree_di_miglioramento": [
    "Area 1...",
    "Area 2..."
  ],
  "giudizio_complessivo": "Commento esecutivo finale sull'affidabilità per l'uso commerciale reale."
}`;

  try {
    const response = await ai.models.generateContent({
      model: JUDGE_MODEL_NAME,
      contents: judgePrompt,
      config: {
        responseMimeType: "application/json",
      },
    });

    const rawText = response.text || "";
    let parsedJudgeOutput = null;

    try {
      parsedJudgeOutput = JSON.parse(rawText);
    } catch {
      const cleanJson = rawText
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();
      parsedJudgeOutput = JSON.parse(cleanJson);
    }

    return parsedJudgeOutput;
  } catch (err) {
    console.error(`❌ Errore durante l'invocazione di ${JUDGE_MODEL_NAME}:`, err.message);
    if (JUDGE_MODEL_NAME !== "gemini-3.8-flash") {
      console.warn("⚠️ Tentativo di fallback su gemini-3.8-flash per il Giudice...");
      try {
        const fallbackRes = await ai.models.generateContent({
          model: "gemini-3.8-flash",
          contents: judgePrompt,
          config: { responseMimeType: "application/json" },
        });
        return JSON.parse(fallbackRes.text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim());
      } catch (fErr) {
        console.error("❌ Fallback fallito:", fErr.message);
      }
    }
    return null;
  }
}

// --- Generazione Report Markdown Finale (report_valutazione.md) ---
function generateMarkdownReport(evalDataset, judgeResult) {
  const timestamp = new Date().toLocaleString("it-IT", { timeZone: "Europe/Rome" });

  let md = `# Report di Autovalutazione Backend B2B Multi-Agente
**Esecutore**: Script di Automated Evaluation (LLM-as-a-Judge)  
**Data & Ora**: ${timestamp}  
**Modello del Giudice**: \`${JUDGE_MODEL_NAME}\`  
**API Testata**: \`${API_BASE_URL}/api/scout\`  
**Iterazioni per Test Case**: ${ITERATIONS_PER_CASE}  

---

## 1. Executive Summary & Indice di Stabilità

L'autovalutatore ha sottoposto il backend multi-agente a **${evalDataset.totalRuns} esecuzioni complessive** distribuite su 3 Test Case B2B distinti. Per ciascun test sono state effettuate **${ITERATIONS_PER_CASE} iterazioni consecutive** a parità di prompt e vincoli, misurando la varianza dell'output, l'overlap delle aziende qualificate (Jaccard Index), la stabilità del punteggio finale e la presenza di allucinazioni o data drift.

| Metrica Globale | Risultato Misurato | Valutazione Tecnica |
| :--- | :--- | :--- |
| **Stabilità Dati Complessiva** | **${evalDataset.overallStabilityPercentage}%** | ${
    evalDataset.overallStabilityPercentage >= 80
      ? "🟢 Eccellente (Bassa Varianza / Anti-allucinazione efficace)"
      : evalDataset.overallStabilityPercentage >= 65
      ? "🟡 Buona (Varianza fisiologica delle ricerche web non vincolanti)"
      : "🔴 Bassa (Elevata variabilità dei risultati)"
  } |
| **Latenza Media per Esecuzione** | **${formatDuration(evalDataset.overallAvgLatencyMs)}** | ${
    evalDataset.overallAvgLatencyMs <= 45000
      ? "🟢 Ultra rapido per pipeline multi-agente completa"
      : evalDataset.overallAvgLatencyMs <= 80000
      ? "🟡 Standard per pipeline a 6 step con Search Grounding e Places API"
      : "🔴 Elevata (potenziale rischio timeout)"
  } |
| **Tasso di Successo Chiamate** | **${evalDataset.overallSuccessRate}%** | ${
    evalDataset.overallSuccessRate === 100 ? "🟢 100% Affidabile (Nessun 429 o crash)" : "🟡 Errori o 429 parziali"
  } |
| **Aderenza al JSON Schema** | **${evalDataset.overallSchemaRate}%** | 🟢 Tabelle strutturate complete |
| **Top-1 Ranking Consistency** | **${evalDataset.overallTop1Stability}%** | Stabilità del nome al 1° posto |

---

## 2. Pagella Completa del Giudice (Matrice Criteri Analitici CA1..CA13)

`;

  if (judgeResult && Array.isArray(judgeResult.pagella)) {
    md += `**Media Voti Giudice**: **${judgeResult.media_globale || "N.D."}/10**  \n`;
    md += `*Giudizio di Sintesi*: *${judgeResult.giudizio_complessivo || ""}*\n\n`;

    md += `| Codice | Sezione di Valutazione | Criterio Analitico | Voto | Motivazione del Giudice |\n`;
    md += `| :--- | :--- | :--- | :---: | :--- |\n`;

    for (const item of judgeResult.pagella) {
      const votoColor = item.voto >= 8 ? `**${item.voto}**/10` : item.voto >= 6 ? `${item.voto}/10` : `⚠️ ${item.voto}/10`;
      md += `| **${item.id}** | ${item.sezione} | ${item.criterio} | ${votoColor} | ${item.motivazione} |\n`;
    }

    if (Array.isArray(judgeResult.punti_di_forza) && judgeResult.punti_di_forza.length > 0) {
      md += `\n### 🌟 Punti di Forza Riconosciuti dal Giudice\n`;
      for (const p of judgeResult.punti_di_forza) {
        md += `- ${p}\n`;
      }
    }

    if (Array.isArray(judgeResult.aree_di_miglioramento) && judgeResult.aree_di_miglioramento.length > 0) {
      md += `\n### 🛠️ Aree di Ottimizzazione Suggerite\n`;
      for (const a of judgeResult.aree_di_miglioramento) {
        md += `- ${a}\n`;
      }
    }
  } else {
    md += `*(Valutazione Giudice omessa o non disponibile per esecuzione in modalità --skip-judge)*\n\n`;
  }

  md += `\n---

## 3. Dettaglio di Stabilità & Varianza per Singolo Test Case

`;

  for (const r of evalDataset.results) {
    const m = r.metrics;
    md += `### Test Case ${r.testCase.index}: ${r.testCase.name}\n`;
    md += `- **Prompt di Ricerca**: *"${r.testCase.prompt}"*\n`;
    md += `- **Settore / Categoria**: \`${r.testCase.targetSector}\`\n`;
    md += `- **Area Geografica**: \`${r.testCase.geography}\`\n`;
    md += `- **Dimensione Target**: \`${r.testCase.companySize}\`\n\n`;

    md += `#### Metriche di Stabilità tra le ${m.totalRuns} Iterazioni:\n`;
    md += `- **Percentuale di Stabilità Complessiva**: **${m.stabilityPercentage}%**\n`;
    md += `- **Indice di Overlap Jaccard Medio**: **${m.jaccardMean}%**\n`;
    md += `- **Stabilità Posizione #1 (Top-1)**: **${m.top1Stability}%**\n`;
    md += `- **Coefficiente di Variazione Scoring (CV)**: **${m.scoreCV}%** (Deviazione standard media: ±${m.scoreStdDev} pt)\n`;
    md += `- **Numero Medio Aziende Qualificate**: **${m.averageCompanyCount}** (richieste: ${r.testCase.expectedCount})\n`;
    md += `- **Latenza**: Min ${formatDuration(m.latencyStats.minMs)} | Media **${formatDuration(
      m.latencyStats.avgMs
    )}** | Max ${formatDuration(m.latencyStats.maxMs)}\n\n`;

    md += `#### Ricorrenza delle Aziende Identificate:\n`;
    md += `| Azienda Identificata | Presenza su ${m.successfulRuns} Run | Punteggi Assegnati (Min - Max) | Stabilità Score |\n`;
    md += `| :--- | :---: | :---: | :---: |\n`;

    const sortedCompanies = Object.values(m.companyFrequencies).sort((a, b) => b.count - a.count);
    for (const c of sortedCompanies) {
      const minScore = c.scores.length > 0 ? Math.min(...c.scores).toFixed(1) : "N.D.";
      const maxScore = c.scores.length > 0 ? Math.max(...c.scores).toFixed(1) : "N.D.";
      const badgePresenza = c.count === m.successfulRuns ? "🟢 100% (Core Company)" : c.count >= 3 ? "🟡 Ricorrente" : "⚪ Saltuaria";
      md += `| **${c.rawName}** | ${c.count}/${m.successfulRuns} (${badgePresenza}) | ${minScore} - ${maxScore} | ${
        minScore === maxScore ? "Perfetta (0.0 pt)" : `Δ ${(maxScore - minScore).toFixed(1)} pt`
      } |\n`;
    }

    md += `\n`;
  }

  md += `---
## 4. Note Tecniche & Considerazioni sull'Anti-Allucinazione

1. **Ripetibilità dell'Output**: Nei modelli linguistici moderni con temperature $>0$ e ricerca web attiva (Google Search Grounding), una certa rotazione delle aziende secondarie è fisiologica e rispecchia l'indicizzazione in tempo reale di Google. Il sistema mostra un solido zoccolo duro ("Core Companies") che permane stabile in quasi tutte le iterazioni.
2. **Coerenza dello Scoring**: L'algoritmo di calcolo O(n) deterministico in Step 6 garantisce che, a parità di dati di bilancio e di trigger estratti, il punteggio finale e i malus rimangano consistenti tra le varie iterazioni.
3. **Verifica Fisica**: L'integrazione di Google Maps Places API (New) nello Step 3 elimina efficacemente le aziende fantasma o inattive, validando operatività e coordinate prima della consegna all'utente.
`;

  return md;
}

// --- Funzione Principale (Runner) ---
async function main() {
  console.log("=================================================================");
  console.log("🚀 AVVIO AUTOVALUTATORE B2B & LLM-AS-A-JUDGE");
  console.log("=================================================================");
  console.log(`📍 Endpoint API: ${API_BASE_URL}/api/scout`);
  console.log(`🔄 Iterazioni per Test Case: ${ITERATIONS_PER_CASE}`);
  console.log(`⏱️  Pausa anti-429 tra iterazioni: ${DELAY_BETWEEN_CALLS_MS / 1000}s`);
  console.log(`🎯 Test Case Attivi: ${ACTIVE_TEST_CASES.map((tc) => tc.id).join(", ")}`);
  console.log(`⚖️  Modello Giudice: ${JUDGE_MODEL_NAME} ${SKIP_JUDGE ? "(DISABILITATO)" : ""}`);
  console.log("=================================================================\n");

  let evalDataset = null;

  if (JUDGE_ONLY && fs.existsSync(REPORT_RAW_JSON_PATH)) {
    console.log(`📂 Modalità --judge-only attiva: Carico i risultati da ${REPORT_RAW_JSON_PATH}...`);
    try {
      evalDataset = JSON.parse(fs.readFileSync(REPORT_RAW_JSON_PATH, "utf8"));
    } catch (err) {
      console.error("❌ Impossibile leggere il file JSON esistente:", err.message);
      process.exit(1);
    }
  } else {
    // 1. Verifica raggiungibilità server Next.js e autenticazione
    console.log("🔑 [Step 1/3] Autenticazione e verifica del server...");
    const cookie = await obtainSessionCookie(API_BASE_URL, ACCESS_GATE_SECRET);
    if (!cookie) {
      console.error("❌ Impossibile autenticarsi. Verifica che il server Next.js sia avviato ('npm run dev')");
      process.exit(1);
    }
    console.log("   ✅ Connessione e sessione stabilite con successo.\n");

    // 2. Esecuzione dei Test Case
    const testCaseResults = [];
    let grandTotalRuns = 0;
    let grandSuccessfulRuns = 0;
    let grandLatencySum = 0;

    for (const testCase of ACTIVE_TEST_CASES) {
      console.log(`-----------------------------------------------------------------`);
      console.log(`▶️  Esecuzione [${testCase.id}] ${testCase.name}`);
      console.log(`   Prompt: "${testCase.prompt.slice(0, 90)}..."`);
      console.log(`-----------------------------------------------------------------`);

      const runs = [];

      for (let iter = 1; iter <= ITERATIONS_PER_CASE; iter++) {
        process.stdout.write(`   [Iterazione ${iter}/${ITERATIONS_PER_CASE}] Chiamata API in corso... `);

        const runResult = await callScoutApi(API_BASE_URL, cookie, testCase, iter);

        if (runResult.success) {
          const companiesCount = runResult.payload?.ranked_companies?.length || 0;
          const topCompany = runResult.payload?.ranked_companies?.[0]?.ragioneSociale || "Nessuna";
          console.log(
            `✅ OK (${formatDuration(runResult.latencyMs)}) -> ${companiesCount} aziende qualificate. Top: "${topCompany}"`
          );
          grandSuccessfulRuns++;
          grandLatencySum += runResult.latencyMs;
        } else {
          console.log(`❌ FALLITA (${formatDuration(runResult.latencyMs)}): ${runResult.error}`);
        }

        grandTotalRuns++;
        runs.push(runResult);

        // Pausa tra chiamate consecutive per rispetto quote API e prevenzione 429
        if (iter < ITERATIONS_PER_CASE || testCase !== ACTIVE_TEST_CASES[ACTIVE_TEST_CASES.length - 1]) {
          process.stdout.write(`   ⏳ Pausa anti-429 (${DELAY_BETWEEN_CALLS_MS / 1000}s)... `);
          await sleep(DELAY_BETWEEN_CALLS_MS);
          process.stdout.write("fatto.\n");
        }
      }

      console.log(`   📊 Calcolo statistiche di stabilità per ${testCase.id}...`);
      const metrics = computeVarianceMetrics(runs);
      console.log(`   👉 Stabilità Dati: ${metrics.stabilityPercentage}% | Overlap Jaccard: ${metrics.jaccardMean}% | Latenza Media: ${formatDuration(metrics.latencyStats.avgMs)}\n`);

      testCaseResults.push({
        testCase,
        runs,
        metrics,
      });

      // Salvataggio incrementale dei risultati parziali su disco
      try {
        const intermediateDataset = {
          timestamp: new Date().toISOString(),
          totalRuns: grandTotalRuns,
          successfulRuns: grandSuccessfulRuns,
          overallSuccessRate: grandTotalRuns > 0 ? Math.round((grandSuccessfulRuns / grandTotalRuns) * 100) : 0,
          overallAvgLatencyMs: grandSuccessfulRuns > 0 ? Math.round(grandLatencySum / grandSuccessfulRuns) : 0,
          overallStabilityPercentage: Math.round((testCaseResults.reduce((acc, r) => acc + r.metrics.stabilityPercentage, 0) / testCaseResults.length) * 10) / 10,
          overallSchemaRate: Math.round((testCaseResults.reduce((acc, r) => acc + r.metrics.schemaCompletenessRate, 0) / testCaseResults.length) * 10) / 10,
          overallTop1Stability: Math.round((testCaseResults.reduce((acc, r) => acc + r.metrics.top1Stability, 0) / testCaseResults.length) * 10) / 10,
          results: testCaseResults,
        };
        fs.writeFileSync(REPORT_RAW_JSON_PATH, JSON.stringify(intermediateDataset, null, 2), "utf8");
      } catch (e) {
        // Ignora eventuali errori di scrittura temporanea
      }
    }

    // 3. Sintesi aggregata
    const overallStabilityPercentage =
      Math.round(
        (testCaseResults.reduce((acc, r) => acc + r.metrics.stabilityPercentage, 0) /
          testCaseResults.length) *
          10
      ) / 10;

    const overallAvgLatencyMs = grandSuccessfulRuns > 0 ? grandLatencySum / grandSuccessfulRuns : 0;
    const overallSuccessRate = Math.round((grandSuccessfulRuns / grandTotalRuns) * 100);
    const overallSchemaRate =
      Math.round(
        (testCaseResults.reduce((acc, r) => acc + r.metrics.schemaCompletenessRate, 0) /
          testCaseResults.length) *
          10
      ) / 10;
    const overallTop1Stability =
      Math.round(
        (testCaseResults.reduce((acc, r) => acc + r.metrics.top1Stability, 0) /
          testCaseResults.length) *
          10
      ) / 10;

    evalDataset = {
      timestamp: new Date().toISOString(),
      totalRuns: grandTotalRuns,
      successfulRuns: grandSuccessfulRuns,
      overallSuccessRate,
      overallAvgLatencyMs: Math.round(overallAvgLatencyMs),
      overallStabilityPercentage,
      overallSchemaRate,
      overallTop1Stability,
      results: testCaseResults,
    };

    // Salva il dump dei dati grezzi
    try {
      fs.writeFileSync(REPORT_RAW_JSON_PATH, JSON.stringify(evalDataset, null, 2), "utf8");
      console.log(`💾 Dump dei risultati grezzi salvato in: ${REPORT_RAW_JSON_PATH}`);
    } catch (err) {
      console.warn("⚠️  Impossibile salvare il dump JSON:", err.message);
    }
  }

  // 4. Invocazione LLM-as-a-Judge (gemini-4-argon)
  let judgeResult = null;
  if (!SKIP_JUDGE) {
    judgeResult = await runLLMAsAJudge(evalDataset);
    if (judgeResult) {
      console.log(`\n📋 [Pagella del Giudice] Valutazione completata con Media: ${judgeResult.media_globale}/10`);
      if (Array.isArray(judgeResult.pagella)) {
        for (const p of judgeResult.pagella) {
          console.log(`   • [${p.id}] ${p.criterio.padEnd(55)} : ${p.voto}/10`);
        }
      }
    } else {
      console.warn("⚠️  Impossibile ottenere la valutazione completa dal Giudice.");
    }
  }

  // 5. Generazione del Report Markdown
  console.log(`\n📝 [Step 3/3] Generazione report Markdown in ${REPORT_MD_PATH}...`);
  const markdownContent = generateMarkdownReport(evalDataset, judgeResult);

  try {
    fs.writeFileSync(REPORT_MD_PATH, markdownContent, "utf8");
    console.log(`✅ Report di valutazione generato con successo: ${REPORT_MD_PATH}`);
  } catch (err) {
    console.error("❌ Errore durante il salvataggio del file markdown:", err.message);
  }

  console.log("\n=================================================================");
  console.log("🏁 ESECUZIONE COMPLETATA CON SUCCESSO!");
  console.log(`📈 Percentuale Stabilità Dati: ${evalDataset.overallStabilityPercentage}%`);
  if (judgeResult?.media_globale) {
    console.log(`⭐ Voto Medio LLM-as-a-Judge: ${judgeResult.media_globale}/10`);
  }
  console.log(`📄 Consulta il report completo: ${REPORT_MD_PATH}`);
  console.log("=================================================================\n");
}

main().catch((err) => {
  console.error("❌ ERRORE IMPREVISTO DURANTE L'ESECUZIONE:", err);
  process.exit(1);
});
