"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Compass, LogOut } from "lucide-react";
import { DynamicSlider } from "@/components/scout/DynamicSlider";
import { ExportDropdown } from "@/components/scout/ExportDropdown";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useScoutStore } from "@/lib/store";

/**
 * Layout Dashboard con Topbar interattiva: Slider Real-Time, Controlli Export e Logout (SAD Cap. 9).
 */
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const resetResults = useScoutStore((s) => s.resetResults);
  const [isLoggingOut, setIsLoggingOut] = React.useState(false);

  async function handleLogout() {
    setIsLoggingOut(true);
    try {
      await fetch("/api/auth/session", { method: "DELETE" });
      resetResults();
      router.replace("/login");
      router.refresh();
    } finally {
      setIsLoggingOut(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-1 flex-col bg-muted/20">
      <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/80">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-3 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
          {/* Brand & Architettura */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                <Compass className="size-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold tracking-tight sm:text-base">
                    B2B Scouting Agent
                  </span>
                  <Badge variant="secondary" className="text-[10px]">
                    In-Memory
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  CXI Sales Matcher &amp; Search Grounding
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 lg:hidden">
              <ExportDropdown />
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={handleLogout}
                disabled={isLoggingOut}
                title="Chiudi sessione"
              >
                <LogOut className="size-4" />
              </Button>
            </div>
          </div>

          {/* Controlli Centrali e Azioni */}
          <div className="flex flex-wrap items-center justify-between gap-4 lg:justify-end">
            <DynamicSlider />

            <div className="hidden items-center gap-2 lg:flex">
              <ExportDropdown />
              <Button
                variant="ghost"
                size="default"
                onClick={handleLogout}
                disabled={isLoggingOut}
                title="Disconnetti sessione PIN"
              >
                <LogOut className="mr-1.5 size-4" />
                Esci
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6">
        {children}
      </main>
    </div>
  );
}
