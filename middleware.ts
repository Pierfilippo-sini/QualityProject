import { NextResponse, type NextRequest } from "next/server";
import {
  SESSION_COOKIE_NAME,
  verifySessionTokenWithTarget,
  DEFAULT_ACCESS_GATE_SECRET,
  DEFAULT_BRAIN_GATE_SECRET,
} from "@/lib/auth";

/**
 * Middleware di Protezione Access Gate (SAD Capitolo 8).
 * Intercetta tutte le rotte della dashboard, il nuovo ambiente /ui e gli endpoint API protetti,
 * verificando il cookie stateless firmato `scout_session_token`.
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Endpoint pubblico per autenticazione PIN e logout
  if (pathname === "/api/auth/session") {
    return NextResponse.next();
  }

  const accessSecret = process.env.ACCESS_GATE_SECRET || DEFAULT_ACCESS_GATE_SECRET;
  const brainSecret = process.env.BRAIN_GATE_SECRET || DEFAULT_BRAIN_GATE_SECRET;

  const sessionToken = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = await verifySessionTokenWithTarget(sessionToken, [
    accessSecret,
    brainSecret,
  ]);
  const isAuthenticated = session.valid;

  // Gestione rotta pubblica /login (e redirect da /login-new alla pagina definitiva /login)
  if (pathname === "/login-new") {
    const destination = isAuthenticated ? session.target || "/" : "/login";
    return NextResponse.redirect(new URL(destination, request.url));
  }

  if (pathname === "/login") {
    if (isAuthenticated) {
      const destination = session.target || "/";
      return NextResponse.redirect(new URL(destination, request.url));
    }
    return NextResponse.next();
  }

  // Isolamento tra le due stanze protette:
  // - Chi accede con la password della stanza /ui (target === "/ui") viene mantenuto in /ui
  // - Chi accede con la password della dashboard principale (target === "/") non può accedere a /ui
  if (isAuthenticated) {
    if (session.target === "/ui" && !pathname.startsWith("/ui") && !pathname.startsWith("/api/")) {
      return NextResponse.redirect(new URL("/ui", request.url));
    }
    if (session.target !== "/ui" && pathname.startsWith("/ui")) {
      return NextResponse.redirect(new URL("/", request.url));
    }
  }

  // Protezione endpoint API (/api/scout, ecc.) con risposta JSON 401
  if (pathname.startsWith("/api/")) {
    if (!isAuthenticated) {
      return NextResponse.json(
        {
          error:
            "Accesso non autorizzato. Effettua il login con il PIN di sessione.",
        },
        { status: 401 }
      );
    }
    return NextResponse.next();
  }

  // Protezione rotte UI (Dashboard principale, ambiente /ui e relative sottopagine)
  if (!isAuthenticated) {
    const loginUrl = new URL("/login", request.url);
    const response = NextResponse.redirect(loginUrl);
    if (sessionToken) {
      response.cookies.delete(SESSION_COOKIE_NAME);
    }
    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
