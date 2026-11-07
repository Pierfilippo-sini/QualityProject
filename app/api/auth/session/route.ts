import { NextResponse, type NextRequest } from "next/server";
import {
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
  createSessionToken,
  verifyPinConstantTime,
} from "@/lib/auth";

/**
 * Route Handler Stateless per l'Access Gate basato su PIN (SAD Capitolo 8).
 * - POST: Valida il PIN in tempo costante ed emette il cookie HttpOnly `scout_session_token`
 * - DELETE: Invalida la sessione rimuovendo il cookie `scout_session_token`
 */
export async function POST(request: NextRequest) {
  try {
    const accessSecret = process.env.ACCESS_GATE_SECRET;
    const brainSecret = process.env.BRAIN_GATE_SECRET;

    if (!accessSecret && !brainSecret) {
      return NextResponse.json(
        {
          error:
            "Configurazione server incompleta: nessuna chiave di accesso definita.",
        },
        { status: 500 }
      );
    }

    const body = (await request.json().catch(() => null)) as {
      pin?: unknown;
    } | null;

    const pin = typeof body?.pin === "string" ? body.pin.trim() : "";
    if (!pin) {
      return NextResponse.json(
        { error: "Inserisci il PIN di sessione per accedere." },
        { status: 400 }
      );
    }

    let matchedSecret: string | null = null;
    let redirectTo = "/";

    // Verifica prioritaria credenziale ambiente Cervello / UI
    if (brainSecret && (await verifyPinConstantTime(pin, brainSecret))) {
      matchedSecret = brainSecret;
      redirectTo = "/ui";
    } else if (accessSecret && (await verifyPinConstantTime(pin, accessSecret))) {
      matchedSecret = accessSecret;
      redirectTo = "/";
    }

    if (!matchedSecret) {
      return NextResponse.json(
        { error: "PIN di accesso non valido. Riprova." },
        { status: 401 }
      );
    }

    const token = await createSessionToken(
      matchedSecret,
      SESSION_MAX_AGE_SECONDS,
      redirectTo
    );
    const response = NextResponse.json(
      { authenticated: true, redirectTo },
      { status: 200 }
    );

    response.cookies.set({
      name: SESSION_COOKIE_NAME,
      value: token,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_MAX_AGE_SECONDS,
    });

    return response;
  } catch {
    return NextResponse.json(
      { error: "Errore interno durante la verifica della sessione." },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  const response = NextResponse.json({ authenticated: false }, { status: 200 });
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}
