"use client";

import * as React from "react";
import {
  Building2,
  Check,
  Copy,
  ExternalLink,
  FileText,
  Globe,
  Layers,
  MapPin,
  MessageCircle,
  Phone,
  Scale,
  Sparkles,
  Star,
  Target,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { getCXIPackageDefinition } from "@/lib/cxiMatrix";
import { buildExplainabilityText } from "@/lib/scoring";
import { useScoutStore } from "@/lib/store";

/**
 * Pannello di Dettaglio Laterale Slide-over Drawer aggiornato:
 * - Clusterizzazione GICS (`cluster_macro` + `sub_cluster_specifico`)
 * - Informazioni Chiave (`cosaSapere`, `bacinoClientiODimensione`, `altriDatiChiave`)
 * - Doppio Matching CXI: Soluzione Principale (con Gancio Mail copiabile) + Soluzione Secondaria (con sintesi 1 riga)
 * - 2 Figure Professionali Distinte (Ruolo, Livello Decisionale, Cosa gli interessa, Primo messaggio utile — zero LinkedIn)
 * - Breakdown Completo dello Score (Fit Target, Potenza Trigger, Malus max -0.5, Score Totale)
 */
export function CompanyDrawer() {
  const companies = useScoutStore((s) => s.companies);
  const selectedCompanyId = useScoutStore((s) => s.selectedCompanyId);
  const isDrawerOpen = useScoutStore((s) => s.isDrawerOpen);
  const triggerWeight = useScoutStore((s) => s.triggerWeight);
  const closeCompanyDrawer = useScoutStore((s) => s.closeCompanyDrawer);

  const [copiedMail, setCopiedMail] = React.useState(false);

  const company = React.useMemo(
    () =>
      companies.find(
        (item) =>
          item.id === selectedCompanyId ||
          item.ragioneSociale === selectedCompanyId
      ) ?? null,
    [companies, selectedCompanyId]
  );

  async function handleCopyPrimaryMail() {
    const mailText = company?.cxi_primaria.gancio_mail;
    if (!mailText) return;
    await navigator.clipboard.writeText(mailText);
    setCopiedMail(true);
    window.setTimeout(() => setCopiedMail(false), 2000);
  }

  const primaryDef = company
    ? getCXIPackageDefinition(company.cxi_primaria.pacchetto)
    : null;
  const secondaryDef = company
    ? getCXIPackageDefinition(company.cxi_secondaria.pacchetto)
    : null;

  const dynamicExplainability = company
    ? buildExplainabilityText(company, triggerWeight)
    : "";

  const hasMapsInfo = Boolean(
    company &&
      (company.mapsStatus === "OPERATIONAL" ||
        (company.indirizzoVerificatoMaps &&
          company.indirizzoVerificatoMaps !== "N.D.") ||
        typeof company.mapsRating === "number")
  );

  return (
    <Sheet
      open={isDrawerOpen && Boolean(company)}
      onOpenChange={(open) => {
        if (!open) closeCompanyDrawer();
      }}
    >
      <SheetContent
        side="right"
        className="w-full overflow-y-auto sm:max-w-2xl data-[side=right]:sm:max-w-2xl"
      >
        {company && (
          <div className="flex flex-col gap-6 pb-8">
            {/* 1. Header con Cluster, Soluzioni CXI e Score */}
            <SheetHeader className="border-b pb-4">
              <div className="flex flex-wrap items-center gap-1.5 pr-8">
                <Badge variant="secondary" className="gap-1 text-xs">
                  <Layers className="size-3 text-primary" />
                  {company.cluster_macro}
                </Badge>
                <Badge variant="outline" className="text-xs">
                  {company.sub_cluster_specifico}
                </Badge>
                <Badge variant="secondary" className="font-mono">
                  Score {company.scoreFinal.toFixed(1)} / 10
                </Badge>
                {company.score_breakdown.malus_buyer_persona > 0 && (
                  <Badge variant="destructive">
                    Malus -
                    {company.score_breakdown.malus_buyer_persona.toFixed(2)} pt
                  </Badge>
                )}
              </div>

              <SheetTitle className="mt-2 text-xl font-bold">
                {company.ragioneSociale}
              </SheetTitle>
              <SheetDescription>
                {company.sedeCitta} ({company.sedeRegione}) • ATECO{" "}
                {company.atecoCodice} • {company.bacinoClientiODimensione}
              </SheetDescription>

              <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-300"
                  style={{
                    width: `${Math.min(100, Math.max(10, company.scoreFinal * 10))}%`,
                  }}
                />
              </div>
            </SheetHeader>

            <div className="space-y-5 px-4">
              {/* 2. Informazioni Chiave sull'Azienda ("Cosa sapere" & Dati Chiave) */}
              <section
                data-testid="drawer-company-description"
                className="rounded-lg border p-4"
              >
                <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  <FileText className="size-4 text-primary" />
                  Informazioni Chiave sull&apos;Azienda (Cosa Sapere)
                </div>
                <p className="text-sm leading-relaxed text-foreground">
                  {company.cosaSapere}
                </p>
                {company.companyDescription &&
                  company.companyDescription !== company.cosaSapere && (
                    <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                      {company.companyDescription}
                    </p>
                  )}
                <div className="mt-3 grid grid-cols-3 gap-2 rounded-md bg-muted/40 p-2.5 text-xs">
                  <div>
                    <div className="text-[11px] text-muted-foreground">
                      Clienti / Dimensione
                    </div>
                    <div className="font-semibold text-foreground">
                      {company.bacinoClientiODimensione}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-muted-foreground">
                      Fatturato Recente
                    </div>
                    <div className="font-semibold text-foreground">
                      {company.fatturatoValore !== null
                        ? `${company.fatturatoValore.toLocaleString("it-IT")} € (${company.fatturatoAnno ?? "N.D."})`
                        : "N.D."}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-muted-foreground">
                      Dipendenti
                    </div>
                    <div className="font-semibold text-foreground">
                      {company.dipendenti !== null
                        ? company.dipendenti.toLocaleString("it-IT")
                        : "N.D."}
                    </div>
                  </div>
                </div>
              </section>

              {/* 3. Doppio Matching Soluzioni CXI (Principale + Secondaria) */}
              <section
                data-testid="drawer-cxi-dual-matching"
                className="space-y-3 rounded-lg border border-primary/30 bg-primary/[0.03] p-4"
              >
                <div className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-foreground uppercase">
                  <Sparkles className="size-4 text-amber-500" />
                  Doppio Matching Servizi CXI Pertinenti
                </div>

                {/* 3A. Soluzione CXI Principale */}
                <div className="rounded-lg border bg-background p-3.5 space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        variant="outline"
                        className={primaryDef?.badgeClassName}
                      >
                        Soluzione Principale:{" "}
                        {company.cxi_primaria.nome_soluzione}
                      </Badge>
                      {company.cxi_primaria.trigger_data && (
                        <Badge variant="secondary" className="font-mono text-[10px]">
                          {company.cxi_primaria.trigger_data}
                        </Badge>
                      )}
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleCopyPrimaryMail}
                    >
                      {copiedMail ? (
                        <>
                          <Check className="mr-1.5 size-3.5 text-emerald-600" />
                          Mail Copiata
                        </>
                      ) : (
                        <>
                          <Copy className="mr-1.5 size-3.5" />
                          Copia Gancio Mail
                        </>
                      )}
                    </Button>
                  </div>

                  <div className="space-y-1 text-xs">
                    <div>
                      <span className="font-semibold text-foreground">
                        Servizio su misura (1 riga):{" "}
                      </span>
                      <span className="text-foreground/90">
                        {company.cxi_primaria.servizio_personalizzato_1_riga}
                      </span>
                    </div>
                    <div>
                      <span className="font-semibold text-foreground">
                        Aggancio al fatto (Trigger):{" "}
                      </span>
                      <span className="text-muted-foreground">
                        {company.cxi_primaria.trigger_fatto}
                      </span>
                    </div>
                  </div>

                  <div className="rounded-md border border-border/70 bg-muted/30 p-3">
                    <div className="mb-1 text-[11px] font-semibold text-muted-foreground uppercase">
                      Gancio Mail (Dedicato alla Soluzione CXI Principale)
                    </div>
                    <p className="whitespace-pre-line text-xs leading-relaxed text-foreground">
                      {company.cxi_primaria.gancio_mail}
                    </p>
                  </div>
                </div>

                {/* 3B. Soluzione CXI Secondaria */}
                <div className="rounded-lg border bg-background p-3.5 space-y-1.5">
                  <Badge
                    variant="outline"
                    className={secondaryDef?.badgeClassName}
                  >
                    Soluzione Secondaria:{" "}
                    {company.cxi_secondaria.nome_soluzione}
                  </Badge>
                  <div className="space-y-1 text-xs">
                    <div>
                      <span className="font-semibold text-foreground">
                        Servizio su misura (1 riga):{" "}
                      </span>
                      <span className="text-foreground/90">
                        {company.cxi_secondaria.servizio_personalizzato_1_riga}
                      </span>
                    </div>
                    <div>
                      <span className="font-semibold text-foreground">
                        Trigger / Esigenza:{" "}
                      </span>
                      <span className="text-muted-foreground">
                        {company.cxi_secondaria.trigger_fatto}
                      </span>
                    </div>
                  </div>
                </div>
              </section>

              {/* 4. 2 Figure Professionali / Buyer Personas (Senza LinkedIn) */}
              <section className="space-y-3 rounded-lg border p-4">
                <div className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  <Users className="size-4 text-primary" />
                  Interlocutori &amp; 2 Buyer Personas Target
                </div>

                <div className="grid gap-3">
                  {company.buyer_personas.map((persona, pIdx) => (
                    <div
                      key={pIdx}
                      className="rounded-lg border bg-muted/20 p-3.5 space-y-2 text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="font-mono text-[10px]">
                          Figura #{pIdx + 1}
                        </Badge>
                        <span className="font-semibold text-sm text-foreground">
                          {persona.ruolo_e_nome}
                        </span>
                      </div>

                      <div className="grid gap-1.5">
                        <div>
                          <span className="font-semibold text-foreground">
                            Livello / Peso Decisionale:{" "}
                          </span>
                          <span className="text-muted-foreground">
                            {persona.livello_decisionale}
                          </span>
                        </div>
                        <div>
                          <span className="inline-flex items-center gap-1 font-semibold text-foreground">
                            <Target className="size-3 text-amber-600" />
                            Cosa gli interessa:{" "}
                          </span>
                          <span className="text-muted-foreground">
                            {persona.cosa_gli_interessa}
                          </span>
                        </div>
                        <div className="rounded bg-background p-2 border border-border/60">
                          <span className="inline-flex items-center gap-1 font-semibold text-primary">
                            <MessageCircle className="size-3" />
                            Primo messaggio utile (Angolo d&apos;attacco):{" "}
                          </span>
                          <span className="text-foreground">
                            {persona.primo_messaggio_utile}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              {/* 5. Breakdown Completo dello Score (Scheda 2 Excel Preview) */}
              <section className="rounded-lg border bg-muted/30 p-4">
                <div className="mb-2.5 flex items-center gap-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  <Scale className="size-4 text-primary" />
                  Breakdown Metodo di Scoring (Max Malus Persona -0.5)
                </div>

                <div className="grid grid-cols-4 gap-2 text-center text-xs">
                  <div className="rounded-md border bg-background p-2">
                    <div className="text-[11px] text-muted-foreground">
                      Fit Target ({Math.round(company.score_breakdown.peso_target * 100)}%)
                    </div>
                    <div className="mt-0.5 font-mono text-sm font-semibold">
                      {company.score_breakdown.score_target.toFixed(1)}
                    </div>
                    <div className="font-mono text-[10px] text-muted-foreground">
                      +{company.score_breakdown.contributo_target.toFixed(2)}
                    </div>
                  </div>

                  <div className="rounded-md border bg-background p-2">
                    <div className="text-[11px] text-muted-foreground">
                      Potenza Trigger ({Math.round(company.score_breakdown.peso_trigger * 100)}%)
                    </div>
                    <div className="mt-0.5 font-mono text-sm font-semibold">
                      {company.score_breakdown.score_trigger.toFixed(1)}
                    </div>
                    <div className="font-mono text-[10px] text-muted-foreground">
                      +{company.score_breakdown.contributo_trigger.toFixed(2)}
                    </div>
                  </div>

                  <div className="rounded-md border bg-background p-2">
                    <div className="text-[11px] text-muted-foreground">
                      Malus Persona
                    </div>
                    <div className="mt-0.5 font-mono text-sm font-semibold text-destructive">
                      {company.score_breakdown.malus_buyer_persona > 0
                        ? `-${company.score_breakdown.malus_buyer_persona.toFixed(2)}`
                        : "0.00"}
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      max -0.50
                    </div>
                  </div>

                  <div className="rounded-md border border-primary/40 bg-primary/5 p-2">
                    <div className="text-[11px] font-semibold text-primary">
                      Totale
                    </div>
                    <div className="mt-0.5 font-mono text-sm font-bold text-foreground">
                      {company.score_breakdown.score_totale.toFixed(1)}
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      su 10.0
                    </div>
                  </div>
                </div>

                <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                  {dynamicExplainability}
                </p>
                {company.score_breakdown.motivo_malus && (
                  <p className="mt-1 text-xs font-medium text-destructive">
                    Nota malus: {company.score_breakdown.motivo_malus}
                  </p>
                )}
                {company.explainability && (
                  <p className="mt-1.5 text-xs text-foreground/80">
                    {company.explainability}
                  </p>
                )}
              </section>

              {/* 6. Verifica Fisica Sede Google Maps */}
              <section className="rounded-lg border p-4">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                    <Building2 className="size-4 text-emerald-600" />
                    Verifica Sede Fisica
                  </span>
                  <Badge variant="outline" className="text-[10px]">
                    {company.mapsStatus ?? "UNVERIFIED"}
                  </Badge>
                </div>
                <dl className="grid grid-cols-2 gap-3 text-xs">
                  <div className="col-span-2">
                    <dt className="text-muted-foreground">
                      Indirizzo Certificato
                    </dt>
                    <dd className="mt-0.5 inline-flex items-center gap-1 font-medium text-foreground">
                      <MapPin className="size-3.5 shrink-0 text-muted-foreground" />
                      {company.indirizzoVerificatoMaps ?? "N.D."}
                    </dd>
                  </div>
                  {typeof company.mapsRating === "number" && (
                    <div>
                      <dt className="text-muted-foreground">Rating Pubblico</dt>
                      <dd className="mt-0.5 inline-flex items-center gap-1 font-medium text-foreground">
                        <Star className="size-3.5 fill-amber-400 text-amber-500" />
                        {company.mapsRating.toFixed(1)} / 5.0
                      </dd>
                    </div>
                  )}
                  {company.mapsPhone && (
                    <div>
                      <dt className="text-muted-foreground">Telefono Sede</dt>
                      <dd className="mt-0.5 inline-flex items-center gap-1 font-medium text-foreground">
                        <Phone className="size-3 text-muted-foreground" />
                        {company.mapsPhone}
                      </dd>
                    </div>
                  )}
                  {company.mapsWebsiteUri && (
                    <div className="col-span-2">
                      <dt className="text-muted-foreground">Sito Web Ufficiale</dt>
                      <dd className="mt-0.5 truncate font-medium">
                        <a
                          href={company.mapsWebsiteUri}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline"
                        >
                          <Globe className="size-3" />
                          {company.mapsWebsiteUri}
                        </a>
                      </dd>
                    </div>
                  )}
                </dl>
                {hasMapsInfo && (
                  <p className="mt-3 border-t pt-2 text-right text-[11px] font-medium text-muted-foreground">
                    Google Maps
                  </p>
                )}
              </section>

              {/* 7. Fonti Ufficiali Verificate (Senza LinkedIn) */}
              <section className="rounded-lg border p-4">
                <h4 className="mb-2.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  Fonti Web &amp; Bilancio Verificate ({company.sources.length})
                </h4>
                <ul className="space-y-2">
                  {company.sources.map((source, idx) => (
                    <li
                      key={`${source.url}-${idx}`}
                      className="flex items-start justify-between gap-3 rounded-md bg-muted/40 p-2.5 text-xs"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium text-foreground">
                          {source.title}
                        </div>
                        <div className="truncate text-muted-foreground">
                          {source.url}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <Badge variant="outline" className="text-[10px]">
                          {source.sourceType}
                        </Badge>
                        <a
                          href={source.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:opacity-80"
                          aria-label={`Apri fonte ${source.title}`}
                        >
                          <ExternalLink className="size-3.5" />
                        </a>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
