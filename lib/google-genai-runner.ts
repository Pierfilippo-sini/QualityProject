import { GoogleGenAI, ApiError } from "@google/genai";
import {
  AGENT_MODEL_ASSIGNMENT,
  UNIFIED_GEMINI_MODEL,
  getGeminiApiKey,
  type AgentStepKey,
} from "@/lib/agent-config";
import {
  withGeminiUsageTracker,
  type GeminiCallCostMetrics,
} from "@/lib/gemini-usage-tracker";
import { stripHtmlAndCssToCleanText } from "@/lib/html-cleaner";

/**
 * Layer Client AI & Google Search Grounding (`@google/genai` Interactions API).
 *
 * Responsabilità:
 * 1. Utilizzare esclusivamente il modello `gemini-3.8-flash` per tutti i sub-agenti e per l'orchestratore.
 * 2. Pulire il payload in ingresso rimuovendo eventuali tag HTML/CSS inutili per risparmiare token.
 * 3. Forzare il Structured Outputs tramite JSON Schema nativo dell'API (`response_format`),
 *    ottenendo esclusivamente il payload JSON richiesto senza preamboli o markdown code block.
 * 4. Impostare timeout compatibili con i limiti delle Serverless Function su Vercel (`maxDuration = 60`).
 */

export { getGeminiApiKey };

export interface GroundingCitation {
  title: string;
  url: string;
}

export interface GeminiStructuredCallOptions {
  stepKey: AgentStepKey;
  systemInstruction: string;
  userPrompt: string;
  jsonSchema: Record<string, unknown>;
  maxOutputTokens?: number;
  timeoutMs?: number;
}

export interface GeminiStructuredCallResult<T> {
  data: T;
  rawText: string;
  modelUsed: string;
  fallbackTriggered: boolean;
  groundingQuotaFallback: boolean;
  warningMessage?: string;
  citations: GroundingCitation[];
  searchQueries: string[];
  usageMetrics: GeminiCallCostMetrics;
}

let groundingSearchCooldownUntil = 0;
const COOLDOWN_MS = 30_000;

function createGenAIClient(): GoogleGenAI {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw new Error(
      "Chiave GEMINI_API_KEY mancante. Inseriscila nel file .env.local per eseguire il motore di scouting."
    );
  }
  return new GoogleGenAI({ apiKey });
}

function isQuotaError(error: unknown): boolean {
  if (error instanceof ApiError && error.status === 429) {
    return true;
  }
  if (
    error &&
    typeof error === "object" &&
    (error as { status?: unknown }).status === 429
  ) {
    return true;
  }
  const msg = (
    error instanceof Error ? error.message : String(error)
  ).toLowerCase();
  return (
    msg.includes("429") ||
    msg.includes("quota") ||
    msg.includes("resource_exhausted") ||
    msg.includes("rate limit") ||
    msg.includes("too_many_requests")
  );
}

function cleanJsonString(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith("```")) {
    return trimmed
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
  }
  return trimmed;
}

function extractGroundingMetadata(interaction: unknown): {
  citations: GroundingCitation[];
  searchQueries: string[];
} {
  const citationsMap = new Map<string, GroundingCitation>();
  const searchQueriesSet = new Set<string>();

  if (!interaction || typeof interaction !== "object") {
    return { citations: [], searchQueries: [] };
  }

  const steps = (interaction as { steps?: unknown[] }).steps;
  if (!Array.isArray(steps)) {
    return { citations: [], searchQueries: [] };
  }

  for (const step of steps) {
    if (!step || typeof step !== "object") continue;
    const stepRecord = step as Record<string, unknown>;

    if (stepRecord.type === "google_search_call") {
      const args = stepRecord.arguments as { queries?: unknown } | undefined;
      if (Array.isArray(args?.queries)) {
        for (const q of args.queries) {
          if (typeof q === "string" && q.trim()) {
            searchQueriesSet.add(q.trim());
          }
        }
      }
    }

    if (stepRecord.type === "model_output" && Array.isArray(stepRecord.content)) {
      for (const block of stepRecord.content) {
        if (!block || typeof block !== "object") continue;
        const blockRecord = block as Record<string, unknown>;
        if (!Array.isArray(blockRecord.annotations)) continue;

        for (const ann of blockRecord.annotations) {
          if (!ann || typeof ann !== "object") continue;
          const annRecord = ann as Record<string, unknown>;
          if (
            annRecord.type === "url_citation" &&
            typeof annRecord.url === "string" &&
            annRecord.url.startsWith("http")
          ) {
            const url = annRecord.url.trim();
            const title =
              typeof annRecord.title === "string" && annRecord.title.trim()
                ? annRecord.title.trim()
                : new URL(url).hostname;
            if (!citationsMap.has(url)) {
              citationsMap.set(url, { title, url });
            }
          }
        }
      }
    }
  }

  return {
    citations: Array.from(citationsMap.values()),
    searchQueries: Array.from(searchQueriesSet.values()),
  };
}

function extractTextFromInteraction(interaction: {
  output_text?: string;
  outputs?: unknown[];
  steps?: unknown[];
}): string {
  if (typeof interaction.output_text === "string" && interaction.output_text.trim()) {
    return interaction.output_text.trim();
  }

  if (Array.isArray(interaction.outputs)) {
    const outChunks: string[] = [];
    for (const part of interaction.outputs) {
      if (
        part &&
        typeof part === "object" &&
        (part as { type?: unknown }).type === "text" &&
        typeof (part as { text?: unknown }).text === "string"
      ) {
        outChunks.push((part as { text: string }).text);
      }
    }
    if (outChunks.length > 0) {
      return outChunks.join("").trim();
    }
  }

  if (Array.isArray(interaction.steps)) {
    const chunks: string[] = [];
    for (const step of interaction.steps) {
      if (!step || typeof step !== "object") continue;
      const stepRecord = step as Record<string, unknown>;
      if (stepRecord.type === "model_output" && Array.isArray(stepRecord.content)) {
        for (const part of stepRecord.content) {
          if (
            part &&
            typeof part === "object" &&
            (part as { type?: unknown }).type === "text" &&
            typeof (part as { text?: unknown }).text === "string"
          ) {
            chunks.push((part as { text: string }).text);
          }
        }
      }
    }
    if (chunks.length > 0) {
      return chunks.join("").trim();
    }
  }

  return "";
}

/**
 * Esegue una chiamata strutturata utilizzando esclusivamente `gemini-3.8-flash`
 * con JSON Schema nativo (`response_format`), pulizia automatica di HTML/CSS dal prompt
 * e timeout calibrato per le Serverless Function di Vercel.
 */
export async function callGeminiStructured<T>(
  options: GeminiStructuredCallOptions
): Promise<GeminiStructuredCallResult<T>> {
  const client = createGenAIClient();
  const routing = AGENT_MODEL_ASSIGNMENT[options.stepKey];
  const modelId = UNIFIED_GEMINI_MODEL;

  // Pulisce il prompt da eventuali residui HTML/CSS mantenendo intatti JSON e markdown
  const cleanUserPrompt = stripHtmlAndCssToCleanText(options.userPrompt, 24_000);

  const strictJsonEnforcementNote =
    "FORMATO DI RISPOSTA OBBLIGATORIO: Rispondi ESCLUSIVAMENTE con l'oggetto JSON conforme allo schema richiesto, senza alcun preambolo testuale, commento o blocco markdown ```json. Ogni campo testuale deve essere costituito da frasi complete, sintetiche e ben concluse che terminano sempre con un punto fermo (.). È severamente vietato troncare le frasi o usare i punti di sospensione (...).";

  const executeAttempt = async (
    enableSearchTool: boolean,
    extraSystemNote?: string
  ) => {
    const resolvedMaxTokens = options.maxOutputTokens ?? 8192;
    const generationConfig: Record<string, unknown> = {
      thinking_level: "low",
      max_output_tokens: resolvedMaxTokens,
    };

    const systemParts = [
      options.systemInstruction,
      strictJsonEnforcementNote,
      ...(extraSystemNote ? [extraSystemNote] : []),
    ];

    const { response: interaction, metrics: usageMetrics } =
      await withGeminiUsageTracker(
        {
          stepLabel: options.stepKey,
          stepNumber: routing.stepNumber,
          model: modelId,
        },
        () =>
          client.interactions.create(
            {
              model: modelId,
              input: cleanUserPrompt,
              system_instruction: systemParts.join("\n\n"),
              store: false,
              ...(enableSearchTool
                ? { tools: [{ type: "google_search" as const }] }
                : {}),
              generation_config: generationConfig,
              response_format: options.jsonSchema,
            },
            options.timeoutMs ? { timeout: options.timeoutMs } : undefined
          )
      );

    const rawText = extractTextFromInteraction(
      interaction as unknown as {
        output_text?: string;
        outputs?: unknown[];
        steps?: unknown[];
      }
    );
    if (!rawText) {
      throw new Error(
        `Risposta vuota ricevuta dal modello ${modelId} nello step ${options.stepKey}.`
      );
    }

    const cleaned = cleanJsonString(rawText);
    const parsed = JSON.parse(cleaned) as T;
    const { citations, searchQueries } = extractGroundingMetadata(interaction);

    return {
      data: parsed,
      rawText: cleaned,
      citations,
      searchQueries,
      usageMetrics,
    };
  };

  const now = Date.now();
  let wantSearchGrounding =
    routing.useSearchGrounding && now >= groundingSearchCooldownUntil;
  let groundingQuotaFallback =
    routing.useSearchGrounding && !wantSearchGrounding;

  const GROUNDING_FALLBACK_WARNING =
    "Quota Google Search Grounding esaurita (HTTP 429): attivato fallback resiliente su gemini-3.8-flash con testo sito pulito e certificazione Google Maps Places API.";

  const ANTI_HALLUCINATION_FALLBACK_NOTE =
    "NOTA CRITICA DI SICUREZZA: Lo strumento Google Search ha esaurito la quota API (HTTP 429). Usa esclusivamente il testo pulito estratto dal sito e conoscenze aziendali verificate; NON inventare MAI cifre di fatturato, dipendenti o nomi di manager non certi (imposta null o 'N.D.').";

  try {
    const res = await executeAttempt(
      wantSearchGrounding,
      groundingQuotaFallback ? ANTI_HALLUCINATION_FALLBACK_NOTE : undefined
    );
    return {
      ...res,
      modelUsed: modelId,
      fallbackTriggered: groundingQuotaFallback,
      groundingQuotaFallback,
      ...(groundingQuotaFallback
        ? { warningMessage: GROUNDING_FALLBACK_WARNING }
        : {}),
    };
  } catch (error) {
    // Se lo step usa Google Search Grounding e riceve 429 sulla quota Search, riprova subito senza tool Search sempre su gemini-3.8-flash
    if (wantSearchGrounding && isQuotaError(error)) {
      groundingSearchCooldownUntil = Date.now() + COOLDOWN_MS;
      wantSearchGrounding = false;
      groundingQuotaFallback = true;

      const fallbackRes = await executeAttempt(
        false,
        ANTI_HALLUCINATION_FALLBACK_NOTE
      );
      return {
        ...fallbackRes,
        modelUsed: modelId,
        fallbackTriggered: true,
        groundingQuotaFallback: true,
        warningMessage: GROUNDING_FALLBACK_WARNING,
      };
    }

    throw error instanceof Error
      ? error
      : new Error(
          `Chiamata gemini-3.8-flash fallita nello step ${options.stepKey}: ${String(error)}`
        );
  }
}
