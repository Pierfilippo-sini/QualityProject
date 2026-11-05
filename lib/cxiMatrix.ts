import type { CXIPackage } from "@/lib/types";

/**
 * Matrice Deterministica di Business: Eventi/Esigenze -> Soluzioni CXI (Customer Experience Italia).
 * Supporta il Doppio Matching (Soluzione CXI Principale + Soluzione CXI Secondaria).
 */
export interface CXIPackageDefinition {
  id: CXIPackage;
  label: string;
  solutionTitle: string;
  triggers: string[];
  targetBuyerPersonas: string[];
  badgeClassName: string;
}

export const CXI_MATRIX: Record<CXIPackage, CXIPackageDefinition> = {
  CONSULTING: {
    id: "CONSULTING",
    label: "Consulting X",
    solutionTitle: "CXI Consulting",
    triggers: [
      "Acquisizioni (M&A), fusioni societarie e armonizzazione processi post-M&A",
      "Rebranding, riorganizzazioni aziendali e governance omnicanale",
      "Standard di servizio omogenei tra sportelli/filiali e canali remoti",
      "Formazione front-line, Academy CX e leadership team commerciali",
      "Espansione commerciale o apertura nuove filiali",
    ],
    targetBuyerPersonas: [
      "Chief Executive Officer (CEO) / General Manager",
      "Direttore Commerciale o Marketing Retail",
      "HR / Learning & Development Director",
      "Head of Customer Strategy & Governance",
    ],
    badgeClassName:
      "border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-800 dark:bg-indigo-950/50 dark:text-indigo-300",
  },
  DIGITAL: {
    id: "DIGITAL",
    label: "Digital X",
    solutionTitle: "CXI Digital",
    triggers: [
      "Digitalizzazione del customer journey e canali self-service (App, WhatsApp, Portali)",
      "Adozione AI conversazionale, voicebot/chatbot e automazione CRM/ERP",
      "Lancio e-commerce B2B/B2C o trasformazione digitale dei touchpoint",
      "Modernizzazione piattaforme di contact center cloud e analytics CX",
    ],
    targetBuyerPersonas: [
      "Chief Information Officer (CIO) / Chief Digital Officer (CDO)",
      "Head of Digital Customer Experience & CRM",
      "IT & Transformation Director",
      "E-commerce & Omnichannel Manager",
    ],
    badgeClassName:
      "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-950/50 dark:text-sky-300",
  },
  OPERATIONS: {
    id: "OPERATIONS",
    label: "Operations X",
    solutionTitle: "CXI Operations",
    triggers: [
      "Gestione grandi volumi o picchi di contatti clienti (inbound/outbound)",
      "Percorsi di caring proattivo per fidelizzazione e riduzione churn/abbandoni",
      "Supporto operativo nel cambio brand, scadenze contrattuali o migrazioni",
      "Ottimizzazione processi di back-office, post-vendita e supply chain",
    ],
    targetBuyerPersonas: [
      "Direttore Customer Operations / Customer Care",
      "Chief Operating Officer (COO)",
      "Responsabile Contact Center & Back-Office",
      "Head of Retention & Post-Sales Service",
    ],
    badgeClassName:
      "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-300",
  },
  ESG: {
    id: "ESG",
    label: "ESG X",
    solutionTitle: "CXI ESG",
    triggers: [
      "Pubblicazione bilancio di sostenibilità (CSRD) e sostenibilità di filiera",
      "Certificazioni ambientali, parità di genere, accessibilità e inclusione CX",
      "Welfare aziendale, benessere delle persone di front-line e transizione green",
    ],
    targetBuyerPersonas: [
      "Chief Sustainability Officer (CSO) / ESG Manager",
      "HR & People Care Director",
      "Responsabile Qualità, Sostenibilità & Compliance",
    ],
    badgeClassName:
      "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300",
  },
  NONE: {
    id: "NONE",
    label: "Assessment CXI",
    solutionTitle: "CXI Advisory Assessment",
    triggers: [],
    targetBuyerPersonas: [],
    badgeClassName: "border-border bg-muted text-muted-foreground",
  },
};

export function getCXIPackageDefinition(
  cxiPackage: CXIPackage
): CXIPackageDefinition {
  return CXI_MATRIX[cxiPackage] ?? CXI_MATRIX.NONE;
}

export function resolveCXISolutionName(
  cxiPackage: CXIPackage,
  customLabel?: string | null
): string {
  const def = getCXIPackageDefinition(cxiPackage);
  const cleaned = customLabel?.trim();
  if (cleaned && cleaned.length >= 3 && cleaned.toUpperCase() !== "NONE") {
    return cleaned;
  }
  return def.label;
}
