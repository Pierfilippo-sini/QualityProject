"use client";

import { Target, Zap } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { useScoutStore } from "@/lib/store";

/**
 * Slider Interattivo Real-Time Bersaglio vs Trigger (SAD Sez. 5.3 e 9).
 * Ricalcola lo score finale e riordina la tabella in memoria senza chiamate server.
 */
export function DynamicSlider() {
  const triggerWeight = useScoutStore((s) => s.triggerWeight);
  const setTriggerWeight = useScoutStore((s) => s.setTriggerWeight);

  const triggerPct = Math.round(triggerWeight * 100);
  const targetPct = 100 - triggerPct;

  return (
    <div className="flex min-w-[260px] flex-col gap-1.5 sm:min-w-[320px]">
      <div className="flex items-center justify-between text-xs font-medium">
        <span className="inline-flex items-center gap-1 text-muted-foreground">
          <Target className="size-3.5 text-primary" />
          Bersaglio{" "}
          <strong className="font-semibold text-foreground">{targetPct}%</strong>
        </span>
        <span className="inline-flex items-center gap-1 text-muted-foreground">
          <Zap className="size-3.5 text-amber-500" />
          Trigger{" "}
          <strong className="font-semibold text-foreground">{triggerPct}%</strong>
        </span>
      </div>

      <Slider
        min={0}
        max={100}
        step={5}
        value={[triggerPct]}
        onValueChange={(values) => {
          const next = values[0];
          if (typeof next === "number") {
            setTriggerWeight(next / 100);
          }
        }}
        aria-label="Bilanciamento peso Bersaglio Ideale vs Potenza Trigger"
      />
    </div>
  );
}
