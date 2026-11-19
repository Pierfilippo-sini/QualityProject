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
  sources?: CompanySourceLink[];
  dossier?: CompanyDossier;
}

interface RankingCardProps {
  company: RankedCompanyItem;
  index: number;
  targetRankedCount: number;
}

// Velocità animazioni per il fronte della scheda
const TYPING_SPEED_MS = 170;

export default function RankingCard({
  company,
  index,
  targetRankedCount,
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
    dossier.buyerPersonas[0];

  return (
    <li
      ref={cardRef}
      className="rv-sheet"
      style={{ "--i": index } as React.CSSProperties}
    >
      <div className={`rv-flip-card ${isFlipped ? "is-flipped" : ""}`}>
        {/* ==================== FRONTE SCHEDA ==================== */}
        <div className={`rv-card-face rv-card-face--front ${surfaceClass}`}>
          <div className="rv-card-top">
            <div className="rv-rank-block">
              <span
                className={`m-text-2 rv-rank-number ${
                  isOutOfRanking ? "is-out" : "is-in-rank"
                }`}
              >
                #{company.rank}
              </span>
              {isOutOfRanking && (
                <span className="m-text-3 rv-out-label">Fuori classifica</span>
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
          {/* Header superiore: Badge rank + Nome azienda + Scoring ultra-compatto + Torna alla scheda */}
          <div className="rv-back-header">
            <div className="rv-back-header-left">
              <span className="rv-back-badge">#{company.rank}</span>
              <h4 className="rv-back-company-name">{company.name}</h4>
            </div>

            {/* Strip di Scoring compatta inserita nell'header (zero spazio sprecato) */}
            <div className="rv-header-scoring-strip">
              <div className="rv-header-score-item">
                <span className="rv-header-score-label">Fit</span>
                <span className="rv-header-score-val">
                  {dossier.scoringBreakdown.fitTargetScore.toFixed(1)}
                </span>
              </div>

              <div className="rv-header-score-item">
                <span className="rv-header-score-label">Trigger</span>
                <span className="rv-header-score-val">
                  {dossier.scoringBreakdown.potenzaTriggerScore.toFixed(1)}
                </span>
              </div>

              {/* Malus Persona incluso SOLTANTO se presente (> 0) */}
              {dossier.scoringBreakdown.malusPersona > 0 && (
                <div className="rv-header-score-item rv-header-score-item--malus">
                  <span className="rv-header-score-label">Malus</span>
                  <span className="rv-header-score-val">
                    -{dossier.scoringBreakdown.malusPersona.toFixed(2)}
                  </span>
                </div>
              )}

              <div className="rv-header-score-item rv-header-score-item--total">
                <span className="rv-header-score-label">Score</span>
                <span className="rv-header-score-val">
                  {dossier.scoringBreakdown.totalScore.toFixed(1)}
                </span>
                <span className="text-[9px] opacity-70">/10</span>
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

              {/* 4. Sottosettore (subito sotto settore) */}
              <div className="rv-back-field">
                <span className="rv-back-field__label">Sottosettore</span>
                <span className="rv-back-field__val text-[11px] leading-tight">
                  {company.subcategory}
                </span>
              </div>

              {/* 5. Sede (Indirizzo preciso con icona allineata al titolo) */}
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

              {/* 6. Telefono (con icona allineata al titolo) */}
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

              {/* 7. Sito ufficiale (con icona allineata al titolo) */}
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

              {/* 8. Fonti (la voce più in basso) */}
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
                {/* 1. INFORMAZIONI CHIAVE SULL'AZIENDA (Trafiletto Unico senza divisori) */}
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

                {/* 2. DOPPIO MATCHING SERVIZI CXI PERTINENTI (Sezione Principale) */}
                <div className="rv-back-card rv-back-card--cxi">
                  <div className="flex items-center justify-between pb-1.5 border-b border-[var(--color-8)]/50">
                    <h5 className="rv-back-card-title">
                      DOPPIO MATCHING SERVIZI CXI PERTINENTI
                    </h5>
                    <span className="text-[10px] uppercase font-bold text-[var(--color-6)] tracking-wider">
                      Opportunità Prioritaria
                    </span>
                  </div>

                  {/* Soluzione Principale */}
                  <div className="rv-cxi-item">
                    <div className="rv-cxi-head-row">
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

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          className="rv-action-btn rv-action-btn--email-toggle"
                          onClick={(e) => {
                            e.stopPropagation();
                            setIsEmailOpen(!isEmailOpen);
                          }}
                        >
                          {isEmailOpen ? "Nascondi Bozza Email" : "Mostra Bozza Email"}
                        </button>

                        {isEmailOpen && (
                          <button
                            type="button"
                            className="rv-action-btn rv-action-btn--primary"
                            onClick={handleCopyEmail}
                            title="Copia l'intero gancio mail"
                          >
                            {isCopied ? (
                              <>
                                <Check size={12} className="text-emerald-600" />
                                <span className="text-emerald-700 font-semibold">
                                  Copiato!
                                </span>
                              </>
                            ) : (
                              <>
                                <Copy size={12} />
                                <span>Copia Gancio Mail</span>
                              </>
                            )}
                          </button>
                        )}
                      </div>
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

                    {/* Bozza Email Espandibile (nascosta di default) */}
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
                            <div className="rv-email-header">
                              Bozza Email Personalizzata (COO)
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

                {/* 3. INTERLOCUTORI & BUYER PERSONAS TARGET (Con selettore a Tab per massima chiarezza) */}
                <div className="rv-back-card">
                  <div className="flex items-center justify-between pb-1.5 border-b border-[var(--color-8)]/50">
                    <h5 className="rv-back-card-title">
                      INTERLOCUTORI & 2 BUYER PERSONAS TARGET
                    </h5>
                    {/* Selettore a Tab minimalista */}
                    <div className="rv-persona-tabs">
                      {dossier.buyerPersonas.map((persona) => (
                        <button
                          key={persona.figureNumber}
                          type="button"
                          className={`rv-persona-tab ${
                            activePersonaTab === persona.figureNumber
                              ? "is-active"
                              : ""
                          }`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setActivePersonaTab(persona.figureNumber);
                          }}
                        >
                          Figura #{persona.figureNumber}: {persona.figureNumber === 1 ? "COO" : "CIO / CDO"}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Scheda Interlocutore Attivo: ariosa, chiara, senza affollamento */}
                  <div className="rv-persona-view">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="rv-persona-tag">
                          Figura #{activePersona.figureNumber}
                        </span>
                        <h6 className="rv-persona-role-title">
                          {activePersona.role}
                        </h6>
                      </div>
                      <span className="text-[11px] uppercase font-bold text-[var(--color-6)] tracking-wide">
                        {activePersona.figureNumber === 1
                          ? "Decisore Economico"
                          : "Sponsor Strategico"}
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
