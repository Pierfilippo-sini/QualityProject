"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, KeyRound, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

/**
 * Pagina PIN / Password Access Gate (SAD Capitoli 8 e 9).
 * Autentica la sessione tramite `POST /api/auth/session` ottenendo il cookie HttpOnly `scout_session_token`.
 */
export default function LoginPage() {
  const router = useRouter();
  const [pin, setPin] = React.useState("");
  const [showPin, setShowPin] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!pin.trim() || isSubmitting) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        setError(data?.error ?? "PIN di accesso non valido.");
        setIsSubmitting(false);
        return;
      }

      router.replace("/");
      router.refresh();
    } catch {
      setError("Errore di connessione al server di autenticazione.");
      setIsSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-1 items-center justify-center bg-muted/30 p-4">
      <div className="w-full max-w-md space-y-4">
        <div className="flex flex-col items-center text-center">
          <div className="mb-3 flex size-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
            <ShieldCheck className="size-6" />
          </div>
          <Badge variant="outline" className="mb-2">
            Stateless Access Gate
          </Badge>
          <h1 className="text-2xl font-bold tracking-tight">
            B2B Scouting Agent
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            AI Data Research &amp; CXI Sales Matcher
          </p>
        </div>

        <Card className="border-border/80 shadow-sm">
          <CardHeader className="space-y-1 pb-3">
            <CardTitle className="text-base font-semibold">
              Autenticazione di Sessione
            </CardTitle>
            <CardDescription>
              Inserisci il PIN aziendale per sbloccare la dashboard e il motore
              di scouting in tempo reale.
            </CardDescription>
          </CardHeader>

          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label
                  htmlFor="session-pin"
                  className="text-xs font-medium text-foreground"
                >
                  PIN / Password di Sessione
                </label>
                <div className="relative">
                  <KeyRound className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="session-pin"
                    type={showPin ? "text" : "password"}
                    value={pin}
                    onChange={(e) => setPin(e.target.value)}
                    placeholder="Inserisci il PIN segreto..."
                    autoComplete="current-password"
                    autoFocus
                    disabled={isSubmitting}
                    className="h-10 pr-10 pl-9"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPin((prev) => !prev)}
                    className="absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                    aria-label={showPin ? "Nascondi PIN" : "Mostra PIN"}
                  >
                    {showPin ? (
                      <EyeOff className="size-4" />
                    ) : (
                      <Eye className="size-4" />
                    )}
                  </button>
                </div>
              </div>

              {error && (
                <div
                  role="alert"
                  className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive"
                >
                  {error}
                </div>
              )}

              <Button
                type="submit"
                size="lg"
                className="h-10 w-full"
                disabled={isSubmitting || pin.trim().length === 0}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" />
                    Verifica in corso...
                  </>
                ) : (
                  "Accedi alla Dashboard"
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground">
          Architettura Stateless In-Memory • Nessun dato persistito su database
        </p>
      </div>
    </main>
  );
}
