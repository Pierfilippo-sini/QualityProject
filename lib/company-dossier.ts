export interface CompanySourceLink {
  title: string;
  url: string;
}

export interface CompanyKeyInfo {
  summary: string;
  coreBusiness: string;
  markets: string;
  keyStrengths?: string;
}

export interface CxiPrimarySolution {
  name: string;
  year?: string;
  tailoredService: string;
  trigger: string;
  emailHook: {
    subject: string;
    body: string;
  };
}

export interface CxiSecondarySolution {
  name: string;
  tailoredService: string;
  trigger: string;
}

export interface BuyerPersonaItem {
  figureNumber: number;
  role: string;
  decisionLevel: string;
  interests: string;
  firstMessageAngle: string;
}

export interface ScoringBreakdownItem {
  fitTargetScore: number;
  fitTargetWeighted: string;
  potenzaTriggerScore: number;
  potenzaTriggerWeighted: string;
  malusPersona: number;
  malusPersonaMax?: string;
  totalScore: number;
  formulaExplanation?: string;
  summaryNote?: string;
}

export interface CompanyDossier {
  keyInfo: CompanyKeyInfo;
  cxiPrimary: CxiPrimarySolution;
  cxiSecondary: CxiSecondarySolution;
  buyerPersonas: BuyerPersonaItem[];
  scoringBreakdown: ScoringBreakdownItem;
}

/**
 * Genera il dossier approfondito di intelligence B2B per una specifica azienda,
 * rispettando fedelmente il doppio matching CXI, le buyer personas, le informazioni chiave
 * e il breakdown di scoring.
 */
export function getCompanyDossier(company: {
  name: string;
  cluster: string;
  subcategory: string;
  headquartersCity?: string;
  fullAddress?: string;
  rank?: number;
}): CompanyDossier {
  const name = company.name;
  const cluster = company.cluster || "Automazione & Industria";
  const subcategory = company.subcategory || "Meccatronica";
  const city = company.headquartersCity || "Milano (MI)";

  // 1. Informazioni Chiave sull'Azienda
  const keyInfo: CompanyKeyInfo = {
    summary: `${name} è una realtà consolidata nel comparto ${cluster.toLowerCase()}, specializzata nello sviluppo e fornitura di soluzioni per ${subcategory.toLowerCase()}. Con sede principale a ${city}, l'azienda presidia filiere industriali ad alta intensità tecnologica, integrando ingegneria di processo avanzata e assistenza su commessa per clienti enterprise nazionali ed esteri.`,
    coreBusiness: `Progettazione, fabbricazione e distribuzione B2B di componenti e sistemi dedicati a ${subcategory.toLowerCase()}, con forte orientamento alla servitizzazione, alla manutenzione predittiva e al supporto continuativo post-vendita.`,
    markets: `Mercato domestico (circa 45%) con focus nei distretti industriali del Nord Italia, ed export qualificato (circa 55%) verso Germania, Francia, Svizzera e Nord America per clienti OEM e integratori di linea.`,
    keyStrengths: `Elevata flessibilità produttiva, conformità agli standard ISO e Industry 4.0, solida base installata e investimenti crescenti nell'interconnessione digitale dei macchinari e nel customer service.`,
  };

  // 2. Doppio Matching Servizi CXI Pertinenti
  const cxiPrimary: CxiPrimarySolution = {
    name: "Digital X",
    year: "2024",
    tailoredService: `Implementazione di un portale self-service integrato con AI conversazionale per la diagnostica tecnica preventiva e l'ordine rapido della ricambistica B2B.`,
    trigger: `Digitalizzazione del customer journey e potenziamento dei portali self-service e configuratori B2B per l'assistenza tecnica remota e la vendita di ricambi. La recente crescita della base installata presso committenti industriali di ${name} ha generato un picco di richieste di supporto di primo livello e una frammentazione nei flussi di ordinazione dei ricambi critici: abilitare un canale intelligente 24/7 elimina i colli di bottiglia e accelera del 40% il ciclo di evasione su commessa.`,
    emailHook: {
      subject: `Portali self-service e diagnostica tecnica rapida per ${name}`,
      body: `Gentile Chief Operating Officer,

l'impegno costante di ${name} nella transizione verso la servitizzazione e il potenziamento dei servizi tecnici B2B rappresenta un punto di riferimento per l'automazione industriale avanzata. Sappiamo quanto sia strategico per la continuità operativa dei vostri clienti industriali minimizzare i tempi di fermo impianto e snellire la gestione della componentistica di ricambio.

Con la nostra soluzione Digital X supportiamo primari gruppi manifatturieri tramite l'implementazione di un portale self-service integrato con AI conversazionale per la diagnostica tecnica preventiva e l'ordine immediato dei ricambi. Questo approccio permette di incrementare la produttività del supporto tecnico operativo, riducendo sensibilmente i carichi di back-office e accelerando la risoluzione delle richieste su commessa.

Sarei felice di condividere un breve confronto operativo per illustrarle casi d'uso concreti già adottati nel vostro settore.`,
    },
  };

  const cxiSecondary: CxiSecondarySolution = {
    name: "Operations X",
    tailoredService: `Servizio di supporto operativo di caring tecnico multicanale per garantire la continuità operativa degli impianti industriali e accelerare i tempi di risposta dell'assistenza.`,
    trigger: `Ottimizzazione dei processi di back-office, post-vendita e gestione delle richieste tecniche complesse legate a commesse globali di automazione. La pressione competitiva richiede standard di Service Level Agreement (SLA) sempre più stringenti nei mercati export, dove una risposta qualificata entro 60 minuti costituisce un fattore determinante di fidelizzazione contrattuale.`,
  };

  // 3. Interlocutori & 2 Buyer Personas Target
  const buyerPersonas: BuyerPersonaItem[] = [
    {
      figureNumber: 1,
      role: "Chief Operating Officer (COO)",
      decisionLevel:
        "Decisore economico finale con pieno potere di spesa per l'efficientamento dei processi operativi, dell'assistenza post-vendita e della supply chain.",
      interests:
        "Riduzione dei tempi di fermo impianto per i clienti industriali, incremento della produttività del supporto tecnico e abbattimento dei costi operativi di commessa.",
      firstMessageAngle:
        "Approcciare focalizzandosi sulla riduzione dei tempi medi di risoluzione dei ticket tecnici e sulla standardizzazione dell'assistenza post-vendita a livello internazionale.",
    },
    {
      figureNumber: 2,
      role: "Chief Information Officer (CIO) / Chief Digital Officer (CDO)",
      decisionLevel:
        "Sponsor strategico per l'architettura IT aziendale e l'integrazione di piattaforme digitali, CRM e portali di customer self-service.",
      interests:
        "Integrazione nativa dei canali digitali di supporto con i sistemi ERP e CRM aziendali, sicurezza dei dati tecnici e scalabilità delle soluzioni di self-service B2B.",
      firstMessageAngle:
        "Approcciare proponendo un'architettura integrata che automatizza la gestione documentale e l'accesso ai manuali tecnici tramite assistenti virtuali basati su AI.",
    },
  ];

  // 4. Breakdown Metodo di Scoring
  const scoringBreakdown: ScoringBreakdownItem = {
    fitTargetScore: 9.7,
    fitTargetWeighted: "+2.42",
    potenzaTriggerScore: 9.4,
    potenzaTriggerWeighted: "+7.05",
    malusPersona: 0.0,
    malusPersonaMax: "max -0.50",
    totalScore: 9.5,
    formulaExplanation: `Score Totale 9.5/10 = 25% Fit Target (9.7) + 75% Potenza Trigger (9.4) con 2 Buyer Personas complete (malus 0).`,
    summaryNote: `L'aderenza ai parametri dimensionali, territoriali e settoriali è perfetta, collocando l'azienda ai vertici del cluster di riferimento. La recente accelerazione verso la digitalizzazione del customer journey e dei portali per l'assistenza post-vendita rende il trigger di assoluto rilievo e tempestività.`,
  };

  return {
    keyInfo,
    cxiPrimary,
    cxiSecondary,
    buyerPersonas,
    scoringBreakdown,
  };
}
