"use client"

import * as React from "react"
import { ArrowRight, Eye, EyeOff, Loader2, Lock } from "lucide-react"

import { cn } from "@/lib/utils"
import { LiquidButton } from "@/components/ui/liquid-glass-button"

interface LiquidGlassPasswordProps {
  onSubmit?: (password: string) => void | Promise<void>
  isSubmitting?: boolean
  error?: string | null
  placeholder?: string
  autoFocus?: boolean
  className?: string
  onFocus?: () => void
  onBlur?: () => void
  onValueChange?: (value: string) => void
}

/**
 * Campo password "Liquid Glass".
 * Riusa gli stessi strati del `LiquidButton`:
 *  1. ombre interne bianche (bordo luminoso),
 *  2. `backdrop-blur` di fallback (Safari/Firefox non supportano `url()` in backdrop-filter),
 *  3. distorsione SVG `#container-glass` (Chromium) — il filtro è renderizzato
 *     dal `LiquidButton` di invio, quindi non va duplicato qui.
 */
export function LiquidGlassPassword({
  onSubmit,
  isSubmitting = false,
  error,
  placeholder = "Password",
  autoFocus,
  className,
  onFocus,
  onBlur,
  onValueChange,
}: LiquidGlassPasswordProps) {
  const [value, setValue] = React.useState("")
  const [visible, setVisible] = React.useState(false)
  const inputId = React.useId()
  const errorId = `${inputId}-error`

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!value.trim() || isSubmitting) return
    void onSubmit?.(value)
  }

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const next = event.target.value
    setValue(next)
    onValueChange?.(next)
  }

  return (
    <form
      onSubmit={handleSubmit}
      className={cn("relative w-full max-w-md", className)}
    >
      <label htmlFor={inputId} className="sr-only">
        Password
      </label>

      <div className="group/glass relative isolate flex h-14 items-center gap-2 rounded-full pr-2 pl-5 transition-transform duration-300 focus-within:scale-[1.01]">
        {/* Strato 1: bordo luminoso + velatura */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-0 rounded-full bg-white/[0.03] shadow-[0_0_8px_rgba(0,0,0,0.03),0_2px_6px_rgba(0,0,0,0.08),inset_3px_3px_0.5px_-3.5px_rgba(255,255,255,0.09),inset_-3px_-3px_0.5px_-3.5px_rgba(255,255,255,0.85),inset_1px_1px_1px_-0.5px_rgba(255,255,255,0.6),inset_-1px_-1px_1px_-0.5px_rgba(255,255,255,0.6),inset_0_0_6px_6px_rgba(255,255,255,0.12),inset_0_0_2px_2px_rgba(255,255,255,0.06),0_0_12px_rgba(0,0,0,0.15)] transition-[background-color,box-shadow] duration-300 group-focus-within/glass:bg-white/[0.06]"
        />
        {/* Strato 2: blur di fallback cross-browser */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10 overflow-hidden rounded-full backdrop-blur-[3px] backdrop-saturate-150"
        />
        {/* Strato 3: distorsione liquida (Chromium) */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10 overflow-hidden rounded-full"
          style={{ backdropFilter: 'url("#container-glass")' }}
        />

        <Lock
          aria-hidden="true"
          className="relative z-10 size-4 shrink-0 text-neutral-400"
        />
        <input
          id={inputId}
          type={visible ? "text" : "password"}
          value={value}
          onChange={handleChange}
          placeholder={placeholder}
          autoComplete="current-password"
          autoFocus={autoFocus}
          readOnly={isSubmitting}
          onFocus={onFocus}
          onBlur={onBlur}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className="relative z-10 h-full min-w-0 flex-1 bg-transparent text-sm tracking-wide text-neutral-100 placeholder:text-neutral-500 focus:outline-none read-only:opacity-80 autofill:[-webkit-text-fill-color:#f5f5f5] autofill:[transition:background-color_9999s_ease-out_0s]"
        />
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setVisible((v) => !v)}
          className="relative z-10 flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-neutral-400 transition-colors hover:text-neutral-100 focus-visible:ring-2 focus-visible:ring-white/30 focus-visible:outline-none"
          aria-label={visible ? "Nascondi password" : "Mostra password"}
        >
          {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
        <LiquidButton
          type="submit"
          size="icon"
          aria-label="Accedi"
          onMouseDown={(e) => e.preventDefault()}
          disabled={isSubmitting || value.trim().length === 0}
          className="relative z-10 size-10 shrink-0 rounded-full text-neutral-100"
        >
          {isSubmitting ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <ArrowRight className="size-4" />
          )}
        </LiquidButton>
      </div>

      {error && (
        <p
          id={errorId}
          role="alert"
          className="absolute inset-x-0 top-full mt-3 text-center text-xs font-medium text-red-400"
        >
          {error}
        </p>
      )}
    </form>
  )
}
