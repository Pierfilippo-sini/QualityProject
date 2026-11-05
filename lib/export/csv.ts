import type { CompanyResult } from "@/lib/types";

/**
 * Formattatore ed esportatore CSV RFC-4180 lato client allineato al nuovo contratto dati
 * (Cluster GICS, 2 Buyer Personas senza LinkedIn, Doppio Matching CXI e Score Breakdown).
 */
function escapeCsvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) {
    return '""';
  }
  const str = String(value);
  const escaped = str.replace(/"/g, '""');
  return `"${escaped}"`;
}

export function formatCompaniesToCsv(companies: CompanyResult[]): string {
  const sorted = [...companies].sort((a, b) => b.scoreFinal - a.scoreFinal);

  const headers = [
    "Priorita",
    "Azienda",
    "Cluster Macro",
    "Sub-Cluster Specifico",
    "Fit Target",
    "Potenza Trigger",
    "Malus Buyer Persona",
    "Score Totale",
    "Sede",
    "Clienti / Dimensione",
    "Fatturato EUR",
    "Anno Bilancio",
    "Dipendenti",
    "Cosa Sapere",
    "Buyer Persona 1 - Ruolo",
    "Buyer Persona 1 - Livello Decisionale",
    "Buyer Persona 1 - Cosa gli interessa",
    "Buyer Persona 1 - Primo messaggio utile",
    "Buyer Persona 2 - Ruolo",
    "Buyer Persona 2 - Livello Decisionale",
    "Buyer Persona 2 - Cosa gli interessa",
    "Buyer Persona 2 - Primo messaggio utile",
    "CXI Primaria - Soluzione",
    "CXI Primaria - Servizio 1 riga",
    "CXI Primaria - Trigger",
    "CXI Secondaria - Soluzione",
    "CXI Secondaria - Servizio 1 riga",
    "CXI Secondaria - Trigger",
    "Gancio Mail CXI Primaria",
    "Fonti Verificate",
  ];

  const lines: string[] = [headers.map(escapeCsvCell).join(",")];

  sorted.forEach((company, index) => {
    const [bp1, bp2] = company.buyer_personas;
    const bd = company.score_breakdown;

    const row = [
      index + 1,
      company.ragioneSociale,
      company.cluster_macro,
      company.sub_cluster_specifico,
      bd.score_target.toFixed(1),
      bd.score_trigger.toFixed(1),
      bd.malus_buyer_persona > 0 ? `-${bd.malus_buyer_persona}` : "0",
      bd.score_totale.toFixed(1),
      `${company.sedeCitta} (${company.sedeRegione})`,
      company.bacinoClientiODimensione,
      company.fatturatoValore ?? "N.D.",
      company.fatturatoAnno ?? "N.D.",
      company.dipendenti ?? "N.D.",
      company.cosaSapere,
      bp1.ruolo_e_nome,
      bp1.livello_decisionale,
      bp1.cosa_gli_interessa,
      bp1.primo_messaggio_utile,
      bp2.ruolo_e_nome,
      bp2.livello_decisionale,
      bp2.cosa_gli_interessa,
      bp2.primo_messaggio_utile,
      company.cxi_primaria.nome_soluzione,
      company.cxi_primaria.servizio_personalizzato_1_riga,
      company.cxi_primaria.trigger_fatto,
      company.cxi_secondaria.nome_soluzione,
      company.cxi_secondaria.servizio_personalizzato_1_riga,
      company.cxi_secondaria.trigger_fatto,
      company.cxi_primaria.gancio_mail,
      company.sources.map((s) => `${s.title} (${s.url})`).join(" | "),
    ];
    lines.push(row.map(escapeCsvCell).join(","));
  });

  return lines.join("\r\n");
}

export function exportCompaniesToCsv(
  companies: CompanyResult[],
  filenamePrefix = "cxi-b2b-scouting-results"
): void {
  if (typeof window === "undefined" || companies.length === 0) {
    return;
  }

  const csvContent = `\uFEFF${formatCompaniesToCsv(companies)}`;
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const dateStamp = new Date().toISOString().slice(0, 10);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${filenamePrefix}-${dateStamp}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
