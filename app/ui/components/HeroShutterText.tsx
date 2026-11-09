"use client";

import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";

interface HeroShutterTextProps {
  className?: string;
  isOpen?: boolean;
  children?: React.ReactNode;
}

// Module-level flag: the large shutter animation runs ONLY ONCE per page session.
// Once it transitions to the small logo at the top, it remains permanently locked
// as that static logo across all opens and closes of the black AI Agent screen.
let globalCompanyHunterHasAnimated = false;

export default function HeroShutterText({
  className = "",
  isOpen = true,
  children,
}: HeroShutterTextProps) {
  const [cycleKey, setCycleKey] = useState(0);
  const [isDelayedVisible, setIsDelayedVisible] = useState(() => globalCompanyHunterHasAnimated);
  const [isLogo, setIsLogo] = useState(() => globalCompanyHunterHasAnimated);

  // Exact casing: only 'C' and 'H' capitalized
  const companyChars = ["C", "o", "m", "p", "a", "n", "y"];
  const hunterChars = ["H", "u", "n", "t", "e", "r"];

  useEffect(() => {
    let t1: NodeJS.Timeout;
    let t2: NodeJS.Timeout;

    if (isOpen) {
      if (globalCompanyHunterHasAnimated) {
        setIsDelayedVisible(true);
        setIsLogo(true);
        return;
      }

      // Appears only after the black screen borders have completely expanded and touched the screen
      t1 = setTimeout(() => {
        setIsDelayedVisible(true);
        setIsLogo(false);
        setCycleKey((k) => k + 1);

        // After 1.5s of initial display, smoothly shrink and glide up to the top
        t2 = setTimeout(() => {
          globalCompanyHunterHasAnimated = true;
          setIsLogo(true);
        }, 1500);
      }, 450);
    } else {
      if (!globalCompanyHunterHasAnimated) {
        setIsDelayedVisible(false);
        setIsLogo(false);
      }
    }
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [isOpen]);

  const handleClick = () => {
    if (!isLogo && !globalCompanyHunterHasAnimated) {
      setCycleKey((k) => k + 1);
    }
  };

  if (!isOpen || !isDelayedVisible) {
    return null;
  }

  return (
    <div
      className={`absolute inset-0 flex flex-col items-center pointer-events-none select-none ${className}`}
      style={{
        fontFamily: 'var(--font-1), "Host Grotesk", sans-serif',
      }}
    >
      {/* Floating Title Container:
          Starts higher up (top: 28%, translateY: -50%),
          then smoothly glides to the top (top: 1.75rem, translateY: 0%) and remains completely static. */}
      <motion.div
        initial={false}
        animate={
          isLogo
            ? { top: "1.75rem", y: "0%" }
            : { top: "28%", y: "-50%" }
        }
        transition={{
          duration: 1.25,
          ease: [0.16, 1, 0.3, 1], // Ultra-fluid cubic bezier
        }}
        className={`absolute left-0 right-0 flex flex-col items-center pointer-events-auto ${
          isLogo ? "cursor-default" : "cursor-pointer group"
        }`}
        onClick={handleClick}
        title={isLogo ? "Company Hunter" : "Clicca per riavviare l'effetto"}
      >
        <motion.div
          key={cycleKey}
          layout
          transition={{
            layout: { duration: 1.25, ease: [0.16, 1, 0.3, 1] },
          }}
          className={`flex items-center transition-all ${
            isLogo
              ? "justify-center w-auto px-3 py-1"
              : "justify-between w-full px-5 sm:px-10 md:px-14"
          }`}
        >
          {/* Word: Company */}
          <motion.div
            layout
            transition={{
              layout: { duration: 1.25, ease: [0.16, 1, 0.3, 1] },
            }}
            className={`flex items-center ${
              isLogo
                ? "tracking-[-0.02em]"
                : "justify-between flex-1"
            }`}
          >
            {companyChars.map((char, i) => (
              <motion.div
                key={`c-${i}`}
                layout
                transition={{
                  layout: { duration: 1.25, ease: [0.16, 1, 0.3, 1] },
                }}
                className="relative overflow-hidden inline-flex items-center justify-center"
              >
                {/* Main letter: White with site font Host Grotesk */}
                <motion.span
                  initial={{ opacity: 0, filter: "blur(14px)" }}
                  animate={{
                    opacity: 1,
                    filter: "blur(0px)",
                  }}
                  transition={{ delay: i * 0.04 + 0.08, duration: 0.6 }}
                  className={`leading-none text-white drop-shadow-[0_0_16px_rgba(255,255,255,0.35)] transition-all duration-1000 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                    isLogo
                      ? "text-xl sm:text-2xl font-semibold tracking-[-0.02em]"
                      : "text-[11vw] sm:text-[9.5vw] lg:text-[7.5vw] font-semibold tracking-normal"
                  }`}
                  style={{ fontFamily: 'var(--font-1), "Host Grotesk", sans-serif' }}
                >
                  {char}
                </motion.span>

                {/* Shutter Animation only during large appearance phase */}
                {!isLogo && (
                  <>
                    <motion.span
                      initial={{ x: "-100%", opacity: 0 }}
                      animate={{ x: "100%", opacity: [0, 1, 0] }}
                      transition={{
                        duration: 0.55,
                        delay: i * 0.04,
                        ease: "easeInOut",
                      }}
                      className="absolute inset-0 text-[11vw] sm:text-[9.5vw] lg:text-[7.5vw] leading-none font-semibold text-white z-10 pointer-events-none drop-shadow-[0_0_12px_#ffffff]"
                      style={{
                        fontFamily: 'var(--font-1), "Host Grotesk", sans-serif',
                        clipPath: "polygon(0 0, 100% 0, 100% 35%, 0 35%)",
                      }}
                    >
                      {char}
                    </motion.span>

                    <motion.span
                      initial={{ x: "100%", opacity: 0 }}
                      animate={{ x: "-100%", opacity: [0, 1, 0] }}
                      transition={{
                        duration: 0.55,
                        delay: i * 0.04 + 0.06,
                        ease: "easeInOut",
                      }}
                      className="absolute inset-0 text-[11vw] sm:text-[9.5vw] lg:text-[7.5vw] leading-none font-semibold text-white z-10 pointer-events-none drop-shadow-[0_0_12px_#ffffff]"
                      style={{
                        fontFamily: 'var(--font-1), "Host Grotesk", sans-serif',
                        clipPath: "polygon(0 35%, 100% 35%, 100% 65%, 0 65%)",
                      }}
                    >
                      {char}
                    </motion.span>

                    <motion.span
                      initial={{ x: "-100%", opacity: 0 }}
                      animate={{ x: "100%", opacity: [0, 1, 0] }}
                      transition={{
                        duration: 0.55,
                        delay: i * 0.04 + 0.12,
                        ease: "easeInOut",
                      }}
                      className="absolute inset-0 text-[11vw] sm:text-[9.5vw] lg:text-[7.5vw] leading-none font-semibold text-white z-10 pointer-events-none drop-shadow-[0_0_12px_#ffffff]"
                      style={{
                        fontFamily: 'var(--font-1), "Host Grotesk", sans-serif',
                        clipPath: "polygon(0 65%, 100% 65%, 100% 100%, 0 100%)",
                      }}
                    >
                      {char}
                    </motion.span>
                  </>
                )}
              </motion.div>
            ))}
          </motion.div>

          {/* Natural space between Company and Hunter: smooth contraction */}
          <motion.div
            layout
            transition={{
              layout: { duration: 1.25, ease: [0.16, 1, 0.3, 1] },
            }}
            className={`shrink-0 transition-all ${
              isLogo ? "w-[7px] sm:w-[9px]" : "w-6 sm:w-12 md:w-20"
            }`}
          />

          {/* Word: Hunter */}
          <motion.div
            layout
            transition={{
              layout: { duration: 1.25, ease: [0.16, 1, 0.3, 1] },
            }}
            className={`flex items-center ${
              isLogo
                ? "tracking-[-0.02em]"
                : "justify-between flex-1"
            }`}
          >
            {hunterChars.map((char, i) => (
              <motion.div
                key={`h-${i}`}
                layout
                transition={{
                  layout: { duration: 1.25, ease: [0.16, 1, 0.3, 1] },
                }}
                className="relative overflow-hidden inline-flex items-center justify-center"
              >
                {/* Main letter: White with site font Host Grotesk */}
                <motion.span
                  initial={{ opacity: 0, filter: "blur(14px)" }}
                  animate={{
                    opacity: 1,
                    filter: "blur(0px)",
                  }}
                  transition={{ delay: (i + 7) * 0.04 + 0.08, duration: 0.6 }}
                  className={`leading-none text-white drop-shadow-[0_0_16px_rgba(255,255,255,0.35)] transition-all duration-1000 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                    isLogo
                      ? "text-xl sm:text-2xl font-semibold tracking-[-0.02em]"
                      : "text-[11vw] sm:text-[9.5vw] lg:text-[7.5vw] font-semibold tracking-normal"
                  }`}
                  style={{ fontFamily: 'var(--font-1), "Host Grotesk", sans-serif' }}
                >
                  {char}
                </motion.span>

                {/* Shutter Animation only during large appearance phase */}
                {!isLogo && (
                  <>
                    <motion.span
                      initial={{ x: "-100%", opacity: 0 }}
                      animate={{ x: "100%", opacity: [0, 1, 0] }}
                      transition={{
                        duration: 0.55,
                        delay: (i + 7) * 0.04,
                        ease: "easeInOut",
                      }}
                      className="absolute inset-0 text-[11vw] sm:text-[9.5vw] lg:text-[7.5vw] leading-none font-semibold text-white z-10 pointer-events-none drop-shadow-[0_0_12px_#ffffff]"
                      style={{
                        fontFamily: 'var(--font-1), "Host Grotesk", sans-serif',
                        clipPath: "polygon(0 0, 100% 0, 100% 35%, 0 35%)",
                      }}
                    >
                      {char}
                    </motion.span>

                    <motion.span
                      initial={{ x: "100%", opacity: 0 }}
                      animate={{ x: "-100%", opacity: [0, 1, 0] }}
                      transition={{
                        duration: 0.55,
                        delay: (i + 7) * 0.04 + 0.06,
                        ease: "easeInOut",
                      }}
                      className="absolute inset-0 text-[11vw] sm:text-[9.5vw] lg:text-[7.5vw] leading-none font-semibold text-white z-10 pointer-events-none drop-shadow-[0_0_12px_#ffffff]"
                      style={{
                        fontFamily: 'var(--font-1), "Host Grotesk", sans-serif',
                        clipPath: "polygon(0 35%, 100% 35%, 100% 65%, 0 65%)",
                      }}
                    >
                      {char}
                    </motion.span>

                    <motion.span
                      initial={{ x: "-100%", opacity: 0 }}
                      animate={{ x: "100%", opacity: [0, 1, 0] }}
                      transition={{
                        duration: 0.55,
                        delay: (i + 7) * 0.04 + 0.12,
                        ease: "easeInOut",
                      }}
                      className="absolute inset-0 text-[11vw] sm:text-[9.5vw] lg:text-[7.5vw] leading-none font-semibold text-white z-10 pointer-events-none drop-shadow-[0_0_12px_#ffffff]"
                      style={{
                        fontFamily: 'var(--font-1), "Host Grotesk", sans-serif',
                        clipPath: "polygon(0 65%, 100% 65%, 100% 100%, 0 100%)",
                      }}
                    >
                      {char}
                    </motion.span>
                  </>
                )}
              </motion.div>
            ))}
          </motion.div>
        </motion.div>

        {/* Optional Slot below the title (for new question button) */}
        {children && <div className="mt-2.5 z-20 pointer-events-auto flex justify-center">{children}</div>}
      </motion.div>
    </div>
  );
}
