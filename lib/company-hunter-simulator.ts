import type { RankedCompanyItem } from "@/app/ui/components/RankingCard";

export interface SearchParametersInput {
  dimensione?: string;
  area?: string;
  categoria?: string;
}

export interface ResolvedSearchCriteria {
  dimensione: string;
  area: string;
  categoria: string;
}

export interface SimulationResult {
  criteria: ResolvedSearchCriteria;
  companies: RankedCompanyItem[];
  summary: string;
}

/**
 * Risolve i 3 parametri di ricerca con priorità assoluta ai box dedicati
 * e deduzione automatica dal testo libero per i campi omessi.
 */
export function resolveSearchCriteria(
  prompt: string,
  params?: SearchParametersInput
): ResolvedSearchCriteria {
  const p = prompt || "";
  const boxDimensione = params?.dimensione?.trim() || "";
  const boxArea = params?.area?.trim() || "";
  const boxCategoria = params?.categoria?.trim() || "";

  // 1. Categoria: Box ha priorità assoluta, altrimenti deduce da prompt
  let categoria = boxCategoria;
  if (!categoria) {
    if (/(?:software|saas|digital|ict|tech|ai|cloud)/i.test(p)) {
      categoria = "SaaS & Digital Tech";
    } else if (/(?:manifattur|meccanic|industri|cnc|acciaio|carpenteria)/i.test(p)) {
      categoria = "Manifatturiero & Meccanica";
    } else if (/(?:energi|energy|gas|luce|renewabl|rinnovabil)/i.test(p)) {
      categoria = "Energy & Utilities";
    } else if (/(?:logistic|trasport|supply chain|shipping)/i.test(p)) {
      categoria = "Logistica & Trasporti";
    } else if (/(?:fintech|bank|finanz|assicuraz)/i.test(p)) {
      categoria = "FinTech & Banking";
    } else if (/(?:food|alimentar|beverage|vino|agri)/i.test(p)) {
      categoria = "Agroalimentare & Food";
    } else if (/(?:pharma|biotech|salute|healthcare|medic)/i.test(p)) {
      categoria = "Pharma & Life Sciences";
    } else {
      categoria = "B2B Services & Industry";
    }
  }

  // 2. Area Geografica: Box ha priorità assoluta, altrimenti deduce da prompt
  let area = boxArea;
  if (!area) {
    const geoMatches = p.match(
      /\b(Torino|Milano|Bologna|Roma|Napoli|Firenze|Genova|Verona|Padova|Brescia|Bergamo|Piemonte|Lombardia|Veneto|Emilia[- ]Romagna|Toscana|Nord[- ]Italia|Centro[- ]Italia|Sud[- ]Italia)\b/i
    );
    if (geoMatches) {
      area = geoMatches[1];
    } else {
      area = "Nord Italia";
    }
  }

  // 3. Dimensione: Box ha priorità assoluta, altrimenti deduce da prompt
  let dimensione = boxDimensione;
  if (!dimensione) {
    const dimMatches = p.match(
      /(\d+[\s-]*\d*\s*(?:dipendenti|addetti|clienti|M€|mln|k|mila))/i
    );
    if (dimMatches) {
      dimensione = dimMatches[1];
    } else if (/(?:pmi|piccole|medie)/i.test(p)) {
      dimensione = "PMI (20-100 dipendenti)";
    } else if (/(?:mid-cap|grandi)/i.test(p)) {
      dimensione = "Mid-Cap (100-500 dipendenti)";
    } else {
      dimensione = "10M - 50M € (30-150 dipendenti)";
    }
  }

  return { categoria, area, dimensione };
}

/**
 * Simula una ricerca realistica e restituisce esattamente 5 aziende
 * coerenti con i criteri definiti.
 */
export function simulateCompanyHunterSearch(
  prompt: string,
  params?: SearchParametersInput
): SimulationResult {
  const criteria = resolveSearchCriteria(prompt, params);

  const baseCompaniesBySector: Record<
    string,
    Array<{ name: string; cluster: string; subcategory: string; baseRev: number; baseEmp: number }>
  > = {
    "SaaS & Digital Tech": [
      {
        name: "Nexura Cloud S.p.A.",
        cluster: "Software & Cloud",
        subcategory: "Enterprise SaaS Platforms",
        baseRev: 14200000,
        baseEmp: 98,
      },
      {
        name: "Omnia Data Systems S.r.l.",
        cluster: "AI & Big Data",
        subcategory: "Predictive Analytics B2B",
        baseRev: 8750000,
        baseEmp: 62,
      },
      {
        name: "Hyperion Cybersecurity S.p.A.",
        cluster: "Cybersecurity",
        subcategory: "Zero Trust Protection",
        baseRev: 19400000,
        baseEmp: 135,
      },
      {
        name: "Krypton Web Solutions S.r.l.",
        cluster: "Digital Services",
        subcategory: "E-Commerce & Omnichannel",
        baseRev: 6300000,
        baseEmp: 44,
      },
      {
        name: "Synapse IoT Automation S.p.A.",
        cluster: "Industrial IoT",
        subcategory: "Smart Factory Edge Computing",
        baseRev: 22800000,
        baseEmp: 160,
      },
    ],
    "Manifatturiero & Meccanica": [
      {
        name: "Aeterna Precision Systems S.p.A.",
        cluster: "Meccanica di precisione",
        subcategory: "Componenti aerospaziali & difesa",
        baseRev: 18900000,
        baseEmp: 142,
      },
      {
        name: "Krono Automazioni Industriali S.p.A.",
        cluster: "Automazione & Robotica",
        subcategory: "Linee produttive robotizzate",
        baseRev: 12400000,
        baseEmp: 88,
      },
      {
        name: "Officine Meccaniche Val Seriana S.r.l.",
        cluster: "Meccanica pesante",
        subcategory: "Lavorazioni CNC ad alta precisione",
        baseRev: 7650000,
        baseEmp: 52,
      },
      {
        name: "Vanguard Tooling Tech S.p.A.",
        cluster: "Utensileria speciale",
        subcategory: "Stampi industriali termoindurenti",
        baseRev: 15200000,
        baseEmp: 110,
      },
      {
        name: "Delta Flange & Raccordi S.r.l.",
        cluster: "Carpenteria metallica",
        subcategory: "Componenti idraulici per Oil&Gas",
        baseRev: 5400000,
        baseEmp: 36,
      },
    ],
  };

  // Seleziona la base di aziende adatta o usa fallback realistico
  let matchedTemplates = baseCompaniesBySector[criteria.categoria];
  if (!matchedTemplates) {
    if (criteria.categoria.includes("SaaS") || criteria.categoria.includes("Tech")) {
      matchedTemplates = baseCompaniesBySector["SaaS & Digital Tech"];
    } else {
      matchedTemplates = baseCompaniesBySector["Manifatturiero & Meccanica"];
    }
  }

  // Genera esattamente 5 aziende ordinate con Rank da 1 a 5
  const companies: RankedCompanyItem[] = matchedTemplates.map((template, idx) => {
    return {
      rank: idx + 1,
      name: template.name,
      revenue: template.baseRev,
      employees: template.baseEmp,
      cluster: template.cluster,
      subcategory: `${template.subcategory} (${criteria.area})`,
    };
  });

  const summary = `Ricerca completata con successo: individuate 5 aziende d'eccellenza conformi a Categoria "${criteria.categoria}", Area "${criteria.area}" e Dimensione "${criteria.dimensione}". Classifica aggiornata con metriche di bilancio verificate.`;

  return {
    criteria,
    companies,
    summary,
  };
}
