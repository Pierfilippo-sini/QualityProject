"use client";

import React, { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import RotatingEarth from "./RotatingEarth";
import TypingEffect from "./TypingEffect";

export type IntroPhase =
  | "appear"   // Fase 1: Globo solo al centro per 1 secondo
  | "typing"   // Fase 2 (scrittura) + Fase 3 (pausa 2s) + Fase 4 (cancellazione rapida)
  | "recenter" // Ritorno del globo solo al centro esatto (50vw, 50vh)
  | "finished"; // Fase 5: Transizione layoutId verso la Hero Page + reveal del sito

interface IntroSequenceProps {
  isIntroFinished: boolean;
  onFinish: () => void;
}

export default function IntroSequence({
  isIntroFinished,
  onFinish,
}: IntroSequenceProps) {
  const [phase, setPhase] = useState<IntroPhase>("appear");
  const [earthReady, setEarthReady] = useState(false);

  const handleEarthReady = useCallback(() => {
    setEarthReady(true);
  }, []);

  // Fase 1: Rimane al centro da solo per esattamente 1 secondo (1000ms)
  useEffect(() => {
    if (!earthReady || phase !== "appear") return;

    const timer = setTimeout(() => {
      setPhase("typing");
    }, 1000);

    return () => clearTimeout(timer);
  }, [earthReady, phase]);

  // Al termine di Fase 2 (scrittura) + Fase 3 (2s pausa) + Fase 4 (backspace rapido)
  const handleTypingSequenceComplete = useCallback(() => {
    setPhase("recenter");
  }, []);

  // Breve assestamento del globo da solo al centro prima del volo Fase 5 verso la Hero
  useEffect(() => {
    if (phase !== "recenter") return;

    const timer = setTimeout(() => {
      setPhase("finished");
      onFinish();
    }, 240);

    return () => clearTimeout(timer);
  }, [phase, onFinish]);

  if (isIntroFinished) {
    return null;
  }

  const isTextPhaseActive = phase === "typing";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center pointer-events-auto"
      aria-label="Intro Animation"
    >
      {/* Contenitore Flexbox centrato: garantisce che il centro di massa di [Globo + Testo] sia sempre a (50vw, 50vh) */}
      <div className="inline-flex items-center justify-center">
        <motion.div
          layout
          layoutId="company-hunter-globe"
          initial={{ opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{
            opacity: { duration: 0.4, ease: "easeOut" },
            scale: { duration: 0.4, ease: "easeOut" },
            layout: {
              type: "spring",
              stiffness: 480,
              damping: 40,
              mass: 0.6,
            },
          }}
          className="relative h-[128px] w-[128px] shrink-0 sm:h-[164px] sm:w-[164px]"
        >
          <RotatingEarth
            width={640}
            height={640}
            className="h-full w-full"
            onReady={handleEarthReady}
          />
        </motion.div>

        {isTextPhaseActive && (
          <motion.div
            layout="position"
            initial={{ opacity: 0, marginLeft: 0 }}
            animate={{ opacity: 1, marginLeft: 24 }}
            transition={{
              layout: {
                type: "spring",
                stiffness: 480,
                damping: 40,
                mass: 0.6,
              },
              marginLeft: { duration: 0.14, ease: "easeOut" },
              opacity: { duration: 0.12 },
            }}
            className="flex items-center overflow-hidden"
          >
            <TypingEffect
              texts={["CompanyHunter"]}
              typingSpeed={76}
              rotationInterval={2000}
              deletingSpeed={32}
              singleCycleWithBackspace={true}
              startTrigger={true}
              showCursor={false}
              onSequenceComplete={handleTypingSequenceComplete}
              className="font-[family-name:var(--font-1)] text-4xl font-medium tracking-[-0.03em] text-[#0b0b0b] sm:text-6xl md:text-[74px]"
            />
          </motion.div>
        )}
      </div>
    </div>
  );
}
