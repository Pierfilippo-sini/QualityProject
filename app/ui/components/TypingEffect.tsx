"use client";

import React, { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: any[]) {
  return twMerge(clsx(inputs));
}

export interface TypingEffectProps {
  texts?: string[];
  className?: string;
  rotationInterval?: number;
  typingSpeed?: number;
  deletingSpeed?: number;
  singleCycleWithBackspace?: boolean;
  typeOnce?: boolean;
  startTrigger?: boolean;
  showCursor?: boolean;
  onCharChange?: (currentText: string) => void;
  onSequenceComplete?: () => void;
}

const DEMO = ["Design", "Development", "Marketing"];

export const TypingEffect = ({
  texts = DEMO,
  className,
  rotationInterval = 3000,
  typingSpeed = 150,
  deletingSpeed = 35,
  singleCycleWithBackspace = false,
  typeOnce = false,
  startTrigger = true,
  showCursor = true,
  onCharChange,
  onSequenceComplete,
}: TypingEffectProps) => {
  const [displayedText, setDisplayedText] = useState("");
  const [currentTextIndex, setCurrentTextIndex] = useState(0);
  const [charIndex, setCharIndex] = useState(0);
  const [mode, setMode] = useState<"typing" | "pausing" | "deleting" | "done">(
    "typing"
  );

  const onCharChangeRef = useRef(onCharChange);
  onCharChangeRef.current = onCharChange;

  const onSequenceCompleteRef = useRef(onSequenceComplete);
  onSequenceCompleteRef.current = onSequenceComplete;

  const currentText = texts[currentTextIndex % texts.length] ?? "";

  useEffect(() => {
    onCharChangeRef.current?.(displayedText);
  }, [displayedText]);

  useEffect(() => {
    if (!startTrigger) return;

    if (typeOnce) {
      if (charIndex < currentText.length) {
        const timer = setTimeout(() => {
          const nextIndex = charIndex + 1;
          setDisplayedText(currentText.slice(0, nextIndex));
          setCharIndex(nextIndex);
        }, typingSpeed);
        return () => clearTimeout(timer);
      } else {
        setMode("done");
        onSequenceCompleteRef.current?.();
      }
      return;
    }

    if (!singleCycleWithBackspace) {
      if (charIndex < currentText.length) {
        const typingTimeout = setTimeout(() => {
          const nextIndex = charIndex + 1;
          setDisplayedText(currentText.slice(0, nextIndex));
          setCharIndex(nextIndex);
        }, typingSpeed);
        return () => clearTimeout(typingTimeout);
      } else {
        const changeLabelTimeout = setTimeout(() => {
          setDisplayedText("");
          setCharIndex(0);
          setCurrentTextIndex((prev) => (prev + 1) % texts.length);
        }, rotationInterval);
        return () => clearTimeout(changeLabelTimeout);
      }
    }

    // Sequenza singola per Intro:
    // Fase 2 (Scrittura) -> Fase 3 (Pausa 2s) -> Fase 4 (Cancellazione rapida) -> Done
    if (mode === "typing") {
      if (charIndex < currentText.length) {
        const timer = setTimeout(() => {
          const nextIndex = charIndex + 1;
          setDisplayedText(currentText.slice(0, nextIndex));
          setCharIndex(nextIndex);
        }, typingSpeed);
        return () => clearTimeout(timer);
      } else {
        setMode("pausing");
      }
    } else if (mode === "pausing") {
      const pauseTimer = setTimeout(() => {
        setMode("deleting");
      }, rotationInterval);
      return () => clearTimeout(pauseTimer);
    } else if (mode === "deleting") {
      if (charIndex > 0) {
        const deleteTimer = setTimeout(() => {
          const nextIndex = charIndex - 1;
          setDisplayedText(currentText.slice(0, nextIndex));
          setCharIndex(nextIndex);
        }, deletingSpeed);
        return () => clearTimeout(deleteTimer);
      } else {
        setMode("done");
        onSequenceCompleteRef.current?.();
      }
    }
  }, [
    charIndex,
    currentText,
    deletingSpeed,
    mode,
    rotationInterval,
    singleCycleWithBackspace,
    startTrigger,
    texts.length,
    typeOnce,
    typingSpeed,
  ]);

  return (
    <div
      className={cn(
        "relative inline-flex items-center justify-center text-center text-4xl font-bold whitespace-nowrap",
        className
      )}
    >
      <span>{displayedText}</span>
      {showCursor && mode !== "done" && (
        <motion.span
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{
            duration: 0.6,
            repeat: Infinity,
            repeatType: "reverse",
          }}
          className="ml-1 inline-block h-[0.88em] w-[3px] shrink-0 rounded-sm bg-current"
        />
      )}
    </div>
  );
};

export default TypingEffect;
