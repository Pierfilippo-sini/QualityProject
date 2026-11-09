"use client";

import React, { useEffect, useLayoutEffect, useRef } from "react";
import * as d3 from "d3";
import worldData from "../data/world-data.json";

interface RotatingEarthProps {
  width?: number;
  height?: number;
  className?: string;
  onReady?: () => void;
}

// Shared live rotation angle so that Intro -> Hero layoutId transition preserves exact rotation state
const sharedState = {
  rotation: [-12, -8] as [number, number],
  scaleMultiplier: 1,
};

const landFeatures = (worldData as any).landFeatures;
const landDots = (worldData as any).dots as [number, number][];

const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

export default function RotatingEarth({
  width = 640,
  height = 640,
  className = "",
  onReady,
}: RotatingEarthProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  useIsomorphicLayoutEffect(() => {
    if (!canvasRef.current) return;

    const canvas = canvasRef.current;
    const context = canvas.getContext("2d", { alpha: true });
    if (!context) return;

    // Fixed internal coordinate space so CSS/Framer Motion scaling is 100% seamless & razor-sharp
    const size = Math.min(width, height);
    const baseRadius = size * 0.475;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    context.scale(dpr, dpr);

    const projection = d3
      .geoOrthographic()
      .scale(baseRadius * sharedState.scaleMultiplier)
      .translate([size / 2, size / 2])
      .rotate(sharedState.rotation)
      .clipAngle(90);

    const path = d3.geoPath().projection(projection).context(context);
    const graticuleGeometry = d3.geoGraticule()();

    let isDisposed = false;

    const render = () => {
      if (isDisposed) return;
      context.clearRect(0, 0, size, size);

      const currentScale = projection.scale();
      const scaleFactor = currentScale / baseRadius;

      // 1. Draw ocean (Swiss white globe interior + black border)
      context.beginPath();
      context.arc(size / 2, size / 2, currentScale, 0, 2 * Math.PI);
      context.fillStyle = "#ffffff";
      context.fill();
      context.strokeStyle = "#0b0b0b";
      context.lineWidth = 2.2 * scaleFactor;
      context.stroke();

      // 2. Draw graticule (subtle black wireframe grid)
      context.beginPath();
      path(graticuleGeometry);
      context.strokeStyle = "#0b0b0b";
      context.lineWidth = 0.85 * scaleFactor;
      context.globalAlpha = 0.22;
      context.stroke();
      context.globalAlpha = 1;

      // 3. Draw continent outlines
      context.beginPath();
      const features = landFeatures.features;
      for (let i = 0; i < features.length; i++) {
        path(features[i]);
      }
      context.strokeStyle = "#0b0b0b";
      context.lineWidth = 1.15 * scaleFactor;
      context.stroke();

      // 4. Draw halftone land dots in a single batched GPU path (< 0.8ms per frame)
      context.beginPath();
      const dotRadius = 1.35 * scaleFactor;
      const twoPi = 2 * Math.PI;
      for (let i = 0; i < landDots.length; i++) {
        const projected = projection(landDots[i]);
        if (projected) {
          const px = projected[0];
          const py = projected[1];
          context.moveTo(px + dotRadius, py);
          context.arc(px, py, dotRadius, 0, twoPi);
        }
      }
      context.fillStyle = "#1a1a1a";
      context.fill();
    };

    // Paint immediately on frame 0 (synchronous, zero network wait)
    render();
    onReadyRef.current?.();

    let autoRotate = true;
    const rotationSpeed = 0.38;
    let lastTime = performance.now();

    const rotationTimer = d3.timer((now) => {
      const dt = Math.min(32, now - lastTime);
      lastTime = now;
      if (autoRotate) {
        sharedState.rotation[0] += rotationSpeed * (dt / 16.667);
        projection.rotate(sharedState.rotation);
        render();
      }
    });

    const handleMouseDown = (event: MouseEvent) => {
      autoRotate = false;
      const startX = event.clientX;
      const startY = event.clientY;
      const startRotation: [number, number] = [
        sharedState.rotation[0],
        sharedState.rotation[1],
      ];

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const sensitivity = 0.45;
        const dx = moveEvent.clientX - startX;
        const dy = moveEvent.clientY - startY;

        sharedState.rotation[0] = startRotation[0] + dx * sensitivity;
        sharedState.rotation[1] = Math.max(
          -85,
          Math.min(85, startRotation[1] - dy * sensitivity)
        );

        projection.rotate(sharedState.rotation);
        render();
      };

      const handleMouseUp = () => {
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
        setTimeout(() => {
          autoRotate = true;
        }, 15);
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    };

    const handleWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const factor = event.deltaY > 0 ? 0.92 : 1.08;
      sharedState.scaleMultiplier = Math.max(
        0.65,
        Math.min(1.8, sharedState.scaleMultiplier * factor)
      );
      projection.scale(baseRadius * sharedState.scaleMultiplier);
      render();
    };

    canvas.addEventListener("mousedown", handleMouseDown);
    canvas.addEventListener("wheel", handleWheel, { passive: false });

    return () => {
      isDisposed = true;
      rotationTimer.stop();
      canvas.removeEventListener("mousedown", handleMouseDown);
      canvas.removeEventListener("wheel", handleWheel);
    };
  }, [width, height]);

  return (
    <div className={`relative select-none ${className}`}>
      <canvas
        ref={canvasRef}
        className="block h-full w-full cursor-grab rounded-full active:cursor-grabbing"
      />
    </div>
  );
}
