import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth";

/**
 * Middleware di Protezione Access Gate (SAD Capitolo 8).
 * Intercetta tutte le rotte della dashboard e gli endpoint API protetti,
 * verificando il cookie stateless firmato `scout_session_token`.
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Endpoint pubblico per autenticazione PIN e logout
  if (pathname === "/api/auth/session") {
    return NextResponse.next();
  }

  const sessionToken = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const isAuthenticated = await verifySessionToken(
    sessionToken,
    process.env.ACCESS_GATE_SECRET
  );

  // Gestione rotta pubblica /login
  if (pathname === "/login") {
    if (isAuthenticated) {
      return NextResponse.redirect(new URL("/", request.url));
    }
    return NextResponse.next();
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

  // Protezione rotte UI (Dashboard principale e sottopagine)
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
