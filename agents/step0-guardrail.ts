import { callGeminiStructured } from "@/lib/gemini";
import type { StepExecutionResult } from "@/lib/telemetry";
import type { MandatorySearchInput } from "@/lib/types";

/**
 * Step 0 — Input Guardrail & Controllore dei 3 Parametri Obbligatori B2B (`gemini-3.8-flash`).
 *
 * Verifica a monte (con zero spreco di token di ricerca):
 * 1. Se la richiesta riguarda lo scouting aziendale B2B (`isB2BScoutingRequest`).
 * 2. Se, combinando gli appositi campi del form (`mandatoryParams`) e il testo libero del `prompt`,
 *    sono presenti TUTTI E 3 i parametri obbligatori:
 *    - Categoria / Settore Azienda
 *    - Area Geografica
 *    - Dimensione Aziendale (fasce dipendenti, soglie clienti/fatturato come "almeno 500.000 clienti", oppure PMI, Mid-Cap, Grandi Imprese, Aziende Quotate, Startup).
 * Se la domanda è fuori tema oppure manca anche solo uno dei 3 parametri, blocca subito la pipeline
 * restituendo un messaggio chiaro (`politeReplyIfBlocked`) che indica esattamente cosa manca.
 */

export interface GuardrailInput {
  prompt: string;
  mandatoryParams?: MandatorySearchInput;
}

export interface GuardrailOutput {
  isB2BScoutingRequest: boolean;
  hasAllMandatoryParams: boolean;
  missingMandatoryParams: string[];
  reason: string;
  politeReplyIfBlocked: string;
}

interface RawGuardrailLLMResponse {
  isB2BScoutingRequest: boolean;
  hasCategoriaSettore: boolean;
  hasAreaGeografica: boolean;
  hasDimensioneAziendale: boolean;
  reason: string;
  politeReplyIfBlocked: string;
}

const GUARDRAIL_SCHEMA: Record<string, unknown> = {
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
        "True se la Categoria o il Settore Azienda è presente (nei campi dedicati oppure scritto direttamente nel prompt, es. 'aziende che vendono luce e gas', 'manifatturiero', 'software', ecc.).",
    },
    hasAreaGeografica: {
      type: "boolean",
      description:
        "True se l'Area Geografica è presente (nei campi dedicati oppure nel prompt, es. 'Nord Italia' anche con lievi refusi di battitura come 'Nora Italia', 'Lombardia', 'Torino', 'Italia', ecc.).",
    },
    hasDimensioneAziendale: {
      type: "boolean",
      description:
        "True se la Dimensione Aziendale è presente (nei campi dedicati oppure nel prompt): accetta fasce di dipendenti, soglie di clienti o fatturato (es. 'almeno 500.000 clienti', 'fatturato 20M-80M€'), oppure categorie dimensionali/mercato come PMI, Mid-Cap, Grandi Imprese, Aziende Quotate, Startup.",
    },
    reason: {
      type: "string",
      description: "Breve motivazione tecnica della verifica (1 frase).",
    },
    politeReplyIfBlocked: {
      type: "string",
      description:
        "Se isB2BScoutingRequest è false OPPURE se manca uno o più dei 3 parametri obbligatori, messaggio cortese in italiano che spiega perché la ricerca è stata bloccata e indica chiaramente quali dei 3 parametri mancano. Se tutto è valido, stringa vuota.",
    },
  },
  required: [
    "isB2BScoutingRequest",
    "hasCategoriaSettore",
    "hasAreaGeografica",
    "hasDimensioneAziendale",
    "reason",
    "politeReplyIfBlocked",
  ],
};

const GUARDRAIL_SYSTEM_INSTRUCTION = `Sei il Controllore a Monte (Step 0 — Input Guardrail & Mandatory Parameters Checker) della piattaforma "B2B Scouting & CXI Sales Matcher".
L'utente può inserire i 3 parametri obbligatori tramite gli appositi campi del form OPPURE scriverli direttamente nel prompt testuale della chat (o combinare le due cose).

Il tuo compito è verificare:
1. PERTINENZA B2B (\`isB2BScoutingRequest\`):
   - \`true\` se l'utente cerca o analizza aziende, fornitori, utility, imprese o lead commerciali.
   - \`false\` per domande fuori contesto (es. "Chi è il presidente degli Stati Uniti?", sport, ricette, meteo, ecc.).

2. PRESENZA DEI 3 PARAMETRI OBBLIGATORI (combinando Campi Form + Prompt Chat, tollerando eventuali refusi di battitura come "famialie", "Nora Italia" per "Nord Italia", "arandi volumi"):
   - **Categoria / Settore Azienda** (\`hasCategoriaSettore\`): es. vendita luce e gas, manifatturiero, ICT, chimico, logistica, ecc.
   - **Area Geografica** (\`hasAreaGeografica\`): es. Nord Italia, Lombardia, Torino, Centro-Nord, Italia, ecc.
   - **Dimensione Aziendale** (\`hasDimensioneAziendale\`): DEVE accettare sia fasce numeriche di dipendenti (es. 50-250 dipendenti), sia soglie dimensionali di clienti o fatturato (es. "almeno 500.000 clienti", "fatturato 20M-80M€"), sia categorie dimensionali/mercato come PMI, Mid-Cap, Grandi Imprese, Aziende Quotate, Startup.

3. MESSAGGIO DI BLOCCO (\`politeReplyIfBlocked\`):
   - Se \`isB2BScoutingRequest = false\`: rispondi cortesemente che sei un assistente specializzato esclusivamente in Scouting Aziendale B2B e Qualificazione Commerciale CXI.
   - Se \`isB2BScoutingRequest = true\` ma manca almeno uno dei 3 parametri obbligatori: spiega cortesemente che per avviare lo scouting B2B devono essere presenti tutti e 3 i parametri (nei campi dedicati oppure direttamente nel prompt) ed elenca esplicitamente quale parametro manca tra Categoria/Settore, Area Geografica e Dimensione Aziendale.`;

function hasFieldText(value: string | undefined | null): boolean {
  return Boolean(value && value.trim().length >= 2);
}

export async function runStep0Guardrail(
  input: GuardrailInput
): Promise<StepExecutionResult<GuardrailOutput>> {
  const mp = input.mandatoryParams;
  const combinedInspectionText = [
    mp?.categoriaSettore?.trim()
      ? `Campo Categoria/Settore Azienda: ${mp.categoriaSettore.trim()}`
      : "Campo Categoria/Settore Azienda: (non compilato nel campo dedicato, verifica nel prompt)",
    mp?.areaGeografica?.trim()
      ? `Campo Area Geografica: ${mp.areaGeografica.trim()}`
      : "Campo Area Geografica: (non compilato nel campo dedicato, verifica nel prompt)",
    mp?.dimensioneAziendale?.trim()
      ? `Campo Dimensione Aziendale: ${mp.dimensioneAziendale.trim()}`
      : "Campo Dimensione Aziendale: (non compilato nel campo dedicato, verifica nel prompt)",
    mp?.noteStrategiche?.trim()
      ? `Testo nel campo Prompt / Obiettivi: ${mp.noteStrategiche.trim()}`
      : "",
    `Prompt complessivo inviato dall'utente:\n"""\n${input.prompt}\n"""`,
  ]
    .filter(Boolean)
    .join("\n");

  const res = await callGeminiStructured<RawGuardrailLLMResponse>({
    stepKey: "guardrail",
    systemInstruction: GUARDRAIL_SYSTEM_INSTRUCTION,
    userPrompt: combinedInspectionText,
    jsonSchema: GUARDRAIL_SCHEMA,
    maxOutputTokens: 8192,
  });

  const isB2B = Boolean(res.data.isB2BScoutingRequest);

  // Un parametro è presente se rilevato dall'LLM nel prompt/campi OPPURE se compilato esplicitamente nel campo dedicato
  const hasSettore =
    Boolean(res.data.hasCategoriaSettore) || hasFieldText(mp?.categoriaSettore);
  const hasGeo =
    Boolean(res.data.hasAreaGeografica) || hasFieldText(mp?.areaGeografica);
  const hasDim =
    Boolean(res.data.hasDimensioneAziendale) ||
    hasFieldText(mp?.dimensioneAziendale);

  const missingMandatoryParams: string[] = [];
  if (isB2B) {
    if (!hasSettore) {
      missingMandatoryParams.push("Categoria / Settore Azienda");
    }
    if (!hasGeo) {
      missingMandatoryParams.push("Area Geografica");
    }
    if (!hasDim) {
      missingMandatoryParams.push(
        "Dimensione Aziendale (es. fascia dipendenti, soglia clienti/fatturato, PMI, Mid-Cap, Grandi Imprese, Aziende Quotate, Startup)"
      );
    }
  }

  const hasAllMandatoryParams = isB2B && missingMandatoryParams.length === 0;

  const fallbackOffTopic =
    "Sono un assistente specializzato esclusivamente nello Scouting Aziendale B2B e nella Qualificazione Commerciale CXI. Inserisci una richiesta inerente alla ricerca di imprese indicando Categoria/Settore, Area Geografica e Dimensione Aziendale (negli appositi campi oppure direttamente nel prompt).";

  const fallbackMissingParams = `La tua richiesta è inerente allo scouting B2B, ma per avviare l'analisi devono essere presenti tutti e 3 i parametri obbligatori (puoi inserirli negli appositi campi oppure scriverli direttamente nel prompt). Parametri mancanti rilevati: ${missingMandatoryParams.join(", ")}.`;

  let politeReply = "";
  if (!isB2B) {
    politeReply = res.data.politeReplyIfBlocked?.trim() || fallbackOffTopic;
  } else if (!hasAllMandatoryParams) {
    politeReply =
      res.data.politeReplyIfBlocked?.trim() &&
      res.data.politeReplyIfBlocked.trim().length > 15
        ? `${res.data.politeReplyIfBlocked.trim()} (Parametri mancanti: ${missingMandatoryParams.join(", ")})`
        : fallbackMissingParams;
  }

  const normalized: GuardrailOutput = {
    isB2BScoutingRequest: isB2B,
    hasAllMandatoryParams,
    missingMandatoryParams,
    reason:
      res.data.reason?.trim() ||
      (!isB2B
        ? "Richiesta fuori contesto B2B."
        : !hasAllMandatoryParams
          ? `Parametri obbligatori mancanti: ${missingMandatoryParams.join(", ")}`
          : "Richiesta B2B completa di tutti e 3 i parametri obbligatori."),
    politeReplyIfBlocked: politeReply,
  };

  return {
    output: normalized,
    modelUsed: res.modelUsed,
    fallbackTriggered: res.fallbackTriggered,
  };
}
