"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

interface CursorGlowProps {
  /** Diametro del bagliore in px. */
  size?: number
  /** Fattore di inseguimento (0–1): più basso = scia più morbida. */
  smoothing?: number
  className?: string
}

/**
 * Bagliore radiale morbido che segue il cursore su tutta la viewport.
 * - `pointer-events-none`: non intercetta mai il mouse (il canvas Spline resta interattivo).
 * - Il listener è su `window` in fase di capture, così riceve il movimento anche
 *   quando il puntatore è sopra il canvas 3D.
 * - Muove il bagliore con `transform` in un loop rAF (niente re-render React).
 */
export function CursorGlow({
  size = 640,
  smoothing = 0.12,
  className,
}: CursorGlowProps) {
  const glowRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    const el = glowRef.current
    if (!el) return

    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches
    const ease = reduceMotion ? 1 : smoothing
    const half = size / 2

    let targetX = window.innerWidth / 2
    let targetY = window.innerHeight / 2
    let x = targetX
    let y = targetY
    let frame = 0

    const render = () => {
      el.style.transform = `translate3d(${x - half}px, ${y - half}px, 0)`
    }

    const tick = () => {
      x += (targetX - x) * ease
      y += (targetY - y) * ease
      render()
      if (Math.abs(targetX - x) > 0.3 || Math.abs(targetY - y) > 0.3) {
        frame = requestAnimationFrame(tick)
      } else {
        frame = 0
      }
    }

    const onMove = (event: PointerEvent) => {
      if (event.pointerType === "touch") return
      targetX = event.clientX
      targetY = event.clientY
      el.style.opacity = "1"
      if (!frame) frame = requestAnimationFrame(tick)
    }

    const onLeave = () => {
      el.style.opacity = "0"
    }

    render()
    window.addEventListener("pointermove", onMove, {
      passive: true,
      capture: true,
    })
    document.documentElement.addEventListener("mouseleave", onLeave)
    window.addEventListener("blur", onLeave)

    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener("pointermove", onMove, { capture: true })
      document.documentElement.removeEventListener("mouseleave", onLeave)
      window.removeEventListener("blur", onLeave)
    }
  }, [size, smoothing])

  return (
    <div
      aria-hidden="true"
      className={cn("pointer-events-none fixed inset-0 overflow-hidden", className)}
    >
      <div
        ref={glowRef}
        className="absolute top-0 left-0 rounded-full opacity-0 transition-opacity duration-500 will-change-transform"
        style={{
          width: size,
          height: size,
          background:
            "radial-gradient(circle at center, rgba(255,255,255,0.16) 0%, rgba(229,229,229,0.07) 30%, rgba(255,255,255,0.02) 50%, transparent 70%)",
        }}
      />
    </div>
  )
}
