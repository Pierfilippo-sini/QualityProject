"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { LiquidGlassPassword } from "@/components/ui/liquid-glass-password";

interface PasswordGateProps {
  onFocus?: () => void;
  onBlur?: () => void;
  onSuccess?: () => void;
  onError?: () => void;
}

/**
 * Collega il campo Liquid Glass all'Access Gate di `/login`
 * (`POST /api/auth/session` → cookie HttpOnly `scout_session_token`)
 * supportando entrambe le password (`/` con `ACCESS_GATE_SECRET` e `/ui` con `BRAIN_GATE_SECRET`).
 */
export function PasswordGate({
  onFocus,
  onBlur,
  onSuccess,
  onError,
}: PasswordGateProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleSubmit(pin: string) {
    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });

      const data = (await response.json().catch(() => null)) as {
        redirectTo?: string;
        error?: string;
      } | null;

      if (!response.ok) {
        setError(data?.error ?? "Password non valida.");
        setIsSubmitting(false);
        onError?.();
        return;
      }

      const destination =
        typeof data?.redirectTo === "string" && data.redirectTo.startsWith("/")
          ? data.redirectTo
          : "/";

      // Posa di successo/sblocco del robot prima del redirect
      onSuccess?.();
      await new Promise((r) => setTimeout(r, 600));

      router.replace(destination);
      router.refresh();
    } catch {
      setError("Errore di connessione al server di autenticazione.");
      setIsSubmitting(false);
      onError?.();
    }
  }

  return (
    <LiquidGlassPassword
      onSubmit={handleSubmit}
      isSubmitting={isSubmitting}
      error={error}
      placeholder="Inserisci la password"
      onFocus={onFocus}
      onBlur={onBlur}
    />
  );
}
