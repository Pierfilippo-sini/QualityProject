"use client";

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Target, Zap } from "lucide-react";
import {
  BarRaceChart,
  type BarRaceDatum,
  type NonClassificataItem,
} from "@/components/ui/bar-race-chart";

export interface CompanyCandidate {
  id: string;
  name: string;
  cluster: string;
  macroCategory: string;
  headquartersCity?: string;
  revenue?: number | string;
  employees?: number | string;
  bersaglioScore: number; // Score Bersaglio (es. 9.7)
  triggerScore: number;   // Score Trigger (es. 8.4)
  malus?: number;         // Eventuale malus Buyer Persona [0..0.5]
}

interface AgentRankingRaceProps {
  category?: string;
  topN?: number;
  companies?: CompanyCandidate[];
  nonClassificate?: NonClassificataItem[];
  isSearching?: boolean;
  showSlider?: boolean;
  onSliderChange?: (bersaglioPct: number) => void;
  onSelectCompany?: (companyName: string) => void;
  className?: string;
}

const DEFAULT_CANDIDATES: Record<string, CompanyCandidate[]> = {
  "SaaS & Digital Tech": [
    // Top in classifica
    {
      id: "c1",
      name: "Nexura Cloud S.p.A.",
      cluster: "Enterprise SaaS Platforms",
      macroCategory: "SaaS & Digital Tech",
      headquartersCity: "Milano (MI)",
      revenue: 14200000,
      employees: 98,
      bersaglioScore: 9.8,
      triggerScore: 8.5,
    },
    {
      id: "c2",
      name: "Hyperion Cybersecurity S.p.A.",
      cluster: "Zero Trust Protection",
      macroCategory: "SaaS & Digital Tech",
      headquartersCity: "Roma (RM)",
      revenue: 19400000,
      employees: 135,
      bersaglioScore: 9.5,
      triggerScore: 9.1,
    },
    {
      id: "c3",
      name: "Omnia Data Systems S.r.l.",
      cluster: "AI & Big Data Analytics",
      macroCategory: "SaaS & Digital Tech",
      headquartersCity: "Torino (TO)",
      revenue: 8750000,
      employees: 62,
      bersaglioScore: 8.6,
      triggerScore: 9.8,
    },
    {
      id: "c4",
      name: "Synapse IoT Automation S.p.A.",
      cluster: "Smart Factory Edge Computing",
      macroCategory: "SaaS & Digital Tech",
      headquartersCity: "Milano (MI)",
      revenue: 22800000,
      employees: 160,
      bersaglioScore: 9.2,
      triggerScore: 9.4,
    },
    {
      id: "c5",
      name: "Krypton Web Solutions S.r.l.",
      cluster: "Digital Platforms & Omnichannel",
      macroCategory: "SaaS & Digital Tech",
      headquartersCity: "Bologna (BO)",
      revenue: 6300000,
      employees: 44,
      bersaglioScore: 8.9,
      triggerScore: 8.8,
    },
    // Candidati valutati con voto fuori ranking (Step 6 Cut-Off)
    {
      id: "c6",
      name: "Aura Neural Labs S.r.l.",
      cluster: "Computer Vision & OCR",
      macroCategory: "SaaS & Digital Tech",
      headquartersCity: "Verona (VR)",
      revenue: 11400000,
      employees: 78,
      bersaglioScore: 9.6,
      triggerScore: 7.9,
    },
    {
      id: "c7",
      name: "Vortex Cloud Security S.p.A.",
      cluster: "SecOps & Cloud Compliance",
      macroCategory: "SaaS & Digital Tech",
      headquartersCity: "Genova (GE)",
      revenue: 15800000,
      employees: 105,
      bersaglioScore: 8.0,
      triggerScore: 9.6,
    },
    {
      id: "c8",
      name: "Prisma B2B Software S.r.l.",
      cluster: "ERP & Workflow Automation",
      macroCategory: "SaaS & Digital Tech",
      headquartersCity: "Brescia (BS)",
      revenue: 9200000,
      employees: 58,
      bersaglioScore: 8.4,
      triggerScore: 8.3,
    },
    {
      id: "c9",
      name: "Zenith Digital Systems S.p.A.",
      cluster: "Fintech Cloud Services",
      macroCategory: "SaaS & Digital Tech",
      headquartersCity: "Firenze (FI)",
      revenue: 13600000,
      employees: 86,
      bersaglioScore: 8.2,
      triggerScore: 8.1,
    },
    {
      id: "c10",
      name: "Echo Logic Media S.r.l.",
      cluster: "AdTech & Analytics",
      macroCategory: "SaaS & Digital Tech",
      headquartersCity: "Padova (PD)",
      revenue: 7800000,
      employees: 50,
      bersaglioScore: 7.9,
      triggerScore: 7.8,
    },
  ],
  "Manifatturiero & Meccanica": [
    {
      id: "m1",
      name: "Aeterna Precision Systems S.p.A.",
      cluster: "Meccanica aerospaziale",
      macroCategory: "Manifatturiero & Meccanica",
      headquartersCity: "Torino (TO)",
      revenue: 18900000,
      employees: 142,
      bersaglioScore: 9.8,
      triggerScore: 8.6,
    },
    {
      id: "m2",
      name: "Krono Automazioni Industriali S.p.A.",
      cluster: "Linee robotizzate",
      macroCategory: "Manifatturiero & Meccanica",
      headquartersCity: "Brescia (BS)",
      revenue: 12400000,
      employees: 88,
      bersaglioScore: 8.7,
      triggerScore: 9.8,
    },
    {
      id: "m3",
      name: "Officine Meccaniche Val Seriana S.r.l.",
      cluster: "Lavorazioni CNC alta precisione",
      macroCategory: "Manifatturiero & Meccanica",
      headquartersCity: "Bergamo (BG)",
      revenue: 7650000,
      employees: 52,
      bersaglioScore: 9.4,
      triggerScore: 9.1,
    },
    {
      id: "m4",
      name: "Vanguard Tooling Tech S.p.A.",
      cluster: "Stampi industriali termoindurenti",
      macroCategory: "Manifatturiero & Meccanica",
      headquartersCity: "Bologna (BO)",
      revenue: 15200000,
      employees: 110,
      bersaglioScore: 9.5,
      triggerScore: 8.8,
    },
    {
      id: "m5",
      name: "Delta Flange Meccanica S.p.A.",
      cluster: "Carpenteria metallica speciale",
      macroCategory: "Manifatturiero & Meccanica",
      headquartersCity: "Genova (GE)",
      revenue: 5400000,
      employees: 36,
      bersaglioScore: 8.8,
      triggerScore: 9.4,
    },
    {
      id: "m6",
      name: "RoboWeld Italia S.r.l.",
      cluster: "Saldatura laser automatizzata",
      macroCategory: "Manifatturiero & Meccanica",
      headquartersCity: "Vicenza (VI)",
      revenue: 10300000,
      employees: 72,
      bersaglioScore: 9.6,
      triggerScore: 8.0,
    },
    {
      id: "m7",
      name: "MecCast Fonderie S.p.A.",
      cluster: "Microfusione di precisione",
      macroCategory: "Manifatturiero & Meccanica",
      headquartersCity: "Milano (MI)",
      revenue: 16500000,
      employees: 118,
      bersaglioScore: 8.1,
      triggerScore: 9.5,
    },
    {
      id: "m8",
      name: "Lario Pneumatica S.r.l.",
      cluster: "Valvole e attuatori industriali",
      macroCategory: "Manifatturiero & Meccanica",
      headquartersCity: "Lecco (LC)",
      revenue: 8300000,
      employees: 56,
      bersaglioScore: 8.3,
      triggerScore: 8.2,
    },
  ],
};

const DEFAULT_NON_CLASSIFICATE: Record<string, NonClassificataItem[]> = {
  "SaaS & Digital Tech": [
    {
      id: "nc1",
      name: "CloudByte Solutions S.r.l.",
      city: "Milano (MI)",
      revenue: 3800000,
      employees: 18,
      reason: "Fatturato non conforme ai vincoli (Fatturato: €3.8M — Richiesto: €10M - €50M)",
    },
    {
      id: "nc2",
      name: "Algoritmi & Dati S.r.l.",
      city: "Monza (MB)",
      revenue: 12500000,
      employees: "N/D",
      reason: "Fonti camerali o creditizie non sufficientemente attendibili per il numero di dipendenti",
    },
    {
      id: "nc3",
      name: "NextGen Media App S.p.A.",
      city: "Milano (MI)",
      revenue: 16200000,
      employees: 48,
      reason: "Settore merceologico non conforme: target B2C consumer, escluso dal perimetro B2B",
    },
    {
      id: "nc4",
      name: "CyberEdge UK Ltd",
      city: "Londra (UK)",
      revenue: 28000000,
      employees: 92,
      reason: "Sede legale ed operativa fuori dal perimetro geografico target richiesto (Italia)",
    },
  ],
  "Manifatturiero & Meccanica": [
    {
      id: "ncm1",
      name: "Carpenteria Lombarda S.n.c.",
      city: "Lecco (LC)",
      revenue: 2400000,
      employees: 14,
      reason: "Fatturato non conforme ai vincoli (Fatturato: €2.4M — Richiesto: €10M - €50M)",
    },
    {
      id: "ncm2",
      name: "MicroPrecision Meccanica S.r.l.",
      city: "Torino (TO)",
      revenue: 11200000,
      employees: "N/D",
      reason: "Fonti camerali e bilanci depositati non reperibili o incompleti per organico addetti",
    },
    {
      id: "ncm3",
      name: "Ferramenta Industriale Retail S.p.A.",
      city: "Verona (VR)",
      revenue: 18000000,
      employees: 65,
      reason: "Attività commerciale/distributiva al dettaglio non aderente ai criteri manifatturieri",
    },
  ],
};

export function AgentRankingRace({
  category = "SaaS & Digital Tech",
  topN = 5,
  companies: incomingCompanies,
  nonClassificate: incomingNonClassificate,
  isSearching = false,
  showSlider,
  onSliderChange,
  onSelectCompany,
  className = "",
}: AgentRankingRaceProps) {
  // Percentuale Bersaglio: si muove di 5 in 5 (es. 0, 5, 10, ... 50, 55, ..., 100). Default 50/50
  const [bersaglioPct, setBersaglioPct] = React.useState<number>(50);
  const triggerPct = 100 - bersaglioPct;

  // Lo slider appare solo dopo la stesura dell'intera classifica a componente centrato
  const shouldShowSlider = showSlider !== undefined ? showSlider : !isSearching;

  const trackRef = React.useRef<HTMLDivElement | null>(null);
  const isDraggingRef = React.useRef(false);

  // Pool candidati: se incomingCompanies è passato (anche vuoto [] all'avvio), rispetta l'array vuoto per il popolamento progressivo
  const pool = React.useMemo(() => {
    if (incomingCompanies !== undefined) {
      return incomingCompanies;
    }
    return (
      DEFAULT_CANDIDATES[category] ||
      DEFAULT_CANDIDATES["SaaS & Digital Tech"]!
    );
  }, [incomingCompanies, category]);

  // Candidati scartati a monte: usa gli scarti reali se forniti (anche se array vuoto []), altrimenti usa i mock solo in assenza della prop
  const nonClassificateList = React.useMemo(() => {
    if (incomingNonClassificate !== undefined) {
      return incomingNonClassificate;
    }
    if (isSearching && pool.length < 5) {
      return [];
    }
    return (
      DEFAULT_NON_CLASSIFICATE[category] ||
      DEFAULT_NON_CLASSIFICATE["SaaS & Digital Tech"] ||
      []
    );
  }, [incomingNonClassificate, category, isSearching, pool.length]);

  // Calcola dinamicamente il voto di ogni azienda
  const data: BarRaceDatum[] = React.useMemo(() => {
    return pool.map((company) => {
      const bScore = company.bersaglioScore ?? 9.0;
      const tScore = company.triggerScore ?? 9.0;
      const malus = company.malus ?? 0;
      const computedScore = (bScore * bersaglioPct + tScore * triggerPct) / 100 - malus;
      const finalVote = Math.max(1.0, Math.min(10.0, Math.round(computedScore * 10) / 10));

      return {
        id: company.id,
        label: company.name,
        value: finalVote,
        bersaglioScore: bScore,
        triggerScore: tScore,
        category: company.macroCategory,
        city: company.headquartersCity,
        revenue: company.revenue,
        employees: company.employees,
      };
    });
  }, [pool, bersaglioPct, triggerPct]);

  // Movimento a step di 5 senza agganciamenti o resistenze
  const updateSteppedValue = React.useCallback(
    (rawVal: number) => {
      const clamped = Math.max(0, Math.min(100, rawVal));
      const stepped = Math.round(clamped / 5) * 5;
      setBersaglioPct(stepped);
      onSliderChange?.(stepped);
    },
    [onSliderChange]
  );

  const handleSliderInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    updateSteppedValue(Number(e.target.value));
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    isDraggingRef.current = true;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    handlePointerMove(e);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current || !trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    updateSteppedValue(ratio * 100);
  };

  const handlePointerUp = () => {
    isDraggingRef.current = false;
  };

  return (
    <div
      className={`w-full ${
        shouldShowSlider ? "max-w-[1580px] p-4 sm:p-6 sm:px-8" : "max-w-[1280px] p-3.5 sm:p-5 sm:px-6"
      } mx-auto rounded-2xl sm:rounded-3xl border border-white/10 transition-all duration-500 ${className}`}
      style={{
        // Opacità ridotta al 55% con backdrop-blur per staccare visibilmente la scheda dallo sfondo
        background: "rgba(18, 18, 22, 0.55)",
        backdropFilter: "blur(24px) saturate(140%)",
        WebkitBackdropFilter: "blur(24px) saturate(140%)",
        boxShadow:
          "0 24px 50px -12px rgba(0, 0, 0, 0.75), inset 0 1px 0 rgba(255, 255, 255, 0.12)",
      }}
    >
      {/* Grafico Bar Race compatto con colonne distinte (Azienda, Sede, Fatturato, Dipendenti, Score) */}
      <BarRaceChart
        data={data}
        nonClassificate={nonClassificateList}
        topN={topN}
        duration={400}
        rowHeight={34}
        caption="ranking"
        period={category}
        formatValue={(v) => v.toFixed(1)}
        onSelectCompany={onSelectCompany}
        isSearching={isSearching}
      />

      {/* Sezione Slider: compare SOLO dopo la stesura dell'intera classifica quando il componente è centrato */}
      <AnimatePresence>
        {shouldShowSlider && (
          <motion.div
            key="ranking-slider-section"
            initial={{ opacity: 0, height: 0, marginTop: 0 }}
            animate={{ opacity: 1, height: "auto", marginTop: 14 }}
            exit={{ opacity: 0, height: 0, marginTop: 0 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="border-t border-white/10 pt-3.5 overflow-hidden"
          >
            {/* Intestazione Simmetrica: Logo bianco ai bordi estremi, Titoli adiacenti, Percentuali al centro */}
            <div className="mb-2.5 flex items-center justify-between text-white font-mono select-none">
              {/* Estremo Sinistro: Logo Target bianco + Titolo Bersaglio */}
              <div className="flex items-center gap-2">
                <Target className="size-4 text-white shrink-0" />
                <span className="text-xs font-bold uppercase tracking-wider text-white">
                  Bersaglio
                </span>
              </div>

              {/* Centro Perfetto: Percentuali attive simmetriche in bianco puro (default 50% / 50%) */}
              <div className="flex items-center gap-2 text-sm font-bold text-white tabular-nums tracking-wide">
                <span className="text-white text-sm sm:text-base">{bersaglioPct}%</span>
                <span className="text-white/40">/</span>
                <span className="text-white text-sm sm:text-base">{triggerPct}%</span>
              </div>

              {/* Estremo Destro: Titolo Trigger + Logo Zap bianco */}
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-white">
                  Trigger
                </span>
                <Zap className="size-4 text-white shrink-0" />
              </div>
            </div>

            {/* Traccia Slider Completamente Bianca: step di 5 in 5, zero resistenze o agganciamenti */}
            <div
              ref={trackRef}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              className="relative flex items-center h-5 cursor-pointer touch-none"
            >
              {/* Sfondo traccia bianco semitrasparente con riempimento bianco puro */}
              <div className="h-1.5 sm:h-2 w-full rounded-full bg-white/20 overflow-hidden relative">
                <div
                  className="h-full rounded-full bg-white transition-all duration-100 ease-out"
                  style={{ width: `${bersaglioPct}%` }}
                />
              </div>

              {/* Input nativo con step di 5 per navigazione fluida */}
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={bersaglioPct}
                onChange={handleSliderInputChange}
                aria-label="Percentuale Bersaglio e Trigger"
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />

              {/* Thumb completamente bianco elegante */}
              <div
                className="pointer-events-none absolute size-4.5 sm:size-5 rounded-full bg-white border-2 border-white shadow-[0_0_12px_rgba(255,255,255,0.7)] -translate-x-1/2 transition-all duration-100 ease-out"
                style={{ left: `${bersaglioPct}%` }}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default AgentRankingRace;
