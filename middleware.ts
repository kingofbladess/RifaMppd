import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, readSessionToken } from "@/lib/session";

// /registro y su API: cualquier usuario activo. Panel, ruleta, sorteo y gestión: solo admin.
const ADMIN_ONLY = ["/admin", "/ruleta", "/api/draw", "/api/admin"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const session = await readSessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  const needsAdmin = ADMIN_ONLY.some((p) => pathname === p || pathname.startsWith(p + "/"));

  if (session && (!needsAdmin || session.role === "admin")) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: session ? "Requiere rol administrador" : "No autorizado" }, { status: session ? 403 : 401 });
  }
  if (session) return NextResponse.redirect(new URL("/registro", req.url));
  const url = new URL("/login", req.url);
  url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/admin/:path*", "/ruleta/:path*", "/registro/:path*", "/api/draw/:path*", "/api/admin/:path*",
    "/api/register/:path*", "/api/lookup/:path*"],
};
