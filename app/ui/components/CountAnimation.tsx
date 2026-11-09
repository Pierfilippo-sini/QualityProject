"use client";

import React, { useEffect } from "react";
import { motion, useMotionValue, useTransform, animate } from "framer-motion";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: any[]) {
  return twMerge(clsx(inputs));
}

export interface CountAnimationProps {
  number: number;
  className?: string;
  startTrigger?: boolean;
  prefix?: string;
  suffix?: string;
  formatLocale?: boolean;
}

function CountAnimation({
  number,
  className = "",
  startTrigger = true,
  prefix = "",
  suffix = "",
  formatLocale = false,
}: CountAnimationProps) {
  const count = useMotionValue(0);
  const rounded = useTransform(count, (latest) => {
    const val = Math.round(latest);
    const formatted = formatLocale ? val.toLocaleString("it-IT") : String(val);
    return `${prefix}${formatted}${suffix}`;
  });

  useEffect(() => {
    if (!startTrigger) return;
    const animation = animate(count, number, {
      duration: 4.5,
      ease: [0.16, 1, 0.3, 1],
    });

    return animation.stop;
  }, [count, number, startTrigger]);

  return <motion.span className={cn(className)}>{rounded}</motion.span>;
}

export { CountAnimation };
export default CountAnimation;
