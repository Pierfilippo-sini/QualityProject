import type { Metadata } from "next";
import { Anton } from "next/font/google";
import { LoginClient } from "./login-client";

const anton = Anton({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-anton",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Accesso — B2B Scouting Agent",
};

/**
 * Pagina definitiva di Login per B2B Scouting Agent con robot 3D (Spline),
 * scritta Halftone 'SCOUTING AGENT' e componente password Liquid Glass.
 * Autentica le due stanze (`/` tramite `ACCESS_GATE_SECRET` e `/ui` tramite `BRAIN_GATE_SECRET`).
 */
export default function LoginPage() {
  return (
    <LoginClient
      titleFontClassName={anton.className}
      titleFontFamily={anton.style.fontFamily}
    />
  );
}
