"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, LayoutGroup, motion } from "framer-motion";
import RotatingEarth from "./components/RotatingEarth";
import IntroSequence from "./components/IntroSequence";
import RankingCard, { type RankedCompanyItem } from "./components/RankingCard";
import MorphOrb, { type MorphOrbParams, type MorphOrbRef } from "./components/MorphOrb";
import HeroShutterText from "./components/HeroShutterText";
import TypingEffect from "./components/TypingEffect";
import { GlassFilter } from "@/components/ui/liquid-glass-button";
import { simulateCompanyHunterSearch } from "@/lib/company-hunter-simulator";
import AgentRankingRace, { type CompanyCandidate } from "@/components/scout/AgentRankingRace";
import type { NonClassificataItem } from "@/components/ui/bar-race-chart";
import type { CompanyDossier } from "@/lib/company-dossier";
import type {
  CompanyResult,
  DiscardedCompanyTrace,
  MandatorySearchInput,
  ScoutStreamEvent,
} from "@/lib/types";
import "./evenkeel.css";

const INITIAL_RANKED_COMPANIES: RankedCompanyItem[] = [
  {
    rank: 7,
    name: "Vortex SecOps S.p.A.",
    revenue: 15800000,
    employees: 105,
    cluster: "Cloud Security",
    subcategory: "SecOps & Cloud Compliance",
    headquartersCity: "Genova (GE)",
    fullAddress: "Via XX Settembre 42, 16121 Genova (GE)",
    phone: "+39 010 595 8800",
    website: "https://www.vortexsecops.it",
    pIva: "IT02719280105",
    bersaglioScore: 7.8,
    triggerScore: 9.7,
    sources: [
      { title: "Registro Imprese — C.C.I.A.A. Genova", url: "https://www.registroimprese.it" },
      { title: "FatturatoItalia — Dati 2024", url: "https://www.fatturatoitalia.it" },
      { title: "Google Maps — Sede verificata", url: "https://maps.google.com" },
    ],
  },
  {
    rank: 6,
    name: "Aura Neural Labs S.r.l.",
    revenue: 11400000,
    employees: 78,
    cluster: "Computer Vision",
    subcategory: "OCR & Cognitive Automation",
    headquartersCity: "Verona (VR)",
    fullAddress: "Corso Porta Nuova 11, 37122 Verona (VR)",
    phone: "+39 045 801 2345",
    website: "https://www.auraneural.it",
    pIva: "IT04728190234",
    bersaglioScore: 9.7,
    triggerScore: 7.9,
    sources: [
      { title: "Registro Imprese — C.C.I.A.A. Verona", url: "https://www.registroimprese.it" },
      { title: "ReportAziende — Dati camerali 2024", url: "https://www.reportaziende.it" },
      { title: "Google Maps — Sede operativa verificata", url: "https://maps.google.com" },
    ],
  },
  {
    rank: 5,
    name: "Nordic Logistics S.r.l.",
    revenue: "N/A",
    employees: "8-15 stimati",
    cluster: "Logistica",
    subcategory: "Trasporto merci su strada",
    headquartersCity: "Verona (VR)",
    fullAddress: "Interporto Quadrante Europa, 37135 Verona (VR)",
    phone: "+39 045 862 1000",
    website: "https://www.nordiclogistics.it",
    pIva: "IT03891020231",
    bersaglioScore: 8.5,
    triggerScore: 8.4,
    sources: [
      { title: "Registro Imprese — C.C.I.A.A. Verona", url: "https://www.registroimprese.it" },
      { title: "ReportAziende — Dati camerali 2024", url: "https://www.reportaziende.it" },
      { title: "Google Maps — Hub logistico verificato", url: "https://maps.google.com" },
    ],
  },
  {
    rank: 4,
    name: "Vanguard Packaging S.p.A.",
    revenue: 1450000,
    employees: "N/A",
    cluster: "Packaging",
    subcategory: "Imballaggi in cartone",
    headquartersCity: "Bologna (BO)",
    fullAddress: "Via dell'Industria 14, 40012 Calderara di Reno (BO)",
    phone: "+39 051 728 900",
    website: "https://www.vanguardpack.it",
    pIva: "IT04182900378",
    bersaglioScore: 9.2,
    triggerScore: 9.0,
    sources: [
      { title: "Registro Imprese — C.C.I.A.A. Bologna", url: "https://www.registroimprese.it" },
      { title: "FatturatoItalia — Scheda aziendale", url: "https://www.fatturatoitalia.it" },
      { title: "Google Maps — Stabilimento verificato", url: "https://maps.google.com" },
    ],
  },
  {
    rank: 3,
    name: "Officine Meccaniche Rossi S.r.l.",
    revenue: 3820000,
    employees: 34,
    cluster: "Meccanica",
    subcategory: "Lavorazioni CNC",
    headquartersCity: "Vicenza (VI)",
    fullAddress: "Viale della Scienza 22, 36100 Vicenza (VI)",
    phone: "+39 0444 964 120",
    website: "https://www.officinerossi.it",
    pIva: "IT02891030245",
    bersaglioScore: 9.5,
    triggerScore: 9.1,
    sources: [
      { title: "Registro Imprese — C.C.I.A.A. Vicenza", url: "https://www.registroimprese.it" },
      { title: "ReportAziende — Bilancio depositato", url: "https://www.reportaziende.it" },
      { title: "Google Maps — Officina verificata", url: "https://maps.google.com" },
    ],
  },
  {
    rank: 2,
    name: "Krono Automazioni S.p.A.",
    revenue: 7640000,
    employees: 68,
    cluster: "Automazione",
    subcategory: "Robotica industriale",
    headquartersCity: "Brescia (BS)",
    fullAddress: "Via Crotte 28, 25127 Brescia (BS)",
    phone: "+39 030 373 5500",
    website: "https://www.kronoautomazioni.it",
    pIva: "IT03182900174",
    bersaglioScore: 8.6,
    triggerScore: 9.8,
    sources: [
      { title: "Registro Imprese — C.C.I.A.A. Brescia", url: "https://www.registroimprese.it" },
      { title: "FatturatoItalia — Dati 2024", url: "https://www.fatturatoitalia.it" },
      { title: "Google Maps — Sede operativa verificata", url: "https://maps.google.com" },
    ],
  },
  {
    rank: 1,
    name: "Aeterna Precision Systems S.p.A.",
    revenue: 14900000,
    employees: 125,
    cluster: "Meccanica di precisione",
    subcategory: "Componenti aerospaziali",
    headquartersCity: "Torino (TO)",
    fullAddress: "Corso Svizzera 185, 10149 Torino (TO)",
    phone: "+39 011 749 6100",
    website: "https://www.aeternaprecision.it",
    pIva: "IT07829100012",
    bersaglioScore: 9.8,
    triggerScore: 8.5,
    sources: [
      { title: "Registro Imprese — C.C.I.A.A. Torino", url: "https://www.registroimprese.it" },
      { title: "ReportAziende — Bilancio depositato", url: "https://www.reportaziende.it" },
      { title: "Google Maps — Sede legale & operativa verificata", url: "https://maps.google.com" },
    ],
  },
];

const GLOBE_CARD_COORDS: ReadonlyArray<{ lat: string; lon: string }> = [
  { lat: "74.6deg", lon: "0.0deg" },
  { lat: "63.2deg", lon: "137.5deg" },
  { lat: "55.2deg", lon: "275.0deg" },
  { lat: "48.6deg", lon: "52.5deg" },
  { lat: "42.7deg", lon: "190.0deg" },
  { lat: "37.4deg", lon: "327.5deg" },
  { lat: "32.4deg", lon: "105.0deg" },
  { lat: "27.7deg", lon: "242.6deg" },
  { lat: "23.1deg", lon: "20.1deg" },
  { lat: "18.7deg", lon: "157.6deg" },
  { lat: "14.5deg", lon: "295.1deg" },
  { lat: "10.3deg", lon: "72.6deg" },
  { lat: "6.2deg", lon: "210.1deg" },
  { lat: "2.0deg", lon: "347.6deg" },
  { lat: "-2.0deg", lon: "125.1deg" },
  { lat: "-6.2deg", lon: "262.6deg" },
  { lat: "-10.3deg", lon: "40.1deg" },
  { lat: "-14.5deg", lon: "177.6deg" },
  { lat: "-18.7deg", lon: "315.1deg" },
  { lat: "-23.1deg", lon: "92.7deg" },
  { lat: "-27.7deg", lon: "230.2deg" },
  { lat: "-32.4deg", lon: "7.7deg" },
  { lat: "-37.4deg", lon: "145.2deg" },
  { lat: "-42.7deg", lon: "282.7deg" },
  { lat: "-48.6deg", lon: "60.2deg" },
  { lat: "-55.2deg", lon: "197.7deg" },
  { lat: "-63.2deg", lon: "335.2deg" },
  { lat: "-74.6deg", lon: "112.7deg" },
];

const B2B_EFFECT_TILES: ReadonlyArray<{ title: string; subtitle: string }> = [
  { title: "Verified B2B Target", subtitle: "Financial Audit" },
  { title: "CXI Priority Match", subtitle: "Tailored Outreach" },
  { title: "Google Maps", subtitle: "Operational Check" },
  { title: "Market Intelligence", subtitle: "AI Grounded" },
  { title: "Decision Makers", subtitle: "Buyer Personas" },
  { title: "Trigger Signals", subtitle: "Live Scoring" },
  { title: "Bilanci & ATECO", subtitle: "Dual Portal Check" },
  { title: "Lead Qualification", subtitle: "High Precision" },
  { title: "Zero Hallucination", subtitle: "Source Verified" },
  { title: "Outreach Ready", subtitle: "Custom Email Hook" },
];

type GlobeTileData =
  | {
      kind: "logo";
      companyName: string;
      cluster: string;
      logoCandidates: string[];
    }
  | {
      kind: "text";
      title: string;
      subtitle: string;
    };

function extractCompanyDomain(website?: string): string | null {
  if (!website) return null;
  try {
    const normalized = website.startsWith("http") ? website : `https://${website}`;
    const hostname = new URL(normalized).hostname.replace(/^www\./i, "").toLowerCase();
    if (
      !hostname ||
      hostname === "azienda-target.it" ||
      hostname === "azienda.it" ||
      hostname.includes("registroimprese.it") ||
      hostname.includes("reportaziende.it") ||
      hostname.includes("fatturatoitalia.it") ||
      hostname.includes("ufficiocamerale.it") ||
      hostname.includes("maps.google.") ||
      hostname.includes("google.com") ||
      hostname.includes("vertexaisearch.cloud.google.com") ||
      hostname.includes("wikipedia.org") ||
      hostname.includes("paginegialle.it") ||
      hostname.includes("infocamere.it") ||
      hostname.includes("linkedin.com")
    ) {
      return null;
    }
    return hostname;
  } catch {
    return null;
  }
}

function buildGlobeTiles(rankedCompanies: RankedCompanyItem[]): GlobeTileData[] {
  const totalSlots = GLOBE_CARD_COORDS.length;
  const maxLogoRepsPerCompany = 3;

  const logoEntries: GlobeTileData[] = [];
  const textEntries: GlobeTileData[] = [];

  for (const company of rankedCompanies) {
    const candidateUrls = [
      company.website,
      ...(company.sources?.map((s) => s.url) ?? []),
    ];
    let domain: string | null = null;
    for (const url of candidateUrls) {
      domain = extractCompanyDomain(url);
      if (domain) break;
    }

    const logoCandidates: string[] = [];
    const directLogo = company.logoUrl?.trim();
    if (directLogo && /^https?:\/\//i.test(directLogo)) {
      logoCandidates.push(directLogo);
    }
    if (domain) {
      const googleFavicon = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`;
      const ddgIcon = `https://icons.duckduckgo.com/ip3/${encodeURIComponent(domain)}.ico`;
      if (!logoCandidates.includes(googleFavicon)) logoCandidates.push(googleFavicon);
      if (!logoCandidates.includes(ddgIcon)) logoCandidates.push(ddgIcon);
    }

    if (logoCandidates.length > 0) {
      logoEntries.push({
        kind: "logo",
        companyName: company.name,
        cluster: company.cluster,
        logoCandidates,
      });
    }

    textEntries.push({
      kind: "text",
      title: company.name,
      subtitle: company.cluster || company.headquartersCity || "B2B Target",
    });
  }

  // Costruisci un pool ordinato rispettando il limite massimo di 3 ripetizioni per logo aziendale
  const logoPool: GlobeTileData[] = [];
  if (logoEntries.length > 0) {
    for (let rep = 0; rep < maxLogoRepsPerCompany; rep++) {
      for (const entry of logoEntries) {
        logoPool.push(entry);
      }
    }
  }

  const companyTextPool: GlobeTileData[] = [];
  if (textEntries.length > 0) {
    const targetCompanyTextCount = Math.min(totalSlots - Math.min(logoPool.length, 14), textEntries.length * 2);
    for (let i = 0; i < targetCompanyTextCount; i++) {
      companyTextPool.push(textEntries[i % textEntries.length]!);
    }
  }

  const combined: GlobeTileData[] = [];
  const maxLogosUsed = Math.min(logoPool.length, 14);
  let li = 0;
  let ti = 0;
  let ei = 0;

  while (combined.length < totalSlots) {
    if (li < maxLogosUsed) {
      combined.push(logoPool[li++]!);
    }
    if (combined.length < totalSlots && ti < companyTextPool.length) {
      combined.push(companyTextPool[ti++]!);
    }
    if (combined.length < totalSlots && li >= maxLogosUsed && ti >= companyTextPool.length) {
      const effect = B2B_EFFECT_TILES[ei % B2B_EFFECT_TILES.length]!;
      combined.push({
        kind: "text",
        title: effect.title,
        subtitle: effect.subtitle,
      });
      ei++;
    }
  }

  return combined.slice(0, totalSlots);
}

function QualifiedGlobeTile({ tile }: { tile: GlobeTileData }) {
  const candidatesKey =
    tile.kind === "logo" ? tile.logoCandidates.join("|") : "";
  const [fallbackState, setFallbackState] = useState<{
    key: string;
    index: number;
  }>({ key: candidatesKey, index: 0 });

  const candidateIndex =
    fallbackState.key === candidatesKey ? fallbackState.index : 0;

  const advanceCandidate = () => {
    setFallbackState((prev) => ({
      key: candidatesKey,
      index: (prev.key === candidatesKey ? prev.index : 0) + 1,
    }));
  };

  const activeLogoUrl =
    tile.kind === "logo" ? tile.logoCandidates[candidateIndex] : undefined;

  if (tile.kind === "logo" && activeLogoUrl) {
    const isGoogleFavicon = activeLogoUrl.includes("google.com/s2/favicons");
    return (
      <div className="cl-face m-surface">
        <div className="flex h-full w-full flex-col items-center justify-between p-2">
          <div className="flex min-h-0 w-full flex-1 items-center justify-center">
            <img
              src={activeLogoUrl}
              alt={tile.companyName}
              loading="eager"
              onError={advanceCandidate}
              onLoad={(e) => {
                if (isGoogleFavicon && e.currentTarget.naturalWidth <= 16) {
                  advanceCandidate();
                }
              }}
              className="max-h-[56%] max-w-[56%] select-none object-contain"
            />
          </div>
          <span className="m-text-3 w-full truncate text-center text-[10px]">
            {tile.companyName}
          </span>
        </div>
      </div>
    );
  }

  const title = tile.kind === "logo" ? tile.companyName : tile.title;
  const subtitle = tile.kind === "logo" ? tile.cluster : tile.subtitle;

  return (
    <div className="cl-face m-surface">
      <span className="m-text-3 line-clamp-2">{title}</span>
      <span className="m-text-3 cl-trade truncate">{subtitle}</span>
    </div>
  );
}

function parseEmailHook(
  rawMail: string,
  solutionName: string,
  companyName: string
): { subject: string; body: string } {
  const trimmed = (rawMail || "").trim();
  const subjectMatch = trimmed.match(/^Oggetto:\s*(.+)$/im);
  if (subjectMatch) {
    const subject = subjectMatch[1]!.trim();
    const body = trimmed.replace(/^Oggetto:\s*.+(?:\r?\n)+/i, "").trim();
    return {
      subject: subject || `${solutionName} — Opportunità per ${companyName}`,
      body: body || trimmed,
    };
  }
  return {
    subject: `${solutionName} — Opportunità per ${companyName}`,
    body: trimmed,
  };
}

function mapCompanyResultToRankedItem(
  c: CompanyResult,
  rank: number
): RankedCompanyItem {
  const institutionalUrl =
    c.sources.find((s) => s.sourceType === "INSTITUTIONAL")?.url ||
    c.sources[0]?.url ||
    "";
  const website = c.mapsWebsiteUri || institutionalUrl;
  const fullAddress =
    c.indirizzoVerificatoMaps && c.indirizzoVerificatoMaps !== "N.D."
      ? c.indirizzoVerificatoMaps
      : c.sedeRegione
        ? `${c.sedeCitta} (${c.sedeRegione})`
        : c.sedeCitta;

  const p1 = c.buyer_personas?.[0];
  const p2 = c.buyer_personas?.[1];

  const dossier: CompanyDossier = {
    keyInfo: {
      summary: c.companyDescription || c.cosaSapere,
      coreBusiness: c.cosaSapere || c.altriDatiChiave,
      markets: `${c.altriDatiChiave ? `${c.altriDatiChiave} ` : ""}Presidio operativo: ${c.sedeCitta}${c.sedeRegione ? ` (${c.sedeRegione})` : ""} — ${c.bacinoClientiODimensione || c.sub_cluster_specifico}.`,
    },
    cxiPrimary: {
      name: c.cxi_primaria.nome_soluzione,
      year:
        c.cxi_primaria.trigger_data ||
        (c.fatturatoAnno ? String(c.fatturatoAnno) : undefined),
      tailoredService: c.cxi_primaria.servizio_personalizzato_1_riga,
      trigger: c.cxi_primaria.trigger_fatto,
      emailHook: parseEmailHook(
        c.cxi_primaria.gancio_mail,
        c.cxi_primaria.nome_soluzione,
        c.ragioneSociale
      ),
    },
    cxiSecondary: {
      name: c.cxi_secondaria.nome_soluzione,
      tailoredService: c.cxi_secondaria.servizio_personalizzato_1_riga,
      trigger: c.cxi_secondaria.trigger_fatto,
    },
    buyerPersonas: [
      {
        figureNumber: 1,
        role: p1?.ruolo_e_nome || "Direzione Operativa",
        decisionLevel: p1?.livello_decisionale || "Decisore economico",
        interests: p1?.cosa_gli_interessa || "Efficienza operativa e customer experience.",
        firstMessageAngle:
          p1?.primo_messaggio_utile || "Proporre un confronto sui risultati operativi CXI.",
      },
      {
        figureNumber: 2,
        role: p2?.ruolo_e_nome || "Direzione Digitale / IT",
        decisionLevel: p2?.livello_decisionale || "Sponsor strategico",
        interests: p2?.cosa_gli_interessa || "Digitalizzazione e integrazione dei processi.",
        firstMessageAngle:
          p2?.primo_messaggio_utile || "Approcciare con focus su innovazione e scalabilità.",
      },
    ],
    scoringBreakdown: {
      fitTargetScore: c.scoreTarget,
      fitTargetWeighted: `+${(c.score_breakdown?.contributo_target ?? c.scoreTarget * 0.5).toFixed(2)}`,
      potenzaTriggerScore: c.scoreTrigger,
      potenzaTriggerWeighted: `+${(c.score_breakdown?.contributo_trigger ?? c.scoreTrigger * 0.5).toFixed(2)}`,
      malusPersona: c.malusApplied ?? 0,
      malusPersonaMax: "max -0.50",
      totalScore: c.scoreFinal,
      formulaExplanation: c.explainability,
    },
  };

  return {
    rank,
    name: c.ragioneSociale,
    revenue:
      typeof c.fatturatoValore === "number"
        ? c.fatturatoValore
        : c.bacinoClientiODimensione || "N/A",
    employees: typeof c.dipendenti === "number" ? c.dipendenti : "N/A",
    cluster: c.cluster_macro,
    subcategory: c.sub_cluster_specifico,
    headquartersCity: c.sedeCitta || "Italia",
    fullAddress,
    phone: c.mapsPhone || "N.D.",
    website,
    logoUrl: c.logoUrl ?? null,
    pIva: c.partitaIva || "N.D.",
    bersaglioScore: c.scoreTarget,
    triggerScore: c.scoreTrigger,
    liveScore: c.scoreFinal,
    sources: c.sources.map((s) => ({ title: s.title, url: s.url })),
    dossier,
  };
}

function mapCompanyResultToCandidate(
  c: CompanyResult,
  macroCategory: string
): CompanyCandidate {
  return {
    id: c.id,
    name: c.ragioneSociale,
    cluster: c.sub_cluster_specifico || c.cluster_macro,
    macroCategory,
    headquartersCity: c.sedeCitta || "Italia",
    revenue:
      typeof c.fatturatoValore === "number"
        ? c.fatturatoValore
        : c.bacinoClientiODimensione || "N/A",
    employees: typeof c.dipendenti === "number" ? c.dipendenti : "N/A",
    bersaglioScore: c.scoreTarget,
    triggerScore: c.scoreTrigger,
    malus: c.malusApplied ?? 0,
  };
}

function mapDiscardedToNonClassificate(
  discarded: DiscardedCompanyTrace[] | undefined
): NonClassificataItem[] {
  if (!Array.isArray(discarded) || discarded.length === 0) return [];
  const seen = new Set<string>();
  const out: NonClassificataItem[] = [];

  for (let i = 0; i < discarded.length; i++) {
    const item = discarded[i];
    if (!item || !item.ragioneSociale) continue;
    const stageLower = (item.stage || "").toLowerCase();
    // Esclude il cut-off di Step 6 (le aziende extra con voto vanno in Fuori Ranking)
    if (stageLower.includes("step 6") || stageLower.includes("cut-off")) {
      continue;
    }
    const key = item.ragioneSociale.trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    out.push({
      id: `nc-real-${i}-${key.replace(/[^a-z0-9]/g, "-")}`,
      name: item.ragioneSociale,
      city: "—",
      reason: item.reason,
    });
  }
  return out;
}

function buildCompositePromptForApi(
  query: string,
  params?: MorphOrbParams
): { compositePrompt: string; mandatoryParams: MandatorySearchInput } {
  const categoriaSettore = params?.categoria?.trim() ?? "";
  const areaGeografica = params?.area?.trim() ?? "";
  const dimensioneAziendale = params?.dimensione?.trim() ?? "";
  const noteStrategiche = query.trim();

  const structuredParts: string[] = [];
  if (categoriaSettore) {
    structuredParts.push(`Settore/Categoria: "${categoriaSettore}"`);
  }
  if (areaGeografica) {
    structuredParts.push(`Area Geografica: "${areaGeografica}"`);
  }
  if (dimensioneAziendale) {
    structuredParts.push(`Dimensione Aziendale: "${dimensioneAziendale}"`);
  }

  const compositePrompt =
    structuredParts.length === 0
      ? noteStrategiche
      : noteStrategiche
        ? `Parametri specificati nei campi dedicati — ${structuredParts.join(", ")}. Richiesta utente: ${noteStrategiche}`
        : `Parametri specificati nei campi dedicati — ${structuredParts.join(", ")}.`;

  return {
    compositePrompt,
    mandatoryParams: {
      categoriaSettore,
      areaGeografica,
      dimensioneAziendale,
      noteStrategiche,
    },
  };
}

export default function BrainUIPage() {
  const [isIntroFinished, setIsIntroFinished] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [navHidden, setNavHidden] = useState(false);
  const [confirmExit, setConfirmExit] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  // Parametro variabile: numero di aziende richieste in classifica dall'utente (5 aziende come richiesto dal workflow)
  const [targetRankedCount, setTargetRankedCount] = useState<number>(5);
  const [companies, setCompanies] = useState<RankedCompanyItem[]>(INITIAL_RANKED_COMPANIES);
  const [raceCompanies, setRaceCompanies] = useState<CompanyCandidate[]>([]);
  const [nonClassificateCompanies, setNonClassificateCompanies] = useState<NonClassificataItem[] | undefined>(undefined);
  const [guardrailMessage, setGuardrailMessage] = useState<string | null>(null);
  const [searchedMacroCategory, setSearchedMacroCategory] = useState<string>("SaaS & Digital Tech");
  const [hasSearchResults, setHasSearchResults] = useState(false);
  const [companyHunterKey, setCompanyHunterKey] = useState(0);
  const morphOrbRef = React.useRef<MorphOrbRef>(null);
  const scoutAbortRef = React.useRef<AbortController | null>(null);
  const [agentPhase, setAgentPhase] = useState<string>("idle");
  const [isAgentScreenOpen, setIsAgentScreenOpen] = useState(false);
  const [sliderBersaglioPct, setSliderBersaglioPct] = useState<number>(50);
  const scrollRafRef = React.useRef<number | null>(null);

  const handleSelectCompany = useCallback((companyName: string) => {
    const domId = `company-card-${companyName.toLowerCase().replace(/[^a-z0-9]/g, "-")}`;
    const el = document.getElementById(domId) || document.getElementById("reviews");
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, []);

  // Calcolo dinamico dello score e riordinamento della classifica in tempo reale con lo slider Bersaglio / Trigger
  const dynamicRankedCompanies = useMemo(() => {
    const bPct = sliderBersaglioPct;
    const tPct = 100 - bPct;
    const scored = companies.map((c, idx) => {
      const bScore = c.bersaglioScore ?? (9.6 - (idx % 5) * 0.2);
      const tScore = c.triggerScore ?? (8.5 + (idx % 5) * 0.3);
      const malus = c.dossier?.scoringBreakdown?.malusPersona ?? 0;
      const rawLive = (bScore * bPct + tScore * tPct) / 100 - malus;
      const liveScore = Math.max(1.0, Math.min(10.0, Math.round(rawLive * 10) / 10));
      return {
        ...c,
        bersaglioScore: bScore,
        triggerScore: tScore,
        liveScore,
      };
    });

    // Ordina decrescente per liveScore, con fallback per mantenere coerenza
    const sorted = [...scored].sort(
      (a, b) => b.liveScore - a.liveScore || a.name.localeCompare(b.name)
    );

    // Riassegna la posizione in classifica (rank 1..N)
    return sorted.map((company, index) => ({
      ...company,
      rank: index + 1,
    }));
  }, [companies, sliderBersaglioPct]);

  // Ordine di rendering per il carosello evenkeel (#reviews):
  // Dal punteggio più basso al più alto per far sì che la #1 stia in cima allo stack
  const orderedCompanies = useMemo(
    () => [...dynamicRankedCompanies].sort((a, b) => b.rank - a.rank),
    [dynamicRankedCompanies]
  );

  // Mix per il globo 3D #clients (loghi PNG + nomi/settori + frasi B2B su sfondo grigio m-surface)
  const globeTiles = useMemo(
    () => buildGlobeTiles(dynamicRankedCompanies),
    [dynamicRankedCompanies]
  );

  // Ricalcola le misure e le variabili CSS (--reviews-at, --reviews-top) ogni volta che
  // la graduatoria delle tessere viene modificata o riordinata, garantendo che lo scorrimento
  // e l'effetto stacking di impilamento funzionino perfettamente per tutte le tessere.
  useEffect(() => {
    const updateReviewsMeasurements = () => {
      const sheets = Array.from(
        document.querySelectorAll<HTMLElement>("#reviews .rv-stack > li")
      );
      if (sheets.length <= 1) return;
      let at = 0;
      sheets.slice(0, -1).forEach((sheet, i) => {
        const nextSheet = sheets[i + 1];
        if (!nextSheet) return;
        const mb = parseFloat(getComputedStyle(sheet).marginBottom) || 0;
        at += sheet.offsetHeight + mb;
        const nextTop = parseFloat(getComputedStyle(nextSheet).top) || 0;
        sheet.style.setProperty("--reviews-at", `${at}px`);
        sheet.style.setProperty("--reviews-top", `${nextTop}px`);
      });
    };

    updateReviewsMeasurements();
    const t = setTimeout(updateReviewsMeasurements, 150);
    return () => clearTimeout(t);
  }, [orderedCompanies]);

  const handleAgentSubmit = useCallback(
    async (query: string, params?: MorphOrbParams) => {
      scoutAbortRef.current?.abort();
      scoutAbortRef.current = null;

      // Modalità Demo: conserva la simulazione istantanea di test
      if (params?.isDemo) {
        setGuardrailMessage(null);
        setNonClassificateCompanies(undefined);
        setHasSearchResults(false);
        setSliderBersaglioPct(50);

        const result = simulateCompanyHunterSearch(query, params);
        const macroCat = result.criteria.categoria || "SaaS & Digital Tech";
        setSearchedMacroCategory(macroCat);
        setRaceCompanies([]);

        const requestedMatch = (query + " " + (params?.dimensione || "")).match(/\b(10|\d+)\s*(?:aziend|nomi|societ)/i);
        const reqCount = requestedMatch ? Math.min(15, Math.max(3, parseInt(requestedMatch[1]!, 10))) : 5;
        setTargetRankedCount(reqCount);

        const scorePresets = [
          { bersaglio: 9.8, trigger: 8.5 },
          { bersaglio: 8.6, trigger: 9.8 },
          { bersaglio: 9.5, trigger: 9.1 },
          { bersaglio: 9.2, trigger: 9.4 },
          { bersaglio: 8.9, trigger: 8.8 },
          { bersaglio: 9.7, trigger: 7.9 },
          { bersaglio: 7.8, trigger: 9.7 },
          { bersaglio: 8.5, trigger: 8.4 },
          { bersaglio: 8.3, trigger: 8.2 },
          { bersaglio: 8.0, trigger: 7.9 },
        ];

        const extraSectorCompanies = [
          { name: "Aura Neural Labs S.r.l.", cluster: "Computer Vision", city: "Verona (VR)", rev: 11400000, emp: 78, pIva: "IT04728190234" },
          { name: "Vortex SecOps S.p.A.", cluster: "Cloud Security", city: "Genova (GE)", rev: 15800000, emp: 105, pIva: "IT02719280105" },
          { name: "Prisma Systems S.r.l.", cluster: "ERP Platforms", city: "Brescia (BS)", rev: 9200000, emp: 58, pIva: "IT03918270176" },
          { name: "Zenith Cloud S.p.A.", cluster: "Fintech Services", city: "Firenze (FI)", rev: 13600000, emp: 86, pIva: "IT06819200483" },
          { name: "Echo Logic Media S.r.l.", cluster: "AdTech Analytics", city: "Padova (PD)", rev: 7800000, emp: 50, pIva: "IT05192830289" },
        ];

        const fullCandidateList = [...result.companies];
        extraSectorCompanies.forEach((extra) => {
          if (!fullCandidateList.some((c) => c.name === extra.name)) {
            fullCandidateList.push({
              rank: fullCandidateList.length + 1,
              name: extra.name,
              revenue: extra.rev,
              employees: extra.emp,
              cluster: extra.cluster,
              subcategory: `${extra.cluster} (${result.criteria.area})`,
              headquartersCity: extra.city,
              fullAddress: `Via dell'Innovazione 1, ${extra.city}`,
              phone: "+39 02 8900 1234",
              website: "https://www.azienda-target.it",
              pIva: extra.pIva,
              sources: [{ title: "Registro Imprese", url: "https://www.registroimprese.it" }],
            });
          }
        });

        const candidatesWithScores: RankedCompanyItem[] = fullCandidateList.map((c, idx) => ({
          ...c,
          bersaglioScore: scorePresets[idx]?.bersaglio ?? (9.5 - (idx % 6) * 0.2),
          triggerScore: scorePresets[idx]?.trigger ?? (8.5 + (idx % 6) * 0.3),
        }));

        const candidates: CompanyCandidate[] = candidatesWithScores.map((c, idx) => ({
          id: `cand-${idx}-${c.name.toLowerCase().replace(/[^a-z0-9]/g, "-")}`,
          name: c.name,
          cluster: c.cluster,
          macroCategory: macroCat,
          headquartersCity: c.headquartersCity,
          revenue: c.revenue,
          employees: c.employees,
          bersaglioScore: c.bersaglioScore!,
          triggerScore: c.triggerScore!,
        }));

        setRaceCompanies([]);
        await new Promise((resolve) => setTimeout(resolve, 600));

        for (let i = 0; i < candidates.length; i++) {
          setRaceCompanies((prev) => [...prev, candidates[i]!]);
          if (i < candidates.length - 1) {
            await new Promise((resolve) => setTimeout(resolve, 640));
          }
        }
        await new Promise((resolve) => setTimeout(resolve, 500));

        setCompanies(candidatesWithScores);
        setHasSearchResults(true);

        if (typeof window !== "undefined") {
          setTimeout(() => {
            window.dispatchEvent(new Event("resize"));
          }, 300);
        }
        return result.summary;
      }

      // Modalità Reale: chiamata streaming SSE al backend Gemini (/api/scout)
      const abortController = new AbortController();
      scoutAbortRef.current = abortController;

      const { compositePrompt, mandatoryParams } = buildCompositePromptForApi(query, params);
      const initialCategory = params?.categoria?.trim() || "Scouting B2B";
      let activeCategory = initialCategory;

      const requestedMatch = (query + " " + (params?.dimensione || "")).match(
        /\b(10|\d+)\s*(?:aziend|nomi|societ)/i
      );
      const initialReqCount = requestedMatch
        ? Math.min(20, Math.max(1, parseInt(requestedMatch[1]!, 10)))
        : 5;

      setGuardrailMessage(null);
      setHasSearchResults(false);
      setRaceCompanies([]);
      setNonClassificateCompanies([]);
      setSliderBersaglioPct(50);
      setSearchedMacroCategory(initialCategory);
      setTargetRankedCount(initialReqCount);

      const streamedCompaniesByKey = new Map<string, CompanyResult>();
      let finalSummary = "";
      let gotResult = false;
      let hadError = false;

      const handleStreamEvent = (streamEvent: ScoutStreamEvent) => {
        if (abortController.signal.aborted) return;

        if (streamEvent.type === "intent") {
          if (streamEvent.constraints.settore) {
            activeCategory = streamEvent.constraints.settore;
            setSearchedMacroCategory(streamEvent.constraints.settore);
          }
          if (streamEvent.constraints.requestedCount) {
            setTargetRankedCount(streamEvent.constraints.requestedCount);
          }
        } else if (streamEvent.type === "company") {
          const c = streamEvent.company;
          const dedupKey = c.id || c.ragioneSociale.trim().toLowerCase();
          streamedCompaniesByKey.set(dedupKey, c);
          const candidate = mapCompanyResultToCandidate(c, activeCategory);
          setRaceCompanies((prev) => {
            const filtered = prev.filter(
              (item) => item.id !== candidate.id && item.name !== candidate.name
            );
            return [...filtered, candidate];
          });
        } else if (streamEvent.type === "trace") {
          setNonClassificateCompanies(
            mapDiscardedToNonClassificate(streamEvent.debug_trace.discarded_companies)
          );
        } else if (streamEvent.type === "result") {
          gotResult = true;
          const payload = streamEvent.payload;
          finalSummary = payload.text_response;

          const allScored = payload.all_scored_companies ?? payload.ranked_companies;
          if (payload.response_type === "text_only" || allScored.length === 0) {
            setGuardrailMessage(
              payload.text_response ||
                "Specifica Categoria/Settore, Area Geografica e Dimensione Aziendale per avviare lo scouting B2B."
            );
            setRaceCompanies([]);
            setNonClassificateCompanies([]);
            setHasSearchResults(false);
          } else {
            const rankedItems = allScored.map((c, idx) =>
              mapCompanyResultToRankedItem(c, idx + 1)
            );
            const candidates = allScored.map((c) =>
              mapCompanyResultToCandidate(c, activeCategory)
            );

            setRaceCompanies(candidates);
            setCompanies(rankedItems);
            setNonClassificateCompanies(
              mapDiscardedToNonClassificate(payload.debug_trace.discarded_companies)
            );
            setGuardrailMessage(null);
            setHasSearchResults(true);

            if (typeof window !== "undefined") {
              setTimeout(() => {
                window.dispatchEvent(new Event("resize"));
              }, 300);
            }
          }
        } else if (streamEvent.type === "error") {
          hadError = true;
          finalSummary = streamEvent.message;
          setGuardrailMessage(streamEvent.message);
          setHasSearchResults(false);
        }
      };

      try {
        const response = await fetch("/api/scout", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "text/event-stream",
          },
          body: JSON.stringify({
            prompt: compositePrompt,
            mandatoryParams,
          }),
          signal: abortController.signal,
        });

        if (response.status === 401) {
          if (typeof window !== "undefined") {
            window.location.href = "/login";
          }
          return "Sessione scaduta. Reindirizzamento al login.";
        }

        if (!response.ok || !response.body) {
          const errPayload = (await response.json().catch(() => null)) as {
            error?: string;
          } | null;
          const errMsg =
            errPayload?.error ||
            "Impossibile avviare la ricerca con le API di Gemini.";
          setGuardrailMessage(errMsg);
          setHasSearchResults(false);
          return errMsg;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (abortController.signal.aborted) break;

          buffer += decoder.decode(value, { stream: true });
          const chunks = buffer.split(/\r?\n\r?\n/);
          buffer = chunks.pop() ?? "";

          for (const chunk of chunks) {
            const lines = chunk.split(/\r?\n/);
            for (const line of lines) {
              if (!line.startsWith("data: ")) continue;
              const jsonRaw = line.slice(6).trim();
              if (!jsonRaw) continue;
              try {
                const streamEvent = JSON.parse(jsonRaw) as ScoutStreamEvent;
                handleStreamEvent(streamEvent);
              } catch {
                // ignora chunk JSON malformati parziali
              }
            }
          }
        }

        if (buffer.trim() && !abortController.signal.aborted) {
          for (const line of buffer.split(/\r?\n/)) {
            if (!line.startsWith("data: ")) continue;
            const jsonRaw = line.slice(6).trim();
            if (!jsonRaw) continue;
            try {
              const streamEvent = JSON.parse(jsonRaw) as ScoutStreamEvent;
              handleStreamEvent(streamEvent);
            } catch {
              // ignore trailing incomplete event
            }
          }
        }

        if (!gotResult && !hadError && !abortController.signal.aborted) {
          const fallbackCompanies = Array.from(streamedCompaniesByKey.values());
          if (fallbackCompanies.length > 0) {
            const rankedItems = fallbackCompanies.map((c, idx) =>
              mapCompanyResultToRankedItem(c, idx + 1)
            );
            setCompanies(rankedItems);
            setHasSearchResults(true);
            if (typeof window !== "undefined") {
              setTimeout(() => {
                window.dispatchEvent(new Event("resize"));
              }, 300);
            }
          } else {
            const errMsg =
              "Connessione allo stream di scouting interrotta prima del completamento.";
            setGuardrailMessage(errMsg);
            setHasSearchResults(false);
            return errMsg;
          }
        }

        return finalSummary || "Scouting B2B completato.";
      } catch (err) {
        if (
          abortController.signal.aborted ||
          (err instanceof DOMException && err.name === "AbortError")
        ) {
          return "";
        }
        const errMsg =
          "Errore di rete durante la comunicazione con il backend /api/scout.";
        setGuardrailMessage(errMsg);
        setHasSearchResults(false);
        return errMsg;
      } finally {
        if (scoutAbortRef.current === abortController) {
          scoutAbortRef.current = null;
        }
      }
    },
    []
  );

  const handleRunDemo = useCallback(() => {
    morphOrbRef.current?.startDemo(
      "Cercami 5 aziende a Milano nel settore SaaS con fatturato 10M - 50M €",
      {
        dimensione: "10M - 50M €",
        area: "Milano",
        categoria: "SaaS & Digital Tech",
      }
    );
  }, []);

  const handleIntroFinish = useCallback(() => {
    setIsIntroFinished(true);
  }, []);

  // Lock page scroll during the intro splash sequence so the user stays on the Hero viewport
  useEffect(() => {
    if (!isIntroFinished) {
      window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isIntroFinished]);

  // Track when the full black screen (#agent-screen) is reached so the shutter title triggers only after it opens
  useEffect(() => {
    if (!isIntroFinished) return;
    const agentEl = document.getElementById("agent-screen");
    if (!agentEl) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.85) {
            setIsAgentScreenOpen(true);
          } else if (entry.intersectionRatio < 0.3) {
            setIsAgentScreenOpen(false);
          }
        });
      },
      { threshold: [0, 0.3, 0.85] }
    );

    observer.observe(agentEl);
    return () => observer.disconnect();
  }, [isIntroFinished]);

  // Keep viewport locked on #agent-screen when the agent is actively processing/answering
  useEffect(() => {
    if (agentPhase !== "idle" && agentPhase !== "reset") {
      const agentEl = document.getElementById("agent-screen");
      if (agentEl) {
        const top = Math.round(agentEl.getBoundingClientRect().top + window.scrollY);
        if (Math.abs(window.scrollY - top) > 10) {
          window.scrollTo({ top, behavior: "instant" as ScrollBehavior });
        }
      }
    }
  }, [agentPhase]);

  // Initialize 8B motion-kit measurements, scroll-driven scenes, and navigation behaviors
  useEffect(() => {
    const html = document.documentElement;
    const supportsTimeline =
      typeof CSS !== "undefined" &&
      typeof CSS.supports === "function" &&
      CSS.supports("animation-timeline: view()");
    const noReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: no-preference)"
    ).matches;
    const live = noReducedMotion && supportsTimeline;

    if (live) {
      html.setAttribute("data-8b-live", "");
    }

    const box = (element: Element) => {
      if (!(element instanceof HTMLElement)) {
        const r = element.getBoundingClientRect();
        return {
          x: r.left + window.scrollX,
          y: r.top + window.scrollY,
          w: r.width,
          h: r.height,
        };
      }
      let x = 0;
      let y = 0;
      let node: HTMLElement | null = element;
      while (node) {
        x += node.offsetLeft;
        y += node.offsetTop;
        node = node.offsetParent as HTMLElement | null;
      }
      return {
        x,
        y,
        w: element.offsetWidth,
        h: element.offsetHeight,
      };
    };

    const setVars = (
      element: HTMLElement | null,
      vars: Record<string, string | number>
    ) => {
      if (!element) return;
      for (const [name, value] of Object.entries(vars)) {
        element.style.setProperty(name, String(value));
      }
    };

    const measures = new Set<() => void>();

    // Number all [data-8b-items] groups (--i, --n)
    const numberItems = () => {
      document.querySelectorAll("[data-8b-items]").forEach((group) => {
        const selector = group.getAttribute("data-8b-items");
        if (!selector) return;
        let items: HTMLElement[] = [];
        try {
          items = Array.from(group.querySelectorAll<HTMLElement>(selector));
        } catch {
          return;
        }
        items.forEach((item, index) => {
          item.style.setProperty("--i", String(index));
          item.style.setProperty("--n", String(items.length));
        });
      });
    };

    numberItems();
    measures.add(numberItems);

    // Scene: Opening
    const measureOpening = () => {
      const section = document.getElementById("opening");
      if (!section) return;
      const two = section.querySelector<HTMLElement>(".op-two");
      const rule = section.querySelector<HTMLElement>(".op-rule");
      const rows = Array.from(
        section.querySelectorAll<HTMLElement>(".op-say > .l-a")
      );
      if (two && rule) {
        setVars(section, {
          "--opening-run": `${two.offsetTop}px`,
          "--opening-slit": `${rule.offsetLeft}px`,
        });
        rows.forEach((row, i) => {
          const child = row.firstElementChild as HTMLElement | null;
          setVars(child, {
            "--opening-row": `${rule.offsetLeft - row.offsetLeft}px`,
            "--opening-step": i,
          });
        });
      }
    };
    measures.add(measureOpening);

    // Scene: Month
    const measureMonth = () => {
      const section = document.getElementById("month");
      const board = section?.querySelector<HTMLElement>(".mo-board");
      if (section && board) {
        setVars(section, {
          "--month-board-w": `${board.clientWidth}px`,
          "--month-board-h": `${board.clientHeight}px`,
        });
      }
    };
    measures.add(measureMonth);

    // Scene: Clients
    const measureClients = () => {
      const title = document.querySelector<HTMLElement>("#clients .cl-title");
      const a = title?.querySelector<HTMLElement>(".cl-half--a");
      const b = title?.querySelector<HTMLElement>(".cl-half--b");
      if (!title || !a || !b) return;
      const wide = window.matchMedia("(min-width: 701px)");
      const cx = title.clientWidth / 2;
      if (wide.matches) {
        // Natural typography word spacing between "Qualified" and "customers"
        const fontSize = parseFloat(getComputedStyle(title).fontSize) || 64;
        const gap = fontSize * 0.28;
        const start = cx - (a.offsetWidth + gap + b.offsetWidth) / 2;
        setVars(a, {
          "--clients-x": `${start - a.offsetLeft}px`,
          "--clients-y": "0px",
        });
        setVars(b, {
          "--clients-x": `${start + a.offsetWidth + gap - b.offsetLeft}px`,
          "--clients-y": "0px",
        });
      } else {
        const cy = title.clientHeight / 2;
        setVars(a, {
          "--clients-x": `${cx - a.offsetWidth / 2 - a.offsetLeft}px`,
          "--clients-y": `${cy - a.offsetHeight - a.offsetTop}px`,
        });
        setVars(b, {
          "--clients-x": `${cx - b.offsetWidth / 2 - b.offsetLeft}px`,
          "--clients-y": `${cy - b.offsetTop}px`,
        });
      }
    };
    measures.add(measureClients);

    // Scene: Team
    const measureTeam = () => {
      const row = document.querySelector<HTMLElement>("#team .tm-row");
      if (!row) return;
      const cards = Array.from(row.children) as HTMLElement[];
      const middle = (cards.length - 1) / 2;
      cards.forEach((card, i) => {
        setVars(card, {
          "--team-x": `${
            row.clientWidth / 2 -
            (card.offsetLeft + card.offsetWidth / 2) +
            (i - middle) * 16
          }px`,
          "--team-y": `${
            row.clientHeight / 2 -
            (card.offsetTop + card.offsetHeight / 2) +
            (i % 2 ? -12 : 12)
          }px`,
        });
      });
    };
    measures.add(measureTeam);

    // Scene: Reviews
    const measureReviews = () => {
      const sheets = Array.from(
        document.querySelectorAll<HTMLElement>("#reviews .rv-stack > li")
      );
      let at = 0;
      sheets.slice(0, -1).forEach((sheet, i) => {
        at += sheet.offsetHeight + parseFloat(getComputedStyle(sheet).marginBottom);
        setVars(sheet, {
          "--reviews-at": `${at}px`,
          "--reviews-top": `${
            parseFloat(getComputedStyle(sheets[i + 1]).top) || 0
          }px`,
        });
      });
    };
    measures.add(measureReviews);

    // Scene: Footer
    const measureFooter = () => {
      const footer = document.getElementById("footer");
      const word = footer?.querySelector<HTMLElement>(".ft-word");
      const ghost = footer?.querySelector<HTMLElement>(".ghost");
      if (footer && word && ghost) {
        const wordFontSize = parseFloat(getComputedStyle(word).fontSize) || 1;
        const ghostFontSize = parseFloat(getComputedStyle(ghost).fontSize) || 1;
        setVars(footer, {
          "--footer-run": `${
            document.documentElement.offsetHeight - box(word).y
          }px`,
          "--footer-from": ghostFontSize / wordFontSize,
        });
      }
    };
    measures.add(measureFooter);

    // [data-8b-motion] scroll enter triggers
    const getEnterAt = (element: Element) => {
      const own = /^(\d{1,3}(?:\.\d+)?)%$/.exec(
        (element.getAttribute("data-8b-enter") || "").trim()
      );
      return own && +own[1] <= 100 ? +own[1] / 100 : 0.88;
    };

    let pendingMotions = Array.from(
      document.querySelectorAll<HTMLElement>("[data-8b-motion]")
    ).map((element) => ({
      element,
      y: 0,
      at: getEnterAt(element),
    }));

    const checkMotions = () => {
      pendingMotions = pendingMotions.filter((item) => {
        if (item.y > window.scrollY + window.innerHeight * item.at) {
          return true;
        }
        item.element.classList.add("is-in");
        return false;
      });
    };

    const updateMotionPositions = () => {
      pendingMotions.forEach((item) => {
        item.y = box(item.element).y;
      });
      checkMotions();
    };
    measures.add(updateMotionPositions);

    // Track progress for #month and #switch
    const updateScrollTracks = () => {
      const trackSection = (
        sectionEl: HTMLElement | null,
        itemsConfig: [string, string, number][]
      ) => {
        if (!sectionEl) return;
        const rect = sectionEl.getBoundingClientRect();
        const vh = window.innerHeight;
        const d0 = rect.top;
        const d1 = rect.top + rect.height - vh;
        const p =
          d1 === d0 ? (d0 <= 0 ? 1 : 0) : Math.min(1, Math.max(0, -d0 / (d1 - d0)));

        itemsConfig.forEach(([selector, className, threshold]) => {
          const el = document.querySelector(selector);
          if (el) {
            el.classList.toggle(className, p >= threshold);
          }
        });
      };

      let scrolledPastTimeline = 0;
      const monthEl = document.getElementById("month");
      if (monthEl) {
        const rect = monthEl.getBoundingClientRect();
        const vh = window.innerHeight;
        const d0 = rect.top;
        const d1 = rect.top + rect.height - vh;
        const p =
          d1 === d0 ? (d0 <= 0 ? 1 : 0) : Math.min(1, Math.max(0, -d0 / (d1 - d0)));

        const tasksEl = monthEl.querySelector<HTMLElement>(".mo-tasks");
        if (tasksEl) {
          const remainingPct = Math.max(0, (1 - p) * 100).toFixed(2);
          if (window.innerWidth > 700) {
            tasksEl.style.clipPath = `inset(0 ${remainingPct}% 0 0)`;
          } else {
            tasksEl.style.clipPath = `inset(0 0 ${remainingPct}% 0)`;
          }
        }

        const taskItems = monthEl.querySelectorAll<HTMLElement>(".mo-tasks > li");
        taskItems.forEach((item, idx) => {
          const threshold = (idx + 0.05) / 5;
          item.classList.toggle("is-on", p >= threshold);
        });

        // Pixels scrolled past the exact moment the timeline bar reaches the right edge (bottom reaches vh)
        scrolledPastTimeline = vh - rect.bottom;
      }

      trackSection(document.getElementById("switch"), [
        ["#switch .sw-tiles > li:nth-of-type(1)", "is-done", 0.30333],
        ["#switch .sw-tiles > li:nth-of-type(2)", "is-done", 0.63667],
        ["#switch .sw-tiles > li:nth-of-type(3)", "is-done", 0.97],
      ]);

      // Scroll-driven line-by-line thickening for #principle
      // Starts shortly after the timeline bar has reached the right edge of #month,
      // and completes with the last line fully bold at the bottom of the page.
      const principleLines = document.querySelectorAll<HTMLElement>("#principle .pc-l");
      if (principleLines.length > 0) {
        const vh = window.innerHeight;
        const maxScroll = Math.max(1, document.documentElement.scrollHeight - vh);
        const curScroll = window.scrollY;
        // Remaining scroll distance to the exact bottom of the page
        const distToBottom = Math.max(0, maxScroll - curScroll);

        const timelineDelayPx = 60;

        if (scrolledPastTimeline < timelineDelayPx) {
          // Timeline bar has not yet completed and passed the delay buffer: hold at initial thin weight
          principleLines.forEach((line) => {
            const wordsEl = line.querySelector<HTMLElement>(".pc-w");
            if (wordsEl) {
              wordsEl.style.fontWeight = "300";
              wordsEl.style.opacity = "0.35";
              wordsEl.style.letterSpacing = "-0.01em";
            }
          });
        } else {
          // Active scroll budget from activation point down to fine pagina
          const activeBudget = Math.max(260, distToBottom + (scrolledPastTimeline - timelineDelayPx));

          // Staggered windows: line 1 activates shortly after timeline completes, line 4 completes (1.0) at fine pagina
          const lineRanges = [
            { start: activeBudget * 1.0, end: activeBudget * 0.52 },
            { start: activeBudget * 0.82, end: activeBudget * 0.35 },
            { start: activeBudget * 0.64, end: activeBudget * 0.18 },
            { start: activeBudget * 0.44, end: 0 },
          ];

          principleLines.forEach((line, idx) => {
            const cfg = lineRanges[idx] || lineRanges[lineRanges.length - 1];
            const span = cfg.start - cfg.end;
            const rawP = span > 0 ? (cfg.start - distToBottom) / span : 1;
            const clampedP = Math.max(0, Math.min(1, rawP));
            // Smoothstep easing for high-end optical weight transition
            const p = clampedP * clampedP * (3 - 2 * clampedP);

            const weight = Math.round(300 + 500 * p);
            const opacity = +(0.35 + 0.65 * p).toFixed(3);
            const tracking = +(-0.01 - 0.03 * p).toFixed(4);

            const wordsEl = line.querySelector<HTMLElement>(".pc-w");
            if (wordsEl) {
              wordsEl.style.fontWeight = String(weight);
              wordsEl.style.opacity = String(opacity);
              wordsEl.style.letterSpacing = `${tracking}em`;
            }
          });
        }
      }
    };
    measures.add(updateScrollTracks);

    const runAllMeasures = () => {
      measures.forEach((fn) => {
        try {
          fn();
        } catch {
          // ignore measurement errors during layout transitions
        }
      });
    };

    runAllMeasures();

    const resizeObserver = new ResizeObserver(() => {
      requestAnimationFrame(runAllMeasures);
    });
    resizeObserver.observe(document.body);

    let lastScrollY = window.scrollY;
    const handleScroll = () => {
      const y = window.scrollY;
      if (Math.abs(y - lastScrollY) >= 4) {
        setNavHidden(y > lastScrollY && y > 140);
        lastScrollY = y;
      }
      requestAnimationFrame(() => {
        checkMotions();
        updateScrollTracks();
      });
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    document.fonts?.ready.then(runAllMeasures);

    // Pause spirit level bubble when offscreen
    const levelEl = document.querySelector("#opening .op-level");
    let levelObserver: IntersectionObserver | null = null;
    if (levelEl && "IntersectionObserver" in window) {
      levelObserver = new IntersectionObserver(([entry]) => {
        levelEl.classList.toggle("is-paused", !entry.isIntersecting);
      });
      levelObserver.observe(levelEl);
    }

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("scroll", handleScroll);
      levelObserver?.disconnect();
    };
  }, []);

  const smoothScrollToSelector = useCallback(
    (selector: string, duration = 880) => {
      const isHero = selector === "#hero" || selector === "#opening";
      const target = isHero
        ? document.getElementById("opening") || document.body
        : document.querySelector<HTMLElement>(selector);
      if (!target && !isHero) return;

      if (scrollRafRef.current !== null) {
        cancelAnimationFrame(scrollRafRef.current);
        scrollRafRef.current = null;
      }

      const startY = window.scrollY;
      const targetY = isHero
        ? 0
        : Math.max(
            0,
            Math.round(target!.getBoundingClientRect().top + window.scrollY)
          );
      const delta = targetY - startY;

      if (Math.abs(delta) < 2) {
        window.scrollTo(0, targetY);
        return;
      }

      const startTime = performance.now();
      const easeInOutCubic = (t: number) =>
        t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

      const step = (now: number) => {
        const elapsed = now - startTime;
        const progress = Math.min(1, elapsed / duration);
        const eased = easeInOutCubic(progress);
        window.scrollTo(0, Math.round(startY + delta * eased));

        if (progress < 1) {
          scrollRafRef.current = requestAnimationFrame(step);
        } else {
          window.scrollTo(0, targetY);
          scrollRafRef.current = null;
        }
      };

      scrollRafRef.current = requestAnimationFrame(step);
    },
    []
  );

  const handleNavAnchorClick = (
    e: React.MouseEvent<HTMLAnchorElement>,
    href: string
  ) => {
    if (!href.startsWith("#")) return;
    e.preventDefault();
    setMenuOpen(false);
    setConfirmExit(false);
    if (href === "#agent-screen") {
      smoothScrollToSelector("#agent-screen", 880);
      window.setTimeout(() => {
        setIsAgentScreenOpen(true);
      }, 920);
      return;
    }
    smoothScrollToSelector(href, 880);
  };

  const handleExitLogout = async () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    try {
      await fetch("/api/auth/session", { method: "DELETE" });
    } finally {
      window.location.href = "/login";
    }
  };

  const siteRevealTransition = {
    duration: 1.15,
    ease: [0.22, 1, 0.36, 1] as [number, number, number, number],
  };

  return (
    <LayoutGroup>
      <div
        className={`evenkeel-site min-h-screen w-full bg-white ${
          isIntroFinished ? "is-revealed" : ""
        }`}
      >
        {/* Intro Splash Sequence (Fasi 1, 2, 3, 4) */}
        <IntroSequence
          isIntroFinished={isIntroFinished}
          onFinish={handleIntroFinish}
        />

        {/* Navigation */}
        <motion.header
          id="nav"
          className={`nav ${navHidden && !menuOpen ? "is-hidden" : ""}`}
          data-8b-section="navigation"
          initial={{ opacity: 0 }}
          animate={{ opacity: isIntroFinished ? 1 : 0 }}
          transition={siteRevealTransition}
        >
          <button
            className="m-btn-3 nav__menu"
            type="button"
            aria-expanded={menuOpen}
            aria-controls="menu"
            onClick={() => {
              setConfirmExit(false);
              setMenuOpen(true);
            }}
          >
            <span className="m-btn-3__label">Menu</span>
          </button>

          <div className="menu" id="menu" hidden={!menuOpen}>
            <span className="menu__rule" aria-hidden="true"></span>
            <div className="menu__top">
              <button
                className="m-icon menu__close"
                type="button"
                aria-label="Close menu"
                onClick={() => {
                  setMenuOpen(false);
                  setConfirmExit(false);
                }}
              >
                <svg
                  className="m-icon__glyph"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path d="M5 5l14 14M19 5L5 19" />
                </svg>
              </button>
            </div>
            <nav aria-label="Main">
              <ul className="menu__list" data-8b-items=":scope > li">
                {[
                  ["#hero", "Home page"],
                  ["#agent-screen", "AI Agent"],
                  ...(hasSearchResults ? [["#reviews", "Ranking"]] : []),
                  ["#team", "How to use"],
                ].map(([href, label]) => (
                  <li key={href}>
                    <a
                      className="m-link-3"
                      href={href}
                      onClick={(e) => handleNavAnchorClick(e, href)}
                    >
                      {label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
            <div className="menu__foot">
              <div className="menu__exit-wrap">
                <button
                  className="m-icon menu__power-btn"
                  type="button"
                  aria-label="Power off"
                  onClick={() => setConfirmExit((prev) => !prev)}
                >
                  <svg
                    className="m-icon__glyph"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path d="M12 3v9" strokeLinecap="round" />
                    <path
                      d="M17.66 6.34a8 8 0 1 1-11.32 0"
                      strokeLinecap="round"
                    />
                  </svg>
                </button>
                {confirmExit && (
                  <button
                    className="m-btn menu__exit-confirm"
                    type="button"
                    disabled={isLoggingOut}
                    onClick={handleExitLogout}
                  >
                    <span className="m-btn__label">exit</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </motion.header>

        <main>
          {/* Opening / Hero Section */}
          <section id="opening" className="op" data-8b-section="opening">
            <div className="op-one">
              <motion.span
                className="l-rule op-rule"
                aria-hidden="true"
                initial={{ opacity: 0 }}
                animate={{ opacity: isIntroFinished ? 1 : 0 }}
                transition={siteRevealTransition}
              />

              <motion.p
                className="m-text-3 op-where l-b"
                initial={{ opacity: 0 }}
                animate={{ opacity: isIntroFinished ? 1 : 0 }}
                transition={siteRevealTransition}
              >
                <span>Scouting Agent for real-time market intelligence</span>
                <span>High-precision target qualification</span>
              </motion.p>

              {/* Contenitore Finale del Globo 3D nella Hero Page (Fase 5) */}
              <div className="op-globe-stage">
                {isIntroFinished && (
                  <motion.div
                    layout
                    layoutId="company-hunter-globe"
                    transition={{
                      layout: {
                        duration: 1.25,
                        ease: [0.22, 1, 0.36, 1],
                      },
                    }}
                    className="op-globe-hero"
                  >
                    <RotatingEarth
                      width={640}
                      height={640}
                      className="h-full w-full"
                    />
                  </motion.div>
                )}
              </div>

              <motion.div
                className="op-head"
                initial={{ opacity: 0 }}
                animate={{ opacity: isIntroFinished ? 1 : 0 }}
                transition={siteRevealTransition}
              >
                <div className="op-name">
                  <p className="m-text-3 op-what">
                    Target discovery, financial audit &amp; key contacts
                  </p>
                  <h1 className="m-text-2 op-h1">
                    <span className="ln">
                      <span className="ln__i">Lead</span>
                    </span>{" "}
                    <span className="ln">
                      <span className="ln__i">Generation</span>
                    </span>
                  </h1>
                </div>
                <p className="m-text-2 op-sub">
                  <span className="ln l-a op-a">
                    <span className="ln__i">AI market</span>
                  </span>
                  <span className="ln l-a op-a">
                    <span className="ln__i">analyzer,</span>
                  </span>
                  <span className="ln l-b">
                    <span className="ln__i">profiles fit</span>
                  </span>
                  <span className="ln l-b op-in">
                    <span className="ln__i">with care.</span>
                  </span>
                </p>
                <div className="op-foot">
                  <div className="op-level" aria-hidden="true">
                    <span className="op-level__bubble"></span>
                  </div>
                  <div className="op-actions">
                    <a
                      className="m-btn"
                      href="#agent-screen"
                      onClick={(e) => handleNavAnchorClick(e, "#agent-screen")}
                    >
                      <span className="m-btn__label">Try our agent</span>
                    </a>
                    <a
                      className="m-link"
                      href="#team"
                      onClick={(e) => handleNavAnchorClick(e, "#team")}
                    >
                      Discover how to use
                    </a>
                  </div>
                </div>
              </motion.div>
            </div>

            <motion.div
              id="agent-screen"
              className="op-two relative w-full h-screen min-h-screen bg-black overflow-hidden flex flex-col justify-between"
              initial={{ opacity: 0 }}
              animate={{ opacity: isIntroFinished ? 1 : 0 }}
              transition={siteRevealTransition}
            >
              {/* Perimetro dell'intera schermata nera delimitato da 4 spigoli a L bianchi, con griglia leggera solo all'interno */}
              <div className="absolute inset-5 sm:inset-7 md:inset-9 pointer-events-none z-10 overflow-hidden">
                {/* Griglia leggera confinata unicamente all'interno del perimetro */}
                <div
                  className="absolute inset-0 opacity-[0.06] pointer-events-none"
                  style={{
                    backgroundImage: `linear-gradient(to right, #888 1px, transparent 1px), linear-gradient(to bottom, #888 1px, transparent 1px)`,
                    backgroundSize: "clamp(24px, 4vw, 48px) clamp(24px, 4vw, 48px)",
                  }}
                />

                {/* 4 Spigoli a forma di L bianchi ai 4 angoli dell'intera schermata nera */}
                <div className="absolute top-0 left-0 w-7 h-7 sm:w-8 sm:h-8 border-l-[1.5px] border-t-[1.5px] border-white/60 pointer-events-none" />
                <div className="absolute top-0 right-0 w-7 h-7 sm:w-8 sm:h-8 border-r-[1.5px] border-t-[1.5px] border-white/60 pointer-events-none" />
                <div className="absolute bottom-0 left-0 w-7 h-7 sm:w-8 sm:h-8 border-l-[1.5px] border-b-[1.5px] border-white/60 pointer-events-none" />
                <div className="absolute bottom-0 right-0 w-7 h-7 sm:w-8 sm:h-8 border-r-[1.5px] border-b-[1.5px] border-white/60 pointer-events-none" />

                {/* Pulsante Demo per test simulazione */}
                <div className="absolute top-4 right-6 sm:top-6 sm:right-8 z-40">
                  <button
                    type="button"
                    onClick={handleRunDemo}
                    title="Simula una ricerca standard di test"
                    className="group relative inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 hover:border-emerald-500/40 text-xs font-mono text-zinc-300 hover:text-white backdrop-blur-md transition-all duration-200 shadow-sm cursor-pointer pointer-events-auto"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="font-medium tracking-wide">Demo</span>
                  </button>
                </div>
              </div>

              {/* In Cima: Scritta COMPANY HUNTER e bottone new question */}
              <div className="absolute inset-0 z-30 pointer-events-none">
                <HeroShutterText isOpen={isAgentScreenOpen}>
                  <AnimatePresence>
                    {agentPhase === "answered" && (
                      <motion.button
                        key="new-question-btn"
                        type="button"
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4, transition: { duration: 0.15 } }}
                        transition={{ duration: 0.25, ease: "easeOut" }}
                        onClick={(e) => {
                          e.stopPropagation();
                          scoutAbortRef.current?.abort();
                          scoutAbortRef.current = null;
                          setAgentPhase("idle");
                          morphOrbRef.current?.reset();
                          setHasSearchResults(false);
                          setRaceCompanies([]);
                          setNonClassificateCompanies(undefined);
                          setGuardrailMessage(null);
                          setSliderBersaglioPct(50);
                        }}
                        className="group relative inline-flex flex-col items-center justify-center pt-1 pb-1 px-3 bg-transparent border-0 outline-none cursor-pointer pointer-events-auto"
                      >
                        <span className="text-[11px] sm:text-xs font-mono lowercase tracking-wider text-zinc-400 group-hover:text-zinc-100 transition-colors duration-150">
                          new question
                        </span>
                        {/* Sottolineatura con estremi sfumati: bianco a riposo, verde smeraldo in hover senza filtri blur o aloni residui */}
                        <span
                          className="w-full mt-1 h-[1px] pointer-events-none transition-colors duration-200
                            bg-gradient-to-r from-transparent via-white/30 to-transparent
                            group-hover:from-transparent group-hover:via-emerald-400 group-hover:to-transparent"
                        />
                      </motion.button>
                    )}
                  </AnimatePresence>
                </HeroShutterText>
              </div>

              {/* Classifica Bar Race Dinamica Dark Mode: compare appena il globo bianco inizia a roteare */}
              <AnimatePresence>
                {(agentPhase === "assemble" ||
                  agentPhase === "think" ||
                  agentPhase === "resolve" ||
                  agentPhase === "answered") && (
                  <motion.div
                    key="agent-ranking-race-overlay"
                    initial={{ opacity: 0, scale: 0.96, x: "-50%", y: 12 }}
                    animate={{
                      opacity: 1,
                      scale: 1,
                      x: "-50%",
                      top: agentPhase === "answered" ? "calc(16% - 10px)" : "calc(16% + 140px)",
                      y: "0%",
                    }}
                    exit={{ opacity: 0, scale: 0.96, x: "-50%", y: 12, transition: { duration: 0.25 } }}
                    transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                    className={`absolute left-1/2 z-20 pointer-events-auto transition-[width,max-width] duration-500 ease-out ${
                      agentPhase === "answered"
                        ? "w-[calc(100%-48px)] sm:w-[calc(100%-64px)] md:w-[calc(100%-96px)] max-w-[1580px]"
                        : "w-[calc(100%-48px)] sm:w-[calc(100%-80px)] md:w-[calc(100%-112px)] max-w-[1280px]"
                    }`}
                  >
                    {guardrailMessage ? (
                      <div
                        className="w-full max-w-[880px] mx-auto rounded-2xl sm:rounded-3xl border border-white/10 p-6 sm:p-8 text-white"
                        style={{
                          background: "rgba(18, 18, 22, 0.55)",
                          backdropFilter: "blur(24px) saturate(140%)",
                          WebkitBackdropFilter: "blur(24px) saturate(140%)",
                          boxShadow:
                            "0 24px 50px -12px rgba(0, 0, 0, 0.75), inset 0 1px 0 rgba(255, 255, 255, 0.12)",
                        }}
                      >
                        <div className="mb-3 flex items-center justify-between border-b border-white/10 pb-3">
                          <span className="inline-flex items-center gap-2 font-mono text-[11px] font-bold uppercase tracking-wider text-zinc-300">
                            <span className="h-2 w-2 rounded-full bg-amber-400" />
                            Controllore B2B · Risposta Agente
                          </span>
                          <span className="rounded-full border border-white/15 bg-white/[0.06] px-2.5 py-0.5 font-mono text-[10px] text-zinc-300">
                            Ricerca non avviata
                          </span>
                        </div>
                        <p className="text-sm sm:text-base leading-relaxed text-zinc-100 whitespace-pre-line">
                          {guardrailMessage}
                        </p>
                        <p className="mt-4 font-mono text-[11px] text-zinc-400">
                          Clicca su &ldquo;new question&rdquo; in alto per modificare la richiesta o specificare Categoria, Area Geografica e Dimensione.
                        </p>
                      </div>
                    ) : (
                      <AgentRankingRace
                        category={searchedMacroCategory}
                        topN={targetRankedCount}
                        companies={raceCompanies}
                        nonClassificate={nonClassificateCompanies}
                        isSearching={
                          agentPhase === "assemble" ||
                          agentPhase === "think" ||
                          agentPhase === "resolve"
                        }
                        showSlider={agentPhase === "answered"}
                        onSliderChange={(pct) => setSliderBersaglioPct(pct)}
                        onSelectCompany={handleSelectCompany}
                      />
                    )}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Chat dell'agente: MorphOrb al centro/basso, senza barre laterali, con globo verde su Done */}
              <MorphOrb
                ref={morphOrbRef}
                onSubmit={handleAgentSubmit}
                onPhaseChange={(p) => {
                  setAgentPhase(p);
                  if (p === "idle") {
                    scoutAbortRef.current?.abort();
                    scoutAbortRef.current = null;
                    setGuardrailMessage(null);
                    setNonClassificateCompanies(undefined);
                    setHasSearchResults(false);
                    setRaceCompanies([]);
                    setSliderBersaglioPct(50);
                  }
                }}
              />
            </motion.div>
          </section>

          {/* Rest of the Website Sections */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: isIntroFinished ? 1 : 0 }}
            transition={siteRevealTransition}
          >
            {/* Sezioni Risultati Dinamici: Company Ranking e Clienti Qualificati (visibili contestualmente dopo ricerca) */}
            {hasSearchResults && (
              <>
                {/* Company Ranking Carousel (replaces Questions we hear every week) */}
                <section id="reviews" className="rv" data-8b-section="reviews">
              <h2 className="m-text-2 rv-h">
                <span className="l-a">Company</span>
                <span className="l-b">ranking.</span>
              </h2>
              <ol className="rv-stack" data-8b-items=":scope > li">
                {orderedCompanies.map((company, index) => (
                  <RankingCard
                    key={company.name}
                    company={company}
                    index={index}
                    targetRankedCount={targetRankedCount}
                    bersaglioPct={sliderBersaglioPct}
                    triggerPct={100 - sliderBersaglioPct}
                  />
                ))}
              </ol>
            </section>

            {/* Clients */}
            <section id="clients" className="cl" data-8b-section="clients">
              <div className="cl-stage">
                <h2 className="m-text-2 cl-title">
                  <span className="cl-half cl-half--a">Qualified</span>{" "}
                  <span className="cl-half cl-half--b">customers</span>
                </h2>
                <ul
                  className="cl-globe"
                  data-8b-items=":scope > li"
                  aria-label="Qualified B2B customers"
                >
                  {globeTiles.map((tile, idx) => {
                    const coord = GLOBE_CARD_COORDS[idx]!;
                    const tileKey =
                      tile.kind === "logo"
                        ? `globe-card-${idx}-${tile.logoCandidates[0]}`
                        : `globe-card-${idx}-${tile.title}`;
                    return (
                      <li
                        key={tileKey}
                        className="cl-card"
                        style={
                          { "--lat": coord.lat, "--lon": coord.lon } as React.CSSProperties
                        }
                      >
                        <QualifiedGlobeTile tile={tile} />
                      </li>
                    );
                  })}
                </ul>
                <p className="m-text-3 cl-note">
                  Thousands+ of potential clients. Here is a small sample.
                </p>
              </div>
            </section>
          </>
        )}

            {/* Team */}
            <section
              id="team"
              className="tm"
              data-8b-section="team"
            >
              <h2 className="m-text-2 tm-h">
                <span className="l-a">Una domanda,</span>
                <span className="l-b">al resto pensiamo noi.</span>
              </h2>
              <p className="m-text-3 tm-sub l-b">
                Come usare al meglio il nostro agente
              </p>
              <ul className="tm-row" data-8b-items=":scope > li">
                {/* 1. Prompt */}
                <li
                  className="tm-card"
                  style={{ "--team-tilt": "-8deg" } as React.CSSProperties}
                >
                  <div className="tm-glass-card group/glass">
                    <img
                      src="/scenes/1.png?v=2"
                      alt="1. Inserisci il prompt"
                      className="h-full w-full object-contain select-none pointer-events-none transition-all duration-500 ease-out drop-shadow-[0_10px_22px_rgba(0,0,0,0.06)] group-hover/glass:drop-shadow-[0_20px_36px_rgba(0,90,220,0.22)] group-hover/glass:brightness-[1.03]"
                    />
                  </div>
                  <div className="tm-card-info">
                    <h3 className="m-text-4">1. Inserisci il prompt</h3>
                    <p className="m-text">
                      Inizia descrivendo liberamente la tua ricerca. Puoi definire
                      settore, geografia, fatturato minimo o bisogni specifici:
                      l&apos;agente comprende il contesto naturale e costruisce la
                      strategia di scouting.
                    </p>
                  </div>
                </li>

                {/* 2. Parametri dimensionali */}
                <li
                  className="tm-card"
                  style={{ "--team-tilt": "-4deg" } as React.CSSProperties}
                >
                  <div className="tm-glass-card group/glass">
                    <img
                      src="/scenes/2.png?v=2"
                      alt="2. Parametri dimensionali"
                      className="h-full w-full object-contain select-none pointer-events-none transition-all duration-500 ease-out drop-shadow-[0_10px_22px_rgba(0,0,0,0.06)] group-hover/glass:drop-shadow-[0_20px_36px_rgba(0,90,220,0.22)] group-hover/glass:brightness-[1.03]"
                    />
                  </div>
                  <div className="tm-card-info">
                    <h3 className="m-text-4">2. Parametri dimensionali</h3>
                    <p className="m-text">
                      In alternativa puoi indicare parametri precisi: dimensione
                      aziendale (fatturato o dipendenti), area geografica e categoria
                      per 5 aziende. Non è obbligatorio compilarli tutti nei campi,
                      ma devono essere specificati nel prompt.
                    </p>
                  </div>
                </li>

                {/* 3. Pensiero & Scoring */}
                <li
                  className="tm-card"
                  style={{ "--team-tilt": "2deg" } as React.CSSProperties}
                >
                  <div className="tm-glass-card group/glass">
                    <img
                      src="/scenes/3.png?v=2"
                      alt="3. Pensiero & Scoring"
                      className="h-full w-full object-contain select-none pointer-events-none transition-all duration-500 ease-out drop-shadow-[0_10px_22px_rgba(0,0,0,0.06)] group-hover/glass:drop-shadow-[0_20px_36px_rgba(0,90,220,0.22)] group-hover/glass:brightness-[1.03]"
                    />
                  </div>
                  <div className="tm-card-info">
                    <h3 className="m-text-4">3. Pensiero &amp; Scoring</h3>
                    <p className="m-text">
                      L&apos;agente specializzato passa alla fase di pensiero ed elabora
                      i dati raccolti sul web. Esegue un&apos;analisi approfondita su
                      ciascuna azienda candidata, assegnando un punteggio e ordinandole
                      in classifica.
                    </p>
                  </div>
                </li>

                {/* 4. Bersaglio & Trigger (50/50) */}
                <li
                  className="tm-card"
                  style={{ "--team-tilt": "-3deg" } as React.CSSProperties}
                >
                  <div className="tm-glass-card group/glass">
                    <img
                      src="/scenes/4.png?v=2"
                      alt="4. Bersaglio & Trigger (50/50)"
                      className="h-full w-full object-contain select-none pointer-events-none transition-all duration-500 ease-out drop-shadow-[0_10px_22px_rgba(0,0,0,0.06)] group-hover/glass:drop-shadow-[0_20px_36px_rgba(0,90,220,0.22)] group-hover/glass:brightness-[1.03]"
                    />
                  </div>
                  <div className="tm-card-info">
                    <h3 className="m-text-4">4. Bersaglio &amp; Trigger (50/50)</h3>
                    <p className="m-text">
                      Il voto finale combina due metriche personalizzabili via slider:
                      Bersaglio (50%), aderenza ai requisiti richiesti, e Trigger
                      (50%), che valuta la reale propensione all&apos;acquisto basandosi
                      su notizie, assunzioni ed eventi recenti.
                    </p>
                  </div>
                </li>

                {/* 5. Approfondisci, Vendi & Esporta */}
                <li
                  className="tm-card"
                  style={{ "--team-tilt": "7deg" } as React.CSSProperties}
                >
                  <div className="tm-glass-card group/glass">
                    <img
                      src="/scenes/5.png?v=2"
                      alt="5. Approfondisci & Esporta"
                      className="h-full w-full object-contain select-none pointer-events-none transition-all duration-500 ease-out drop-shadow-[0_10px_22px_rgba(0,0,0,0.06)] group-hover/glass:drop-shadow-[0_20px_36px_rgba(0,90,220,0.22)] group-hover/glass:brightness-[1.03]"
                    />
                  </div>
                  <div className="tm-card-info">
                    <h3 className="m-text-4">5. Approfondisci &amp; Esporta</h3>
                    <p className="m-text">
                      Accedi all&apos;analisi dettagliata di ogni azienda con tutti gli
                      insight chiave: associamo ciascun prospect al servizio migliore
                      da vendere e scriviamo la bozza email su misura per avviare il
                      contatto. A fine sessione, esporti tutto in Excel con un clic.
                    </p>
                  </div>
                </li>
              </ul>
            </section>

            {/* Month */}
            <section id="month" className="mo" data-8b-section="month">
              <div className="mo-stage">
                <h2 className="m-text-2 mo-h">
                  <span className="l-a">Cinque fasi,</span>
                  <span className="l-b">zero attrito.</span>
                </h2>
                <p className="m-text-3 mo-sub l-b">
                  Come funziona il nostro agente
                </p>
                <div className="mo-board">
                  <div className="mo-scale" aria-hidden="true">
                    <span className="mo-fill"></span>
                  </div>
                  <span className="mo-marker" aria-hidden="true"></span>
                  <ol className="mo-tasks" data-8b-items=":scope > li">
                    <li className="mo-task">
                      <p className="m-text-3 mo-day">Fase 01</p>
                      <h3 className="m-text-4">Scouting online</h3>
                      <p className="m-text">
                        Ricerca aziende target online per individuare tutte le
                        realtà attive nel settore richiesto.
                      </p>
                    </li>
                    <li className="mo-task">
                      <p className="m-text-3 mo-day">Fase 02</p>
                      <h3 className="m-text-4">Dati &amp; Maps</h3>
                      <p className="m-text">
                        Arricchimento simultaneo: categoria, fatturato, dimensione
                        e verifica sede Google Maps [in contemporanea].
                      </p>
                    </li>
                    <li className="mo-task">
                      <p className="m-text-3 mo-day">Fase 03</p>
                      <h3 className="m-text-4">News &amp; Potenziale</h3>
                      <p className="m-text">
                        Cerca news aziendali e analizza le reali potenzialità di
                        vendita dei tuoi servizi.
                      </p>
                    </li>
                    <li className="mo-task">
                      <p className="m-text-3 mo-day">Fase 04</p>
                      <h3 className="m-text-4">Scoring &amp; Rank</h3>
                      <p className="m-text">
                        Dà un voto alle aziende e stila la classifica gerarchica
                        dalla prima all&apos;ultima.
                      </p>
                    </li>
                    <li className="mo-task">
                      <p className="m-text-3 mo-day">Fase 05</p>
                      <h3 className="m-text-4">Report human</h3>
                      <p className="m-text">
                        Produce un output finale ordinato, trasparente e human
                        &amp; business friendly.
                      </p>
                    </li>
                  </ol>
                </div>
                <p className="m-text-3 mo-note">
                  Dalla query al dossier operativo in pochi minuti.
                </p>
              </div>
            </section>

            {/* Principle */}
            <section id="principle" className="pc" data-8b-section="principle">
              <blockquote className="m-text-2 pc-q">
                <span className="pc-l pc-l-a" data-pc-line="1">
                  <span className="pc-w">Il mercato non aspetta</span>
                  <span className="pc-dot pc-dot--black" aria-hidden="true" />
                </span>
                <span className="pc-l pc-l-b" data-pc-line="2">
                  <span className="pc-w">Il tuo </span>
                  <span className="pc-agent">scouting agent</span>
                </span>
                <span className="pc-l pc-l-a" data-pc-line="3">
                  <span className="pc-w">ha già selezionato</span>
                </span>
                <span className="pc-l pc-l-b" data-pc-line="4">
                  <span className="pc-w">chi ha bisogno di te</span>
                  <span className="pc-dot" aria-hidden="true" />
                </span>
              </blockquote>
            </section>
          </motion.div>
        </main>
        <GlassFilter />
      </div>
    </LayoutGroup>
  );
}
