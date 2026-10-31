import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, readSessionToken, homeFor, type Role } from "@/lib/session";

// Admin: todo. Operador: /registro y su API. Pantalla (TV): solo la ruleta y el sorteo.
const ADMIN_ONLY = ["/admin", "/ruleta", "/api/draw", "/api/admin"];
const TV_ONLY = ["/ruleta", "/api/draw"];
const under = (pathname: string, list: string[]) => list.some((p) => pathname === p || pathname.startsWith(p + "/"));
function allowed(role: Role, pathname: string) {
  if (role === "admin") return true;
  if (role === "tv") return under(pathname, TV_ONLY);
  return !under(pathname, ADMIN_ONLY);
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const session = await readSessionToken(req.cookies.get(SESSION_COOKIE)?.value);

  if (session && allowed(session.role, pathname)) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: session ? "Tu usuario no tiene permiso para esto" : "No autorizado" }, { status: session ? 403 : 401 });
  }
  if (session) return NextResponse.redirect(new URL(homeFor(session.role), req.url));
  const url = new URL("/login", req.url);
  url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/admin/:path*", "/ruleta/:path*", "/registro/:path*", "/api/draw/:path*", "/api/admin/:path*",
    "/api/register/:path*", "/api/lookup/:path*"],
};
