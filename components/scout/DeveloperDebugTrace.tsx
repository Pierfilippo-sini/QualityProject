"use client";

import * as React from "react";
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Code2,
  Cpu,
  ExternalLink,
  SearchCode,
  ShieldAlert,
  ShieldCheck,
  SkipForward,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useScoutStore } from "@/lib/store";
import type { ApiConnectionStatus, SubagentStepTrace } from "@/lib/types";

function renderApiStatusBadge(label: string, status: ApiConnectionStatus) {
  if (status === "connected") {
    return (
      <Badge
        variant="outline"
        className="gap-1.5 border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300"
      >
        <CheckCircle2 className="size-3" />
        {label}: Connesso
      </Badge>
    );
  }
  if (status === "missing_key") {
    return (
      <Badge
        variant="outline"
        className="gap-1.5 border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-300"
      >
        <AlertCircle className="size-3" />
        {label}: Chiave Mancante
      </Badge>
    );
  }
  return (
    <Badge variant="destructive" className="gap-1.5">
      <XCircle className="size-3" />
      {label}: Errore API
    </Badge>
  );
}

function renderStepStatusIcon(status: SubagentStepTrace["status"]) {
  if (status === "success") {
    return <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />;
  }
  if (status === "skipped") {
    return <SkipForward className="size-4 shrink-0 text-muted-foreground" />;
  }
  return <XCircle className="size-4 shrink-0 text-destructive" />;
}

function getModelBadgeStyle(modelUsed: string): string {
  const lower = modelUsed.toLowerCase();
  if (lower.includes("maps")) {
    return "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300";
  }
  if (lower.includes("argon") || lower.includes("pro")) {
    return "border-violet-300 bg-violet-50 text-violet-800 dark:border-violet-800 dark:bg-violet-950/50 dark:text-violet-300";
  }
  return "border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-800 dark:bg-sky-950/50 dark:text-sky-300";
}

/**
 * Pannello Sviluppatore "🔍 Developer Debug Trace" (Zero-Token Telemetry — Fase 2).
 *
 * Visualizza:
 * 1. Stato connessioni API (`Gemini` e `Google Maps`), esito Guardrail e conteggio target richiesto.
 * 2. Tab "Aziende Qualificate / Considerate" vs "Aziende Scartate" (con stadio e motivo tecnico).
 * 3. Timeline completa dei Subagenti con modello usato, fallback Anti-429, latenza in ms e
 *    blocchi JSON `<details>` nativi (ricercabili con Cmd+F) per `input_payload` e `output_payload`.
 */
export function DeveloperDebugTrace() {
  const debugTrace = useScoutStore((s) => s.debugTrace);
  const isDebugOpen = useScoutStore((s) => s.isDebugOpen);
  const setIsDebugOpen = useScoutStore((s) => s.setIsDebugOpen);

  const [activeCompanyTab, setActiveCompanyTab] = React.useState<
    "considered" | "discarded"
  >("considered");

  const totalDurationMs = React.useMemo(() => {
    if (!debugTrace) return 0;
    return debugTrace.subagent_steps.reduce(
      (acc, step) => acc + (step.duration_ms || 0),
      0
    );
  }, [debugTrace]);

  const executedStepsCount = debugTrace
    ? debugTrace.subagent_steps.filter((s) => s.status === "success").length
    : 0;
  const discardedCount = debugTrace?.discarded_companies.length ?? 0;

  return (
    <Card
      data-testid="developer-debug-trace-panel"
      className="border-border/90 bg-card shadow-xs"
    >
      <CardHeader className="p-4 sm:px-5 sm:py-3.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setIsDebugOpen(!isDebugOpen)}
            aria-expanded={isDebugOpen}
            className="flex flex-1 items-center gap-2.5 text-left"
          >
            <div className="flex size-8 items-center justify-center rounded-lg bg-slate-900 text-slate-50 dark:bg-slate-100 dark:text-slate-900">
              <SearchCode className="size-4" />
            </div>
            <div>
              <CardTitle className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                <span>🔍 Developer Debug Trace</span>
                <Badge variant="secondary" className="font-mono text-[10px]">
                  Zero-Token Telemetry
                </Badge>
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Ispezione subagenti, routing Flash/Pro, stato API e motivazioni di scarto
              </p>
            </div>
          </button>

          <div className="flex flex-wrap items-center gap-2">
            {debugTrace && (
              <>
                <Badge variant="outline" className="font-mono text-[11px]">
                  Step attivi: {executedStepsCount}/{debugTrace.subagent_steps.length}
                </Badge>
                {typeof debugTrace.total_cost_usd === "number" && (
                  <Badge
                    variant="outline"
                    className="border-emerald-300 bg-emerald-50 font-mono text-[11px] text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300"
                    title="Costo effettivo addebitato (Google Maps escluso perché coperto da 300€ di credito gratuito Google Cloud)"
                  >
                    Costo Effettivo: ${debugTrace.total_cost_usd.toFixed(6)}
                  </Badge>
                )}
                {typeof debugTrace.maps_credit_saved_usd === "number" &&
                  debugTrace.maps_credit_saved_usd > 0 && (
                    <Badge
                      variant="outline"
                      className="border-teal-300 bg-teal-50 font-mono text-[11px] text-teal-800 dark:border-teal-800 dark:bg-teal-950/50 dark:text-teal-300"
                      title={`Google Maps Places API è coperto al 100% dal credito promozionale di €300 Google Cloud (Valore nominale: $${debugTrace.maps_credit_saved_usd.toFixed(4)})`}
                    >
                      Maps: $0.00 (Coperto da €300 Credito • Valore: ${debugTrace.maps_credit_saved_usd.toFixed(4)})
                    </Badge>
                  )}
                {typeof debugTrace.total_grounding_cost_usd === "number" &&
                  debugTrace.total_grounding_cost_usd > 0 && (
                    <Badge
                      variant="outline"
                      className="border-amber-300 bg-amber-50 font-mono text-[11px] text-amber-800 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-300"
                      title="Costo query Google Search Grounding ($0.035 / query)"
                    >
                      Grounding: ${debugTrace.total_grounding_cost_usd.toFixed(4)}
                    </Badge>
                  )}
                {typeof debugTrace.total_nominal_cost_usd === "number" &&
                  debugTrace.total_nominal_cost_usd >
                    (debugTrace.total_cost_usd ?? 0) && (
                    <Badge
                      variant="outline"
                      className="font-mono text-[11px] text-muted-foreground"
                      title="Valore nominale totale teorico comprensivo dei consumi Maps coperti dal credito"
                    >
                      Valore Nominale: ${debugTrace.total_nominal_cost_usd.toFixed(6)}
                    </Badge>
                  )}
                {typeof debugTrace.total_input_tokens === "number" &&
                  debugTrace.total_input_tokens > 0 && (
                    <Badge variant="outline" className="font-mono text-[11px]">
                      Token In/Out: {debugTrace.total_input_tokens.toLocaleString("it-IT")} /{" "}
                      {(debugTrace.total_output_tokens ?? 0).toLocaleString("it-IT")}
                    </Badge>
                  )}
                <Badge variant="outline" className="font-mono text-[11px]">
                  Scartate: {discardedCount}
                </Badge>
                <Badge variant="outline" className="gap-1 font-mono text-[11px]">
                  <Clock className="size-3" />
                  {(totalDurationMs / 1000).toFixed(2)}s
                </Badge>
              </>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsDebugOpen(!isDebugOpen)}
              aria-label={
                isDebugOpen
                  ? "Chiudi Developer Debug Trace"
                  : "Apri Developer Debug Trace"
              }
            >
              {isDebugOpen ? (
                <>
                  Nascondi <ChevronUp className="ml-1 size-4" />
                </>
              ) : (
                <>
                  Ispeziona <ChevronDown className="ml-1 size-4" />
                </>
              )}
            </Button>
          </div>
        </div>
      </CardHeader>

      {isDebugOpen && (
        <CardContent className="space-y-6 border-t bg-muted/15 p-4 sm:p-5">
          {!debugTrace ? (
            <div className="rounded-lg border border-dashed bg-background p-6 text-center text-xs text-muted-foreground">
              Nessuna traccia registrata in questa sessione. Esegui una query B2B o un test Guardrail per ispezionare in tempo reale i payload JSON di input/output dei subagenti.
            </div>
          ) : (
            <>
              {/* 1. Barra Stato API & Esito Guardrail */}
              <section className="space-y-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  {renderApiStatusBadge("Gemini API", debugTrace.api_status.gemini)}
                  {renderApiStatusBadge(
                    "Google Maps Places API",
                    debugTrace.api_status.google_maps
                  )}

                  {debugTrace.guardrail_passed ? (
                    <Badge
                      variant="outline"
                      className="gap-1.5 border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300"
                    >
                      <ShieldCheck className="size-3" />
                      Guardrail B2B: SUPERATO
                    </Badge>
                  ) : (
                    <Badge
                      variant="outline"
                      className="gap-1.5 border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-300"
                    >
                      <ShieldAlert className="size-3" />
                      Guardrail B2B: BLOCCATO (Off-Topic)
                    </Badge>
                  )}

                  <Badge variant="secondary" className="font-mono text-xs">
                    Target N richiesto: {debugTrace.requested_count}
                  </Badge>
                </div>

                {debugTrace.api_warnings && debugTrace.api_warnings.length > 0 && (
                  <div className="rounded-md border border-amber-300/70 bg-amber-50/70 px-3 py-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                    {debugTrace.api_warnings.map((warn, i) => (
                      <div key={i} className="flex items-center gap-1.5">
                        <AlertCircle className="size-3.5 shrink-0" />
                        <span>{warn}</span>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* 2. Tabs Aziende Qualificate/Considerate vs Aziende Scartate */}
              <section className="space-y-3">
                <div
                  role="tablist"
                  aria-label="Ispezione aziende considerate e scartate"
                  className="inline-flex rounded-lg border bg-background p-1"
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={activeCompanyTab === "considered"}
                    onClick={() => setActiveCompanyTab("considered")}
                    className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                      activeCompanyTab === "considered"
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Aziende Considerate / Qualificate (
                    {debugTrace.considered_companies.length})
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={activeCompanyTab === "discarded"}
                    onClick={() => setActiveCompanyTab("discarded")}
                    className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                      activeCompanyTab === "discarded"
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Aziende Scartate ({debugTrace.discarded_companies.length})
                  </button>
                </div>

                {activeCompanyTab === "considered" ? (
                  <div className="rounded-lg border bg-background p-3">
                    {debugTrace.considered_companies.length === 0 ? (
                      <p className="py-3 text-center text-xs text-muted-foreground">
                        Nessuna azienda presa in considerazione (es. richiesta bloccata dal Guardrail a monte).
                      </p>
                    ) : (
                      <ul className="divide-y text-xs">
                        {debugTrace.considered_companies.map((item, idx) => (
                          <li
                            key={`${item.ragioneSociale}-${idx}`}
                            className="flex flex-wrap items-center justify-between gap-2 py-2 first:pt-0 last:pb-0"
                          >
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-muted-foreground">
                                {idx + 1}.
                              </span>
                              <span className="font-semibold text-foreground">
                                {item.ragioneSociale}
                              </span>
                              {item.url && (
                                <a
                                  href={item.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-0.5 text-primary hover:underline"
                                >
                                  Fonte <ExternalLink className="size-3" />
                                </a>
                              )}
                            </div>
                            <Badge variant="outline" className="text-[11px]">
                              {item.stage_reached}
                            </Badge>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ) : (
                  <div className="rounded-lg border bg-background p-3">
                    {debugTrace.discarded_companies.length === 0 ? (
                      <p className="py-3 text-center text-xs text-muted-foreground">
                        Nessuna azienda scartata in questa esecuzione.
                      </p>
                    ) : (
                      <ul className="divide-y text-xs">
                        {debugTrace.discarded_companies.map((disc, idx) => (
                          <li
                            key={`${disc.ragioneSociale}-${idx}`}
                            className="flex flex-col gap-1 py-2.5 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
                          >
                            <div>
                              <span className="font-semibold text-foreground">
                                {disc.ragioneSociale}
                              </span>
                              <p className="text-destructive">
                                Motivo: {disc.reason}
                              </p>
                            </div>
                            <Badge
                              variant="secondary"
                              className="w-fit shrink-0 text-[10px]"
                            >
                              {disc.stage}
                            </Badge>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </section>

              {/* 3. Timeline Ispezionabile dei Subagenti (Zero-Token Middleware) */}
              <section className="space-y-3">
                <div className="flex items-center gap-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  <Activity className="size-4 text-primary" />
                  Timeline Pipeline Subagenti Standardizzati
                </div>

                <div className="space-y-2.5">
                  {debugTrace.subagent_steps.map((step) => (
                    <div
                      key={`${step.step_number}-${step.agent_name}`}
                      className="rounded-lg border bg-background p-3.5 text-xs"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          {renderStepStatusIcon(step.status)}
                          <span className="font-semibold text-foreground">
                            {step.agent_name}
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge
                            variant="outline"
                            className={`gap-1 font-mono text-[10px] ${getModelBadgeStyle(step.model_used)}`}
                          >
                            <Cpu className="size-3" />
                            {step.model_used}
                          </Badge>

                          {step.fallback_triggered && (
                            <Badge
                              variant="destructive"
                              className="text-[10px]"
                            >
                              Fallback Anti-429 Attivato
                            </Badge>
                          )}

                          <Badge
                            variant="secondary"
                            className="font-mono text-[10px]"
                          >
                            {step.duration_ms} ms
                          </Badge>

                          {step.token_usage && (
                            <>
                              {step.token_usage.mapsCallsCount !== undefined &&
                              step.token_usage.mapsCallsCount > 0 ? (
                                <>
                                  <Badge
                                    variant="outline"
                                    className="border-teal-300 bg-teal-50 font-mono text-[10px] text-teal-800 dark:border-teal-800 dark:bg-teal-950/50 dark:text-teal-300"
                                  >
                                    $0.000000 (Credito €300 Gratuito)
                                  </Badge>
                                  <Badge
                                    variant="outline"
                                    className="font-mono text-[10px] text-muted-foreground"
                                  >
                                    Nominale: ${(step.token_usage.nominalCostUsd ?? 0).toFixed(6)}
                                  </Badge>
                                  <Badge
                                    variant="outline"
                                    className="font-mono text-[10px]"
                                  >
                                    Places API: {step.token_usage.mapsCallsCount} chiamate
                                  </Badge>
                                </>
                              ) : (
                                <>
                                  <Badge
                                    variant="outline"
                                    className="border-emerald-300 bg-emerald-50 font-mono text-[10px] text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300"
                                  >
                                    ${step.token_usage.totalCostUsd.toFixed(6)}
                                  </Badge>
                                  {step.token_usage.groundingQueriesCount !== undefined &&
                                    step.token_usage.groundingQueriesCount > 0 && (
                                      <Badge
                                        variant="outline"
                                        className="border-amber-300 bg-amber-50 font-mono text-[10px] text-amber-800 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-300"
                                      >
                                        Grounding: {step.token_usage.groundingQueriesCount} q ($
                                        {(step.token_usage.groundingCostUsd ?? 0).toFixed(4)})
                                      </Badge>
                                    )}
                                  <Badge
                                    variant="outline"
                                    className="font-mono text-[10px]"
                                  >
                                    In: {step.token_usage.promptTokenCount} ({step.token_usage.tier}) • Out:{" "}
                                    {step.token_usage.candidatesTokenCount}
                                    {step.token_usage.cachedContentTokenCount > 0
                                      ? ` • Cached: ${step.token_usage.cachedContentTokenCount}`
                                      : ""}
                                  </Badge>
                                </>
                              )}
                            </>
                          )}

                          <Badge variant="outline" className="uppercase text-[10px]">
                            {step.status}
                          </Badge>
                        </div>
                      </div>

                      {step.token_usage?.formattedDebugLine && (
                        <div className="mt-2 rounded border border-border/70 bg-muted/40 px-2.5 py-1.5 font-mono text-[11px] text-foreground">
                          {step.token_usage.formattedDebugLine}
                        </div>
                      )}

                      {step.token_usage?.costBreakdown && (
                        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
                          <span className="font-semibold text-foreground/80">
                            Costi Step:
                          </span>
                          {step.token_usage.costBreakdown.tokensTotalCostUsd > 0 && (
                            <span className="rounded bg-muted/80 px-1.5 py-0.5">
                              Tokens: $
                              {step.token_usage.costBreakdown.tokensTotalCostUsd.toFixed(6)}{" "}
                              (In: $
                              {step.token_usage.costBreakdown.inputTokensCostUsd.toFixed(6)}
                              , Out: $
                              {step.token_usage.costBreakdown.outputTokensCostUsd.toFixed(6)}
                              {step.token_usage.costBreakdown.cachedTokensCostUsd > 0
                                ? `, Cache: $${step.token_usage.costBreakdown.cachedTokensCostUsd.toFixed(6)}`
                                : ""}
                              )
                            </span>
                          )}
                          {step.token_usage.costBreakdown.groundingQueriesCount ? (
                            <span className="rounded border border-amber-300/60 bg-amber-50/80 px-1.5 py-0.5 font-medium text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-200">
                              Google Search Grounding:{" "}
                              {step.token_usage.costBreakdown.groundingQueriesCount}{" "}
                              query ($
                              {(
                                step.token_usage.costBreakdown.groundingCostUsd ??
                                0
                              ).toFixed(6)}
                              )
                            </span>
                          ) : null}
                          {step.token_usage.costBreakdown.mapsCallsCount ? (
                            <span className="rounded border border-teal-300/60 bg-teal-50/80 px-1.5 py-0.5 font-medium text-teal-900 dark:border-teal-800/60 dark:bg-teal-950/40 dark:text-teal-200">
                              Google Maps Places API (
                              {step.token_usage.costBreakdown.mapsCallsCount}{" "}
                              chiamate): $0.000000 (Valore nominale: $
                              {(
                                step.token_usage.costBreakdown
                                  .mapsNominalCostUsd ?? 0
                              ).toFixed(6)}{" "}
                              coperto da credito gratuito 300€)
                            </span>
                          ) : null}
                        </div>
                      )}

                      {/* Blocchi JSON espandibili con <details> nativo (accessibili e ricercabili in pagina) */}
                      <div className="mt-2.5 grid gap-2 sm:grid-cols-2">
                        <details className="group rounded-md border bg-muted/30">
                          <summary className="flex cursor-pointer items-center justify-between px-2.5 py-1.5 font-mono text-[11px] font-medium text-muted-foreground select-none hover:text-foreground">
                            <span className="inline-flex items-center gap-1.5">
                              <Code2 className="size-3.5" />
                              input_payload
                            </span>
                            <ChevronDown className="size-3.5 transition-transform group-open:rotate-180" />
                          </summary>
                          <div className="border-t p-2.5">
                            <pre className="max-h-60 overflow-auto font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-all text-foreground">
                              {JSON.stringify(step.input_payload, null, 2)}
                            </pre>
                          </div>
                        </details>

                        <details className="group rounded-md border bg-muted/30">
                          <summary className="flex cursor-pointer items-center justify-between px-2.5 py-1.5 font-mono text-[11px] font-medium text-muted-foreground select-none hover:text-foreground">
                            <span className="inline-flex items-center gap-1.5">
                              <Code2 className="size-3.5" />
                              output_payload
                            </span>
                            <ChevronDown className="size-3.5 transition-transform group-open:rotate-180" />
                          </summary>
                          <div className="border-t p-2.5">
                            <pre className="max-h-60 overflow-auto font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-all text-foreground">
                              {JSON.stringify(step.output_payload, null, 2)}
                            </pre>
                          </div>
                        </details>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </>
          )}
        </CardContent>
      )}
    </Card>
  );
}
