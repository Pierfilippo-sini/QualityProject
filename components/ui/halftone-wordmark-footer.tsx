"use client"

import * as React from "react"

export interface HalftonePalette {
  /** The background color (kept for API compatibility; canvas uses clearRect). */
  background: string
  /** The dots at rest. */
  ink: string
  /** The colour a dot warms toward as it is pushed off its place. */
  warm: string
}

export type HalftonePreset = "night" | "paper" | "ember" | "cobalt"

export interface HalftoneWordmarkFooterProps {
  /** The giant word printed in dots. */
  wordmark?: string
  /** Starting colours. Defaults to "night". */
  preset?: HalftonePreset
  /** Colour overrides, merged over the preset. */
  palette?: { background?: string; ink?: string; warm?: string }
  /** Distance between dot centres, in CSS px. Defaults to 6. */
  dotGap?: number
  /** How far the pointer pushes, in CSS px. Defaults to 80. */
  radius?: number
  /** How much of the word's cap height hangs below the bottom edge, 0–0.6. Defaults to 0. */
  crop?: number
  /** Print grain over everything, 0–1. Defaults to 0 (transparent background). */
  grain?: number
  /** Stretch letters vertically from the top edge (y=0) to the baseline (y=h). Defaults to true. */
  stretchToFullHeight?: boolean
  /** Initial delay in ms before letters begin dropping one by one. Defaults to 3000. */
  startDelayMs?: number
  /** Stagger delay in ms between consecutive letters dropping. Defaults to 75. */
  letterStaggerMs?: number
  /** Duration in ms of each single letter's vertical descent. Defaults to 680. */
  letterDropDurationMs?: number
  /** Pointer and click response. Defaults to true. */
  interactive?: boolean
  /** Face for the wordmark. Heavy grotesks/condensed faces print best. */
  fontFamily?: string
  /** Weight of the wordmark. Defaults to 800. */
  fontWeight?: number
  /** Root height. A definite length or viewport unit. */
  height?: string
  /** Extra root class names. */
  className?: string
}

const PRESETS: { [K in HalftonePreset]: HalftonePalette } = {
  night: { background: "transparent", ink: "#f2efe9", warm: "#e9762b" },
  paper: { background: "transparent", ink: "#17150f", warm: "#c2361c" },
  ember: { background: "transparent", ink: "#f2c48c", warm: "#ff5a1f" },
  cobalt: { background: "transparent", ink: "#dfe7ff", warm: "#ffcd3c" },
}

const SANS_STACK =
  '"Inter Tight", "Inter Variable", "Inter", "Helvetica Neue", Arial, system-ui, sans-serif'

// #region halftone
/** Hex → [r, g, b] in 0–255, or null for anything that isn't #rgb / #rrggbb. */
export function hwfHex(hex: string) {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec((hex || "").trim())
  if (!m) return null
  const h =
    m[1].length === 3
      ? m[1]
          .split("")
          .map((c) => c + c)
          .join("")
      : m[1]
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ]
}

/** Dot radius for a cell coverage in [0, 1]: area-true, so tone stays even. */
export function hwfRadius(coverage: number, gap: number) {
  const c = coverage < 0 ? 0 : coverage > 1 ? 1 : coverage
  return Math.sqrt(c) * gap * 0.56
}

/**
 * One step of a dot's spring back to home, plus the push from a pointer at
 * (px, py) within radius r. Returns [x, y, vx, vy]. Away from the pointer a
 * displaced dot always heads home and comes to rest.
 */
export function hwfStep(
  x: number,
  y: number,
  vx: number,
  vy: number,
  hx: number,
  hy: number,
  px: number,
  py: number,
  r: number
) {
  const dx = x - px
  const dy = y - py
  const d2 = dx * dx + dy * dy
  if (r > 0 && d2 < r * r) {
    const d = Math.sqrt(d2) + 0.001
    const f = (1 - d / r) * 2.6
    vx += (dx / d) * f
    vy += (dy / d) * f
  }
  vx = (vx + (hx - x) * 0.05) * 0.84
  vy = (vy + (hy - y) * 0.05) * 0.84
  return [x + vx, y + vy, vx, vy]
}

/** How warm a dot is drawn: 0 at home, 1 once it is `span` px or more away. */
export function hwfWarmth(
  x: number,
  y: number,
  hx: number,
  hy: number,
  span: number
) {
  const d = Math.hypot(x - hx, y - hy)
  return span > 0 ? Math.min(1, d / span) : 0
}

/** Font size that sets `measured` (width at 100px) to fill `width` exactly. */
export function hwfFitSize(measured: number, width: number) {
  return measured > 0 ? (width / measured) * 100 : 0
}
// #endregion

const HWF_CSS = `
.hwf-root {
  position: relative;
  width: 100%;
  overflow: visible;
  background: transparent;
  color: var(--hwf-ink);
  -webkit-font-smoothing: antialiased;
}
.hwf-root canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  display: block;
  max-width: none;
}
.hwf-sr {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
`

export function HalftoneWordmarkFooter({
  wordmark = "SCOUTING AGENT",
  preset = "night",
  palette,
  dotGap = 6,
  radius = 85,
  crop = 0,
  grain = 0,
  stretchToFullHeight = true,
  startDelayMs = 3000,
  letterStaggerMs = 75,
  letterDropDurationMs = 680,
  interactive = true,
  fontFamily = SANS_STACK,
  fontWeight = 800,
  height = "50vh",
  className = "",
}: HalftoneWordmarkFooterProps) {
  const colors = { ...(PRESETS[preset] || PRESETS.night), ...(palette || {}) }
  const rootRef = React.useRef<HTMLDivElement | null>(null)
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null)
  const opts = React.useRef({
    colors,
    dotGap,
    radius,
    crop,
    grain,
    stretchToFullHeight,
    startDelayMs,
    letterStaggerMs,
    letterDropDurationMs,
    interactive,
    fontFamily,
    fontWeight,
    wordmark,
  })

  React.useEffect(() => {
    opts.current = {
      colors,
      dotGap,
      radius,
      crop,
      grain,
      stretchToFullHeight,
      startDelayMs,
      letterStaggerMs,
      letterDropDurationMs,
      interactive,
      fontFamily,
      fontWeight,
      wordmark,
    }
  })

  const key = [
    wordmark,
    dotGap,
    crop,
    grain,
    stretchToFullHeight,
    startDelayMs,
    letterStaggerMs,
    letterDropDurationMs,
    fontFamily,
    fontWeight,
    colors.ink,
    colors.warm,
  ].join("|")

  React.useEffect(() => {
    const root = rootRef.current
    const canvas = canvasRef.current
    if (!root || !canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    let w = 0
    let h = 0
    let dpr = 1
    let px = -1e5
    let py = -1e5
    let raf = 0
    let startTime = -1
    let visible = true
    let awake = true
    let ring = { x: 0, y: 0, t: -1 }
    // Flat array: [x, y, vx, vy, hx, hy, radius, letterIdx] per dot (stride = 8).
    let dots = new Float32Array(0)
    let count = 0
    let letterCount = 1
    const ink = hwfHex(opts.current.colors.ink) || [242, 239, 233]
    const warm = hwfHex(opts.current.colors.warm) || [233, 118, 43]

    const layout = () => {
      const o = opts.current
      const rect = root.getBoundingClientRect()
      w = Math.max(1, Math.round(rect.width))
      h = Math.max(1, Math.round(rect.height))
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)

      const mask = document.createElement("canvas")
      mask.width = w
      mask.height = h
      const m = mask.getContext("2d", { willReadFrequently: true })
      if (!m) return

      const word = o.wordmark || " "
      const face100 = `${o.fontWeight} 100px ${o.fontFamily}`
      m.font = face100

      // Margini laterali minimi per riempire tutta la larghezza (w-full) senza tagliare i dot esterni
      const sidePad = Math.max(8, Math.round(w * 0.012))
      const targetWidth = Math.max(1, w - sidePad * 2)
      const fit = hwfFitSize(m.measureText(word).width, targetWidth)
      m.font = `${o.fontWeight} ${fit}px ${o.fontFamily}`

      const box = m.measureText(word)
      const startX = (w - box.width) / 2

      // Calcola gli intervalli orizzontali di ciascuna lettera visibile (non spazio)
      // così da far scendere i pallini lettera per lettera dall'alto
      const letterRanges: { left: number; right: number }[] = []
      for (let i = 0; i < word.length; i++) {
        if (word[i] === " ") continue
        const left = startX + m.measureText(word.slice(0, i)).width
        const right = startX + m.measureText(word.slice(0, i + 1)).width
        letterRanges.push({ left, right })
      }
      letterCount = Math.max(1, letterRanges.length)
      const letterBoundaries: number[] = []
      for (let i = 0; i < letterRanges.length - 1; i++) {
        letterBoundaries.push(
          (letterRanges[i].right + letterRanges[i + 1].left) / 2
        )
      }
      const getLetterIndex = (hx: number): number => {
        for (let i = 0; i < letterBoundaries.length; i++) {
          if (hx < letterBoundaries[i]) return i
        }
        return Math.max(0, letterCount - 1)
      }

      const cap = box.actualBoundingBoxAscent || fit * 0.74
      const descent = box.actualBoundingBoxDescent || 0
      m.fillStyle = "#000"
      m.textBaseline = "alphabetic"

      if (o.stretchToFullHeight) {
        // Scala verticalmente (m.scale(1, scaleY)) in modo che le lettere tocchino
        // il bordo superiore della pagina (topPad) e poggino sulla baseline (h - bottomPad)
        const topPad = Math.max(4, Math.ceil(o.dotGap * 0.75))
        const bottomPad = Math.max(4, Math.ceil(o.dotGap * 0.75))
        const availH = Math.max(1, h - topPad - bottomPad)
        const glyphH = Math.max(1, cap + descent)
        const scaleY = availH / glyphH

        m.save()
        m.scale(1, scaleY)
        m.fillText(word, startX, (h - bottomPad) / scaleY - descent)
        m.restore()
      } else {
        const c = Math.max(0, Math.min(0.6, o.crop))
        m.fillText(word, startX, h + cap * c)
      }

      const img = m.getImageData(0, 0, w, h).data
      const gap = Math.max(3, o.dotGap)
      const cols = Math.ceil(w / gap)
      const rows = Math.ceil(h / gap)
      const tmp: number[] = []

      for (let gy = 0; gy < rows; gy++) {
        for (let gx = 0; gx < cols; gx++) {
          let sum = 0
          for (let sy = 0; sy < 3; sy++) {
            for (let sx = 0; sx < 3; sx++) {
              const x = Math.min(
                w - 1,
                Math.floor(gx * gap + ((sx + 0.5) * gap) / 3)
              )
              const y = Math.min(
                h - 1,
                Math.floor(gy * gap + ((sy + 0.5) * gap) / 3)
              )
              sum += img[(y * w + x) * 4 + 3]
            }
          }
          const cov = sum / (9 * 255)
          if (cov < 0.06) continue
          const hx = gx * gap + gap / 2
          const hy = gy * gap + gap / 2
          const letterIdx = getLetterIndex(hx)
          tmp.push(hx, hy, 0, 0, hx, hy, hwfRadius(cov, gap), letterIdx)
        }
      }

      dots = new Float32Array(tmp)
      count = tmp.length / 8
      awake = true
    }

    const draw = () => {
      const now = performance.now()
      if (startTime < 0) {
        startTime = now
      }
      const o = opts.current
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      // Sfondo completamente trasparente per integrarsi col nero e col bagliore della pagina
      ctx.clearRect(0, 0, w, h)

      const elapsedAfterDelay = now - (startTime + o.startDelayMs)
      // Nei primi 3 secondi (startDelayMs) la scritta resta completamente invisibile fuori schermo in alto
      if (elapsedAfterDelay < 0) {
        awake = true
        return
      }

      const totalEntranceMs =
        Math.max(0, letterCount - 1) * o.letterStaggerMs +
        o.letterDropDurationMs +
        120

      // Calcola l'offset verticale di discesa per ciascuna lettera (da -(h + 32) a 0)
      const letterOffsets = new Float32Array(letterCount)
      const letterVisible = new Uint8Array(letterCount)
      let entranceActive = elapsedAfterDelay < totalEntranceMs

      for (let l = 0; l < letterCount; l++) {
        const lElapsed = elapsedAfterDelay - l * o.letterStaggerMs
        if (lElapsed < 0) {
          letterVisible[l] = 0
          letterOffsets[l] = -(h + 32)
          entranceActive = true
        } else if (lElapsed < o.letterDropDurationMs) {
          letterVisible[l] = 1
          const t = Math.min(1, lElapsed / o.letterDropDurationMs)
          // Cubic-out + leggero spring finale fluido verso hy
          const ease = 1 - Math.pow(1 - t, 3)
          letterOffsets[l] = -(h + 32) * (1 - ease)
          entranceActive = true
        } else {
          letterVisible[l] = 1
          letterOffsets[l] = 0
        }
      }

      const r = o.interactive ? Math.max(0, o.radius) : 0
      const ringAge = ring.t < 0 ? 1e9 : now - ring.t
      const ringR = ringAge * 0.9
      let moving = entranceActive

      for (let i = 0; i < count; i++) {
        const j = i * 8
        const letterIdx = dots[j + 7] | 0
        if (!letterVisible[letterIdx]) continue

        const yDrop = letterOffsets[letterIdx]
        let x = dots[j]
        let y = dots[j + 1]
        let vx = dots[j + 2]
        let vy = dots[j + 3]
        const hx = dots[j + 4]
        const hy = dots[j + 5]

        if (ringAge < 900) {
          const dx = hx - ring.x
          const dy = hy + yDrop - ring.y
          const d = Math.sqrt(dx * dx + dy * dy) + 0.001
          const band = 1 - Math.min(1, Math.abs(d - ringR) / 26)
          if (band > 0) {
            const f = band * 3.2 * (1 - ringAge / 900)
            vx += (dx / d) * f
            vy += (dy / d) * f
          }
        }

        // Il puntatore (px, py) interagisce con la posizione visiva attuale (x, y + yDrop)
        const s = hwfStep(x, y, vx, vy, hx, hy, px, py - yDrop, r)
        x = s[0]
        y = s[1]
        vx = s[2]
        vy = s[3]

        if (
          Math.abs(vx) + Math.abs(vy) > 0.02 ||
          Math.abs(x - hx) + Math.abs(y - hy) > 0.05
        ) {
          moving = true
        } else {
          x = hx
          y = hy
          vx = 0
          vy = 0
        }

        dots[j] = x
        dots[j + 1] = y
        dots[j + 2] = vx
        dots[j + 3] = vy

        const k = hwfWarmth(x, y, hx, hy, 28)
        ctx.fillStyle =
          k > 0.02
            ? `rgb(${Math.round(ink[0] + (warm[0] - ink[0]) * k)},${Math.round(
                ink[1] + (warm[1] - ink[1]) * k
              )},${Math.round(ink[2] + (warm[2] - ink[2]) * k)})`
            : o.colors.ink

        ctx.beginPath()
        ctx.arc(x, y + yDrop, dots[j + 6], 0, 6.2832)
        ctx.fill()
      }

      awake = moving || ringAge < 900 || px > -1e4
    }

    const loop = () => {
      raf = 0
      if (!visible) return
      draw()
      if (awake) raf = requestAnimationFrame(loop)
    }

    const wake = () => {
      awake = true
      if (!raf && visible) raf = requestAnimationFrame(loop)
    }

    const toLocal = (e: PointerEvent) => {
      const b = canvas.getBoundingClientRect()
      return [e.clientX - b.left, e.clientY - b.top] as const
    }

    let pointerIdleTimer = 0

    const onLeave = () => {
      if (pointerIdleTimer) {
        window.clearTimeout(pointerIdleTimer)
        pointerIdleTimer = 0
      }
      px = -1e5
      py = -1e5
      wake()
    }

    const onWindowOut = (e: MouseEvent | PointerEvent) => {
      if (!e.relatedTarget) {
        onLeave()
      }
    }

    // Ascolta su window in capture-phase ignorando gli eventi sintetici (!e.isTrusted)
    // così i pallini reagiscono sempre al cursore reale anche sotto il canvas Spline
    const onMove = (e: PointerEvent) => {
      if (!e.isTrusted || !opts.current.interactive) return

      // Se il cursore sta uscendo dai bordi della finestra/schermo, rilascia subito i pallini
      if (
        e.clientX <= 4 ||
        e.clientY <= 4 ||
        e.clientX >= window.innerWidth - 4 ||
        e.clientY >= window.innerHeight - 4
      ) {
        onLeave()
        return
      }

      const [lx, ly] = toLocal(e)
      const rad = Math.max(0, opts.current.radius)
      if (lx < -rad || lx > w + rad || ly < -rad || ly > h + rad) {
        onLeave()
        return
      }

      px = lx
      py = ly
      wake()

      // Quando la scritta non rileva più movimento del cursore (es. uscita rapida dallo schermo o sosta),
      // riporta automaticamente i pallini a riposo senza bloccarli sull'arancione
      if (pointerIdleTimer) {
        window.clearTimeout(pointerIdleTimer)
      }
      pointerIdleTimer = window.setTimeout(onLeave, 150)
    }

    const onDown = (e: PointerEvent) => {
      if (!e.isTrusted || !opts.current.interactive) return
      const target = e.target as HTMLElement | null
      if (target?.closest?.("a,button,input")) return
      const [lx, ly] = toLocal(e)
      ring = { x: lx, y: ly, t: performance.now() }
      wake()
    }

    layout()
    draw()
    wake()

    window.addEventListener("pointermove", onMove, {
      capture: true,
      passive: true,
    })
    window.addEventListener("pointerdown", onDown, {
      capture: true,
      passive: true,
    })
    window.addEventListener("mouseout", onWindowOut)
    window.addEventListener("pointerout", onWindowOut)
    document.addEventListener("mouseleave", onLeave)
    document.documentElement.addEventListener("mouseleave", onLeave)
    document.documentElement.addEventListener("pointerleave", onLeave)
    window.addEventListener("blur", onLeave)

    const ro = new ResizeObserver(() => {
      layout()
      draw()
      wake()
    })
    ro.observe(root)

    const io = new IntersectionObserver((entries) => {
      visible = entries[0] ? entries[0].isIntersecting : true
      if (visible) wake()
    })
    io.observe(root)

    let alive = true
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => {
        if (!alive) return
        layout()
        draw()
        wake()
      })
    }

    return () => {
      alive = false
      if (pointerIdleTimer) {
        window.clearTimeout(pointerIdleTimer)
      }
      cancelAnimationFrame(raf)
      ro.disconnect()
      io.disconnect()
      window.removeEventListener("pointermove", onMove, { capture: true })
      window.removeEventListener("pointerdown", onDown, { capture: true })
      window.removeEventListener("mouseout", onWindowOut)
      window.removeEventListener("pointerout", onWindowOut)
      document.removeEventListener("mouseleave", onLeave)
      document.documentElement.addEventListener("mouseleave", onLeave)
      document.documentElement.addEventListener("pointerleave", onLeave)
      window.removeEventListener("blur", onLeave)
    }
  }, [key])

  return (
    <div
      ref={rootRef}
      className={"hwf-root " + className}
      style={
        {
          height,
          "--hwf-ink": colors.ink,
        } as React.CSSProperties
      }
    >
      <style>{HWF_CSS}</style>
      <canvas ref={canvasRef} aria-hidden="true" />
      <span className="hwf-sr">{wordmark}</span>
    </div>
  )
}

export default HalftoneWordmarkFooter
