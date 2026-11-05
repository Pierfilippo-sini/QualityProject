"use client";

import * as React from "react";
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  ExternalLink,
  Layers,
  MapPin,
  MessageSquare,
  ShieldCheck,
  Star,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card } from "@/components/ui/card";
import { getCXIPackageDefinition } from "@/lib/cxiMatrix";
import { useScoutStore } from "@/lib/store";

function formatCurrencyEUR(value: number | null, year: number | null): string {
  if (value === null) return "Fatturato: N.D.";
  const formatted = new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value);
  return year ? `${formatted} (${year})` : formatted;
}

function getScoreBadgeClass(score: number): string {
  if (score >= 8.0) {
    return "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300";
  }
  if (score >= 6.0) {
    return "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-300";
  }
  return "border-border bg-muted text-muted-foreground";
}

/**
 * Vista Risultati Dashboard allineata al Refactoring Architetturale:
 * Clusterizzazione GICS + 2 Buyer Personas (No-LinkedIn) + Doppio Matching CXI (Primaria & Secondaria) + Breakdown Score (Malus max -0.5).
 */
export function ScoutTable() {
  const tableCaptionId = React.useId();
  const companies = useScoutStore((s) => s.companies);
  const responseType = useScoutStore((s) => s.responseType);
  const textResponse = useScoutStore((s) => s.textResponse);
  const openCompanyDrawer = useScoutStore((s) => s.openCompanyDrawer);
  const setIsDebugOpen = useScoutStore((s) => s.setIsDebugOpen);

  // 1. Modalità TEXT_ONLY (Guardrail B2B o Blocco Parametri Obbligatori Step 1)
  if (responseType === "text_only") {
    return (
      <Card
        data-testid="guardrail-text-only-card"
        className="border-amber-300/80 bg-amber-50/40 p-6 shadow-xs dark:border-amber-800/60 dark:bg-amber-950/20"
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3.5">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-700 dark:text-amber-300">
              <ShieldCheck className="size-5" />
            </div>
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-semibold text-foreground">
                  Blocco di Validazione / Guardrail Attivato
                </h3>
                <Badge
                  variant="outline"
                  className="border-amber-300 bg-amber-100/70 text-[10px] text-amber-900 dark:border-amber-700 dark:bg-amber-900/40 dark:text-amber-200"
                >
                  Zero-Waste • Pipeline Interrotta a Monte
                </Badge>
              </div>
              <p className="max-w-3xl text-sm leading-relaxed text-foreground/90">
                {textResponse ??
                  "Per avviare la ricerca B2B devono essere specificati tutti e 3 i parametri obbligatori: Categoria/Settore Azienda, Area Geografica e Dimensione Aziendale."}
              </p>
            </div>
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0"
            onClick={() => setIsDebugOpen(true)}
          >
            Ispeziona Debug Trace
          </Button>
        </div>
      </Card>
    );
  }

  // 2. Stato Vuoto Iniziale
  if (companies.length === 0) {
    return (
      <div className="space-y-4">
        {textResponse && (
          <Card className="border-border/80 bg-muted/30 p-4 text-sm text-foreground">
            <div className="flex items-start gap-2.5">
              <MessageSquare className="mt-0.5 size-4 shrink-0 text-primary" />
              <p className="leading-relaxed">{textResponse}</p>
            </div>
          </Card>
        )}

        <Card className="flex min-h-[280px] flex-col items-center justify-center border-dashed p-8 text-center">
          <div className="mb-3 flex size-12 items-center justify-center rounded-full bg-muted">
            <Building2 className="size-6 text-muted-foreground" />
          </div>
          <h3 className="text-base font-semibold text-foreground">
            Nessuna azienda in sessione
          </h3>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">
            Compila i 3 campi obbligatori (Categoria/Settore, Area Geografica e
            Dimensione Aziendale) o seleziona uno scenario pronto per avviare la
            pipeline B2B e generare l&apos;Excel a 5 Schede.
          </p>
        </Card>
      </div>
    );
  }

  const hasMapsDerivedData = companies.some(
    (c) =>
      c.mapsStatus === "OPERATIONAL" ||
      (c.indirizzoVerificatoMaps && c.indirizzoVerificatoMaps !== "N.D.") ||
      typeof c.mapsRating === "number"
  );

  // 3. Modalità RANKING
  return (
    <div className="space-y-4">
      {textResponse && (
        <Card
          data-testid="ranking-intro-banner"
          className="border-primary/25 bg-primary/5 p-4 shadow-2xs"
        >
          <div className="flex items-start gap-2.5 text-sm">
            <MessageSquare className="mt-0.5 size-4 shrink-0 text-primary" />
            <p className="leading-relaxed text-foreground">{textResponse}</p>
          </div>
        </Card>
      )}

      <Card className="overflow-hidden border-border/80 shadow-xs">
        <div
          tabIndex={0}
          role="region"
          aria-labelledby={tableCaptionId}
          className="max-w-full overflow-x-auto focus-visible:outline-2 focus-visible:outline-primary"
        >
          <Table>
            <caption id={tableCaptionId} className="sr-only">
              Classifica aziende B2B qualificate ordinate per Score Totale decrescente
            </caption>
            <TableHeader className="sticky top-0 z-10 bg-muted/60 backdrop-blur-xs">
              <TableRow>
                <TableHead className="w-[130px]">Priorità &amp; Score</TableHead>
                <TableHead className="min-w-[230px]">
                  Azienda &amp; Cluster GICS
                </TableHead>
                <TableHead className="min-w-[200px]">
                  Sede, Dimensione &amp; Dati
                </TableHead>
                <TableHead className="min-w-[240px]">
                  2 Buyer Personas
                </TableHead>
                <TableHead className="min-w-[300px]">
                  Doppio Matching CXI (1ª &amp; 2ª)
                </TableHead>
                <TableHead className="text-right">Fonti</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {companies.map((company, index) => {
                const primaryDef = getCXIPackageDefinition(
                  company.cxi_primaria.pacchetto
                );
                const secondaryDef = getCXIPackageDefinition(
                  company.cxi_secondaria.pacchetto
                );
                const [bp1, bp2] = company.buyer_personas;
                const bd = company.score_breakdown;
                const rowKey = company.id || company.ragioneSociale;

                return (
                  <TableRow
                    key={rowKey}
                    onClick={() =>
                      openCompanyDrawer(company.id || company.ragioneSociale)
                    }
                    className="cursor-pointer transition-colors hover:bg-muted/50"
                  >
                    {/* 1. Priorità & Breakdown Score */}
                    <TableCell className="align-top">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-semibold text-muted-foreground">
                            #{index + 1}
                          </span>
                          <Badge
                            variant="outline"
                            className={`font-mono font-semibold ${getScoreBadgeClass(company.scoreFinal)}`}
                          >
                            {company.scoreFinal.toFixed(1)}
                          </Badge>
                        </div>
                        <div className="font-mono text-[10px] text-muted-foreground">
                          Fit {bd.score_target.toFixed(1)} • Trig{" "}
                          {bd.score_trigger.toFixed(1)}
                        </div>
                        {bd.malus_buyer_persona > 0 && (
                          <Badge
                            variant="destructive"
                            className="w-fit gap-1 px-1.5 py-0 text-[10px]"
                          >
                            <AlertTriangle className="size-2.5" />-
                            {bd.malus_buyer_persona.toFixed(2)} pt
                          </Badge>
                        )}
                      </div>
                    </TableCell>

                    {/* 2. Azienda & Clusterizzazione Standardizzata */}
                    <TableCell className="max-w-[260px] align-top whitespace-normal">
                      <div className="font-semibold text-foreground">
                        {company.ragioneSociale}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-1">
                        <Badge
                          variant="secondary"
                          className="gap-1 px-1.5 py-0 text-[10px] font-medium"
                        >
                          <Layers className="size-2.5 text-primary" />
                          {company.cluster_macro}
                        </Badge>
                        <span className="text-[11px] font-medium text-primary/90">
                          • {company.sub_cluster_specifico}
                        </span>
                      </div>
                      {company.cosaSapere && (
                        <p className="mt-1.5 line-clamp-2 text-[11px] leading-snug text-muted-foreground">
                          {company.cosaSapere}
                        </p>
                      )}
                    </TableCell>

                    {/* 3. Sede, Maps, Clienti/Dimensione & Bilancio */}
                    <TableCell className="max-w-[230px] align-top whitespace-normal text-xs">
                      <div className="inline-flex items-center gap-1 font-medium text-foreground">
                        <MapPin className="size-3.5 shrink-0 text-muted-foreground" />
                        <span>
                          {company.sedeCitta} ({company.sedeRegione})
                        </span>
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px]">
                        {company.mapsStatus === "OPERATIONAL" ? (
                          <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
                            <CheckCircle2 className="size-3" />
                            Operativa
                          </span>
                        ) : (
                          <span className="text-muted-foreground">
                            Maps: N.D.
                          </span>
                        )}
                        {typeof company.mapsRating === "number" && (
                          <span className="inline-flex items-center gap-0.5 text-amber-600 dark:text-amber-400">
                            <Star className="size-3 fill-current" />
                            {company.mapsRating.toFixed(1)}
                          </span>
                        )}
                      </div>
                      <div className="mt-1.5 space-y-0.5 text-[11px]">
                        <div className="font-medium text-foreground">
                          {company.bacinoClientiODimensione}
                        </div>
                        <div className="text-muted-foreground">
                          {formatCurrencyEUR(
                            company.fatturatoValore,
                            company.fatturatoAnno
                          )}
                        </div>
                        {company.dipendenti !== null && (
                          <div className="text-muted-foreground">
                            Dipendenti:{" "}
                            {company.dipendenti.toLocaleString("it-IT")}
                          </div>
                        )}
                      </div>
                    </TableCell>

                    {/* 4. Le 2 Figure Professionali (Senza LinkedIn) */}
                    <TableCell className="max-w-[260px] align-top whitespace-normal text-xs">
                      <div className="space-y-2">
                        <div className="rounded border border-border/60 bg-muted/25 p-1.5">
                          <div className="flex items-center gap-1 font-semibold text-foreground">
                            <Users className="size-3 shrink-0 text-emerald-600" />
                            <span className="line-clamp-1">
                              1. {bp1.ruolo_e_nome}
                            </span>
                          </div>
                          <p className="mt-0.5 line-clamp-1 text-[10px] text-muted-foreground">
                            {bp1.livello_decisionale}
                          </p>
                        </div>

                        <div className="rounded border border-border/60 bg-muted/25 p-1.5">
                          <div className="flex items-center gap-1 font-medium text-foreground">
                            <Users className="size-3 shrink-0 text-sky-600" />
                            <span className="line-clamp-1">
                              2. {bp2.ruolo_e_nome}
                            </span>
                          </div>
                          <p className="mt-0.5 line-clamp-1 text-[10px] text-muted-foreground">
                            {bp2.livello_decisionale}
                          </p>
                        </div>
                      </div>
                    </TableCell>

                    {/* 5. Doppio Matching Soluzioni CXI (Principale + Secondaria in 1 riga) */}
                    <TableCell className="max-w-[320px] align-top whitespace-normal text-xs">
                      <div className="space-y-2">
                        <div>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Badge
                              variant="outline"
                              className={`text-[10px] ${primaryDef.badgeClassName}`}
                            >
                              1ª {company.cxi_primaria.nome_soluzione}
                            </Badge>
                            {company.cxi_primaria.trigger_data && (
                              <span className="font-mono text-[10px] text-muted-foreground">
                                {company.cxi_primaria.trigger_data}
                              </span>
                            )}
                          </div>
                          <p className="mt-0.5 line-clamp-2 text-[11px] font-medium text-foreground">
                            {company.cxi_primaria.servizio_personalizzato_1_riga}
                          </p>
                          <p className="line-clamp-1 text-[10px] text-muted-foreground">
                            Trigger: {company.cxi_primaria.trigger_fatto}
                          </p>
                        </div>

                        <div className="border-t border-border/60 pt-1.5">
                          <Badge
                            variant="outline"
                            className={`text-[10px] ${secondaryDef.badgeClassName}`}
                          >
                            2ª {company.cxi_secondaria.nome_soluzione}
                          </Badge>
                          <p className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground">
                            {company.cxi_secondaria.servizio_personalizzato_1_riga}
                          </p>
                        </div>
                      </div>
                    </TableCell>

                    {/* 6. Fonti */}
                    <TableCell className="text-right align-top">
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-primary">
                        <ExternalLink className="size-3.5" />
                        {company.sources.length}
                      </span>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </Card>

      {hasMapsDerivedData && (
        <p className="text-right text-xs font-medium text-muted-foreground">
          Google Maps
        </p>
      )}
    </div>
  );
}
