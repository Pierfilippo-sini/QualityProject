"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Building2,
  Loader2,
  MapPin,
  RotateCcw,
  ShieldOff,
  Sparkles,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useScoutStore } from "@/lib/store";
import type { MandatorySearchInput, ScoutStreamEvent } from "@/lib/types";

interface PresetExample {
  label: string;
  form: MandatorySearchInput;
}

const EXAMPLE_PRESETS: PresetExample[] = [
  {
    label: "Case 1 — Energy Retail Nord Italia (≥500k clienti)",
    form: {
      categoriaSettore:
        "Vendita luce e gas a famiglie e piccole imprese (Energy Retail)",
      areaGeografica: "Nord Italia",
      dimensioneAziendale: "Grandi Imprese / Almeno 500.000 clienti",
      noteStrategiche:
        "Mi interessano realtà che gestiscono grandi volumi di contatti con i clienti. Dammi almeno 5 nomi, ordinati per priorità.",
    },
  },
  {
    label: "Manifatturiero Mid-Cap Lombardia & Emilia-Romagna",
    form: {
      categoriaSettore: "Manifatturiero & Meccanica Industriale",
      areaGeografica: "Lombardia ed Emilia-Romagna",
      dimensioneAziendale: "Mid-Cap (200-1.000 dipendenti, fatturato 40M-200M€)",
      noteStrategiche:
        "Focus su imprese che hanno aperto nuovi stabilimenti, acquisito concorrenti o digitalizzato il post-vendita negli ultimi 18 mesi. 5 aziende.",
    },
  },
  {
    label: "IT & Software PMI Torino",
    form: {
      categoriaSettore: "IT, Software & Digital Services",
      areaGeografica: "Torino",
      dimensioneAziendale: "PMI (50-250 dipendenti)",
      noteStrategiche:
        "Realtà in crescita o coinvolte in operazioni M&A e adozione AI/CRM. 5 aziende.",
    },
  },
];

const DIMENSION_QUICK_OPTIONS = [
  "PMI",
  "Mid-Cap",
  "Grandi Imprese",
  "Aziende Quotate",
  "Startup",
  "50-250 dipendenti",
  "Oltre 250 dipendenti",
  "Almeno 500.000 clienti",
];

function buildCompositePrompt(form: MandatorySearchInput): string {
  const structuredParts: string[] = [];
  if (form.categoriaSettore.trim()) {
    structuredParts.push(`Settore/Categoria: "${form.categoriaSettore.trim()}"`);
  }
  if (form.areaGeografica.trim()) {
    structuredParts.push(`Area Geografica: "${form.areaGeografica.trim()}"`);
  }
  if (form.dimensioneAziendale.trim()) {
    structuredParts.push(
      `Dimensione Aziendale: "${form.dimensioneAziendale.trim()}"`
    );
  }

  const freePrompt = form.noteStrategiche?.trim() ?? "";

  if (structuredParts.length === 0) {
    return freePrompt;
  }

  const header = `Parametri specificati nei campi dedicati — ${structuredParts.join(", ")}.`;
  return freePrompt ? `${header} Richiesta utente: ${freePrompt}` : header;
}

/**
 * Form di ricerca B2B ibrido (Campi Dedicati + Prompt Libero in Chat).
 * I 3 parametri obbligatori (Categoria/Settore, Area Geografica, Dimensione Aziendale)
 * possono essere inseriti nei 3 campi dedicati, direttamente nel prompt testuale, o combinati.
 * Il Controllore B2B (Step 0 / Step 1) verifica la presenza di tutti e 3 e in caso contrario
 * restituisce l'avviso Guardrail specificando esattamente cosa manca.
 */
export function PromptInput() {
  const router = useRouter();
  const baseId = React.useId();

  const mandatoryForm = useScoutStore((s) => s.mandatoryForm);
  const isStreaming = useScoutStore((s) => s.isStreaming);
  const statusMessage = useScoutStore((s) => s.statusMessage);
  const errorMessage = useScoutStore((s) => s.errorMessage);
  const companiesCount = useScoutStore((s) => s.companies.length);
  const responseType = useScoutStore((s) => s.responseType);

  const setPrompt = useScoutStore((s) => s.setPrompt);
  const setMandatoryField = useScoutStore((s) => s.setMandatoryField);
  const setMandatoryForm = useScoutStore((s) => s.setMandatoryForm);
  const setParsedConstraints = useScoutStore((s) => s.setParsedConstraints);
  const appendStreamedCompany = useScoutStore((s) => s.appendStreamedCompany);
  const setDebugTrace = useScoutStore((s) => s.setDebugTrace);
  const applyScoutPayload = useScoutStore((s) => s.applyScoutPayload);
  const resetResults = useScoutStore((s) => s.resetResults);
  const setStreamStatus = useScoutStore((s) => s.setStreamStatus);

  const hasAnySessionData = companiesCount > 0 || responseType !== null;

  function handleChangeField(
    field: keyof MandatorySearchInput,
    value: string
  ) {
    setMandatoryField(field, value);
    if (errorMessage) {
      setStreamStatus(false, "IDLE", statusMessage, null);
    }
  }

  function applyPreset(preset: PresetExample) {
    setMandatoryForm(preset.form);
    setPrompt(buildCompositePrompt(preset.form));
  }

  function applyGuardrailTest() {
    const offTopicForm: MandatorySearchInput = {
      categoriaSettore: "",
      areaGeografica: "",
      dimensioneAziendale: "",
      noteStrategiche: "Chi è il presidente degli Stati Uniti?",
    };
    setMandatoryForm(offTopicForm);
    setPrompt("Chi è il presidente degli Stati Uniti?");
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isStreaming) return;

    const composedPrompt = buildCompositePrompt(mandatoryForm).trim();

    if (composedPrompt.length < 3) {
      setStreamStatus(
        false,
        "IDLE",
        null,
        "Inserisci la tua richiesta nel prompt oppure compila i campi dedicati (Categoria/Settore, Area Geografica, Dimensione Aziendale)."
      );
      return;
    }

    setPrompt(composedPrompt);
    resetResults();
    setStreamStatus(
      true,
      "GUARDRAIL",
      "Connessione al Controllore B2B (gemini-3.8-flash) e verifica dei 3 parametri obbligatori...",
      null
    );

    try {
      const response = await fetch("/api/scout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
        },
        body: JSON.stringify({
          prompt: composedPrompt,
          mandatoryParams: mandatoryForm,
        }),
      });

      if (response.status === 401) {
        router.replace("/login");
        return;
      }

      if (!response.ok || !response.body) {
        const payload = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        setStreamStatus(
          false,
          "ERROR",
          null,
          payload?.error ?? "Impossibile avviare la sessione di scouting."
        );
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split("\n\n");
        buffer = chunks.pop() ?? "";

        for (const chunk of chunks) {
          const line = chunk.split("\n").find((l) => l.startsWith("data: "));
          if (!line) continue;

          const jsonRaw = line.slice(6).trim();
          if (!jsonRaw) continue;

          const streamEvent = JSON.parse(jsonRaw) as ScoutStreamEvent;

          if (streamEvent.type === "stage") {
            setStreamStatus(true, streamEvent.stage, streamEvent.message, null);
          } else if (streamEvent.type === "intent") {
            setParsedConstraints(streamEvent.constraints);
          } else if (streamEvent.type === "company") {
            appendStreamedCompany(streamEvent.company);
          } else if (streamEvent.type === "trace") {
            setDebugTrace(streamEvent.debug_trace);
          } else if (streamEvent.type === "result") {
            applyScoutPayload(streamEvent.payload);
            const doneMsg =
              streamEvent.payload.response_type === "text_only"
                ? "Richiesta bloccata a monte (Guardrail B2B o parametri obbligatori mancanti)."
                : `Scouting completato (${streamEvent.payload.ranked_companies.length} aziende qualificate e pronte per l'export Excel a 5 Schede).`;
            setStreamStatus(false, "COMPLETED", doneMsg, null);
          } else if (streamEvent.type === "error") {
            if (streamEvent.debug_trace) {
              setDebugTrace(streamEvent.debug_trace);
            }
            setStreamStatus(false, "ERROR", null, streamEvent.message);
            return;
          } else if (streamEvent.type === "done") {
            setStreamStatus(
              false,
              "COMPLETED",
              useScoutStore.getState().statusMessage ??
                `Scouting completato (${streamEvent.totalQualified} aziende qualificate).`,
              null
            );
            return;
          }
        }
      }

      if (useScoutStore.getState().isStreaming) {
        setStreamStatus(false, "COMPLETED", "Sessione completata.", null);
      }
    } catch {
      setStreamStatus(
        false,
        "ERROR",
        null,
        "Errore di rete durante la comunicazione con /api/scout."
      );
    }
  }

  const idSettore = `${baseId}-settore`;
  const idGeografia = `${baseId}-geografia`;
  const idDimensione = `${baseId}-dimensione`;
  const idDimensioneList = `${baseId}-dimensione-list`;
  const idNote = `${baseId}-note`;

  return (
    <Card className="border-border/80 shadow-xs">
      <CardContent className="space-y-4 p-4 sm:p-5">
        <form onSubmit={handleSubmit} method="POST" noValidate className="space-y-4">
          <fieldset className="space-y-3" disabled={isStreaming}>
            <legend className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Parametri Obbligatori di Ricerca B2B (Inseribili nei campi dedicati oppure direttamente nel prompt qui sotto)
            </legend>

            <div className="grid gap-3.5 md:grid-cols-3">
              {/* 1. Categoria / Settore Azienda */}
              <div className="space-y-1.5">
                <label
                  htmlFor={idSettore}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-foreground"
                >
                  <Building2 className="size-3.5 text-primary" />
                  Categoria / Settore Azienda
                </label>
                <Input
                  id={idSettore}
                  name="categoriaSettore"
                  value={mandatoryForm.categoriaSettore}
                  onChange={(e) =>
                    handleChangeField("categoriaSettore", e.target.value)
                  }
                  placeholder="Es. Vendita luce e gas, Manifatturiero, ICT..."
                  className="h-10 text-sm"
                />
              </div>

              {/* 2. Area Geografica */}
              <div className="space-y-1.5">
                <label
                  htmlFor={idGeografia}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-foreground"
                >
                  <MapPin className="size-3.5 text-primary" />
                  Area Geografica
                </label>
                <Input
                  id={idGeografia}
                  name="areaGeografica"
                  value={mandatoryForm.areaGeografica}
                  onChange={(e) =>
                    handleChangeField("areaGeografica", e.target.value)
                  }
                  placeholder="Es. Nord Italia, Lombardia, Torino..."
                  className="h-10 text-sm"
                />
              </div>

              {/* 3. Dimensione Aziendale */}
              <div className="space-y-1.5">
                <label
                  htmlFor={idDimensione}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-foreground"
                >
                  <Users className="size-3.5 text-primary" />
                  Dimensione Aziendale
                </label>
                <Input
                  id={idDimensione}
                  name="dimensioneAziendale"
                  list={idDimensioneList}
                  value={mandatoryForm.dimensioneAziendale}
                  onChange={(e) =>
                    handleChangeField("dimensioneAziendale", e.target.value)
                  }
                  aria-describedby={`${idDimensione}-hint`}
                  placeholder="Es. PMI, Mid-Cap, Grandi Imprese, 50-250 dip..."
                  className="h-10 text-sm"
                />
                <datalist id={idDimensioneList}>
                  {DIMENSION_QUICK_OPTIONS.map((opt) => (
                    <option key={opt} value={opt} />
                  ))}
                </datalist>
                <div
                  id={`${idDimensione}-hint`}
                  className="flex flex-wrap gap-1 pt-0.5"
                >
                  {["PMI", "Mid-Cap", "Grandi Imprese", "Aziende Quotate", "Startup"].map(
                    (tag) => (
                      <button
                        key={tag}
                        type="button"
                        onClick={() =>
                          handleChangeField("dimensioneAziendale", tag)
                        }
                        className="rounded border border-border/70 bg-muted/40 px-1.5 py-0.5 text-[10px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      >
                        {tag}
                      </button>
                    )
                  )}
                </div>
              </div>
            </div>

            {/* Prompt Libero in Chat / Obiettivi specifici */}
            <div className="flex flex-col gap-2.5 pt-1 sm:flex-row sm:items-end">
              <div className="flex-1 space-y-1.5">
                <label
                  htmlFor={idNote}
                  className="text-xs font-medium text-muted-foreground"
                >
                  Prompt di ricerca libero (puoi scrivere qui anche Settore, Area Geografica e Dimensione) o obiettivi specifici
                </label>
                <Input
                  id={idNote}
                  name="noteStrategiche"
                  value={mandatoryForm.noteStrategiche ?? ""}
                  onChange={(e) =>
                    handleChangeField("noteStrategiche", e.target.value)
                  }
                  placeholder="Es. Cerco aziende che vendono luce e gas nel Nord Italia con almeno 500.000 clienti e grandi volumi di contatti..."
                  className="h-10 text-sm"
                />
              </div>

              <div className="flex items-center gap-2">
                <Button
                  type="submit"
                  size="lg"
                  className="h-10 px-5"
                  disabled={isStreaming}
                >
                  {isStreaming ? (
                    <>
                      <Loader2 className="mr-2 size-4 animate-spin" />
                      Pipeline attiva...
                    </>
                  ) : (
                    <>
                      <Sparkles className="mr-2 size-4" />
                      Avvia Scouting
                    </>
                  )}
                </Button>

                {hasAnySessionData && !isStreaming && (
                  <Button
                    type="button"
                    variant="outline"
                    size="lg"
                    className="h-10"
                    onClick={resetResults}
                    title="Pulisci sessione in memoria"
                  >
                    <RotateCcw className="size-4" />
                  </Button>
                )}
              </div>
            </div>
          </fieldset>
        </form>

        {/* Esempi Rapidi Pre-Compilati */}
        <div className="flex flex-wrap items-center gap-2 border-t pt-3">
          <span className="text-xs font-medium text-muted-foreground">
            Scenari pronti:
          </span>
          {EXAMPLE_PRESETS.map((preset, idx) => (
            <button
              key={idx}
              type="button"
              disabled={isStreaming}
              onClick={() => applyPreset(preset)}
              className="rounded-md border border-border/70 bg-muted/40 px-2.5 py-1 text-left text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
            >
              {preset.label}
            </button>
          ))}

          <button
            type="button"
            disabled={isStreaming}
            onClick={applyGuardrailTest}
            className="inline-flex items-center gap-1 rounded-md border border-amber-300/80 bg-amber-50/70 px-2.5 py-1 text-left text-xs font-medium text-amber-800 transition-colors hover:bg-amber-100/80 disabled:opacity-50 dark:border-amber-800/70 dark:bg-amber-950/40 dark:text-amber-300"
            title="Compila una domanda fuori tema per verificare il blocco Zero-Waste Guardrail"
          >
            <ShieldOff className="size-3" />
            Test Guardrail Off-Topic
          </button>
        </div>

        {(statusMessage || errorMessage) && (
          <div aria-live="polite" className="flex items-center gap-2 pt-0.5 text-xs">
            {errorMessage ? (
              <Badge variant="destructive" className="whitespace-normal font-normal">
                {errorMessage}
              </Badge>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                {isStreaming && (
                  <Loader2 className="size-3 animate-spin text-primary" />
                )}
                {statusMessage}
              </span>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
