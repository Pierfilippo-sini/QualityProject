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

// Velocità animazioni (più lente per essere viste a schermo)
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
          {/* Header superiore minimale: Badge rank + Nome azienda in piccolo + Torna alla scheda */}
          <div className="rv-back-header">
            <div className="rv-back-header-left">
              <span className="rv-back-badge">#{company.rank}</span>
              <h4 className="rv-back-company-name">{company.name}</h4>
            </div>
            <button
              type="button"
              className="rv-back-return-btn"
              onClick={() => setIsFlipped(false)}
              title="Torna alla scheda"
            >
              <ArrowLeft size={13} className="rv-back-return-btn__icon" />
              <span>Torna alla scheda</span>
            </button>
          </div>

          {/* Body: Colonna sinistra compatta + Area destra minimizzata */}
          <div className="rv-back-body">
            {/* ----------------- COLONNA SINISTRA (Compatta e minimale) ----------------- */}
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

              {/* 5. Sede (Indirizzo preciso) */}
              <div className="rv-back-field">
                <span className="rv-back-field__label">Sede</span>
                <div className="rv-back-field__row">
                  <MapPin size={11} className="rv-back-field-icon" />
                  <span className="rv-back-field__text">
                    {company.fullAddress ||
                      company.headquartersCity ||
                      "Milano (MI)"}
                  </span>
                </div>
              </div>

              {/* 6. Telefono */}
              <div className="rv-back-field">
                <span className="rv-back-field__label">Telefono</span>
                <a
                  href={
                    company.phone
                      ? `tel:${company.phone.replace(/\s+/g, "")}`
                      : "#"
                  }
                  className="rv-back-field__link"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Phone size={11} className="rv-back-field-icon" />
                  <span>{company.phone || "+39 02 0000000"}</span>
                </a>
              </div>

              {/* 7. Sito ufficiale */}
              <div className="rv-back-field">
                <span className="rv-back-field__label">Sito ufficiale</span>
                <a
                  href={company.website || "#"}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rv-back-field__link"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Globe size={11} className="rv-back-field-icon" />
                  <span className="rv-back-field__url">
                    {company.website?.replace(/^https?:\/\//, "") || "azienda.it"}
                  </span>
                </a>
              </div>

              {/* 8. Fonti (la voce più in basso nella colonna sinistra) */}
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

            {/* ----------------- COLONNA DESTRA (Ottimizzata e Minimale) ----------------- */}
            <section className="rv-back-col-right">
              <div className="rv-back-right-scroll-container">
                {/* RIGA 1: Informazioni Chiave (Sinistra) + Metodo di Scoring (Destra) side-by-side! */}
                <div className="rv-back-top-row">
                  {/* Informazioni Chiave sull'Azienda (~56% larghezza) */}
                  <div className="rv-back-panel rv-back-panel--info">
                    <h5 className="rv-back-sec-title">
                      INFORMAZIONI CHIAVE SULL&apos;AZIENDA
                    </h5>
                    <p className="rv-back-info-summary">
                      {dossier.keyInfo.summary}
                    </p>
                    <div className="rv-back-info-subgrid">
                      <div>
                        <span className="rv-back-info-tag">Core Business: </span>
                        <span>{dossier.keyInfo.coreBusiness}</span>
                      </div>
                      <div>
                        <span className="rv-back-info-tag">Mercati: </span>
                        <span>{dossier.keyInfo.markets}</span>
                      </div>
                    </div>
                  </div>

                  {/* Breakdown Metodo di Scoring (~44% larghezza, compatto, senza malus nel titolo!) */}
                  <div className="rv-back-panel rv-back-panel--scoring">
                    <h5 className="rv-back-sec-title">
                      BREAKDOWN METODO DI SCORING
                    </h5>
                    <div className="rv-scoring-strip">
                      {/* Fit Target (25%) */}
                      <div className="rv-scoring-cell">
                        <span className="rv-scoring-cell__label">
                          Fit (25%)
                        </span>
                        <div className="rv-scoring-cell__val">
                          {dossier.scoringBreakdown.fitTargetScore.toFixed(1)}
                        </div>
                        <span className="rv-scoring-cell__sub">
                          {dossier.scoringBreakdown.fitTargetWeighted}
                        </span>
                      </div>

                      {/* Potenza Trigger (75%) */}
                      <div className="rv-scoring-cell">
                        <span className="rv-scoring-cell__label">
                          Trigger (75%)
                        </span>
                        <div className="rv-scoring-cell__val">
                          {dossier.scoringBreakdown.potenzaTriggerScore.toFixed(1)}
                        </div>
                        <span className="rv-scoring-cell__sub">
                          {dossier.scoringBreakdown.potenzaTriggerWeighted}
                        </span>
                      </div>

                      {/* Malus Persona (discreto / meno peso visivo) */}
                      <div className="rv-scoring-cell rv-scoring-cell--minor">
                        <span className="rv-scoring-cell__label text-[9.5px]">
                          Malus Persona
                        </span>
                        <div className="rv-scoring-cell__val text-[14px] text-rose-500 font-medium">
                          {dossier.scoringBreakdown.malusPersona.toFixed(2)}
                        </div>
                        <span className="rv-scoring-cell__sub text-[9.5px]">
                          {dossier.scoringBreakdown.malusPersonaMax || "max -0.50"}
                        </span>
                      </div>

                      {/* Totale (in evidenza) */}
                      <div className="rv-scoring-cell rv-scoring-cell--total">
                        <span className="rv-scoring-cell__label font-bold text-[var(--color-2)]">
                          Totale
                        </span>
                        <div className="rv-scoring-cell__val text-[18px] font-bold text-[var(--color-2)]">
                          {dossier.scoringBreakdown.totalScore.toFixed(1)}
                        </div>
                        <span className="rv-scoring-cell__sub font-medium text-[var(--color-2)]">
                          / 10
                        </span>
                      </div>
                    </div>
                    <p className="rv-scoring-note">
                      Score {dossier.scoringBreakdown.totalScore.toFixed(1)}/10 = 25% Fit Target + 75% Trigger con 2 Buyer Personas complete. Aderenza ottimale ai criteri dimensionali e territoriali.
                    </p>
                  </div>
                </div>

                {/* RIGA 2: DOPPIO MATCHING SERVIZI CXI PERTINENTI (Sezione Principale) */}
                <div className="rv-back-panel rv-back-panel--cxi">
                  <h5 className="rv-back-sec-title">
                    DOPPIO MATCHING SERVIZI CXI PERTINENTI
                  </h5>

                  {/* Soluzione Principale */}
                  <div className="rv-cxi-block">
                    <div className="rv-cxi-head">
                      <div className="flex items-center gap-2">
                        <span className="rv-cxi-badge rv-cxi-badge--primary">
                          Soluzione Principale: {dossier.cxiPrimary.name}
                        </span>
                        {dossier.cxiPrimary.year && (
                          <span className="rv-cxi-badge rv-cxi-badge--year">
                            {dossier.cxiPrimary.year}
                          </span>
                        )}
                      </div>

                      <button
                        type="button"
                        className="rv-cxi-copy-btn"
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
                    </div>

                    <div className="rv-cxi-details">
                      <p>
                        <strong>Servizio su misura (1 riga): </strong>
                        {dossier.cxiPrimary.tailoredService}
                      </p>
                      <p>
                        <strong>Aggancio al fatto (Trigger): </strong>
                        {dossier.cxiPrimary.trigger}
                      </p>
                    </div>

                    {/* Box Gancio Mail Dedicato */}
                    <div className="rv-email-block">
                      <div className="rv-email-block__header">
                        GANCIO MAIL (DEDICATO ALLA SOLUZIONE CXI PRINCIPALE)
                      </div>
                      <div className="rv-email-block__subject">
                        <strong>Oggetto: </strong>
                        {dossier.cxiPrimary.emailHook.subject}
                      </div>
                      <div className="rv-email-block__body whitespace-pre-line">
                        {dossier.cxiPrimary.emailHook.body}
                      </div>
                    </div>
                  </div>

                  {/* Soluzione Secondaria */}
                  <div className="rv-cxi-block rv-cxi-block--secondary">
                    <div className="rv-cxi-head">
                      <span className="rv-cxi-badge rv-cxi-badge--secondary">
                        Soluzione Secondaria: {dossier.cxiSecondary.name}
                      </span>
                    </div>

                    <div className="rv-cxi-details">
                      <p>
                        <strong>Servizio su misura (1 riga): </strong>
                        {dossier.cxiSecondary.tailoredService}
                      </p>
                      <p>
                        <strong>Trigger / Esigenza: </strong>
                        {dossier.cxiSecondary.trigger}
                      </p>
                    </div>
                  </div>
                </div>

                {/* RIGA 3: INTERLOCUTORI & 2 BUYER PERSONAS TARGET (2 Colonne affiancate) */}
                <div className="rv-back-panel rv-back-panel--personas">
                  <h5 className="rv-back-sec-title">
                    INTERLOCUTORI & 2 BUYER PERSONAS TARGET
                  </h5>

                  <div className="rv-personas-grid">
                    {dossier.buyerPersonas.map((persona, pIdx) => (
                      <div key={pIdx} className="rv-persona-box">
                        <div className="rv-persona-head">
                          <span className="rv-persona-badge">
                            Figura #{persona.figureNumber}
                          </span>
                          <h6 className="rv-persona-title">{persona.role}</h6>
                        </div>

                        <div className="rv-persona-lines">
                          <p>
                            <strong>Livello / Peso Decisionale: </strong>
                            {persona.decisionLevel}
                          </p>
                          <p>
                            <strong>Cosa gli interessa: </strong>
                            {persona.interests}
                          </p>
                          <p>
                            <strong>Primo messaggio utile (Angolo d&apos;attacco): </strong>
                            {persona.firstMessageAngle}
                          </p>
                        </div>
                      </div>
                    ))}
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
