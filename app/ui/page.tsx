import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Brain UI",
  description: "Ambiente dedicato per la nuova interfaccia del cervello.",
};

/**
 * Pagina bianca dedicata per la nuova interfaccia (Brain UI).
 * Isolamento completo rispetto alla dashboard preesistente.
 */
export default function BrainUIPage() {
  return (
    <main
      className="min-h-screen w-full bg-white"
      aria-label="Nuovo ambiente Brain UI"
    />
  );
}
