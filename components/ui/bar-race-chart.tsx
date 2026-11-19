"use client";

import * as React from "react";

export type BarRaceDatum = {
  id: string;
  label: string;
  value: number; // Voto calcolato (es. 9.4)
  city?: string;
  revenue?: number | string;
  employees?: number | string;
  bersaglioScore?: number;
  triggerScore?: number;
  category?: string;
  icon?: React.ReactNode;
};

export type NonClassificataItem = {
  id: string;
  name: string;
  city?: string;
  revenue?: number | string;
  employees?: number | string;
  reason: string;
};

export type BarRaceChartProps = {
  data: BarRaceDatum[];
  nonClassificate?: NonClassificataItem[];
  topN?: number; // Numero di aziende in classifica (default 5 o 10)
  duration?: number;
  rowHeight?: number;
  sort?: "desc" | "asc";
  formatValue?: (value: number) => string;
  caption?: React.ReactNode;
  period?: React.ReactNode;
  showRankChange?: boolean;
  onSelectCompany?: (companyName: string) => void;
  isSearching?: boolean;
  className?: string;
  ref?: React.ComponentProps<"div">["ref"];
};

const defaultFormat = (value: number) => value.toFixed(1);

/**
 * Formatta il fatturato in forma abbreviata e pulita (es. +14M€, €8.5M, 10-50M€)
 */
export function formatShortRevenue(value?: number | string): string {
  if (value === undefined || value === null || value === "" || value === "N/A") return "—";
  if (typeof value === "number") {
    if (value >= 1_000_000_000) return `€${(value / 1_000_000_000).toFixed(1)}B`;
    if (value >= 10_000_000) return `+${Math.round(value / 1_000_000)}M€`;
    if (value >= 1_000_000) return `€${(value / 1_000_000).toFixed(1)}M`;
    if (value >= 1_000) return `€${Math.round(value / 1_000)}k`;
    return `€${value}`;
  }
  const clean = String(value).trim();
  if (clean.includes("10M - 50M")) return "10-50M€";
  return clean;
}

/**
 * Formatta i dipendenti in forma abbreviata (es. 70+, 98+, 160+)
 */
export function formatShortEmployees(value?: number | string): string {
  if (value === undefined || value === null || value === "" || value === "N/A") return "—";
  if (typeof value === "number") return `${value}+`;
  const clean = String(value).trim();
  const m = clean.match(/\d+/);
  if (m) return `${m[0]}+`;
  return clean;
}

/**
 * Palette Dinamica basata sulla classifica (Stile Zoom / Scena):
 * Il colore varia dinamicamente in base alla posizione conquistata:
 * - #1: Rosso firma del nostro sito (#d12a1e) con bagliore rubino
 * - #2: Scarlatto brillante (#e62820)
 * - #3: Corallo acceso (#f45347)
 * - #4: Salmone caldo (#f87b72)
 * - #5: Rosa tenue (#fca9a3)
 * - #6..#10: Tonalità progressivamente sfumate
 * - Fuori Ranking: Trasparenza satinata opaca per evidenziare il distacco
 */
export function getBarColorByRank(
  rank: number,
  isFuoriRanking: boolean
): {
  bg: string;
  border: string;
  shadow?: string;
  textTone: string;
} {
  if (isFuoriRanking) {
    return {
      bg: "rgba(255, 255, 255, 0.16)",
      border: "rgba(255, 255, 255, 0.22)",
      textTone: "text-zinc-400",
    };
  }

  const PALETTE = [
    { r: 209, g: 42, b: 30, glow: "0 0 16px rgba(209, 42, 30, 0.7)" }, // #1 Rosso Sito
    { r: 230, g: 40, b: 32, glow: "0 0 10px rgba(230, 40, 32, 0.45)" }, // #2 Scarlatto
    { r: 244, g: 83, b: 71 },                                            // #3 Corallo
    { r: 248, g: 123, b: 114 },                                          // #4 Salmone
    { r: 252, g: 169, b: 163 },                                          // #5 Rosa tenue
    { r: 253, g: 198, b: 194 },                                          // #6 Rosa cipria
    { r: 254, g: 220, b: 218 },                                          // #7 Sfumato chiaro
    { r: 254, g: 237, b: 236 },                                          // #8 Quasi bianco
    { r: 255, g: 247, b: 246 },                                          // #9 Bianco caldo
    { r: 255, g: 255, b: 255 },                                          // #10 Bianco puro
  ];

  if (rank < PALETTE.length) {
    const p = PALETTE[rank]!;
    return {
      bg: `rgb(${p.r}, ${p.g}, ${p.b})`,
      border: `rgba(${p.r}, ${p.g}, ${p.b}, 0.85)`,
      shadow: p.glow,
      textTone: rank <= 4 ? "text-white" : "text-zinc-900",
    };
  }

  return {
    bg: "rgb(255, 255, 255)",
    border: "rgba(255, 255, 255, 0.6)",
    textTone: "text-zinc-900",
  };
}

/**
 * Zoom Dinamico della Scena:
 * Distende la larghezza delle barre in modo che anche variazioni minime di punteggio
 * creino ampie differenze visive chiare.
 */
export function computeZoomedWidths(values: number[]): number[] {
  if (values.length === 0) return [];
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  const spread = maxVal - minVal;

  const zoomFactor = Math.max(0, Math.min(1, (4.5 - spread) / 3.5));

  return values.map((val) => {
    if (maxVal <= 0) return 0;
    const stdWidth = (val / maxVal) * 92;
    const norm = spread > 0.05 ? (val - minVal) / spread : 1;
    const zoomedWidth = 26 + norm * (92 - 26);
    const blended = (1 - zoomFactor) * stdWidth + zoomFactor * zoomedWidth;
    return Math.max(14, Math.min(100, Math.round(blended * 10) / 10));
  });
}

function useReducedMotion() {
  const [reduced, setReduced] = React.useState(true);
  React.useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return reduced;
}

function useRollingNumber(target: number, duration: number, reduced: boolean) {
  const [shown, setShown] = React.useState(target);
  const current = React.useRef(target);
  React.useEffect(() => {
    if (reduced || duration <= 0) {
      current.current = target;
      setShown(target);
      return;
    }
    const start = performance.now();
    const begin = current.current;
    let frame = requestAnimationFrame(function tick(now) {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - (1 - t) ** 3;
      current.current = begin + (target - begin) * eased;
      setShown(current.current);
      if (t < 1) frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [target, duration, reduced]);
  return shown;
}

type RowItemProps = {
  datum: BarRaceDatum;
  rank: number;
  width: number;
  isFuoriRanking: boolean;
  rowHeight: number;
  duration: number;
  reduced: boolean;
  format: (value: number) => string;
  onSelectCompany?: (companyName: string) => void;
};

function RowItem({
  datum,
  rank,
  width,
  isFuoriRanking,
  rowHeight,
  duration,
  reduced,
  format,
  onSelectCompany,
}: RowItemProps) {
  const shown = useRollingNumber(datum.value, duration, reduced);
  const colorStyle = getBarColorByRank(rank, isFuoriRanking);

  return (
    <div
      data-row={datum.id}
      data-rank={rank}
      data-fuori={isFuoriRanking ? "true" : "false"}
      style={{ height: rowHeight }}
      className={`flex items-center gap-3 w-full transition-all duration-300 ${
        isFuoriRanking ? "opacity-75 hover:opacity-100" : "opacity-100"
      }`}
    >
      {/* 1. Posizione in Classifica */}
      <span
        className={`w-6 shrink-0 text-right pr-1 font-mono text-xs font-semibold tabular-nums ${
          isFuoriRanking ? "text-zinc-500" : rank === 0 ? "text-white font-bold" : "text-zinc-400"
        }`}
      >
        {rank + 1}
      </span>

      {/* 2. Nome Azienda (più grande, cliccabile, senza icona e senza location sotto) */}
      <div className="w-52 sm:w-64 md:w-80 lg:w-96 shrink-0 truncate">
        <button
          type="button"
          onClick={() => onSelectCompany?.(datum.label)}
          title={`Vai alla scheda di ${datum.label} in Company ranking`}
          className="truncate text-left text-[13px] sm:text-sm font-semibold text-white hover:text-red-400 hover:underline transition-colors cursor-pointer bg-transparent border-0 p-0 block w-full"
        >
          {datum.label}
        </button>
      </div>

      {/* 3. Colonna Sede (Location a destra del nome) */}
      <div className="hidden sm:block w-28 sm:w-32 shrink-0 truncate font-mono text-[11px] text-zinc-400 text-left">
        {datum.city || "—"}
      </div>

      {/* 4. Colonna Fatturato */}
      <div className="hidden md:block w-24 sm:w-28 shrink-0 truncate font-mono text-[11px] text-zinc-300 text-left">
        {formatShortRevenue(datum.revenue)}
      </div>

      {/* 5. Colonna Dipendenti */}
      <div className="hidden md:block w-20 sm:w-24 shrink-0 truncate font-mono text-[11px] text-zinc-400 text-left">
        {formatShortEmployees(datum.employees)}
      </div>

      {/* 6. Sbarra Animata con Zoom Dinamico & Voto numerico */}
      <div className="relative mr-12 sm:mr-14 h-6 sm:h-6.5 min-w-[140px] flex-1">
        <div
          data-bar
          style={{ width: `${width}%` }}
          className="relative h-full transition-[width] duration-400 ease-out"
        >
          <div
            className="h-full rounded-md transition-all duration-300"
            style={{
              backgroundColor: colorStyle.bg,
              border: `1px solid ${colorStyle.border}`,
              boxShadow: colorStyle.shadow,
            }}
          />
          {/* Voto numerico che sostituisce la revenue */}
          <span
            className={`absolute left-full top-1/2 ml-2 sm:ml-2.5 -translate-y-1/2 whitespace-nowrap font-mono text-xs font-bold tabular-nums ${
              isFuoriRanking ? "text-zinc-400" : "text-white"
            }`}
          >
            {format(shown)}
          </span>
        </div>
      </div>
    </div>
  );
}

export function BarRaceChart({
  data,
  nonClassificate = [],
  topN = 5,
  duration = 450,
  rowHeight = 34,
  sort = "desc",
  formatValue = defaultFormat,
  caption = "ranking",
  period,
  onSelectCompany,
  isSearching = false,
  className = "",
  ref,
}: BarRaceChartProps) {
  const reduced = useReducedMotion();

  // Ordinamento per voto decrescente
  const sorted = React.useMemo(() => {
    return [...data].sort((a, b) =>
      sort === "desc" ? b.value - a.value || a.id.localeCompare(b.id) : a.value - b.value
    );
  }, [data, sort]);

  const visibleValues = sorted.map((d) => d.value);

  // Zoom Dinamico della Scena calcolato su tutti i valori presenti
  const zoomedWidths = React.useMemo(() => {
    return computeZoomedWidths(visibleValues);
  }, [visibleValues]);

  // Se in fase di ricerca con globo, mostra un massimo rigoroso di 12 aziende (aggiunta 1 azienda in più)
  // per allungare di poco la schermata verso il basso mantenendo margini eccellenti
  const maxSearchItems = 12;
  const inRanking = isSearching
    ? sorted.slice(0, Math.min(topN, maxSearchItems))
    : sorted.slice(0, topN);

  const remainingSlotsForFuori = isSearching
    ? Math.max(0, maxSearchItems - inRanking.length)
    : sorted.length - topN;

  const fuoriRanking = isSearching
    ? sorted.slice(topN, topN + remainingSlotsForFuori)
    : sorted.slice(topN);

  const remainingSlotsForNonClassificate = isSearching
    ? Math.max(0, maxSearchItems - inRanking.length - fuoriRanking.length)
    : nonClassificate.length;

  const visibleNonClassificate = isSearching
    ? nonClassificate.slice(0, remainingSlotsForNonClassificate)
    : nonClassificate;

  const hasMultipleCompanies = sorted.length > 5 || visibleNonClassificate.length > 0;

  return (
    <figure
      ref={ref}
      data-slot="bar-race-chart"
      className={`relative w-full ${className}`}
    >
      {/* Header Colonne: Titoli allineati sopra ciascuna colonna senza barre o linee divisorie */}
      <figcaption className="mb-2.5 flex items-center gap-3 border-b border-white/10 pb-2 text-[11px] font-mono font-bold uppercase tracking-wider text-zinc-400 select-none">
        {/* Spacer per colonna Rank # */}
        <span className="w-6 shrink-0 text-right pr-1">#</span>

        {/* Colonna Azienda */}
        <span className="w-52 sm:w-64 md:w-80 lg:w-96 shrink-0 text-left text-white font-bold tracking-widest">
          {caption || "RANKING"}
        </span>

        {/* Colonna Sede */}
        <span className="hidden sm:block w-28 sm:w-32 shrink-0 text-left">
          SEDE
        </span>

        {/* Colonna Fatturato */}
        <span className="hidden md:block w-24 sm:w-28 shrink-0 text-left">
          FATTURATO
        </span>

        {/* Colonna Dipendenti */}
        <span className="hidden md:block w-20 sm:w-24 shrink-0 text-left">
          DIPENDENTI
        </span>

        {/* Colonna Score / Punteggio & Badge Categoria */}
        <div className="flex-1 min-w-[140px] flex items-center justify-between">
          <span className="text-left">SCORE</span>
          {period !== undefined && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.06] px-2.5 py-0.5 font-mono text-[10px] sm:text-[11px] font-semibold tabular-nums text-white backdrop-blur-sm normal-case">
              {period}
            </span>
          )}
        </div>
      </figcaption>

      {/* Lista aziende: durante la ricerca allungata di 1 azienda (max 12), a schermo intero espansa fino alle linee guida */}
      <div
        className={`relative w-full space-y-1 transition-all duration-300 ${
          hasMultipleCompanies
            ? isSearching
              ? "max-h-[min(52vh,435px)] overflow-y-auto pr-1.5 scrollbar-thin scrollbar-thumb-white/20 scrollbar-track-transparent"
              : "max-h-[min(56vh,500px)] overflow-y-auto pr-1.5 scrollbar-thin scrollbar-thumb-white/20 scrollbar-track-transparent"
            : ""
        }`}
      >
        {/* 1. Aziende in Classifica Ufficiale (Top N) */}
        {inRanking.map((datum, rank) => (
          <RowItem
            key={datum.id}
            datum={datum}
            rank={rank}
            width={zoomedWidths[rank] ?? 50}
            isFuoriRanking={false}
            rowHeight={rowHeight}
            duration={duration}
            reduced={reduced}
            format={formatValue}
            onSelectCompany={onSelectCompany}
          />
        ))}

        {/* 2. Divisore Fuori Ranking: linea che parte da dopo che finisce la scritta */}
        {fuoriRanking.length > 0 && (
          <div className="flex items-center gap-2.5 pt-2 pb-1 px-1">
            <span className="font-mono text-[11px] font-semibold uppercase tracking-wider text-zinc-400 whitespace-nowrap pl-1">
              fuori ranking
            </span>
            <div className="h-[1px] flex-1 bg-white/20" />
          </div>
        )}

        {/* 2. Aziende Fuori Ranking che hanno comunque ricevuto il voto */}
        {fuoriRanking.map((datum, idx) => {
          const globalRank = topN + idx;
          return (
            <RowItem
              key={datum.id}
              datum={datum}
              rank={globalRank}
              width={zoomedWidths[globalRank] ?? 40}
              isFuoriRanking={true}
              rowHeight={rowHeight}
              duration={duration}
              reduced={reduced}
              format={formatValue}
              onSelectCompany={onSelectCompany}
            />
          );
        })}

        {/* 3. Sezione Non Classificate: scartate a monte senza sbarra, con motivo preciso */}
        {visibleNonClassificate.length > 0 && (
          <>
            <div className="flex items-center gap-2.5 pt-2.5 pb-1 px-1">
              <span className="font-mono text-[11px] font-semibold uppercase tracking-wider text-zinc-400 whitespace-nowrap pl-1">
                non classificate
              </span>
              <div className="h-[1px] flex-1 bg-white/15" />
            </div>

            {visibleNonClassificate.map((discarded, idx) => (
              <div
                key={discarded.id || `disc-${idx}`}
                style={{ minHeight: rowHeight }}
                className="flex items-center gap-3 w-full py-1 text-xs opacity-75 hover:opacity-100 transition-opacity"
              >
                {/* Indicatore scarto */}
                <span className="w-6 shrink-0 text-right pr-1 font-mono text-xs text-zinc-500 font-bold">
                  ✕
                </span>

                {/* Nome Azienda */}
                <div className="w-52 sm:w-64 md:w-80 lg:w-96 shrink-0 truncate">
                  <span className="text-[12px] sm:text-[13px] font-medium text-zinc-300">
                    {discarded.name}
                  </span>
                </div>

                {/* Sede */}
                <div className="hidden sm:block w-28 sm:w-32 shrink-0 truncate font-mono text-[11px] text-zinc-400">
                  {discarded.city || "—"}
                </div>

                {/* Motivo preciso della scelta dello scarto (al posto della sbarra, in grigio) */}
                <div className="flex-1 min-w-[140px] pr-2">
                  <span className="font-mono text-[11px] text-zinc-400 leading-tight block truncate">
                    {discarded.reason}
                  </span>
                </div>
              </div>
            ))}
          </>
        )}
      </div>

      <div className="sr-only">
        <table>
          <caption>
            {typeof caption === "string" ? caption : "Ranked values"}
            {typeof period === "string" ? ` · ${period}` : ""}
          </caption>
          <thead>
            <tr>
              <th scope="col">Rank</th>
              <th scope="col">Name</th>
              <th scope="col">Score</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((datum, index) => (
              <tr key={datum.id}>
                <td>{index + 1}</td>
                <td>{datum.label}</td>
                <td>{formatValue(datum.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}

export default BarRaceChart;
