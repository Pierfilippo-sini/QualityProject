"use client";

import * as React from "react";
import type { Application, SPEObject } from "@splinetool/runtime";
import { SplineScene } from "@/components/ui/splite";
import { HalftoneWordmarkFooter } from "@/components/ui/halftone-wordmark-footer";
import { PasswordGate } from "./password-gate";

interface LoginClientProps {
  titleFontClassName?: string;
  titleFontFamily?: string;
}

interface EulerVec {
  x: number;
  y: number;
  z: number;
}

interface InternalVideoHolder {
  isVideo?: boolean;
  img?: unknown;
  _cache?: Record<string, Record<string, Record<string, { needsUpdate?: boolean }>>>;
  shared?: { requestRender?: () => void };
}

interface InternalMaterialLayer {
  uuid?: string;
  type?: string;
  color?: {
    texture?: {
      value?: { needsUpdate?: boolean };
      image?: { img?: unknown };
    };
  };
  uniforms?: Record<
    string,
    {
      value?: { isVideoTexture?: boolean; needsUpdate?: boolean };
      image?: { img?: unknown };
    }
  >;
  holders?: InternalVideoHolder[];
}

interface InternalSplineApp {
  canvas?: HTMLCanvasElement;
  _scene?: {
    traverse?: (cb: (obj: unknown) => void) => void;
    getObjectByName?: (name: string) => unknown;
  };
  _sharedAssetsManager?: {
    requestRender?: () => void;
  };
  _requestRenderAutoMode?: () => void;
}

const DEG2RAD = Math.PI / 180;
// Nel video nativo degli occhi di Head 2 (6.33s), a t = 0.60s gli occhi LED sono chiusi in una linea orizzontale
const EYE_LINE_TIMESTAMP = 0.6;
const EYE_OPEN_TIMESTAMP = 0.1;

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/**
 * Estrae il `<video>` degli occhi LED del robot (`Head 2`, layer `ede530fe-2372-405d-96a3-cd68daee0858`)
 * e le relative texture WebGL/WebGPU per forzare il ridisegno immediato sul cambio di frame.
 */
function getHeadEyeVideoController(app: Application | null): {
  videos: HTMLVideoElement[];
  markTexturesDirty: () => void;
} {
  const videos = new Set<HTMLVideoElement>();
  const textures = new Set<{ needsUpdate?: boolean }>();
  const internalApp = app as unknown as InternalSplineApp | null;

  const inspectLayer = (layer: InternalMaterialLayer | null | undefined) => {
    if (!layer) return;
    const directImg = layer.color?.texture?.image?.img;
    if (directImg instanceof HTMLVideoElement) {
      videos.add(directImg);
    }
    if (layer.color?.texture?.value) {
      textures.add(layer.color.texture.value);
    }
    if (layer.uniforms) {
      for (const u of Object.values(layer.uniforms)) {
        if (u?.image?.img instanceof HTMLVideoElement) {
          videos.add(u.image.img);
        }
        if (u?.value && typeof u.value === "object") {
          textures.add(u.value);
        }
      }
    }
    if (Array.isArray(layer.holders)) {
      for (const h of layer.holders) {
        if (h?.img instanceof HTMLVideoElement) {
          videos.add(h.img);
        }
        if (h?._cache) {
          for (const wrapGroup of Object.values(h._cache)) {
            for (const minGroup of Object.values(wrapGroup ?? {})) {
              for (const tex of Object.values(minGroup ?? {})) {
                if (tex) textures.add(tex);
              }
            }
          }
        }
      }
    }
  };

  const inspectObj = (obj: unknown) => {
    if (!obj || typeof obj !== "object" || !("material" in obj)) return;
    const rawMat = (obj as { material?: unknown }).material;
    const mats = Array.isArray(rawMat) ? rawMat : rawMat ? [rawMat] : [];
    for (const m of mats) {
      if (m && typeof m === "object" && "layers" in m) {
        const layers = (m as { layers?: InternalMaterialLayer[] }).layers;
        if (Array.isArray(layers)) {
          for (const l of layers) {
            inspectLayer(l);
          }
        }
      }
    }
  };

  if (internalApp?._scene) {
    const head2 = internalApp._scene.getObjectByName?.("Head 2");
    if (head2) inspectObj(head2);
    if (videos.size === 0) {
      internalApp._scene.traverse?.(inspectObj);
    }
  }

  const markTexturesDirty = () => {
    textures.forEach((tex) => {
      tex.needsUpdate = true;
    });
    internalApp?._sharedAssetsManager?.requestRender?.();
    internalApp?._requestRenderAutoMode?.();
  };

  return {
    videos: Array.from(videos),
    markTexturesDirty,
  };
}

export function LoginClient({
  titleFontClassName,
  titleFontFamily,
}: LoginClientProps) {
  const splineRef = React.useRef<Application | null>(null);
  const passwordBoxRef = React.useRef<HTMLDivElement | null>(null);
  const spotlightRef = React.useRef<HTMLDivElement | null>(null);

  // Il riquadro password compare con effetto sfumato veloce (~500ms) esattamente prima che la scritta scenda (a 2500ms -> 3000ms)
  const [passwordVisible, setPasswordVisible] = React.useState(false);

  // Refs sincroni per la gestione dello sguardo e degli occhi senza ritardi di ciclo React
  const isInputFocusedRef = React.useRef(false);
  const isErrorAnimRef = React.useRef(false);
  const eyesClosedRef = React.useRef(false);
  const lastCursorRef = React.useRef<{ x: number; y: number } | null>(null);
  const errorRafRef = React.useRef<number | null>(null);

  // Comparsa sfumata rapida (500ms) del riquadro password a t = 2500ms, subito prima della discesa del titolo (t = 3000ms)
  React.useEffect(() => {
    const timer = window.setTimeout(() => {
      setPasswordVisible(true);
    }, 2500);
    return () => window.clearTimeout(timer);
  }, []);

  // Sincronizza gli occhi del robot:
  // - closed = true: ferma il video degli occhi al frame t = 0.60s in cui gli occhi sono una linea orizzontale
  // - closed = false: riapre gli occhi (t = 0.10s) e riprende il normale battito di ciglia
  const syncRobotEyes = React.useCallback((closed: boolean) => {
    eyesClosedRef.current = closed;
    const { videos, markTexturesDirty } = getHeadEyeVideoController(
      splineRef.current
    );

    videos.forEach((video) => {
      const guardPlay = () => {
        if (eyesClosedRef.current) {
          video.pause();
          if (Math.abs(video.currentTime - EYE_LINE_TIMESTAMP) > 0.04) {
            video.currentTime = EYE_LINE_TIMESTAMP;
          }
          markTexturesDirty();
        }
      };

      const onSeeked = () => {
        markTexturesDirty();
        requestAnimationFrame(markTexturesDirty);
      };

      video.onseeked = onSeeked;
      video.onplay = guardPlay;

      if (closed) {
        video.pause();
        if (Math.abs(video.currentTime - EYE_LINE_TIMESTAMP) > 0.03) {
          try {
            video.currentTime = EYE_LINE_TIMESTAMP;
          } catch {
            // Ignora se i metadati video non sono ancora pronti
          }
        }
        markTexturesDirty();
        requestAnimationFrame(markTexturesDirty);
      } else {
        video.onplay = null;
        try {
          if (
            video.currentTime >= 0.45 &&
            video.currentTime <= 0.78
          ) {
            video.currentTime = EYE_OPEN_TIMESTAMP;
          }
        } catch {
          // Ignora
        }
        markTexturesDirty();
        void video.play().catch(() => {});
      }
    });
  }, []);

  // Dispatcia un evento pointermove sintetico compatibile con updateRaycaster di Spline
  const dispatchSyntheticPointerMove = React.useCallback(
    (clientX: number, clientY: number) => {
      const canvas =
        splineRef.current?.canvas ?? document.querySelector("canvas");
      const target: EventTarget = canvas ?? window;

      const evt = new PointerEvent("pointermove", {
        clientX,
        clientY,
        screenX: clientX,
        screenY: clientY,
        bubbles: true,
        cancelable: true,
        view: window,
      });

      Object.defineProperty(evt, "pageX", {
        value: clientX + window.scrollX,
        configurable: true,
      });
      Object.defineProperty(evt, "pageY", {
        value: clientY + window.scrollY,
        configurable: true,
      });

      target.dispatchEvent(evt);
    },
    []
  );

  // Calcola le coordinate target per uno sguardo in alto naturale e composto
  const getLookUpCoords = React.useCallback((): { x: number; y: number } => {
    const canvas =
      splineRef.current?.canvas ?? document.querySelector("canvas");
    if (canvas) {
      const rect = canvas.getBoundingClientRect();
      return {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height * 0.08,
      };
    }
    return {
      x: window.innerWidth / 2,
      y: Math.max(40, window.innerHeight * 0.08),
    };
  }, []);

  // Orienta lo sguardo del robot verso l'alto e chiude gli occhi a linea
  const lookUpAtTitle = React.useCallback(() => {
    const { x, y } = getLookUpCoords();
    dispatchSyntheticPointerMove(x, y);
    syncRobotEyes(true);
  }, [dispatchSyntheticPointerMove, getLookUpCoords, syncRobotEyes]);

  // Orienta lo sguardo del robot dritto negli occhi dell'utente (centro schermo)
  const lookStraightAtUser = React.useCallback(() => {
    dispatchSyntheticPointerMove(
      window.innerWidth / 2,
      window.innerHeight / 2
    );
  }, [dispatchSyntheticPointerMove]);

  // Ripristina istantaneamente lo sguardo verso il puntatore reale e riapre gli occhi
  const restoreGazeToCursor = React.useCallback(
    (overrideX?: number, overrideY?: number) => {
      const x =
        overrideX ?? lastCursorRef.current?.x ?? window.innerWidth / 2;
      const y =
        overrideY ?? lastCursorRef.current?.y ?? window.innerHeight / 2;

      syncRobotEyes(false);
      dispatchSyntheticPointerMove(x, y);
      requestAnimationFrame(() => {
        if (!isInputFocusedRef.current && !isErrorAnimRef.current) {
          dispatchSyntheticPointerMove(x, y);
        }
      });
    },
    [dispatchSyntheticPointerMove, syncRobotEyes]
  );

  const handleRobotLoaded = React.useCallback(
    (app: Application) => {
      splineRef.current = app;
      if (isInputFocusedRef.current && !isErrorAnimRef.current) {
        lookUpAtTitle();
      }
    },
    [lookUpAtTitle]
  );

  React.useEffect(() => {
    const handleWindowPointerMoveCapture = (e: PointerEvent) => {
      if (!e.isTrusted) return;
      lastCursorRef.current = { x: e.clientX, y: e.clientY };

      if (spotlightRef.current) {
        spotlightRef.current.style.background = `radial-gradient(520px circle at ${e.clientX}px ${e.clientY}px, rgba(255,255,255,0.065), transparent 70%)`;
      }
    };

    const handleDocumentPointerMoveCapture = (e: PointerEvent) => {
      if (!e.isTrusted) return;
      if (isInputFocusedRef.current || isErrorAnimRef.current) {
        e.stopImmediatePropagation();
      }
    };

    const handleWindowPointerDownCapture = (e: PointerEvent) => {
      if (!e.isTrusted) return;
      lastCursorRef.current = { x: e.clientX, y: e.clientY };

      const clickedInsidePassword =
        passwordBoxRef.current?.contains(e.target as Node) ?? false;

      if (clickedInsidePassword) {
        isInputFocusedRef.current = true;
        if (!isErrorAnimRef.current) {
          lookUpAtTitle();
          requestAnimationFrame(() => {
            if (isInputFocusedRef.current && !isErrorAnimRef.current) {
              lookUpAtTitle();
            }
          });
        }
      } else if (isInputFocusedRef.current) {
        isInputFocusedRef.current = false;
        if (!isErrorAnimRef.current) {
          restoreGazeToCursor(e.clientX, e.clientY);
        }
      }
    };

    window.addEventListener("pointermove", handleWindowPointerMoveCapture, {
      capture: true,
      passive: true,
    });
    document.addEventListener("pointermove", handleDocumentPointerMoveCapture, {
      capture: true,
      passive: true,
    });
    window.addEventListener("pointerdown", handleWindowPointerDownCapture, {
      capture: true,
      passive: true,
    });

    return () => {
      window.removeEventListener("pointermove", handleWindowPointerMoveCapture, {
        capture: true,
      });
      document.removeEventListener(
        "pointermove",
        handleDocumentPointerMoveCapture,
        {
          capture: true,
        }
      );
      window.removeEventListener("pointerdown", handleWindowPointerDownCapture, {
        capture: true,
      });
    };
  }, [lookUpAtTitle, restoreGazeToCursor]);

  React.useEffect(() => {
    return () => {
      if (errorRafRef.current !== null) {
        cancelAnimationFrame(errorRafRef.current);
      }
    };
  }, []);

  const handleContainerFocusCapture = React.useCallback(() => {
    isInputFocusedRef.current = true;
    if (!isErrorAnimRef.current) {
      lookUpAtTitle();
    }
  }, [lookUpAtTitle]);

  const handleContainerBlurCapture = React.useCallback(
    (e: React.FocusEvent<HTMLDivElement>) => {
      const nextFocused = e.relatedTarget as Node | null;
      if (!nextFocused) {
        return;
      }
      if (e.currentTarget.contains(nextFocused)) {
        return;
      }
      isInputFocusedRef.current = false;
      if (!isErrorAnimRef.current) {
        restoreGazeToCursor();
      }
    },
    [restoreGazeToCursor]
  );

  // Animazione su Password Errata:
  // Ripetuta ad OGNI invio errato (anche se l'utente preme Invio 2 volte di fila mentre è già in corso)
  const handleError = React.useCallback(() => {
    const app = splineRef.current;
    const wasAlreadyInError = isErrorAnimRef.current;

    if (errorRafRef.current !== null) {
      cancelAnimationFrame(errorRafRef.current);
      errorRafRef.current = null;
    }

    isInputFocusedRef.current = true;
    isErrorAnimRef.current = true;
    // Durante il gesto della "X" il robot riapre gli occhi e guarda dritto l'utente
    syncRobotEyes(false);
    lookStraightAtUser();

    const enterDuration = 360;
    const holdDuration = 2150;
    const exitDuration = 450;

    if (!app) {
      const fallbackStart = performance.now();
      const tickFallback = (now: number) => {
        const elapsed = now - fallbackStart;
        if (elapsed < enterDuration + holdDuration) {
          lookStraightAtUser();
          errorRafRef.current = requestAnimationFrame(tickFallback);
        } else {
          errorRafRef.current = null;
          isErrorAnimRef.current = false;
          lookUpAtTitle();
        }
      };
      errorRafRef.current = requestAnimationFrame(tickFallback);
      return;
    }

    const allObjects = app.getAllObjects?.() ?? [];
    const getNodesByName = (name: string): SPEObject[] => {
      const matched = allObjects.filter((obj) => obj.name === name);
      if (matched.length > 0) return matched;
      const single = app.findObjectByName(name);
      return single ? [single] : [];
    };

    const armNodes = getNodesByName("arm");
    const elbowNodes = getNodesByName("elbow");
    const forearmNodes = getNodesByName("forearm");

    const defaultArmRot: EulerVec = {
      x: -34.09 * DEG2RAD,
      y: 0,
      z: 0,
    };
    const defaultElbowRot: EulerVec = {
      x: 0,
      y: 20.5 * DEG2RAD,
      z: 0,
    };
    const defaultForearmRot: EulerVec = {
      x: -51.03 * DEG2RAD,
      y: 0,
      z: 0,
    };

    const getArmTarget = (idx: number): EulerVec => ({
      x: (idx === 0 ? -42 : -50) * DEG2RAD,
      y: 0,
      z: -45 * DEG2RAD,
    });
    const elbowTarget: EulerVec = {
      x: 0,
      y: 20.5 * DEG2RAD,
      z: 0,
    };
    const forearmTarget: EulerVec = {
      x: -52 * DEG2RAD,
      y: -15 * DEG2RAD,
      z: -45 * DEG2RAD,
    };

    // Se l'utente preme Invio due volte di fila mentre il robot è già in posa "X",
    // parte da una posa leggermente aperta (defaultRot) così il gesto della "X" viene
    // ripetuto visivamente ogni singola volta!
    const armStart: EulerVec[] = armNodes.map((n) =>
      wasAlreadyInError
        ? { ...defaultArmRot }
        : {
            x: n.rotation.x,
            y: n.rotation.y,
            z: n.rotation.z,
          }
    );
    const elbowStart: EulerVec[] = elbowNodes.map((n) =>
      wasAlreadyInError
        ? { ...defaultElbowRot }
        : {
            x: n.rotation.x,
            y: n.rotation.y,
            z: n.rotation.z,
          }
    );
    const forearmStart: EulerVec[] = forearmNodes.map((n) =>
      wasAlreadyInError
        ? { ...defaultForearmRot }
        : {
            x: n.rotation.x,
            y: n.rotation.y,
            z: n.rotation.z,
          }
    );

    const animStart = performance.now();

    const animateSequence = (now: number) => {
      const elapsed = now - animStart;

      if (elapsed < enterDuration) {
        const rawT = Math.min(1, elapsed / enterDuration);
        const t = easeOutCubic(rawT);

        lookStraightAtUser();

        armNodes.forEach((node, idx) => {
          const s = armStart[idx] ?? defaultArmRot;
          const target = getArmTarget(idx);
          node.rotation.x = lerp(s.x, target.x, t);
          node.rotation.y = lerp(s.y, target.y, t);
          node.rotation.z = lerp(s.z, target.z, t);
        });

        elbowNodes.forEach((node, idx) => {
          const s = elbowStart[idx] ?? defaultElbowRot;
          node.rotation.x = lerp(s.x, elbowTarget.x, t);
          node.rotation.y = lerp(s.y, elbowTarget.y, t);
          node.rotation.z = lerp(s.z, elbowTarget.z, t);
        });

        forearmNodes.forEach((node, idx) => {
          const s = forearmStart[idx] ?? defaultForearmRot;
          node.rotation.x = lerp(s.x, forearmTarget.x, t);
          node.rotation.y = lerp(s.y, forearmTarget.y, t);
          node.rotation.z = lerp(s.z, forearmTarget.z, t);
        });

        errorRafRef.current = requestAnimationFrame(animateSequence);
      } else if (elapsed < enterDuration + holdDuration) {
        lookStraightAtUser();

        armNodes.forEach((node, idx) => {
          const target = getArmTarget(idx);
          node.rotation.x = target.x;
          node.rotation.y = target.y;
          node.rotation.z = target.z;
        });

        elbowNodes.forEach((node) => {
          node.rotation.x = elbowTarget.x;
          node.rotation.y = elbowTarget.y;
          node.rotation.z = elbowTarget.z;
        });

        forearmNodes.forEach((node) => {
          node.rotation.x = forearmTarget.x;
          node.rotation.y = forearmTarget.y;
          node.rotation.z = forearmTarget.z;
        });

        errorRafRef.current = requestAnimationFrame(animateSequence);
      } else if (elapsed < enterDuration + holdDuration + exitDuration) {
        const exitElapsed = elapsed - (enterDuration + holdDuration);
        const rawOutT = Math.min(1, exitElapsed / exitDuration);
        const outT = easeInOutCubic(rawOutT);

        const lookUp = getLookUpCoords();
        const centerX = window.innerWidth / 2;
        const centerY = window.innerHeight / 2;
        dispatchSyntheticPointerMove(
          lerp(centerX, lookUp.x, outT),
          lerp(centerY, lookUp.y, outT)
        );

        armNodes.forEach((node, idx) => {
          const target = getArmTarget(idx);
          node.rotation.x = lerp(target.x, defaultArmRot.x, outT);
          node.rotation.y = lerp(target.y, defaultArmRot.y, outT);
          node.rotation.z = lerp(target.z, defaultArmRot.z, outT);
        });

        elbowNodes.forEach((node) => {
          node.rotation.x = lerp(elbowTarget.x, defaultElbowRot.x, outT);
          node.rotation.y = lerp(elbowTarget.y, defaultElbowRot.y, outT);
          node.rotation.z = lerp(elbowTarget.z, defaultElbowRot.z, outT);
        });

        forearmNodes.forEach((node) => {
          node.rotation.x = lerp(forearmTarget.x, defaultForearmRot.x, outT);
          node.rotation.y = lerp(forearmTarget.y, defaultForearmRot.y, outT);
          node.rotation.z = lerp(forearmTarget.z, defaultForearmRot.z, outT);
        });

        errorRafRef.current = requestAnimationFrame(animateSequence);
      } else {
        errorRafRef.current = null;
        isErrorAnimRef.current = false;
        if (isInputFocusedRef.current) {
          lookUpAtTitle();
        } else {
          restoreGazeToCursor();
        }
      }
    };

    errorRafRef.current = requestAnimationFrame(animateSequence);
  }, [
    dispatchSyntheticPointerMove,
    getLookUpCoords,
    lookStraightAtUser,
    lookUpAtTitle,
    restoreGazeToCursor,
    syncRobotEyes,
  ]);

  const resolvedFontFamily = React.useMemo(() => {
    if (titleFontFamily) {
      return `${titleFontFamily}, "Inter Tight", "Helvetica Neue", Arial, sans-serif`;
    }
    return '"Inter Tight", "Inter Variable", "Inter", "Helvetica Neue", Arial, system-ui, sans-serif';
  }, [titleFontFamily]);

  return (
    <main className="dark relative h-dvh min-h-screen w-full overflow-hidden bg-black text-foreground select-none">
      {/*
        0. BAGLIORE INTERATTIVO SUL CURSORE (z-0)
      */}
      <div
        ref={spotlightRef}
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-0 transition-opacity duration-300"
      />

      {/*
        1. SCRITTA 'SCOUTING AGENT' CON PALLINI HALFTONE (z-[5])
      */}
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute inset-x-0 top-0 z-[5] h-[50vh] w-full ${titleFontClassName ?? ""}`}
      >
        <HalftoneWordmarkFooter
          wordmark="SCOUTING AGENT"
          preset="night"
          palette={{
            background: "transparent",
            ink: "#f4f1ea",
            warm: "#e9762b",
          }}
          dotGap={6}
          radius={90}
          stretchToFullHeight={true}
          startDelayMs={3000}
          letterStaggerMs={75}
          letterDropDurationMs={680}
          interactive={true}
          fontFamily={resolvedFontFamily}
          fontWeight={400}
          height="50vh"
        />
      </div>

      {/*
        2. ROBOT 3D SPLINE (z-10)
      */}
      <div className="absolute inset-0 z-10">
        <SplineScene
          scene="https://prod.spline.design/kZDDjO5HuC9GJUM2/scene.splinecode"
          className="h-full w-full"
          onLoad={handleRobotLoaded}
        />
      </div>

      {/*
        3. COMPONENTE PASSWORD LIQUID GLASS (z-20):
        - Alzato di ulteriori 5px (totale 10px rispetto alla baseline: top-[calc(68vh-10px)] -translate-y-1/2).
        - Compare con effetto sfumato veloce (duration-500) a t = 2500ms, esattamente mezzo secondo prima
          che la scritta 'SCOUTING AGENT' inizi a scendere (t = 3000ms).
      */}
      <div className="pointer-events-none absolute inset-x-0 top-[calc(68vh-10px)] -translate-y-1/2 z-20 flex justify-center px-4">
        <div
          ref={passwordBoxRef}
          onFocusCapture={handleContainerFocusCapture}
          onBlurCapture={handleContainerBlurCapture}
          onPointerDown={(e) => e.stopPropagation()}
          onPointerMove={(e) => e.stopPropagation()}
          className={`w-full max-w-md transition-all duration-500 ease-out ${
            passwordVisible
              ? "pointer-events-auto translate-y-0 opacity-100 blur-0"
              : "pointer-events-none translate-y-2 opacity-0 blur-sm"
          }`}
        >
          <PasswordGate onError={handleError} />
        </div>
      </div>
    </main>
  );
}
export { LoginClient as LoginNewClient };
