"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, LayoutGroup, motion } from "framer-motion";
import RotatingEarth from "./components/RotatingEarth";
import IntroSequence from "./components/IntroSequence";
import RankingCard, { type RankedCompanyItem } from "./components/RankingCard";
import MorphOrb, { type MorphOrbRef } from "./components/MorphOrb";
import HeroShutterText from "./components/HeroShutterText";
import TypingEffect from "./components/TypingEffect";
import { GlassFilter } from "@/components/ui/liquid-glass-button";
import "./evenkeel.css";

const INITIAL_RANKED_COMPANIES: RankedCompanyItem[] = [
  {
    rank: 5,
    name: "Nordic Logistics S.r.l.",
    revenue: "N/A",
    employees: "8-15 stimati",
    cluster: "Logistica",
    subcategory: "Trasporto merci su strada",
  },
  {
    rank: 4,
    name: "Vanguard Packaging S.p.A.",
    revenue: 1450000,
    employees: "N/A",
    cluster: "Packaging",
    subcategory: "Imballaggi in cartone",
  },
  {
    rank: 3,
    name: "Officine Meccaniche Rossi S.r.l.",
    revenue: 3820000,
    employees: 34,
    cluster: "Meccanica",
    subcategory: "Lavorazioni CNC",
  },
  {
    rank: 2,
    name: "Krono Automazioni S.p.A.",
    revenue: 7640000,
    employees: 68,
    cluster: "Automazione",
    subcategory: "Robotica industriale",
  },
  {
    rank: 1,
    name: "Aeterna Precision Systems S.p.A.",
    revenue: 14900000,
    employees: 125,
    cluster: "Meccanica di precisione",
    subcategory: "Componenti aerospaziali",
  },
];

export default function BrainUIPage() {
  const [isIntroFinished, setIsIntroFinished] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [navHidden, setNavHidden] = useState(false);
  const [confirmExit, setConfirmExit] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  // Parametro variabile: numero di aziende richieste in classifica dall'utente (le aziende con rank > targetRankedCount sono "Fuori classifica")
  const [targetRankedCount] = useState<number>(3);
  const [companies] = useState<RankedCompanyItem[]>(INITIAL_RANKED_COMPANIES);
  const [companyHunterKey, setCompanyHunterKey] = useState(0);
  const morphOrbRef = React.useRef<MorphOrbRef>(null);
  const [agentPhase, setAgentPhase] = useState<string>("idle");
  const [isAgentScreenOpen, setIsAgentScreenOpen] = useState(false);
  const scrollRafRef = React.useRef<number | null>(null);

  // Ordine dal peggiore al migliore in classifica (es. #5, #4 fuori classifica per prime -> poi #3, #2, #1)
  const orderedCompanies = useMemo(
    () => [...companies].sort((a, b) => b.rank - a.rank),
    [companies]
  );

  const handleAgentSubmit = useCallback(async (query: string) => {
    await new Promise((resolve) => setTimeout(resolve, 1400));
    return "Target analizzato: " + query + ". Ho individuato 5 aziende conformi con fatturato verificato, cluster di settore e score di prioritario pronto per il tuo CRM.";
  }, []);

  const handleIntroFinish = useCallback(() => {
    setIsIntroFinished(true);
  }, []);

  // Lock page scroll during the intro splash sequence so the user stays on the Hero viewport
  useEffect(() => {
    if (!isIntroFinished) {
      window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isIntroFinished]);

  // Track when the full black screen (#agent-screen) is reached so the shutter title triggers only after it opens
  useEffect(() => {
    if (!isIntroFinished) return;
    const agentEl = document.getElementById("agent-screen");
    if (!agentEl) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.85) {
            setIsAgentScreenOpen(true);
          } else if (entry.intersectionRatio < 0.3) {
            setIsAgentScreenOpen(false);
          }
        });
      },
      { threshold: [0, 0.3, 0.85] }
    );

    observer.observe(agentEl);
    return () => observer.disconnect();
  }, [isIntroFinished]);

  // Keep viewport locked on #agent-screen when the agent is actively processing/answering
  useEffect(() => {
    if (agentPhase !== "idle" && agentPhase !== "reset") {
      const agentEl = document.getElementById("agent-screen");
      if (agentEl) {
        const top = Math.round(agentEl.getBoundingClientRect().top + window.scrollY);
        if (Math.abs(window.scrollY - top) > 10) {
          window.scrollTo({ top, behavior: "instant" as ScrollBehavior });
        }
      }
    }
  }, [agentPhase]);

  // Initialize 8B motion-kit measurements, scroll-driven scenes, and navigation behaviors
  useEffect(() => {
    const html = document.documentElement;
    const supportsTimeline =
      typeof CSS !== "undefined" &&
      typeof CSS.supports === "function" &&
      CSS.supports("animation-timeline: view()");
    const noReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: no-preference)"
    ).matches;
    const live = noReducedMotion && supportsTimeline;

    if (live) {
      html.setAttribute("data-8b-live", "");
    }

    const box = (element: Element) => {
      if (!(element instanceof HTMLElement)) {
        const r = element.getBoundingClientRect();
        return {
          x: r.left + window.scrollX,
          y: r.top + window.scrollY,
          w: r.width,
          h: r.height,
        };
      }
      let x = 0;
      let y = 0;
      let node: HTMLElement | null = element;
      while (node) {
        x += node.offsetLeft;
        y += node.offsetTop;
        node = node.offsetParent as HTMLElement | null;
      }
      return {
        x,
        y,
        w: element.offsetWidth,
        h: element.offsetHeight,
      };
    };

    const setVars = (
      element: HTMLElement | null,
      vars: Record<string, string | number>
    ) => {
      if (!element) return;
      for (const [name, value] of Object.entries(vars)) {
        element.style.setProperty(name, String(value));
      }
    };

    const measures = new Set<() => void>();

    // Number all [data-8b-items] groups (--i, --n)
    const numberItems = () => {
      document.querySelectorAll("[data-8b-items]").forEach((group) => {
        const selector = group.getAttribute("data-8b-items");
        if (!selector) return;
        let items: HTMLElement[] = [];
        try {
          items = Array.from(group.querySelectorAll<HTMLElement>(selector));
        } catch {
          return;
        }
        items.forEach((item, index) => {
          item.style.setProperty("--i", String(index));
          item.style.setProperty("--n", String(items.length));
        });
      });
    };

    numberItems();
    measures.add(numberItems);

    // Scene: Opening
    const measureOpening = () => {
      const section = document.getElementById("opening");
      if (!section) return;
      const two = section.querySelector<HTMLElement>(".op-two");
      const rule = section.querySelector<HTMLElement>(".op-rule");
      const rows = Array.from(
        section.querySelectorAll<HTMLElement>(".op-say > .l-a")
      );
      if (two && rule) {
        setVars(section, {
          "--opening-run": `${two.offsetTop}px`,
          "--opening-slit": `${rule.offsetLeft}px`,
        });
        rows.forEach((row, i) => {
          const child = row.firstElementChild as HTMLElement | null;
          setVars(child, {
            "--opening-row": `${rule.offsetLeft - row.offsetLeft}px`,
            "--opening-step": i,
          });
        });
      }
    };
    measures.add(measureOpening);

    // Scene: Month
    const measureMonth = () => {
      const section = document.getElementById("month");
      const board = section?.querySelector<HTMLElement>(".mo-board");
      if (section && board) {
        setVars(section, {
          "--month-board-w": `${board.clientWidth}px`,
          "--month-board-h": `${board.clientHeight}px`,
        });
      }
    };
    measures.add(measureMonth);

    // Scene: Clients
    const measureClients = () => {
      const title = document.querySelector<HTMLElement>("#clients .cl-title");
      const a = title?.querySelector<HTMLElement>(".cl-half--a");
      const b = title?.querySelector<HTMLElement>(".cl-half--b");
      if (!title || !a || !b) return;
      const wide = window.matchMedia("(min-width: 701px)");
      const cx = title.clientWidth / 2;
      if (wide.matches) {
        // Natural typography word spacing between "Qualified" and "customers"
        const fontSize = parseFloat(getComputedStyle(title).fontSize) || 64;
        const gap = fontSize * 0.28;
        const start = cx - (a.offsetWidth + gap + b.offsetWidth) / 2;
        setVars(a, {
          "--clients-x": `${start - a.offsetLeft}px`,
          "--clients-y": "0px",
        });
        setVars(b, {
          "--clients-x": `${start + a.offsetWidth + gap - b.offsetLeft}px`,
          "--clients-y": "0px",
        });
      } else {
        const cy = title.clientHeight / 2;
        setVars(a, {
          "--clients-x": `${cx - a.offsetWidth / 2 - a.offsetLeft}px`,
          "--clients-y": `${cy - a.offsetHeight - a.offsetTop}px`,
        });
        setVars(b, {
          "--clients-x": `${cx - b.offsetWidth / 2 - b.offsetLeft}px`,
          "--clients-y": `${cy - b.offsetTop}px`,
        });
      }
    };
    measures.add(measureClients);

    // Scene: Team
    const measureTeam = () => {
      const row = document.querySelector<HTMLElement>("#team .tm-row");
      if (!row) return;
      const cards = Array.from(row.children) as HTMLElement[];
      const middle = (cards.length - 1) / 2;
      cards.forEach((card, i) => {
        setVars(card, {
          "--team-x": `${
            row.clientWidth / 2 -
            (card.offsetLeft + card.offsetWidth / 2) +
            (i - middle) * 16
          }px`,
          "--team-y": `${
            row.clientHeight / 2 -
            (card.offsetTop + card.offsetHeight / 2) +
            (i % 2 ? -12 : 12)
          }px`,
        });
      });
    };
    measures.add(measureTeam);

    // Scene: Reviews
    const measureReviews = () => {
      const sheets = Array.from(
        document.querySelectorAll<HTMLElement>("#reviews .rv-stack > li")
      );
      let at = 0;
      sheets.slice(0, -1).forEach((sheet, i) => {
        at += sheet.offsetHeight + parseFloat(getComputedStyle(sheet).marginBottom);
        setVars(sheet, {
          "--reviews-at": `${at}px`,
          "--reviews-top": `${
            parseFloat(getComputedStyle(sheets[i + 1]).top) || 0
          }px`,
        });
      });
    };
    measures.add(measureReviews);

    // Scene: Footer
    const measureFooter = () => {
      const footer = document.getElementById("footer");
      const word = footer?.querySelector<HTMLElement>(".ft-word");
      const ghost = footer?.querySelector<HTMLElement>(".ghost");
      if (footer && word && ghost) {
        const wordFontSize = parseFloat(getComputedStyle(word).fontSize) || 1;
        const ghostFontSize = parseFloat(getComputedStyle(ghost).fontSize) || 1;
        setVars(footer, {
          "--footer-run": `${
            document.documentElement.offsetHeight - box(word).y
          }px`,
          "--footer-from": ghostFontSize / wordFontSize,
        });
      }
    };
    measures.add(measureFooter);

    // [data-8b-motion] scroll enter triggers
    const getEnterAt = (element: Element) => {
      const own = /^(\d{1,3}(?:\.\d+)?)%$/.exec(
        (element.getAttribute("data-8b-enter") || "").trim()
      );
      return own && +own[1] <= 100 ? +own[1] / 100 : 0.88;
    };

    let pendingMotions = Array.from(
      document.querySelectorAll<HTMLElement>("[data-8b-motion]")
    ).map((element) => ({
      element,
      y: 0,
      at: getEnterAt(element),
    }));

    const checkMotions = () => {
      pendingMotions = pendingMotions.filter((item) => {
        if (item.y > window.scrollY + window.innerHeight * item.at) {
          return true;
        }
        item.element.classList.add("is-in");
        return false;
      });
    };

    const updateMotionPositions = () => {
      pendingMotions.forEach((item) => {
        item.y = box(item.element).y;
      });
      checkMotions();
    };
    measures.add(updateMotionPositions);

    // Track progress for #month and #switch
    const updateScrollTracks = () => {
      const trackSection = (
        sectionEl: HTMLElement | null,
        itemsConfig: [string, string, number][]
      ) => {
        if (!sectionEl) return;
        const rect = sectionEl.getBoundingClientRect();
        const vh = window.innerHeight;
        const d0 = rect.top;
        const d1 = rect.top + rect.height - vh;
        const p =
          d1 === d0 ? (d0 <= 0 ? 1 : 0) : Math.min(1, Math.max(0, -d0 / (d1 - d0)));

        itemsConfig.forEach(([selector, className, threshold]) => {
          const el = document.querySelector(selector);
          if (el) {
            el.classList.toggle(className, p >= threshold);
          }
        });
      };

      let scrolledPastTimeline = 0;
      const monthEl = document.getElementById("month");
      if (monthEl) {
        const rect = monthEl.getBoundingClientRect();
        const vh = window.innerHeight;
        const d0 = rect.top;
        const d1 = rect.top + rect.height - vh;
        const p =
          d1 === d0 ? (d0 <= 0 ? 1 : 0) : Math.min(1, Math.max(0, -d0 / (d1 - d0)));

        const tasksEl = monthEl.querySelector<HTMLElement>(".mo-tasks");
        if (tasksEl) {
          const remainingPct = Math.max(0, (1 - p) * 100).toFixed(2);
          if (window.innerWidth > 700) {
            tasksEl.style.clipPath = `inset(0 ${remainingPct}% 0 0)`;
          } else {
            tasksEl.style.clipPath = `inset(0 0 ${remainingPct}% 0)`;
          }
        }

        const taskItems = monthEl.querySelectorAll<HTMLElement>(".mo-tasks > li");
        taskItems.forEach((item, idx) => {
          const threshold = (idx + 0.05) / 5;
          item.classList.toggle("is-on", p >= threshold);
        });

        // Pixels scrolled past the exact moment the timeline bar reaches the right edge (bottom reaches vh)
        scrolledPastTimeline = vh - rect.bottom;
      }

      trackSection(document.getElementById("switch"), [
        ["#switch .sw-tiles > li:nth-of-type(1)", "is-done", 0.30333],
        ["#switch .sw-tiles > li:nth-of-type(2)", "is-done", 0.63667],
        ["#switch .sw-tiles > li:nth-of-type(3)", "is-done", 0.97],
      ]);

      // Scroll-driven line-by-line thickening for #principle
      // Starts shortly after the timeline bar has reached the right edge of #month,
      // and completes with the last line fully bold at the bottom of the page.
      const principleLines = document.querySelectorAll<HTMLElement>("#principle .pc-l");
      if (principleLines.length > 0) {
        const vh = window.innerHeight;
        const maxScroll = Math.max(1, document.documentElement.scrollHeight - vh);
        const curScroll = window.scrollY;
        // Remaining scroll distance to the exact bottom of the page
        const distToBottom = Math.max(0, maxScroll - curScroll);

        const timelineDelayPx = 60;

        if (scrolledPastTimeline < timelineDelayPx) {
          // Timeline bar has not yet completed and passed the delay buffer: hold at initial thin weight
          principleLines.forEach((line) => {
            const wordsEl = line.querySelector<HTMLElement>(".pc-w");
            if (wordsEl) {
              wordsEl.style.fontWeight = "300";
              wordsEl.style.opacity = "0.35";
              wordsEl.style.letterSpacing = "-0.01em";
            }
          });
        } else {
          // Active scroll budget from activation point down to fine pagina
          const activeBudget = Math.max(260, distToBottom + (scrolledPastTimeline - timelineDelayPx));

          // Staggered windows: line 1 activates shortly after timeline completes, line 4 completes (1.0) at fine pagina
          const lineRanges = [
            { start: activeBudget * 1.0, end: activeBudget * 0.52 },
            { start: activeBudget * 0.82, end: activeBudget * 0.35 },
            { start: activeBudget * 0.64, end: activeBudget * 0.18 },
            { start: activeBudget * 0.44, end: 0 },
          ];

          principleLines.forEach((line, idx) => {
            const cfg = lineRanges[idx] || lineRanges[lineRanges.length - 1];
            const span = cfg.start - cfg.end;
            const rawP = span > 0 ? (cfg.start - distToBottom) / span : 1;
            const clampedP = Math.max(0, Math.min(1, rawP));
            // Smoothstep easing for high-end optical weight transition
            const p = clampedP * clampedP * (3 - 2 * clampedP);

            const weight = Math.round(300 + 500 * p);
            const opacity = +(0.35 + 0.65 * p).toFixed(3);
            const tracking = +(-0.01 - 0.03 * p).toFixed(4);

            const wordsEl = line.querySelector<HTMLElement>(".pc-w");
            if (wordsEl) {
              wordsEl.style.fontWeight = String(weight);
              wordsEl.style.opacity = String(opacity);
              wordsEl.style.letterSpacing = `${tracking}em`;
            }
          });
        }
      }
    };
    measures.add(updateScrollTracks);

    const runAllMeasures = () => {
      measures.forEach((fn) => {
        try {
          fn();
        } catch {
          // ignore measurement errors during layout transitions
        }
      });
    };

    runAllMeasures();

    const resizeObserver = new ResizeObserver(() => {
      requestAnimationFrame(runAllMeasures);
    });
    resizeObserver.observe(document.body);

    let lastScrollY = window.scrollY;
    const handleScroll = () => {
      const y = window.scrollY;
      if (Math.abs(y - lastScrollY) >= 4) {
        setNavHidden(y > lastScrollY && y > 140);
        lastScrollY = y;
      }
      requestAnimationFrame(() => {
        checkMotions();
        updateScrollTracks();
      });
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    document.fonts?.ready.then(runAllMeasures);

    // Pause spirit level bubble when offscreen
    const levelEl = document.querySelector("#opening .op-level");
    let levelObserver: IntersectionObserver | null = null;
    if (levelEl && "IntersectionObserver" in window) {
      levelObserver = new IntersectionObserver(([entry]) => {
        levelEl.classList.toggle("is-paused", !entry.isIntersecting);
      });
      levelObserver.observe(levelEl);
    }

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("scroll", handleScroll);
      levelObserver?.disconnect();
    };
  }, []);

  const smoothScrollToSelector = useCallback(
    (selector: string, duration = 880) => {
      const isHero = selector === "#hero" || selector === "#opening";
      const target = isHero
        ? document.getElementById("opening") || document.body
        : document.querySelector<HTMLElement>(selector);
      if (!target && !isHero) return;

      if (scrollRafRef.current !== null) {
        cancelAnimationFrame(scrollRafRef.current);
        scrollRafRef.current = null;
      }

      const startY = window.scrollY;
      const targetY = isHero
        ? 0
        : Math.max(
            0,
            Math.round(target!.getBoundingClientRect().top + window.scrollY)
          );
      const delta = targetY - startY;

      if (Math.abs(delta) < 2) {
        window.scrollTo(0, targetY);
        return;
      }

      const startTime = performance.now();
      const easeInOutCubic = (t: number) =>
        t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

      const step = (now: number) => {
        const elapsed = now - startTime;
        const progress = Math.min(1, elapsed / duration);
        const eased = easeInOutCubic(progress);
        window.scrollTo(0, Math.round(startY + delta * eased));

        if (progress < 1) {
          scrollRafRef.current = requestAnimationFrame(step);
        } else {
          window.scrollTo(0, targetY);
          scrollRafRef.current = null;
        }
      };

      scrollRafRef.current = requestAnimationFrame(step);
    },
    []
  );

  const handleNavAnchorClick = (
    e: React.MouseEvent<HTMLAnchorElement>,
    href: string
  ) => {
    if (!href.startsWith("#")) return;
    e.preventDefault();
    setMenuOpen(false);
    setConfirmExit(false);
    if (href === "#agent-screen") {
      smoothScrollToSelector("#agent-screen", 880);
      window.setTimeout(() => {
        setIsAgentScreenOpen(true);
      }, 920);
      return;
    }
    smoothScrollToSelector(href, 880);
  };

  const handleExitLogout = async () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    try {
      await fetch("/api/auth/session", { method: "DELETE" });
    } finally {
      window.location.href = "/login";
    }
  };

  const siteRevealTransition = {
    duration: 1.15,
    ease: [0.22, 1, 0.36, 1] as [number, number, number, number],
  };

  return (
    <LayoutGroup>
      <div
        className={`evenkeel-site min-h-screen w-full bg-white ${
          isIntroFinished ? "is-revealed" : ""
        }`}
      >
        {/* Intro Splash Sequence (Fasi 1, 2, 3, 4) */}
        <IntroSequence
          isIntroFinished={isIntroFinished}
          onFinish={handleIntroFinish}
        />

        {/* Navigation */}
        <motion.header
          id="nav"
          className={`nav ${navHidden && !menuOpen ? "is-hidden" : ""}`}
          data-8b-section="navigation"
          initial={{ opacity: 0 }}
          animate={{ opacity: isIntroFinished ? 1 : 0 }}
          transition={siteRevealTransition}
        >
          <button
            className="m-btn-3 nav__menu"
            type="button"
            aria-expanded={menuOpen}
            aria-controls="menu"
            onClick={() => {
              setConfirmExit(false);
              setMenuOpen(true);
            }}
          >
            <span className="m-btn-3__label">Menu</span>
          </button>

          <div className="menu" id="menu" hidden={!menuOpen}>
            <span className="menu__rule" aria-hidden="true"></span>
            <div className="menu__top">
              <button
                className="m-icon menu__close"
                type="button"
                aria-label="Close menu"
                onClick={() => {
                  setMenuOpen(false);
                  setConfirmExit(false);
                }}
              >
                <svg
                  className="m-icon__glyph"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path d="M5 5l14 14M19 5L5 19" />
                </svg>
              </button>
            </div>
            <nav aria-label="Main">
              <ul className="menu__list" data-8b-items=":scope > li">
                {[
                  ["#hero", "Home page"],
                  ["#agent-screen", "AI Agent"],
                  ["#reviews", "Ranking"],
                  ["#team", "How to use"],
                ].map(([href, label]) => (
                  <li key={href}>
                    <a
                      className="m-link-3"
                      href={href}
                      onClick={(e) => handleNavAnchorClick(e, href)}
                    >
                      {label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
            <div className="menu__foot">
              <div className="menu__exit-wrap">
                <button
                  className="m-icon menu__power-btn"
                  type="button"
                  aria-label="Power off"
                  onClick={() => setConfirmExit((prev) => !prev)}
                >
                  <svg
                    className="m-icon__glyph"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path d="M12 3v9" strokeLinecap="round" />
                    <path
                      d="M17.66 6.34a8 8 0 1 1-11.32 0"
                      strokeLinecap="round"
                    />
                  </svg>
                </button>
                {confirmExit && (
                  <button
                    className="m-btn menu__exit-confirm"
                    type="button"
                    disabled={isLoggingOut}
                    onClick={handleExitLogout}
                  >
                    <span className="m-btn__label">exit</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </motion.header>

        <main>
          {/* Opening / Hero Section */}
          <section id="opening" className="op" data-8b-section="opening">
            <div className="op-one">
              <motion.span
                className="l-rule op-rule"
                aria-hidden="true"
                initial={{ opacity: 0 }}
                animate={{ opacity: isIntroFinished ? 1 : 0 }}
                transition={siteRevealTransition}
              />

              <motion.p
                className="m-text-3 op-where l-b"
                initial={{ opacity: 0 }}
                animate={{ opacity: isIntroFinished ? 1 : 0 }}
                transition={siteRevealTransition}
              >
                <span>Scouting Agent for real-time market intelligence</span>
                <span>High-precision target qualification</span>
              </motion.p>

              {/* Contenitore Finale del Globo 3D nella Hero Page (Fase 5) */}
              <div className="op-globe-stage">
                {isIntroFinished && (
                  <motion.div
                    layout
                    layoutId="company-hunter-globe"
                    transition={{
                      layout: {
                        duration: 1.25,
                        ease: [0.22, 1, 0.36, 1],
                      },
                    }}
                    className="op-globe-hero"
                  >
                    <RotatingEarth
                      width={640}
                      height={640}
                      className="h-full w-full"
                    />
                  </motion.div>
                )}
              </div>

              <motion.div
                className="op-head"
                initial={{ opacity: 0 }}
                animate={{ opacity: isIntroFinished ? 1 : 0 }}
                transition={siteRevealTransition}
              >
                <div className="op-name">
                  <p className="m-text-3 op-what">
                    Target discovery, financial audit &amp; key contacts
                  </p>
                  <h1 className="m-text-2 op-h1">
                    <span className="ln">
                      <span className="ln__i">Lead</span>
                    </span>{" "}
                    <span className="ln">
                      <span className="ln__i">Generation</span>
                    </span>
                  </h1>
                </div>
                <p className="m-text-2 op-sub">
                  <span className="ln l-a op-a">
                    <span className="ln__i">AI market</span>
                  </span>
                  <span className="ln l-a op-a">
                    <span className="ln__i">analyzer,</span>
                  </span>
                  <span className="ln l-b">
                    <span className="ln__i">profiles fit</span>
                  </span>
                  <span className="ln l-b op-in">
                    <span className="ln__i">with care.</span>
                  </span>
                </p>
                <div className="op-foot">
                  <div className="op-level" aria-hidden="true">
                    <span className="op-level__bubble"></span>
                  </div>
                  <div className="op-actions">
                    <a
                      className="m-btn"
                      href="#agent-screen"
                      onClick={(e) => handleNavAnchorClick(e, "#agent-screen")}
                    >
                      <span className="m-btn__label">Try our agent</span>
                    </a>
                    <a
                      className="m-link"
                      href="#team"
                      onClick={(e) => handleNavAnchorClick(e, "#team")}
                    >
                      Discover how to use
                    </a>
                  </div>
                </div>
              </motion.div>
            </div>

            <motion.div
              id="agent-screen"
              className="op-two relative w-full h-screen min-h-screen bg-black overflow-hidden flex flex-col justify-between"
              initial={{ opacity: 0 }}
              animate={{ opacity: isIntroFinished ? 1 : 0 }}
              transition={siteRevealTransition}
            >
              {/* Perimetro dell'intera schermata nera delimitato da 4 spigoli a L bianchi, con griglia leggera solo all'interno */}
              <div className="absolute inset-5 sm:inset-7 md:inset-9 pointer-events-none z-10 overflow-hidden">
                {/* Griglia leggera confinata unicamente all'interno del perimetro */}
                <div
                  className="absolute inset-0 opacity-[0.06] pointer-events-none"
                  style={{
                    backgroundImage: `linear-gradient(to right, #888 1px, transparent 1px), linear-gradient(to bottom, #888 1px, transparent 1px)`,
                    backgroundSize: "clamp(24px, 4vw, 48px) clamp(24px, 4vw, 48px)",
                  }}
                />

                {/* 4 Spigoli a forma di L bianchi ai 4 angoli dell'intera schermata nera */}
                <div className="absolute top-0 left-0 w-7 h-7 sm:w-8 sm:h-8 border-l-[1.5px] border-t-[1.5px] border-white/60 pointer-events-none" />
                <div className="absolute top-0 right-0 w-7 h-7 sm:w-8 sm:h-8 border-r-[1.5px] border-t-[1.5px] border-white/60 pointer-events-none" />
                <div className="absolute bottom-0 left-0 w-7 h-7 sm:w-8 sm:h-8 border-l-[1.5px] border-b-[1.5px] border-white/60 pointer-events-none" />
                <div className="absolute bottom-0 right-0 w-7 h-7 sm:w-8 sm:h-8 border-r-[1.5px] border-b-[1.5px] border-white/60 pointer-events-none" />
              </div>

              {/* In Cima: Scritta COMPANY HUNTER e bottone new question */}
              <div className="absolute inset-0 z-30 pointer-events-none">
                <HeroShutterText isOpen={isAgentScreenOpen}>
                  <AnimatePresence>
                    {agentPhase === "answered" && (
                      <motion.button
                        key="new-question-btn"
                        type="button"
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4, transition: { duration: 0.15 } }}
                        transition={{ duration: 0.25, ease: "easeOut" }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setAgentPhase("idle");
                          morphOrbRef.current?.reset();
                        }}
                        className="group relative inline-flex flex-col items-center justify-center pt-1 pb-1 px-3 bg-transparent border-0 outline-none cursor-pointer pointer-events-auto"
                      >
                        <span className="text-[11px] sm:text-xs font-mono lowercase tracking-wider text-zinc-400 group-hover:text-zinc-100 transition-colors duration-150">
                          new question
                        </span>
                        {/* Sottolineatura con estremi sfumati: bianco a riposo, verde smeraldo in hover senza filtri blur o aloni residui */}
                        <span
                          className="w-full mt-1 h-[1px] pointer-events-none transition-colors duration-200
                            bg-gradient-to-r from-transparent via-white/30 to-transparent
                            group-hover:from-transparent group-hover:via-emerald-400 group-hover:to-transparent"
                        />
                      </motion.button>
                    )}
                  </AnimatePresence>
                </HeroShutterText>
              </div>

              {/* Chat dell'agente: MorphOrb al centro/basso, senza barre laterali, con globo verde su Done */}
              <MorphOrb
                ref={morphOrbRef}
                onSubmit={handleAgentSubmit}
                onPhaseChange={(p) => setAgentPhase(p)}
              />
            </motion.div>
          </section>

          {/* Rest of the Website Sections */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: isIntroFinished ? 1 : 0 }}
            transition={siteRevealTransition}
          >
            {/* Company Ranking Carousel (replaces Questions we hear every week) */}
            <section id="reviews" className="rv" data-8b-section="reviews">
              <h2 className="m-text-2 rv-h">
                <span className="l-a">Company</span>
                <span className="l-b">ranking.</span>
              </h2>
              <ol className="rv-stack" data-8b-items=":scope > li">
                {orderedCompanies.map((company, index) => (
                  <RankingCard
                    key={company.rank}
                    company={company}
                    index={index}
                    targetRankedCount={targetRankedCount}
                  />
                ))}
              </ol>
            </section>

            {/* Clients */}
            <section id="clients" className="cl" data-8b-section="clients">
              <div className="cl-stage">
                <h2 className="m-text-2 cl-title">
                  <span className="cl-half cl-half--a">Qualified</span>{" "}
                  <span className="cl-half cl-half--b">customers</span>
                </h2>
                <ul
                  className="cl-globe"
                  data-8b-items=":scope > li"
                  aria-label="Some of the businesses whose books we keep"
                >
                  <li
                    className="cl-card"
                    style={
                      { "--lat": "74.6deg", "--lon": "0.0deg" } as React.CSSProperties
                    }
                  >
                    <div className="cl-face m-surface">
                      <span className="m-text-3">Hollis &amp; Daughter</span>
                      <span className="m-text-3 cl-trade">Bakers</span>
                    </div>
                  </li>
                  <li
                    className="cl-card"
                    style={
                      { "--lat": "63.2deg", "--lon": "137.5deg" } as React.CSSProperties
                    }
                  >
                    <div className="cl-face">
                      <img
                        className="m-photo"
                        src="https://images.unsplash.com/photo-1591538519435-4578c3ba26d6?ixid=M3w0Mzc5fDB8MXxzZWFyY2h8MXx8YmFrZXJ5JTIwc3RvcmVmcm9udHxlbnwxfDJ8fHwxNzkxMzY1NzEwfDA&ixlib=rb-4.1.0&auto=format&fit=crop&w=130&q=60"
                        alt="Pastries on the counter of a client bakery"
                        width="1600"
                        height="1491"
                        loading="lazy"
                      />
                    </div>
                  </li>
                  <li
                    className="cl-card"
                    style={
                      { "--lat": "55.2deg", "--lon": "275.0deg" } as React.CSSProperties
                    }
                  >
                    <div className="cl-face m-surface">
                      <span className="m-text-3">Marlow Cycles</span>
                      <span className="m-text-3 cl-trade">Bike repairs</span>
                    </div>
                  </li>
                  <li
                    className="cl-card"
                    style={
                      { "--lat": "48.6deg", "--lon": "52.5deg" } as React.CSSProperties
                    }
                  >
                    <div className="cl-face m-surface">
                      <span className="m-text-3">Fern Street Flowers</span>
                      <span className="m-text-3 cl-trade">Florist</span>
                    </div>
                  </li>
                  <li
                    className="cl-card"
                    style={
                      { "--lat": "42.7deg", "--lon": "190.0deg" } as React.CSSProperties
                    }
                  >
                    <div className="cl-face">
                      <img
                        className="m-photo"
                        src="https://images.unsplash.com/photo-1593702295094-aea22597af65?ixid=M3w0Mzc5fDB8MXxzZWFyY2h8MTN8fGJhcmJlciUyMHNob3B8ZW58MXwwfHx8MTc5MTM2NTcyM3ww&ixlib=rb-4.1.0&auto=format&fit=crop&w=130&q=60"
                        alt="A barber at work in a client's shop"
                        width="1600"
                        height="1067"
                        loading="lazy"
                      />
                    </div>
                  </li>
                  <li
                    className="cl-card"
                    style={
                      { "--lat": "37.4deg", "--lon": "327.5deg" } as React.CSSProperties
                    }
                  >
                    <div className="cl-face m-surface">
                      <span className="m-text-3">Quayside Barbers</span>
                      <span className="m-text-3 cl-trade">Barbers</span>
                    </div>
                  </li>
                  <li
                    className="cl-card"
                    style={
                      { "--lat": "32.4deg", "--lon": "105.0deg" } as React.CSSProperties
                    }
                  >
                    <div className="cl-face m-surface">
                      <span className="m-text-3">Kiln Lane Pottery</span>
                      <span className="m-text-3 cl-trade">Ceramics studio</span>
                    </div>
                  </li>
                  <li
                    className="cl-card"
                    style={
                      { "--lat": "27.7deg", "--lon": "242.6deg" } as React.CSSProperties
                    }
                  >
                    <div className="cl-face">
                      <img
                        className="m-photo"
                        src="https://images.unsplash.com/photo-1673201229733-69d19c5c4a87?ixid=M3w0Mzc5fDB8MXxzZWFyY2h8NHx8dGFpbG9yJTIwd29ya3Nob3B8ZW58MXwwfHx8MTc5MTM2NTcyM3ww&ixlib=rb-4.1.0&auto=format&fit=crop&w=150&q=60"
                        alt="A tailor sewing at her machine"
                        width="1600"
                        height="1067"
                        loading="lazy"
                      />
                    </div>
                  </li>
                  <li
                    className="cl-card"
                    style={
                      { "--lat": "23.1deg", "--lon": "20.1deg" } as React.CSSProperties
                    }
                  >
                    <div className="cl-face m-surface">
                      <span className="m-text-3">Albion Books</span>
                      <span className="m-text-3 cl-trade">Bookshop</span>
                    </div>
                  </li>
                  <li
                    className="cl-card"
                    style={
                      { "--lat": "18.7deg", "--lon": "157.6deg" } as React.CSSProperties
                    }
                  >
                    <div className="cl-face">
                      <img
                        className="m-photo"
                        src="https://images.unsplash.com/photo-1779694540389-2e150caf6590?ixid=M3w0Mzc5fDB8MXxzZWFyY2h8NXx8ZmxvcmlzdCUyMHNob3B8ZW58MXwyfHx8MTc5MTM2NTcxMHww&ixlib=rb-4.1.0&auto=format&fit=crop&w=120&q=60"
                        alt="Bouquets for sale at a florist's stall"
                        width="1600"
                        height="1600"
                        loading="lazy"
                      />
                    </div>
                  </li>
                  <li
                    className="cl-card"
                    style={
                      { "--lat": "14.5deg", "--lon": "295.1deg" } as React.CSSProperties
                    }
                  >
                    <div className="cl-face m-surface">
                      <span className="m-text-3">Second Shot</span>
                      <span className="m-text-3 cl-trade">Coffee</span>
                    </div>
                  </li>
                  <li
                    className="cl-card"
                    style={
                      { "--lat": "10.3deg", "--lon": "72.6deg" } as React.CSSProperties
                    }
                  >
                    <div className="cl-face m-surface">
                      <span className="m-text-3">Redland Motors</span>
                      <span className="m-text-3 cl-trade">Garage</span>
                    </div>
                  </li>
                  <li
                    className="cl-card"
                    style={
                      { "--lat": "6.2deg", "--lon": "210.1deg" } as React.CSSProperties
                    }
                  >
                    <div className="cl-face">
                      <img
                        className="m-photo"
                        src="https://images.unsplash.com/photo-1627881032258-599944eab8a1?ixid=M3w0Mzc5fDB8MXxzZWFyY2h8M3x8YmljeWNsZSUyMHJlcGFpciUyMHdvcmtzaG9wfGVufDF8Mnx8fDE3OTEzNjU3MTF8MA&ixlib=rb-4.1.0&auto=format&fit=crop&w=110&q=60"
                        alt="A bicycle wheel in a repair workshop"
                        width="1600"
                        height="1734"
                        loading="lazy"
                      />
                    </div>
                  </li>
                  <li
                    className="cl-card"
                    style={
                      { "--lat": "2.0deg", "--lon": "347.6deg" } as React.CSSProperties
                    }
                  >
                    <div className="cl-face m-surface">
                      <span className="m-text-3">Pressed</span>
                      <span className="m-text-3 cl-trade">Dry cleaning</span>
                    </div>
                  </li>
                  <li
                    className="cl-card"
                    style={
                      { "--lat": "-2.0deg", "--lon": "125.1deg" } as React.CSSProperties
                    }
                  >
                    <div className="cl-face m-surface">
                      <span className="m-text-3">Northfield Hardware</span>
                      <span className="m-text-3 cl-trade">Hardware</span>
                    </div>
                  </li>
                  <li
                    className="cl-card"
                    style={
                      { "--lat": "-6.2deg", "--lon": "262.6deg" } as React.CSSProperties
                    }
                  >
                    <div className="cl-face">
                      <img
                        className="m-photo"
                        src="https://images.unsplash.com/photo-1760018861921-43af85ea6c4f?ixid=M3w0Mzc5fDB8MXxzZWFyY2h8NXx8cG90dGVyeSUyMHN0dWRpb3xlbnwxfDB8fHwxNzkxMzY1NzIzfDA&ixlib=rb-4.1.0&auto=format&fit=crop&w=170&q=60"
                        alt="Hands shaping clay on a potter's wheel"
                        width="1600"
                        height="1067"
                        loading="lazy"
                      />
                    </div>
                  </li>
                  <li
                    className="cl-card"
                    style={
                      { "--lat": "-10.3deg", "--lon": "40.1deg" } as React.CSSProperties
                    }
                  >
                    <div className="cl-face m-surface">
                      <span className="m-text-3">Totterdown Physio</span>
                      <span className="m-text-3 cl-trade">Physiotherapy</span>
                    </div>
                  </li>
                  <li
                    className="cl-card"
                    style={
                      { "--lat": "-14.5deg", "--lon": "177.6deg" } as React.CSSProperties
                    }
                  >
                    <div className="cl-face m-surface">
                      <span className="m-text-3">Cole &amp; Pike</span>
                      <span className="m-text-3 cl-trade">Joinery</span>
                    </div>
                  </li>
                  <li
                    className="cl-card"
                    style={
                      { "--lat": "-18.7deg", "--lon": "315.1deg" } as React.CSSProperties
                    }
                  >
                    <div className="cl-face">
                      <img
                        className="m-photo"
                        src="https://images.unsplash.com/photo-1633420840567-d5c4cbdffe57?ixid=M3w0Mzc5fDB8MXxzZWFyY2h8NXx8Y29mZmVlJTIwc2hvcCUyMGNvdW50ZXJ8ZW58MXwwfHx8MTc5MTM2NTcyM3ww&ixlib=rb-4.1.0&auto=format&fit=crop&w=200&q=60"
                        alt="A barista pouring milk into a cup"
                        width="1600"
                        height="1061"
                        loading="lazy"
                      />
                    </div>
                  </li>
                  <li
                    className="cl-card"
                    style={
                      { "--lat": "-23.1deg", "--lon": "92.7deg" } as React.CSSProperties
                    }
                  >
                    <div className="cl-face m-surface">
                      <span className="m-text-3">Harbour Yoga</span>
                      <span className="m-text-3 cl-trade">Yoga studio</span>
                    </div>
                  </li>
                  <li
                    className="cl-card"
                    style={
                      { "--lat": "-27.7deg", "--lon": "230.2deg" } as React.CSSProperties
                    }
                  >
                    <div className="cl-face m-surface">
                      <span className="m-text-3">Little Wren</span>
                      <span className="m-text-3 cl-trade">Nursery</span>
                    </div>
                  </li>
                  <li
                    className="cl-card"
                    style={
                      { "--lat": "-32.4deg", "--lon": "7.7deg" } as React.CSSProperties
                    }
                  >
                    <div className="cl-face">
                      <img
                        className="m-photo"
                        src="https://images.unsplash.com/photo-1630147351247-8d7b39d7e681?ixid=M3w0Mzc5fDB8MXxzZWFyY2h8NXx8Ym9va3Nob3AlMjBpbnRlcmlvcnxlbnwxfDB8fHwxNzkxMzY1NzIzfDA&ixlib=rb-4.1.0&auto=format&fit=crop&w=190&q=60"
                        alt="Shelves of an independent bookshop"
                        width="1600"
                        height="1200"
                        loading="lazy"
                      />
                    </div>
                  </li>
                  <li
                    className="cl-card"
                    style={
                      { "--lat": "-37.4deg", "--lon": "145.2deg" } as React.CSSProperties
                    }
                  >
                    <div className="cl-face m-surface">
                      <span className="m-text-3">Halfpenny Deli</span>
                      <span className="m-text-3 cl-trade">Delicatessen</span>
                    </div>
                  </li>
                  <li
                    className="cl-card"
                    style={
                      { "--lat": "-42.7deg", "--lon": "282.7deg" } as React.CSSProperties
                    }
                  >
                    <div className="cl-face m-surface">
                      <span className="m-text-3">Linden Opticians</span>
                      <span className="m-text-3 cl-trade">Opticians</span>
                    </div>
                  </li>
                  <li
                    className="cl-card"
                    style={
                      { "--lat": "-48.6deg", "--lon": "60.2deg" } as React.CSSProperties
                    }
                  >
                    <div className="cl-face">
                      <img
                        className="m-photo"
                        src="https://images.unsplash.com/photo-1676018366904-c083ed678e60?ixid=M3w0Mzc5fDB8MXxzZWFyY2h8M3x8Y2FyJTIwbWVjaGFuaWMlMjBnYXJhZ2V8ZW58MXwwfHx8MTc5MTM2NTcyM3ww&ixlib=rb-4.1.0&auto=format&fit=crop&w=170&q=60"
                        alt="A mechanic working in a small garage"
                        width="1600"
                        height="1067"
                        loading="lazy"
                      />
                    </div>
                  </li>
                  <li
                    className="cl-card"
                    style={
                      { "--lat": "-55.2deg", "--lon": "197.7deg" } as React.CSSProperties
                    }
                  >
                    <div className="cl-face m-surface">
                      <span className="m-text-3">Gable Roofing</span>
                      <span className="m-text-3 cl-trade">Roofers</span>
                    </div>
                  </li>
                  <li
                    className="cl-card"
                    style={
                      { "--lat": "-63.2deg", "--lon": "335.2deg" } as React.CSSProperties
                    }
                  >
                    <div className="cl-face">
                      <img
                        className="m-photo"
                        src="https://images.unsplash.com/photo-1788905761561-d47d8df41edf?ixid=M3w0Mzc5fDB8MXxzZWFyY2h8OHx8c21hbGwlMjBzaG9wJTIwb3duZXIlMjBjb3VudGVyfGVufDF8Mnx8fDE3OTEzNjU3MTB8MA&ixlib=rb-4.1.0&auto=format&fit=crop&w=140&q=60"
                        alt="A customer at the counter of a dry cleaner"
                        width="1600"
                        height="1600"
                        loading="lazy"
                      />
                    </div>
                  </li>
                  <li
                    className="cl-card"
                    style={
                      { "--lat": "-74.6deg", "--lon": "112.7deg" } as React.CSSProperties
                    }
                  >
                    <div className="cl-face m-surface">
                      <span className="m-text-3">Southville Vets</span>
                      <span className="m-text-3 cl-trade">Vets</span>
                    </div>
                  </li>
                </ul>
                <p className="m-text-3 cl-note">
                  Thousands+ of potential clients. Here is a small sample.
                </p>
              </div>
            </section>

            {/* Team */}
            <section
              id="team"
              className="tm"
              data-8b-section="team"
            >
              <h2 className="m-text-2 tm-h">
                <span className="l-a">Una domanda,</span>
                <span className="l-b">al resto pensiamo noi.</span>
              </h2>
              <p className="m-text-3 tm-sub l-b">
                Come usare al meglio il nostro agente
              </p>
              <ul className="tm-row" data-8b-items=":scope > li">
                {/* 1. Prompt */}
                <li
                  className="tm-card"
                  style={{ "--team-tilt": "-8deg" } as React.CSSProperties}
                >
                  <div className="tm-glass-card group/glass">
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-0 z-0 rounded-2xl bg-white/[0.04] shadow-[0_0_8px_rgba(0,0,0,0.03),0_2px_6px_rgba(0,0,0,0.08),inset_3px_3px_0.5px_-3.5px_rgba(255,255,255,0.09),inset_-3px_-3px_0.5px_-3.5px_rgba(255,255,255,0.85),inset_1px_1px_1px_-0.5px_rgba(255,255,255,0.6),inset_-1px_-1px_1px_-0.5px_rgba(255,255,255,0.6),inset_0_0_6px_6px_rgba(255,255,255,0.12),inset_0_0_2px_2px_rgba(255,255,255,0.06),0_0_12px_rgba(0,0,0,0.15)] transition-[background-color,box-shadow] duration-300 group-hover/glass:bg-white/[0.08]"
                    />
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-0 -z-10 overflow-hidden rounded-2xl backdrop-blur-[12px] backdrop-saturate-150"
                    />
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-0 -z-10 overflow-hidden rounded-2xl"
                      style={{ backdropFilter: 'url("#container-glass")' }}
                    />
                    <div className="relative z-10 flex h-full w-full flex-col items-center justify-center p-6 text-center select-none">
                      <span className="text-3xl font-light tracking-widest text-neutral-400/80 font-mono">
                        01
                      </span>
                    </div>
                  </div>
                  <h3 className="m-text-4">1. Inserisci il prompt</h3>
                  <p className="m-text">
                    Inizia descrivendo liberamente la tua ricerca. Puoi definire
                    settore, geografia, fatturato minimo o bisogni specifici:
                    l&apos;agente comprende il contesto naturale e costruisce la
                    strategia di scouting.
                  </p>
                </li>

                {/* 2. Parametri dimensionali */}
                <li
                  className="tm-card"
                  style={{ "--team-tilt": "-4deg" } as React.CSSProperties}
                >
                  <div className="tm-glass-card group/glass">
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-0 z-0 rounded-2xl bg-white/[0.04] shadow-[0_0_8px_rgba(0,0,0,0.03),0_2px_6px_rgba(0,0,0,0.08),inset_3px_3px_0.5px_-3.5px_rgba(255,255,255,0.09),inset_-3px_-3px_0.5px_-3.5px_rgba(255,255,255,0.85),inset_1px_1px_1px_-0.5px_rgba(255,255,255,0.6),inset_-1px_-1px_1px_-0.5px_rgba(255,255,255,0.6),inset_0_0_6px_6px_rgba(255,255,255,0.12),inset_0_0_2px_2px_rgba(255,255,255,0.06),0_0_12px_rgba(0,0,0,0.15)] transition-[background-color,box-shadow] duration-300 group-hover/glass:bg-white/[0.08]"
                    />
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-0 -z-10 overflow-hidden rounded-2xl backdrop-blur-[12px] backdrop-saturate-150"
                    />
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-0 -z-10 overflow-hidden rounded-2xl"
                      style={{ backdropFilter: 'url("#container-glass")' }}
                    />
                    <div className="relative z-10 flex h-full w-full flex-col items-center justify-center p-6 text-center select-none">
                      <span className="text-3xl font-light tracking-widest text-neutral-400/80 font-mono">
                        02
                      </span>
                    </div>
                  </div>
                  <h3 className="m-text-4">2. Parametri dimensionali</h3>
                  <p className="m-text">
                    In alternativa puoi indicare parametri precisi: dimensione
                    aziendale (fatturato o dipendenti), area geografica e categoria
                    per 5 aziende. Non è obbligatorio compilarli tutti nei campi,
                    ma devono essere specificati nel prompt.
                  </p>
                </li>

                {/* 3. Pensiero & Scoring */}
                <li
                  className="tm-card"
                  style={{ "--team-tilt": "2deg" } as React.CSSProperties}
                >
                  <div className="tm-glass-card group/glass">
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-0 z-0 rounded-2xl bg-white/[0.04] shadow-[0_0_8px_rgba(0,0,0,0.03),0_2px_6px_rgba(0,0,0,0.08),inset_3px_3px_0.5px_-3.5px_rgba(255,255,255,0.09),inset_-3px_-3px_0.5px_-3.5px_rgba(255,255,255,0.85),inset_1px_1px_1px_-0.5px_rgba(255,255,255,0.6),inset_-1px_-1px_1px_-0.5px_rgba(255,255,255,0.6),inset_0_0_6px_6px_rgba(255,255,255,0.12),inset_0_0_2px_2px_rgba(255,255,255,0.06),0_0_12px_rgba(0,0,0,0.15)] transition-[background-color,box-shadow] duration-300 group-hover/glass:bg-white/[0.08]"
                    />
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-0 -z-10 overflow-hidden rounded-2xl backdrop-blur-[12px] backdrop-saturate-150"
                    />
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-0 -z-10 overflow-hidden rounded-2xl"
                      style={{ backdropFilter: 'url("#container-glass")' }}
                    />
                    <div className="relative z-10 flex h-full w-full flex-col items-center justify-center p-6 text-center select-none">
                      <span className="text-3xl font-light tracking-widest text-neutral-400/80 font-mono">
                        03
                      </span>
                    </div>
                  </div>
                  <h3 className="m-text-4">3. Pensiero &amp; Scoring</h3>
                  <p className="m-text">
                    L&apos;agente specializzato passa alla fase di pensiero ed elabora
                    i dati raccolti sul web. Esegue un&apos;analisi approfondita su
                    ciascuna azienda candidata, assegnando un punteggio e ordinandole
                    in classifica.
                  </p>
                </li>

                {/* 4. Bersaglio & Trigger (50/50) */}
                <li
                  className="tm-card"
                  style={{ "--team-tilt": "-3deg" } as React.CSSProperties}
                >
                  <div className="tm-glass-card group/glass">
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-0 z-0 rounded-2xl bg-white/[0.04] shadow-[0_0_8px_rgba(0,0,0,0.03),0_2px_6px_rgba(0,0,0,0.08),inset_3px_3px_0.5px_-3.5px_rgba(255,255,255,0.09),inset_-3px_-3px_0.5px_-3.5px_rgba(255,255,255,0.85),inset_1px_1px_1px_-0.5px_rgba(255,255,255,0.6),inset_-1px_-1px_1px_-0.5px_rgba(255,255,255,0.6),inset_0_0_6px_6px_rgba(255,255,255,0.12),inset_0_0_2px_2px_rgba(255,255,255,0.06),0_0_12px_rgba(0,0,0,0.15)] transition-[background-color,box-shadow] duration-300 group-hover/glass:bg-white/[0.08]"
                    />
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-0 -z-10 overflow-hidden rounded-2xl backdrop-blur-[12px] backdrop-saturate-150"
                    />
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-0 -z-10 overflow-hidden rounded-2xl"
                      style={{ backdropFilter: 'url("#container-glass")' }}
                    />
                    <div className="relative z-10 flex h-full w-full flex-col items-center justify-center p-6 text-center select-none">
                      <span className="text-3xl font-light tracking-widest text-neutral-400/80 font-mono">
                        04
                      </span>
                    </div>
                  </div>
                  <h3 className="m-text-4">4. Bersaglio &amp; Trigger (50/50)</h3>
                  <p className="m-text">
                    Il voto finale combina due metriche personalizzabili via slider:
                    Bersaglio (50%), aderenza ai requisiti richiesti, e Trigger
                    (50%), che valuta la reale propensione all&apos;acquisto basandosi
                    su notizie, assunzioni ed eventi recenti.
                  </p>
                </li>

                {/* 5. Esporta e Archivia in Excel */}
                <li
                  className="tm-card"
                  style={{ "--team-tilt": "7deg" } as React.CSSProperties}
                >
                  <div className="tm-glass-card group/glass">
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-0 z-0 rounded-2xl bg-white/[0.04] shadow-[0_0_8px_rgba(0,0,0,0.03),0_2px_6px_rgba(0,0,0,0.08),inset_3px_3px_0.5px_-3.5px_rgba(255,255,255,0.09),inset_-3px_-3px_0.5px_-3.5px_rgba(255,255,255,0.85),inset_1px_1px_1px_-0.5px_rgba(255,255,255,0.6),inset_-1px_-1px_1px_-0.5px_rgba(255,255,255,0.6),inset_0_0_6px_6px_rgba(255,255,255,0.12),inset_0_0_2px_2px_rgba(255,255,255,0.06),0_0_12px_rgba(0,0,0,0.15)] transition-[background-color,box-shadow] duration-300 group-hover/glass:bg-white/[0.08]"
                    />
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-0 -z-10 overflow-hidden rounded-2xl backdrop-blur-[12px] backdrop-saturate-150"
                    />
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-0 -z-10 overflow-hidden rounded-2xl"
                      style={{ backdropFilter: 'url("#container-glass")' }}
                    />
                    <div className="relative z-10 flex h-full w-full flex-col items-center justify-center p-6 text-center select-none">
                      <span className="text-3xl font-light tracking-widest text-neutral-400/80 font-mono">
                        05
                      </span>
                    </div>
                  </div>
                  <h3 className="m-text-4">5. Esporta e Archivia in Excel</h3>
                  <p className="m-text">
                    A fine sessione salvi comodamente tutti i dati elaborati in formato
                    Excel con un clic. Scarica il foglio di calcolo completo con metriche,
                    recapiti e motivazioni dello score per archiviarli nel tuo CRM.
                  </p>
                </li>
              </ul>
            </section>

            {/* Month */}
            <section id="month" className="mo" data-8b-section="month">
              <div className="mo-stage">
                <h2 className="m-text-2 mo-h">
                  <span className="l-a">Cinque fasi,</span>
                  <span className="l-b">zero attrito.</span>
                </h2>
                <p className="m-text-3 mo-sub l-b">
                  Come funziona il nostro agente
                </p>
                <div className="mo-board">
                  <div className="mo-scale" aria-hidden="true">
                    <span className="mo-fill"></span>
                  </div>
                  <span className="mo-marker" aria-hidden="true"></span>
                  <ol className="mo-tasks" data-8b-items=":scope > li">
                    <li className="mo-task">
                      <p className="m-text-3 mo-day">Fase 01</p>
                      <h3 className="m-text-4">Scouting online</h3>
                      <p className="m-text">
                        Ricerca aziende target online per individuare tutte le
                        realtà attive nel settore richiesto.
                      </p>
                    </li>
                    <li className="mo-task">
                      <p className="m-text-3 mo-day">Fase 02</p>
                      <h3 className="m-text-4">Dati &amp; Maps</h3>
                      <p className="m-text">
                        Arricchimento simultaneo: categoria, fatturato, dimensione
                        e verifica sede Google Maps [in contemporanea].
                      </p>
                    </li>
                    <li className="mo-task">
                      <p className="m-text-3 mo-day">Fase 03</p>
                      <h3 className="m-text-4">News &amp; Potenziale</h3>
                      <p className="m-text">
                        Cerca news aziendali e analizza le reali potenzialità di
                        vendita dei tuoi servizi.
                      </p>
                    </li>
                    <li className="mo-task">
                      <p className="m-text-3 mo-day">Fase 04</p>
                      <h3 className="m-text-4">Scoring &amp; Rank</h3>
                      <p className="m-text">
                        Dà un voto alle aziende e stila la classifica gerarchica
                        dalla prima all&apos;ultima.
                      </p>
                    </li>
                    <li className="mo-task">
                      <p className="m-text-3 mo-day">Fase 05</p>
                      <h3 className="m-text-4">Report human</h3>
                      <p className="m-text">
                        Produce un output finale ordinato, trasparente e human
                        &amp; business friendly.
                      </p>
                    </li>
                  </ol>
                </div>
                <p className="m-text-3 mo-note">
                  Dalla query al dossier operativo in pochi minuti.
                </p>
              </div>
            </section>

            {/* Principle */}
            <section id="principle" className="pc" data-8b-section="principle">
              <blockquote className="m-text-2 pc-q">
                <span className="pc-l pc-l-a" data-pc-line="1">
                  <span className="pc-w">Il mercato non aspetta</span>
                  <span className="pc-dot pc-dot--black" aria-hidden="true" />
                </span>
                <span className="pc-l pc-l-b" data-pc-line="2">
                  <span className="pc-w">Il tuo </span>
                  <span className="pc-agent">scouting agent</span>
                </span>
                <span className="pc-l pc-l-a" data-pc-line="3">
                  <span className="pc-w">ha già selezionato</span>
                </span>
                <span className="pc-l pc-l-b" data-pc-line="4">
                  <span className="pc-w">chi ha bisogno di te</span>
                  <span className="pc-dot" aria-hidden="true" />
                </span>
              </blockquote>
            </section>
          </motion.div>
        </main>
        <GlassFilter />
      </div>
    </LayoutGroup>
  );
}
