"use client";

import React, { useRef } from "react";
import { useInView } from "framer-motion";
import CountAnimation from "./CountAnimation";
import TypingEffect from "./TypingEffect";

export interface RankedCompanyItem {
  rank: number;
  name: string;
  revenue: number | string;
  employees: number | string;
  cluster: string;
  subcategory: string;
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
      className={`rv-sheet ${surfaceClass}`}
      style={{ "--i": index } as React.CSSProperties}
    >
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

      <div className="rv-metrics">
        <div className="rv-metric">
          <span className="m-text-3 rv-metric__label">Fatturato</span>
          <div className="rv-metric__val">
            {renderValue(company.revenue, "€ ")}
          </div>
        </div>
        <div className="rv-metric">
          <span className="m-text-3 rv-metric__label">Dipendenti</span>
          <div className="rv-metric__val">{renderValue(company.employees)}</div>
        </div>
      </div>
    </li>
  );
}
