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
} from "lucide-react";
import CountAnimation from "./CountAnimation";
import TypingEffect from "./TypingEffect";

export interface CompanySourceLink {
  title: string;
  url: string;
}

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
  // Parte quando la scheda è ben visibile, così l'animazione non finisce fuori schermo
  const isInView = useInView(cardRef, { once: true, amount: 0.6 });

  const [isFlipped, setIsFlipped] = useState(false);
  const [isSourcesOpen, setIsSourcesOpen] = useState(false);

  const isOutOfRanking = company.rank > targetRankedCount;
  const surfaceClass = index % 2 === 0 ? "m-surface" : "m-surface-2";

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
        {/* FRONTE SCHEDA */}
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

        {/* RETRO SCHEDA */}
        <div className={`rv-card-face rv-card-face--back ${surfaceClass}`}>
          {/* Intestazione retro: nome azienda in piccolo in alto a sinistra + torna alla scheda */}
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

          {/* Corpo retro: Colonna sinistra (1/4) e Area destra (3/4) */}
          <div className="rv-back-body">
            {/* Colonna Sinistra (~1/4 dello spazio) */}
            <aside className="rv-back-col-left">
              {/* Fatturato (immediato) */}
              <div className="rv-back-field">
                <span className="rv-back-field__label">Fatturato</span>
                <span className="rv-back-field__val rv-back-field__val--strong">
                  {typeof company.revenue === "number"
                    ? `€ ${company.revenue.toLocaleString("it-IT")}`
                    : company.revenue}
                </span>
              </div>

              {/* Dipendenti (immediato) */}
              <div className="rv-back-field">
                <span className="rv-back-field__label">Dipendenti</span>
                <span className="rv-back-field__val rv-back-field__val--strong">
                  {typeof company.employees === "number"
                    ? `${company.employees.toLocaleString("it-IT")} addetti`
                    : company.employees}
                </span>
              </div>

              {/* Settore / Categoria */}
              <div className="rv-back-field">
                <span className="rv-back-field__label">Settore</span>
                <span className="rv-back-field__val">{company.cluster}</span>
              </div>

              {/* Fonti (a cascata se cliccata) */}
              <div className="rv-back-field rv-back-sources-box">
                <button
                  type="button"
                  className="rv-back-sources-toggle"
                  onClick={() => setIsSourcesOpen((prev) => !prev)}
                  aria-expanded={isSourcesOpen}
                >
                  <span className="rv-back-field__label">Fonti</span>
                  <span className="rv-back-sources-badge">
                    {company.sources?.length || 0}
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
                      transition={{ duration: 0.25, ease: "easeOut" }}
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
                                size={11}
                                className="rv-back-source-icon"
                              />
                            </a>
                          </li>
                        ))
                      ) : (
                        <li className="rv-back-source-empty">
                          Nessuna fonte esterna registrata
                        </li>
                      )}
                    </motion.ul>
                  )}
                </AnimatePresence>
              </div>

              {/* Sede (Indirizzo preciso) */}
              <div className="rv-back-field">
                <span className="rv-back-field__label">Sede (Indirizzo)</span>
                <div className="rv-back-field__row">
                  <MapPin size={13} className="rv-back-field-icon" />
                  <span className="rv-back-field__text">
                    {company.fullAddress ||
                      company.headquartersCity ||
                      "Milano (MI)"}
                  </span>
                </div>
              </div>

              {/* Telefono */}
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
                  <Phone size={13} className="rv-back-field-icon" />
                  <span>{company.phone || "+39 02 0000000"}</span>
                </a>
              </div>

              {/* Sito ufficiale */}
              <div className="rv-back-field">
                <span className="rv-back-field__label">Sito ufficiale</span>
                <a
                  href={company.website || "#"}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rv-back-field__link"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Globe size={13} className="rv-back-field-icon" />
                  <span className="rv-back-field__url">
                    {company.website?.replace(/^https?:\/\//, "") ||
                      "azienda.it"}
                  </span>
                </a>
              </div>
            </aside>

            {/* Colonna Destra (~3/4 dello spazio): Area per future info agente */}
            <section className="rv-back-col-right">
              <div className="rv-back-right-inner">
                <div className="rv-back-right-header">
                  <div className="rv-back-right-pill">
                    <Sparkles size={13} className="rv-back-right-pill__icon" />
                    <span>AI Sales Intelligence & Match</span>
                  </div>
                  <span className="rv-back-right-status">
                    In arrivo con l&apos;agente
                  </span>
                </div>

                <div className="rv-back-grid-placeholders">
                  <div className="rv-back-placeholder-card">
                    <div className="rv-back-ph-head">
                      <span className="rv-back-ph-label">
                        Sintesi Strategica & Fit
                      </span>
                      <span className="rv-back-ph-dot" />
                    </div>
                    <p className="rv-back-ph-desc">
                      Analisi di mercato automatizzata elaborata dal nostro
                      motore pensante: punti di forza competitivi, trend di
                      crescita e posizionamento nel settore.
                    </p>
                  </div>

                  <div className="rv-back-placeholder-card">
                    <div className="rv-back-ph-head">
                      <span className="rv-back-ph-label">
                        Organigramma & Decision Maker
                      </span>
                      <span className="rv-back-ph-dot" />
                    </div>
                    <p className="rv-back-ph-desc">
                      Identificazione automatica dei profili C-Level (CEO, CTO,
                      Procurement Director) e canali di contatto B2B
                      qualificati.
                    </p>
                  </div>

                  <div className="rv-back-placeholder-card">
                    <div className="rv-back-ph-head">
                      <span className="rv-back-ph-label">
                        Ganci di Vendita & Pitch CXI
                      </span>
                      <span className="rv-back-ph-dot" />
                    </div>
                    <p className="rv-back-ph-desc">
                      Trigger commerciali personalizzati e value proposition
                      calibrate sui reali bisogni operativi di {company.name}.
                    </p>
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
