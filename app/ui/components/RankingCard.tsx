"use client";

import React, { useRef, useState } from "react";
import { useInView, motion, AnimatePresence } from "framer-motion";
import {
  ArrowRight,
  ArrowLeft,
  ChevronDown,
  ExternalLink,
  MapPin,
  Phone,
  Globe,
  Copy,
  Check,
} from "lucide-react";
import CountAnimation from "./CountAnimation";
import TypingEffect from "./TypingEffect";
import {
  getCompanyDossier,
  type CompanySourceLink,
  type CompanyDossier,
} from "@/lib/company-dossier";

export type { CompanySourceLink };

export interface RankedCompanyItem {
  rank: number;
  name: string;
  revenue: number | string;
  employees: number | string;
  cluster: string;
  subcategory: string;
  headquartersCity?: string;
  fullAddress?: string;
  phone?: string;
  website?: string;
  logoUrl?: string | null;
  pIva?: string;
  sources?: CompanySourceLink[];
  dossier?: CompanyDossier;
  bersaglioScore?: number;
  triggerScore?: number;
  liveScore?: number;
}

interface RankingCardProps {
  company: RankedCompanyItem;
  index: number;
  targetRankedCount: number;
  bersaglioPct?: number;
  triggerPct?: number;
}

// Velocità animazioni per il fronte della scheda
const TYPING_SPEED_MS = 170;

export default function RankingCard({
  company,
  index,
  targetRankedCount,
  bersaglioPct = 50,
  triggerPct = 50,
}: RankingCardProps) {
  const cardRef = useRef<HTMLLIElement>(null);
  const isInView = useInView(cardRef, { once: true, amount: 0.6 });

  const [isFlipped, setIsFlipped] = useState(false);
  const [isSourcesOpen, setIsSourcesOpen] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [isEmailOpen, setIsEmailOpen] = useState(false);
  const [activePersonaTab, setActivePersonaTab] = useState<number>(1);

  const isOutOfRanking = company.rank > targetRankedCount;
  const surfaceClass = index % 2 === 0 ? "m-surface" : "m-surface-2";

  // Dossier di intelligence per l'azienda
  const dossier = company.dossier || getCompanyDossier(company);

  const handleCopyEmail = (e: React.MouseEvent) => {
    e.stopPropagation();
    const textToCopy = `Oggetto: ${dossier.cxiPrimary.emailHook.subject}\n\n${dossier.cxiPrimary.emailHook.body}`;
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(textToCopy);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2200);
    }
  };

  const renderValue = (value: number | string, prefix = "") =>
    typeof value === "number" ? (
      <CountAnimation
        number={value}
        prefix={prefix}
        formatLocale={true}
        startTrigger={isInView}
        className="m-text-4 rv-counter"
      />
    ) : (
      <TypingEffect
        texts={[value]}
        typeOnce={true}
        typingSpeed={TYPING_SPEED_MS}
        startTrigger={isInView}
        showCursor={true}
        className="m-text-4 rv-typing"
      />
    );

  const activePersona =
    dossier.buyerPersonas.find((p) => p.figureNumber === activePersonaTab) ||
    dossier.buyerPersonas[0]!;

  const cardDomId = `company-card-${company.name.toLowerCase().replace(/[^a-z0-9]/g, "-")}`;

  return (
    <li
      id={cardDomId}
      ref={cardRef}
      className="rv-sheet scroll-mt-24"
      style={{ "--i": index } as React.CSSProperties}
    >
      <div className={`rv-flip-card ${isFlipped ? "is-flipped" : ""}`}>
        {/* ==================== FRONTE SCHEDA ==================== */}
        <div className={`rv-card-face rv-card-face--front ${surfaceClass}`}>
          <div className="rv-card-top">
            <div className="rv-rank-block flex items-baseline gap-2.5">
              <span
                className={`m-text-2 rv-rank-number ${
                  isOutOfRanking ? "text-zinc-400 font-medium" : "text-black font-bold"
                }`}
              >
                #{company.rank}
              </span>
              {/* Badge Voto Dinamico aggiornato in tempo reale dallo slider */}
              <span
                className={`text-sm font-mono font-bold px-2.5 py-0.5 rounded ${
                  isOutOfRanking
                    ? "bg-zinc-200/80 text-zinc-600"
                    : "bg-red-50 text-[#d12a1e] border border-red-200"
                }`}
              >
                {(company.liveScore ?? dossier.scoringBreakdown.totalScore).toFixed(1)}
              </span>
              {isOutOfRanking && (
                <span className="text-[11px] font-mono text-zinc-400 lowercase tracking-wider">
                  fuori classifica
                </span>
              )}
            </div>

            <div className="rv-title-block">
              <h3 className="m-text-4 rv-quote">{company.name}</h3>
              <div className="rv-tags">
                <span className="m-text-3 rv-tag rv-tag--cluster">
                  {company.cluster}
                </span>
                <span className="m-text-3 rv-tag rv-tag--sub">
                  {company.subcategory}
                </span>
              </div>
            </div>
          </div>

          <div className="rv-bottom-bar">
            <div className="rv-metrics">
              <div className="rv-metric">
                <span className="m-text-3 rv-metric__label">Fatturato</span>
                <div className="rv-metric__val">
                  {renderValue(company.revenue, "€ ")}
                </div>
              </div>
              <div className="rv-metric">
                <span className="m-text-3 rv-metric__label">Dipendenti</span>
                <div className="rv-metric__val">
                  {renderValue(company.employees)}
                </div>
              </div>
              <div className="rv-metric">
                <span className="m-text-3 rv-metric__label">Sede</span>
                <div className="rv-metric__val">
                  {renderValue(company.headquartersCity || "Milano (MI)")}
                </div>
              </div>
            </div>

            <button
              type="button"
              className="rv-deep-dive-btn"
              onClick={() => setIsFlipped(true)}
              title="Approfondisci dettagli azienda"
            >
              <span className="rv-deep-dive-btn__label">Approfondisci</span>
              <ArrowRight size={15} className="rv-deep-dive-btn__arrow" />
            </button>
          </div>
        </div>

        {/* ==================== RETRO SCHEDA ==================== */}
        <div className={`rv-card-face rv-card-face--back ${surfaceClass}`}>
          {/* Header superiore: Badge rank + Nome azienda + Partita IVA + Scoring + Torna alla scheda */}
          <div className="rv-back-header">
            <div className="rv-back-header-left flex items-baseline gap-2 flex-wrap">
              <span className="rv-back-badge">#{company.rank}</span>
              <h4 className="rv-back-company-name">{company.name}</h4>
              <span className="text-[11px] font-mono text-zinc-600 font-normal">
                P.IVA {company.pIva || "IT09384720159"}
              </span>
            </div>

            {/* Strip di Scoring: Fit e Trigger con percentuali attive dello slider, Voto Finale Rosso */}
            <div className="rv-header-scoring-strip">
              <div className="rv-header-score-item">
                <span className="rv-header-score-label">
                  Fit <span className="text-[9px] text-zinc-400 font-normal">({bersaglioPct}%)</span>
                </span>
                <span className="rv-header-score-val">
                  {(company.bersaglioScore ?? dossier.scoringBreakdown.fitTargetScore).toFixed(1)}
                </span>
              </div>

              <div className="rv-header-score-item">
                <span className="rv-header-score-label">
                  Trigger <span className="text-[9px] text-zinc-400 font-normal">({triggerPct}%)</span>
                </span>
                <span className="rv-header-score-val">
                  {(company.triggerScore ?? dossier.scoringBreakdown.potenzaTriggerScore).toFixed(1)}
                </span>
              </div>

              {/* Malus Persona se presente (> 0) */}
              {dossier.scoringBreakdown.malusPersona > 0 && (
                <div className="rv-header-score-item rv-header-score-item--malus">
                  <span className="rv-header-score-label">Malus</span>
                  <span className="rv-header-score-val">
                    -{dossier.scoringBreakdown.malusPersona.toFixed(2)}
                  </span>
                </div>
              )}

              {/* Voto Finale Rosso Acceso: sincronizzato dinamicamente con lo slider */}
              <div className="rv-header-score-item rv-header-score-item--total">
                <span className="rv-header-score-label">Score</span>
                <span className="rv-header-score-val text-[#d12a1e] font-extrabold">
                  {(company.liveScore ?? dossier.scoringBreakdown.totalScore).toFixed(1)}
                </span>
                <span className="text-[9px] text-[#d12a1e]/70">/10</span>
              </div>
            </div>

            <button
              type="button"
              className="rv-back-return-btn"
              onClick={() => setIsFlipped(false)}
              title="Torna alla scheda"
            >
              <ArrowLeft size={12} className="rv-back-return-btn__icon" />
              <span>Torna alla scheda</span>
            </button>
          </div>

          {/* Body: Colonna sinistra compatta + Area destra user-friendly */}
          <div className="rv-back-body">
            {/* ----------------- COLONNA SINISTRA ----------------- */}
            <aside className="rv-back-col-left">
              {/* 1. Fatturato */}
              <div className="rv-back-field">
                <span className="rv-back-field__label">Fatturato</span>
                <span className="rv-back-field__val rv-back-field__val--strong">
                  {typeof company.revenue === "number"
                    ? `€ ${company.revenue.toLocaleString("it-IT")}`
                    : company.revenue}
                </span>
              </div>

              {/* 2. Dipendenti */}
              <div className="rv-back-field">
                <span className="rv-back-field__label">Dipendenti</span>
                <span className="rv-back-field__val rv-back-field__val--strong">
                  {typeof company.employees === "number"
                    ? `${company.employees.toLocaleString("it-IT")} addetti`
                    : company.employees}
                </span>
              </div>

              {/* 3. Settore */}
              <div className="rv-back-field">
                <span className="rv-back-field__label">Settore</span>
                <span className="rv-back-field__val">{company.cluster}</span>
              </div>

              {/* 4. Sottosettore */}
              <div className="rv-back-field">
                <span className="rv-back-field__label">Sottosettore</span>
                <span className="rv-back-field__val text-[11px] leading-tight">
                  {company.subcategory}
                </span>
              </div>

              {/* 5. Sede */}
              <div className="rv-back-field">
                <div className="rv-back-field__label-row">
                  <MapPin size={11} className="rv-back-field-icon" />
                  <span className="rv-back-field__label">Sede</span>
                </div>
                <span className="rv-back-field__val text-[11.5px] leading-snug">
                  {company.fullAddress ||
                    company.headquartersCity ||
                    "Milano (MI)"}
                </span>
              </div>

              {/* 6. Telefono */}
              <div className="rv-back-field">
                <div className="rv-back-field__label-row">
                  <Phone size={11} className="rv-back-field-icon" />
                  <span className="rv-back-field__label">Telefono</span>
                </div>
                <a
                  href={
                    company.phone
                      ? `tel:${company.phone.replace(/\s+/g, "")}`
                      : "#"
                  }
                  className="rv-back-field__link"
                  onClick={(e) => e.stopPropagation()}
                >
                  <span>{company.phone || "+39 02 0000000"}</span>
                </a>
              </div>

              {/* 7. Sito ufficiale */}
              <div className="rv-back-field">
                <div className="rv-back-field__label-row">
                  <Globe size={11} className="rv-back-field-icon" />
                  <span className="rv-back-field__label">Sito ufficiale</span>
                </div>
                <a
                  href={company.website || "#"}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rv-back-field__link"
                  onClick={(e) => e.stopPropagation()}
                >
                  <span className="rv-back-field__url">
                    {company.website?.replace(/^https?:\/\//, "") || "azienda.it"}
                  </span>
                </a>
              </div>

              {/* 8. Fonti */}
              <div className="rv-back-field rv-back-sources-box">
                <button
                  type="button"
                  className="rv-back-sources-toggle"
                  onClick={() => setIsSourcesOpen((prev) => !prev)}
                  aria-expanded={isSourcesOpen}
                >
                  <span className="rv-back-field__label font-bold text-[var(--color-2)]">
                    Fonti
                  </span>
                  <span className="rv-back-sources-badge">
                    {company.sources?.length || 3}
                  </span>
                  <ChevronDown
                    size={11}
                    className={`rv-back-sources-chevron ${
                      isSourcesOpen ? "is-open" : ""
                    }`}
                  />
                </button>

                <AnimatePresence>
                  {isSourcesOpen && (
                    <motion.ul
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.2, ease: "easeOut" }}
                      className="rv-back-sources-list"
                    >
                      {company.sources && company.sources.length > 0 ? (
                        company.sources.map((src, i) => (
                          <li key={i} className="rv-back-source-item">
                            <a
                              href={src.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="rv-back-source-link"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <span className="rv-back-source-title">
                                {src.title}
                              </span>
                              <ExternalLink
                                size={10}
                                className="rv-back-source-icon"
                              />
                            </a>
                          </li>
                        ))
                      ) : (
                        <li className="rv-back-source-empty">
                          Registro Imprese verificato
                        </li>
                      )}
                    </motion.ul>
                  )}
                </AnimatePresence>
              </div>
            </aside>

            {/* ----------------- COLONNA DESTRA (User-Friendly & Pulita) ----------------- */}
            <section className="rv-back-col-right">
              <div className="rv-back-right-scroll-container">
                {/* 1. INFORMAZIONI CHIAVE SULL'AZIENDA */}
                <div className="rv-back-card">
                  <h5 className="rv-back-card-title">
                    INFORMAZIONI CHIAVE SULL&apos;AZIENDA
                  </h5>
                  <p className="rv-back-prose">
                    {dossier.keyInfo.summary}{" "}
                    <u className="rv-back-emphasis">Core business:</u> {dossier.keyInfo.coreBusiness}{" "}
                    <u className="rv-back-emphasis">Mercati:</u> {dossier.keyInfo.markets}
                  </p>
                </div>

                {/* 2. DOPPIO MATCHING SERVIZI CXI PERTINENTI */}
                <div className="rv-back-card rv-back-card--cxi">
                  <div className="flex items-center justify-between pb-1.5 border-b border-[var(--color-8)]/50">
                    <h5 className="rv-back-card-title">
                      DOPPIO MATCHING SERVIZI CXI PERTINENTI
                    </h5>
                    {/* Scritta OPPORTUNITÀ PRIORITARIA in nero grassetto */}
                    <span className="text-[10px] uppercase font-bold text-black tracking-wider">
                      OPPORTUNITÀ PRIORITARIA
                    </span>
                  </div>

                  {/* Soluzione Principale */}
                  <div className="rv-cxi-item">
                    <div className="rv-cxi-head-row flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="rv-cxi-pill rv-cxi-pill--primary">
                          Soluzione Principale: {dossier.cxiPrimary.name}
                        </span>
                        {dossier.cxiPrimary.year && (
                          <span className="rv-cxi-pill rv-cxi-pill--year">
                            {dossier.cxiPrimary.year}
                          </span>
                        )}
                      </div>

                      {/* Tasto Mostra/Nascondi bozza mail: sfondo coordinato (grigio su m-surface-2, bianco su m-surface), testo nero, bordo rosso e larghezza fissa antiriflesso */}
                      <button
                        type="button"
                        className={`inline-flex items-center justify-center w-[184px] shrink-0 h-[30px] px-3.5 rounded text-[12.5px] font-semibold text-black border border-[#d12a1e] transition-all duration-150 cursor-pointer hover:opacity-85 ${
                          surfaceClass === "m-surface-2" ? "bg-[#eaeaea]" : "bg-white"
                        }`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setIsEmailOpen(!isEmailOpen);
                        }}
                      >
                        {isEmailOpen ? "Nascondi bozza mail" : "Mostra bozza mail"}
                      </button>
                    </div>

                    <div className="rv-cxi-content">
                      <p>
                        <u className="rv-back-emphasis">Servizio Proposto:</u>{" "}
                        <span>{dossier.cxiPrimary.tailoredService}</span>
                      </p>
                      <p>
                        <u className="rv-back-emphasis">Contesto Operativo:</u>{" "}
                        <span>{dossier.cxiPrimary.trigger}</span>
                      </p>
                    </div>

                    {/* Bozza Email Espandibile con tasto 'copia mail' bianco */}
                    <AnimatePresence>
                      {isEmailOpen && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.22, ease: "easeOut" }}
                          className="rv-email-drawer"
                        >
                          <div className="rv-email-box">
                            <div className="flex items-center justify-between pb-1 mb-1 border-b border-black/10">
                              <span className="rv-email-header">
                                Bozza Email Personalizzata ({activePersona.figureNumber === 1 ? "COO" : "CIO / CDO"})
                              </span>

                              {/* Tasto Copia Mail: spostato qui, rimane bianco quando attivato */}
                              <button
                                type="button"
                                className="inline-flex items-center gap-1.5 px-3 py-1 rounded bg-white text-black border border-black/20 hover:bg-zinc-100 transition-colors text-xs font-semibold shadow-xs cursor-pointer"
                                onClick={handleCopyEmail}
                                title="Copia l'intero testo dell'email"
                              >
                                {isCopied ? (
                                  <>
                                    <Check size={12} className="text-emerald-600" />
                                    <span className="text-emerald-600 font-semibold">
                                      Copiato!
                                    </span>
                                  </>
                                ) : (
                                  <>
                                    <Copy size={12} className="text-black" />
                                    <span>Copia mail</span>
                                  </>
                                )}
                              </button>
                            </div>

                            <div className="rv-email-subject">
                              <strong>Oggetto: </strong>
                              {dossier.cxiPrimary.emailHook.subject}
                            </div>
                            <div className="rv-email-body whitespace-pre-line">
                              {dossier.cxiPrimary.emailHook.body}
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  {/* Soluzione Secondaria */}
                  <div className="rv-cxi-item rv-cxi-item--secondary">
                    <div className="rv-cxi-head-row">
                      <span className="rv-cxi-pill rv-cxi-pill--secondary">
                        Soluzione Secondaria: {dossier.cxiSecondary.name}
                      </span>
                    </div>

                    <div className="rv-cxi-content">
                      <p>
                        <u className="rv-back-emphasis">Servizio Proposto:</u>{" "}
                        <span>{dossier.cxiSecondary.tailoredService}</span>
                      </p>
                      <p>
                        <u className="rv-back-emphasis">Contesto Operativo:</u>{" "}
                        <span>{dossier.cxiSecondary.trigger}</span>
                      </p>
                    </div>
                  </div>
                </div>

                {/* 3. INTERLOCUTORI & BUYER PERSONAS TARGET */}
                <div className="rv-back-card">
                  <div className="flex items-center justify-between pb-1.5 border-b border-[var(--color-8)]/50">
                    <h5 className="rv-back-card-title">
                      INTERLOCUTORI & 2 BUYER PERSONAS TARGET
                    </h5>
                    {/* Due tasti per scegliere la figura buyer: sfondo bianco, testo nero; attiva ha bordo rosso, inattiva bordo nero */}
                    <div className="flex items-center gap-2">
                      {dossier.buyerPersonas.map((persona) => {
                        const isActive = activePersonaTab === persona.figureNumber;
                        const roleLabel =
                          persona.figureNumber === 1
                            ? "Figura #1 (COO)"
                            : "Figura #2 (CIO / CDO)";
                        return (
                          <button
                            key={persona.figureNumber}
                            type="button"
                            className={`inline-flex items-center justify-center h-[30px] px-3.5 rounded text-[12.5px] transition-all duration-150 cursor-pointer bg-white text-black ${
                              isActive
                                ? "border-2 border-[#d12a1e] font-bold shadow-xs"
                                : "border border-black/35 font-medium hover:border-black"
                            }`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setActivePersonaTab(persona.figureNumber);
                            }}
                          >
                            {roleLabel}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Scheda Interlocutore Attivo: rimosso rettangolo Figura #1 / #2 di fianco al nome */}
                  <div className="rv-persona-view">
                    <div className="flex items-center justify-between">
                      {/* Solo il nome del ruolo, senza rettangolo Figura #1/#2 */}
                      <h6 className="rv-persona-role-title">
                        {activePersona.role}
                      </h6>

                      {/* Scritta DECISORE ECONOMICO in nero grassetto */}
                      <span className="text-[11px] uppercase font-bold text-black tracking-wide">
                        {activePersona.figureNumber === 1
                          ? "DECISORE ECONOMICO"
                          : "SPONSOR STRATEGICO"}
                      </span>
                    </div>

                    <div className="rv-persona-rows">
                      <p>
                        <u className="rv-back-emphasis">Ruolo Decisionale:</u>{" "}
                        <span>{activePersona.decisionLevel}</span>
                      </p>
                      <p>
                        <u className="rv-back-emphasis">Priorità Chiave:</u>{" "}
                        <span>{activePersona.interests}</span>
                      </p>
                      <p>
                        <u className="rv-back-emphasis">Approccio Consigliato:</u>{" "}
                        <span>{activePersona.firstMessageAngle}</span>
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </li>
  );
}
