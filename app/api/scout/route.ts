import { NextResponse, type NextRequest } from "next/server";
import { executeB2BScoutingPipeline } from "@/agents/orchestrator";
import {
  DEFAULT_ACCESS_GATE_SECRET,
  DEFAULT_BRAIN_GATE_SECRET,
  SESSION_COOKIE_NAME,
  verifySessionTokenWithTarget,
} from "@/lib/auth";
import type {
  DebugTrace,
  MandatorySearchInput,
  ScoutStreamEvent,
} from "@/lib/types";

/**
 * Streaming & JSON API Endpoint per il Motore Agentico B2B Scouting.
 *
 * - Verifica il cookie HMAC `scout_session_token` oltre a `middleware.ts`.
 * - Supporta `mandatoryParams` (`categoriaSettore`, `areaGeografica`, `dimensioneAziendale`, `noteStrategiche`)
 *   validandoli sia nel form client sia nello Step 1 dell'Agent Core.
 */
export async function POST(request: NextRequest) {
  const sessionToken = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = await verifySessionTokenWithTarget(sessionToken, [
    process.env.ACCESS_GATE_SECRET || DEFAULT_ACCESS_GATE_SECRET,
    process.env.BRAIN_GATE_SECRET || DEFAULT_BRAIN_GATE_SECRET,
  ]);

  if (!session.valid) {
    return NextResponse.json(
      {
        error:
          "Sessione non valida o scaduta. Effettua nuovamente l'accesso con il PIN.",
      },
      { status: 401 }
    );
  }

  const body = (await request.json().catch(() => null)) as {
    prompt?: unknown;
    mandatoryParams?: Partial<MandatorySearchInput> | null;
    mode?: "stream" | "json";
  } | null;

  const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
  if (!prompt) {
    return NextResponse.json(
      {
        error:
          "I parametri di ricerca B2B (Categoria/Settore, Area Geografica e Dimensione Aziendale) sono obbligatori.",
      },
      { status: 400 }
    );
  }

  const mandatoryParams: MandatorySearchInput | undefined =
    body?.mandatoryParams && typeof body.mandatoryParams === "object"
      ? {
          categoriaSettore:
            typeof body.mandatoryParams.categoriaSettore === "string"
              ? body.mandatoryParams.categoriaSettore.trim()
              : "",
          areaGeografica:
            typeof body.mandatoryParams.areaGeografica === "string"
              ? body.mandatoryParams.areaGeografica.trim()
              : "",
          dimensioneAziendale:
            typeof body.mandatoryParams.dimensioneAziendale === "string"
              ? body.mandatoryParams.dimensioneAziendale.trim()
              : "",
          noteStrategiche:
            typeof body.mandatoryParams.noteStrategiche === "string"
              ? body.mandatoryParams.noteStrategiche.trim()
              : "",
        }
      : undefined;

  const prefersJsonOnly =
    body?.mode === "json" ||
    request.headers.get("accept")?.includes("application/json");

  if (prefersJsonOnly) {
    try {
      const payload = await executeB2BScoutingPipeline(
        prompt,
        undefined,
        mandatoryParams
      );
      return NextResponse.json(payload, { status: 200 });
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Errore imprevisto durante l'esecuzione della pipeline agentica.";
      const debugTrace =
        err && typeof err === "object" && "debug_trace" in err
          ? ((err as { debug_trace?: DebugTrace }).debug_trace ?? undefined)
          : undefined;

      return NextResponse.json(
        { error: message, debug_trace: debugTrace },
        { status: 500 }
      );
    }
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const sendEvent = (event: ScoutStreamEvent) => {
        if (closed) return;
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
          );
        } catch {
          closed = true;
        }
      };

      try {
        const finalPayload = await executeB2BScoutingPipeline(
          prompt,
          {
            onStage: (stage, message) => {
              sendEvent({ type: "stage", stage, message });
            },
            onIntent: (constraints) => {
              sendEvent({ type: "intent", constraints });
            },
            onCompany: (company) => {
              sendEvent({ type: "company", company });
            },
            onTraceUpdate: (debug_trace) => {
              sendEvent({ type: "trace", debug_trace });
            },
          },
          mandatoryParams
        );

        sendEvent({
          type: "result",
          payload: finalPayload,
        });

        sendEvent({
          type: "done",
          totalQualified: finalPayload.ranked_companies.length,
        });
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : "Errore imprevisto durante l'elaborazione dello stream agentico.";
        const debug_trace =
          err && typeof err === "object" && "debug_trace" in err
            ? ((err as { debug_trace?: DebugTrace }).debug_trace ?? undefined)
            : undefined;

        sendEvent({
          type: "error",
          message,
          debug_trace,
        });
      } finally {
        if (!closed) {
          closed = true;
          controller.close();
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
