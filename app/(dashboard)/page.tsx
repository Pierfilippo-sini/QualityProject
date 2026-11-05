"use client";

import { DatabaseZap, Layers, SearchCode, ShieldAlert } from "lucide-react";
import { PromptInput } from "@/components/scout/PromptInput";
import { ScoutTable } from "@/components/scout/ScoutTable";
import { CompanyDrawer } from "@/components/scout/CompanyDrawer";
import { DeveloperDebugTrace } from "@/components/scout/DeveloperDebugTrace";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CXI_MATRIX } from "@/lib/cxiMatrix";
import { useScoutStore } from "@/lib/store";

/**
 * Dashboard Principale B2B Scouting & CXI Sales Matcher (SAD Capitoli 7, 9 + Fase 2 Demo & Debug Trace).
 */
export default function DashboardPage() {
  const companies = useScoutStore((s) => s.companies);
  const triggerWeight = useScoutStore((s) => s.triggerWeight);
  const isDebugOpen = useScoutStore((s) => s.isDebugOpen);
  const setIsDebugOpen = useScoutStore((s) => s.setIsDebugOpen);

  const activePackages = [
    CXI_MATRIX.CONSULTING,
    CXI_MATRIX.DIGITAL,
    CXI_MATRIX.OPERATIONS,
    CXI_MATRIX.ESG,
  ];

  return (
    <div className="space-y-6">
      {/* Sezione Intestazione & Stato Sessione Stateless */}
      <section className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">
            Data Research &amp; Qualificazione Commerciale
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Motore Agentico B2B con Search Grounding, verifica fisica Google Maps,
            matrice deterministica CXI e ricalcolo istantaneo dello score.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Badge variant="outline" className="gap-1.5 py-1">
            <DatabaseZap className="size-3.5 text-emerald-600" />
            Qualificate: <strong>{companies.length}</strong>
          </Badge>
          <Badge variant="outline" className="gap-1.5 py-1">
            <Layers className="size-3.5 text-primary" />
            Bilanciamento: {Math.round((1 - triggerWeight) * 100)}% Target /{" "}
            {Math.round(triggerWeight * 100)}% Trigger
          </Badge>
          <Badge variant="outline" className="gap-1.5 py-1">
            <ShieldAlert className="size-3.5 text-amber-600" />
            Anti-Allucinazione Attivo
          </Badge>
          <Button
            type="button"
            variant={isDebugOpen ? "default" : "outline"}
            size="sm"
            className="h-7 gap-1.5 text-xs"
            onClick={() => setIsDebugOpen(!isDebugOpen)}
          >
            <SearchCode className="size-3.5" />
            Developer Debug Trace
          </Button>
        </div>
      </section>

      {/* Input Naturale & Avvio Pipeline SSE */}
      <PromptInput />

      {/* Tassonomia Pacchetti CXI Attivi */}
      <section
        aria-label="Matrice Pacchetti CXI"
        className="flex flex-wrap items-center gap-2 text-xs"
      >
        <span className="font-medium text-muted-foreground">
          Matrice CXI attiva:
        </span>
        {activePackages.map((pkg) => (
          <Badge
            key={pkg.id}
            variant="outline"
            className={pkg.badgeClassName}
          >
            {pkg.label}
          </Badge>
        ))}
      </section>

      {/* Vista Duale Risultati (Guardrail Text-Only oppure Tabella Ranking B2B) */}
      <ScoutTable />

      {/* Pannello Sviluppatore Zero-Token Telemetry */}
      <DeveloperDebugTrace />

      {/* Slide-over Drawer Dettaglio Azienda, Descrizione & Sales Pitch CXI */}
      <CompanyDrawer />
    </div>
  );
}
