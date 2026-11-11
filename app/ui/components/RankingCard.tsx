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
  Sparkles,
  Building2,
  Users,
  Scale,
  Copy,
  Check,
  Target,
  MessageSquare,
  Info,
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

  // Sezioni per lo scroll rapido nel retro della scheda
  const secInfoRef = useRef<HTMLDivElement>(null);
  const secCxiRef = useRef<HTMLDivElement>(null);
  const secPersonasRef = useRef<HTMLDivElement>(null);
  const secScoringRef = useRef<HTMLDivElement>(null);

  const isOutOfRanking = company.rank > targetRankedCount;
  const surfaceClass = index % 2 === 0 ? "m-surface" : "m-surface-2";

  // Ottiene il dossier approfondito di intelligence per questa azienda
  const dossier = company.dossier || getCompanyDossier(company);

  const handleCopyEmail = (e: React.MouseEvent) => {
    e.stopPropagation();
    const textToCopy = `Oggetto: ${dossier.cxiPrimary.emailHook.subject}\n\n${dossier.cxiPrimary.emailHook.body}`;
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(textToCopy);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2400);
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
              <ArrowRight size={16} className="rv-deep-dive-btn__arrow" />
            </button>
          </div>
        </div>

        {/* ==================== RETRO SCHEDA ==================== */}
        <div className={`rv-card-face rv-card-face--back ${surfaceClass}`}>
          {/* Header superiore: Nome azienda in piccolo + Torna alla scheda */}
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

          {/* Body: Colonna sinistra ultra-compatta + Colonna destra espansa */}
          <div className="rv-back-body">
            {/* ----------------- COLONNA SINISTRA (Compatta) ----------------- */}
            <aside className="rv-back-col-left">
              {/* 1. Fatturato (immediato) */}
              <div className="rv-back-field">
                <span className="rv-back-field__label">Fatturato</span>
                <span className="rv-back-field__val rv-back-field__val--strong">
                  {typeof company.revenue === "number"
                    ? `€ ${company.revenue.toLocaleString("it-IT")}`
                    : company.revenue}
                </span>
              </div>

              {/* 2. Dipendenti (immediato) */}
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

              {/* 4. Sottosettore (subito sotto il settore) */}
              <div className="rv-back-field">
                <span className="rv-back-field__label">Sottosettore</span>
                <span className="rv-back-field__val text-xs leading-snug">
                  {company.subcategory}
                </span>
              </div>

              {/* 5. Sede (Indirizzo preciso) */}
              <div className="rv-back-field">
                <span className="rv-back-field__label">Sede (Indirizzo)</span>
                <div className="rv-back-field__row">
                  <MapPin size={12} className="rv-back-field-icon" />
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
                  <Phone size={12} className="rv-back-field-icon" />
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
                  <Globe size={12} className="rv-back-field-icon" />
                  <span className="rv-back-field__url">
                    {company.website?.replace(/^https?:\/\//, "") || "azienda.it"}
                  </span>
                </a>
              </div>

              {/* 8. Fonti (la voce più in basso nella colonna sinistra!) */}
              <div className="rv-back-field rv-back-sources-box mt-auto pt-2 border-t border-[var(--color-8)]">
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
                    size={13}
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
                      transition={{ duration: 0.22, ease: "easeOut" }}
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
                          Registro Imprese C.C.I.A.A. verificato
                        </li>
                      )}
                    </motion.ul>
                  )}
                </AnimatePresence>
              </div>
            </aside>

            {/* ----------------- COLONNA DESTRA (Dossier Completo) ----------------- */}
            <section className="rv-back-col-right">
              {/* Barra di Navigazione Rapida con Anchor Pills */}
              <div className="rv-back-nav-bar">
                <button
                  type="button"
                  className="rv-back-nav-pill"
                  onClick={(e) => {
                    e.stopPropagation();
                    secInfoRef.current?.scrollIntoView({
                      behavior: "smooth",
                      block: "nearest",
                    });
                  }}
                >
                  <Building2 size={12} />
                  <span>Info Chiave</span>
                </button>
                <button
                  type="button"
                  className="rv-back-nav-pill is-active"
                  onClick={(e) => {
                    e.stopPropagation();
                    secCxiRef.current?.scrollIntoView({
                      behavior: "smooth",
                      block: "nearest",
                    });
                  }}
                >
                  <Sparkles size={12} className="text-amber-500" />
                  <span>Servizi CXI</span>
                </button>
                <button
                  type="button"
                  className="rv-back-nav-pill"
                  onClick={(e) => {
                    e.stopPropagation();
                    secPersonasRef.current?.scrollIntoView({
                      behavior: "smooth",
                      block: "nearest",
                    });
                  }}
                >
                  <Users size={12} />
                  <span>Buyer Personas</span>
                </button>
                <button
                  type="button"
                  className="rv-back-nav-pill"
                  onClick={(e) => {
                    e.stopPropagation();
                    secScoringRef.current?.scrollIntoView({
                      behavior: "smooth",
                      block: "nearest",
                    });
                  }}
                >
                  <Scale size={12} />
                  <span>Scoring</span>
                </button>
              </div>

              {/* Feed Scorrevole dei Contenuti di Intelligence */}
              <div className="rv-back-right-scroll-container">
                {/* 1. INFORMAZIONI CHIAVE SULL'AZIENDA */}
                <div ref={secInfoRef} className="rv-dossier-card">
                  <div className="rv-dossier-card__header">
                    <div className="rv-dossier-title">
                      <Building2 size={15} className="text-[var(--color-2)]" />
                      <span>INFORMAZIONI CHIAVE SULL&apos;AZIENDA</span>
                    </div>
                  </div>

                  <div className="flex flex-col gap-3 text-[13px] leading-relaxed text-[var(--color-2)]">
                    <p className="rv-key-summary">{dossier.keyInfo.summary}</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 border-t border-[var(--color-8)]/60 text-xs">
                      <div>
                        <span className="font-bold text-[var(--color-4)] uppercase tracking-wider block mb-1">
                          Core Business & Servitizzazione
                        </span>
                        <p>{dossier.keyInfo.coreBusiness}</p>
                      </div>
                      <div>
                        <span className="font-bold text-[var(--color-4)] uppercase tracking-wider block mb-1">
                          Presidio Territoriale & Mercati
                        </span>
                        <p>{dossier.keyInfo.markets}</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 2. DOPPIO MATCHING SERVIZI CXI PERTINENTI (Sezione Principale) */}
                <div
                  ref={secCxiRef}
                  className="rv-dossier-card rv-dossier-card--featured"
                >
                  <div className="rv-dossier-card__header">
                    <div className="rv-dossier-title">
                      <Sparkles size={16} className="text-amber-500 fill-amber-500/20" />
                      <span>DOPPIO MATCHING SERVIZI CXI PERTINENTI</span>
                    </div>
                  </div>

                  {/* Soluzione Principale */}
                  <div className="rv-cxi-solution-card">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <span className="rv-cxi-pill-primary">
                          Soluzione Principale: {dossier.cxiPrimary.name}
                        </span>
                        {dossier.cxiPrimary.year && (
                          <span className="rv-cxi-pill-year">
                            {dossier.cxiPrimary.year}
                          </span>
                        )}
                      </div>

                      <button
                        type="button"
                        className="rv-cxi-copy-btn"
                        onClick={handleCopyEmail}
                        title="Copia l'intero gancio mail negli appunti"
                      >
                        {isCopied ? (
                          <>
                            <Check size={13} className="text-emerald-600" />
                            <span className="text-emerald-700 font-semibold">
                              Gancio Copiato!
                            </span>
                          </>
                        ) : (
                          <>
                            <Copy size={13} />
                            <span>Copia Gancio Mail</span>
                          </>
                        )}
                      </button>
                    </div>

                    <div className="flex flex-col gap-2 text-[13px] leading-relaxed">
                      <p>
                        <strong className="font-semibold text-[var(--color-2)]">
                          Servizio su misura (1 riga):{" "}
                        </strong>
                        {dossier.cxiPrimary.tailoredService}
                      </p>
                      <p>
                        <strong className="font-semibold text-[var(--color-2)]">
                          Aggancio al fatto (Trigger):{" "}
                        </strong>
                        {dossier.cxiPrimary.trigger}
                      </p>
                    </div>

                    {/* Nested Gancio Mail Dedicato */}
                    <div className="rv-email-box">
                      <div className="rv-email-box__tag">
                        GANCIO MAIL (DEDICATO ALLA SOLUZIONE CXI PRINCIPALE)
                      </div>
                      <div className="rv-email-box__subject">
                        <strong className="text-[var(--color-2)]">
                          Oggetto:{" "}
                        </strong>
                        {dossier.cxiPrimary.emailHook.subject}
                      </div>
                      <div className="rv-email-box__body whitespace-pre-line">
                        {dossier.cxiPrimary.emailHook.body}
                      </div>
                    </div>
                  </div>

                  {/* Soluzione Secondaria */}
                  <div className="rv-cxi-solution-card">
                    <div className="flex items-center gap-2">
                      <span className="rv-cxi-pill-secondary">
                        Soluzione Secondaria: {dossier.cxiSecondary.name}
                      </span>
                    </div>

                    <div className="flex flex-col gap-2 text-[13px] leading-relaxed">
                      <p>
                        <strong className="font-semibold text-[var(--color-2)]">
                          Servizio su misura (1 riga):{" "}
                        </strong>
                        {dossier.cxiSecondary.tailoredService}
                      </p>
                      <p>
                        <strong className="font-semibold text-[var(--color-2)]">
                          Trigger / Esigenza:{" "}
                        </strong>
                        {dossier.cxiSecondary.trigger}
                      </p>
                    </div>
                  </div>
                </div>

                {/* 3. INTERLOCUTORI & 2 BUYER PERSONAS TARGET */}
                <div ref={secPersonasRef} className="rv-dossier-card">
                  <div className="rv-dossier-card__header">
                    <div className="rv-dossier-title">
                      <Users size={15} className="text-[var(--color-2)]" />
                      <span>INTERLOCUTORI & 2 BUYER PERSONAS TARGET</span>
                    </div>
                  </div>

                  <div className="flex flex-col gap-3">
                    {dossier.buyerPersonas.map((persona, pIdx) => (
                      <div key={pIdx} className="rv-persona-card">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="rv-persona-tag">
                            Figura #{persona.figureNumber}
                          </span>
                          <h5 className="font-bold text-[14px] text-[var(--color-2)]">
                            {persona.role}
                          </h5>
                        </div>

                        <div className="flex flex-col gap-1.5 text-[12.5px] leading-relaxed">
                          <p>
                            <strong className="font-semibold text-[var(--color-2)]">
                              Livello / Peso Decisionale:{" "}
                            </strong>
                            {persona.decisionLevel}
                          </p>
                          <p className="flex items-start gap-1.5">
                            <span className="text-amber-500 font-bold shrink-0">
                              🎯
                            </span>
                            <span>
                              <strong className="font-semibold text-[var(--color-2)]">
                                Cosa gli interessa:{" "}
                              </strong>
                              {persona.interests}
                            </span>
                          </p>
                          <p className="flex items-start gap-1.5">
                            <span className="text-sky-500 font-bold shrink-0">
                              💭
                            </span>
                            <span>
                              <strong className="font-semibold text-[var(--color-2)]">
                                Primo messaggio utile (Angolo d&apos;attacco):{" "}
                              </strong>
                              {persona.firstMessageAngle}
                            </span>
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 4. BREAKDOWN METODO DI SCORING (senza malus persona nel titolo!) */}
                <div ref={secScoringRef} className="rv-dossier-card">
                  <div className="rv-dossier-card__header">
                    <div className="rv-dossier-title">
                      <Scale size={15} className="text-[var(--color-2)]" />
                      <span>BREAKDOWN METODO DI SCORING</span>
                    </div>
                  </div>

                  {/* Grid 4 tessere scoring: Fit Target e Potenza Trigger in risalto, Malus Persona discreto */}
                  <div className="rv-scoring-grid">
                    {/* Box 1: Fit Target (25%) */}
                    <div className="rv-scoring-box rv-scoring-box--main">
                      <span className="rv-scoring-label">Fit Target (25%)</span>
                      <div className="rv-scoring-val">
                        {dossier.scoringBreakdown.fitTargetScore.toFixed(1)}
                      </div>
                      <span className="rv-scoring-sub">
                        {dossier.scoringBreakdown.fitTargetWeighted}
                      </span>
                    </div>

                    {/* Box 2: Potenza Trigger (75%) */}
                    <div className="rv-scoring-box rv-scoring-box--main">
                      <span className="rv-scoring-label">
                        Potenza Trigger (75%)
                      </span>
                      <div className="rv-scoring-val">
                        {dossier.scoringBreakdown.potenzaTriggerScore.toFixed(1)}
                      </div>
                      <span className="rv-scoring-sub">
                        {dossier.scoringBreakdown.potenzaTriggerWeighted}
                      </span>
                    </div>

                    {/* Box 3: Malus Persona (visivamente più discreto/meno peso) */}
                    <div className="rv-scoring-box rv-scoring-box--minor">
                      <span className="rv-scoring-label text-[10.5px]">
                        Malus Persona
                      </span>
                      <div className="rv-scoring-val text-[19px] font-semibold text-rose-500/80">
                        {dossier.scoringBreakdown.malusPersona.toFixed(2)}
                      </div>
                      <span className="rv-scoring-sub text-[10px]">
                        {dossier.scoringBreakdown.malusPersonaMax || "max -0.50"}
                      </span>
                    </div>

                    {/* Box 4: Totale (in risalto) */}
                    <div className="rv-scoring-box rv-scoring-box--total">
                      <span className="rv-scoring-label font-bold text-[var(--color-2)]">
                        Totale
                      </span>
                      <div className="rv-scoring-val text-[26px] font-black text-[var(--color-2)]">
                        {dossier.scoringBreakdown.totalScore.toFixed(1)}
                      </div>
                      <span className="rv-scoring-sub font-semibold text-[var(--color-2)]">
                        su 10.0
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 pt-2 border-t border-[var(--color-8)]/60 text-[12px] leading-relaxed text-[var(--color-4)]">
                    <p className="font-semibold text-[var(--color-2)]">
                      {dossier.scoringBreakdown.formulaExplanation}
                    </p>
                    <p>{dossier.scoringBreakdown.summaryNote}</p>
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
