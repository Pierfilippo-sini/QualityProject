import * as XLSX from "xlsx";
import type { CompanyResult } from "@/lib/types";

/**
 * Generatore Excel (.xlsx) Multi-Scheda a 5 Tab lato client dai risultati già in memoria.
 * ZERO chiamate API aggiuntive: utilizza esclusivamente l'array `CompanyResult[]`
 * mantenendo rigorosamente l'ordine di classifica decrescente per Score Totale in tutte le 5 schede.
 *
 * I nomi dei fogli rispettano il limite tecnico tassativo di 31 caratteri dello standard OpenXML (.xlsx).
 */

export const EXCEL_SHEET_NAMES = {
  NEW_NAMES: "Output - New names", // 18 chars
  CLUSTERS_PRIORITY: "Output - Cluster e priorità", // 27 chars
  KEY_INFO: "Output - Info chiave aziende", // 28 chars
  BUYER_PERSONAS: "Output - Interlocutori e buyer", // 30 chars
  CXI_SERVICES: "Output - Servizi CXI pertinenti", // 31 chars
} as const;

function safeSheetName(name: string): string {
  return name.replace(/[\\/?*[\]:]/g, "").slice(0, 31);
}

function formatKeyDataForSheet1(company: CompanyResult): string {
  const parts: string[] = [];
  if (company.altriDatiChiave?.trim()) {
    parts.push(company.altriDatiChiave.trim());
  }
  const hasRevInText = company.altriDatiChiave
    ?.toLowerCase()
    .includes("ricav");
  if (!hasRevInText && company.fatturatoValore !== null) {
    parts.push(
      `Ricavi ${company.fatturatoAnno ?? "ultimo bilancio"}: ${company.fatturatoValore.toLocaleString("it-IT")} €`
    );
  }
  const hasEmpInText = company.altriDatiChiave
    ?.toLowerCase()
    .includes("dipendent");
  if (!hasEmpInText && company.dipendenti !== null) {
    parts.push(`${company.dipendenti.toLocaleString("it-IT")} dipendenti`);
  }
  if (company.atecoCodice && company.atecoCodice !== "N.D.") {
    parts.push(`ATECO ${company.atecoCodice}`);
  }
  return parts.join("; ") || company.companyDescription;
}

function formatSourcesCompact(company: CompanyResult): string {
  if (!company.sources || company.sources.length === 0) return "N.D.";
  return company.sources
    .map((s) => `${s.title} (${s.url})`)
    .join(" | ");
}

/**
 * Costruisce in memoria il Workbook SheetJS a 5 schede ordinate per Score Totale decrescente.
 */
export function buildMultiSheetScoutingWorkbook(
  companies: CompanyResult[]
): XLSX.WorkBook {
  const sorted = [...companies].sort((a, b) => {
    if (b.scoreFinal !== a.scoreFinal) return b.scoreFinal - a.scoreFinal;
    if (b.scoreTrigger !== a.scoreTrigger) return b.scoreTrigger - a.scoreTrigger;
    return b.scoreTarget - a.scoreTarget;
  });

  const workbook = XLSX.utils.book_new();

  // ===========================================================================
  // SCHEDA 1: Output - New names
  // ===========================================================================
  const sheet1Rows = sorted.map((company) => ({
    Azienda: company.ragioneSociale,
    Sede: `${company.sedeCitta} (${company.sedeRegione})`,
    "Clienti / Dimensione":
      company.bacinoClientiODimensione ||
      (company.dipendenti !== null
        ? `${company.dipendenti.toLocaleString("it-IT")} dipendenti`
        : "N.D."),
    "Altri dati chiave": formatKeyDataForSheet1(company),
    Fonte: formatSourcesCompact(company),
  }));

  const ws1 = XLSX.utils.json_to_sheet(sheet1Rows);
  ws1["!cols"] = [
    { wch: 28 },
    { wch: 24 },
    { wch: 26 },
    { wch: 56 },
    { wch: 64 },
  ];
  XLSX.utils.book_append_sheet(
    workbook,
    ws1,
    safeSheetName(EXCEL_SHEET_NAMES.NEW_NAMES)
  );

  // ===========================================================================
  // SCHEDA 2: Output - Clusterizzazione e priorità
  // (Cluster Macro + Sub-Cluster Specifico + Punteggi Parziali + Malus max -0.5 + Totale)
  // ===========================================================================
  const sheet2Rows = sorted.map((company, index) => {
    const bd = company.score_breakdown;
    const malusSigned =
      bd.malus_buyer_persona > 0 ? -bd.malus_buyer_persona : 0;

    return {
      Priorità: index + 1,
      Azienda: company.ragioneSociale,
      "Cluster Macro": company.cluster_macro,
      "Sub-Cluster Specifico": company.sub_cluster_specifico,
      "Fit Target (1-10)": bd.score_target,
      "Peso Fit Target": `${Math.round(bd.peso_target * 100)}%`,
      "Contributo Fit Target": bd.contributo_target,
      "Potenza Trigger (0-10)": bd.score_trigger,
      "Peso Trigger": `${Math.round(bd.peso_trigger * 100)}%`,
      "Contributo Trigger": bd.contributo_trigger,
      "Malus Buyer Persona (max -0.5)": malusSigned,
      Totale: bd.score_totale,
    };
  });

  const ws2 = XLSX.utils.json_to_sheet(sheet2Rows);
  ws2["!cols"] = [
    { wch: 10 },
    { wch: 28 },
    { wch: 36 },
    { wch: 28 },
    { wch: 16 },
    { wch: 15 },
    { wch: 20 },
    { wch: 20 },
    { wch: 14 },
    { wch: 18 },
    { wch: 28 },
    { wch: 12 },
  ];
  XLSX.utils.book_append_sheet(
    workbook,
    ws2,
    safeSheetName(EXCEL_SHEET_NAMES.CLUSTERS_PRIORITY)
  );

  // ===========================================================================
  // SCHEDA 3: Output - Informazioni chiave sulle aziende
  // ===========================================================================
  const sheet3Rows = sorted.map((company) => ({
    Azienda: company.ragioneSociale,
    "Cosa sapere":
      company.cosaSapere?.trim() || company.companyDescription?.trim() || "N.D.",
  }));

  const ws3 = XLSX.utils.json_to_sheet(sheet3Rows);
  ws3["!cols"] = [{ wch: 28 }, { wch: 95 }];
  XLSX.utils.book_append_sheet(
    workbook,
    ws3,
    safeSheetName(EXCEL_SHEET_NAMES.KEY_INFO)
  );

  // ===========================================================================
  // SCHEDA 4: Output - Interlocutori e buyer persona (2 Figure per ogni Azienda)
  // ===========================================================================
  const sheet4Rows = sorted.flatMap((company) =>
    company.buyer_personas.map((persona) => ({
      Azienda: company.ragioneSociale,
      "Figura Professionale / Ruolo": persona.ruolo_e_nome,
      "Livello / Peso Decisionale": persona.livello_decisionale,
      "Cosa gli interessa": persona.cosa_gli_interessa,
      "Primo messaggio utile": persona.primo_messaggio_utile,
    }))
  );

  const ws4 = XLSX.utils.json_to_sheet(sheet4Rows);
  ws4["!cols"] = [
    { wch: 28 },
    { wch: 36 },
    { wch: 42 },
    { wch: 44 },
    { wch: 52 },
  ];
  XLSX.utils.book_append_sheet(
    workbook,
    ws4,
    safeSheetName(EXCEL_SHEET_NAMES.BUYER_PERSONAS)
  );

  // ===========================================================================
  // SCHEDA 5: Output - Servizi CXI pertinenti (Primaria + Secondaria + Gancio Mail)
  // ===========================================================================
  const sheet5Rows = sorted.map((company) => ({
    Azienda: company.ragioneSociale,
    "Soluzione CXI Principale": company.cxi_primaria.nome_soluzione,
    "Servizio Principale (1 riga)":
      company.cxi_primaria.servizio_personalizzato_1_riga,
    "Aggancio al fatto (Trigger Principale)":
      company.cxi_primaria.trigger_fatto,
    "Soluzione CXI Secondaria": company.cxi_secondaria.nome_soluzione,
    "Servizio Secondario (1 riga)":
      company.cxi_secondaria.servizio_personalizzato_1_riga,
    "Trigger Secondario": company.cxi_secondaria.trigger_fatto,
    "Gancio (Mail Soluzione Principale)": company.cxi_primaria.gancio_mail,
  }));

  const ws5 = XLSX.utils.json_to_sheet(sheet5Rows);
  ws5["!cols"] = [
    { wch: 28 },
    { wch: 24 },
    { wch: 46 },
    { wch: 42 },
    { wch: 24 },
    { wch: 46 },
    { wch: 40 },
    { wch: 70 },
  ];
  XLSX.utils.book_append_sheet(
    workbook,
    ws5,
    safeSheetName(EXCEL_SHEET_NAMES.CXI_SERVICES)
  );

  return workbook;
}

export function exportCompaniesToExcel(
  companies: CompanyResult[],
  filenamePrefix = "cxi-b2b-scouting-5-schede"
): void {
  if (typeof window === "undefined" || companies.length === 0) {
    return;
  }

  const workbook = buildMultiSheetScoutingWorkbook(companies);
  const dateStamp = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(workbook, `${filenamePrefix}-${dateStamp}.xlsx`);
}
