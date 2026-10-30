import { NextResponse } from "next/server";
import { timingSafeEqual, createHash } from "node:crypto";
import { SESSION_COOKIE, createSessionToken, sessionMaxAge, type Session } from "@/lib/session";
import { verifyPassword } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";

const sha = (v: string) => createHash("sha256").update(v).digest();

export async function POST(req: Request) {
  const form = await req.formData();
  const username = String(form.get("username") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const next = String(form.get("next") ?? "");
  const fail = () => NextResponse.redirect(new URL(`/login?error=1&next=${encodeURIComponent(next)}`, req.url), 303);

  let user: Omit<Session, "exp"> | null = null;

  // Cuenta maestra "admin" definida por variable de entorno (sirve para el primer acceso y para crear operadores).
  const envPass = process.env.ADMIN_PASSWORD ?? "";
  if (username === "admin" && envPass && timingSafeEqual(sha(password), sha(envPass))) {
    user = { uid: "env-admin", name: "Administrador", role: "admin" };
  } else {
    const { data } = await supabaseAdmin().from("app_users")
      .select("id, full_name, role, password_hash, is_active").eq("username", username).maybeSingle();
    if (data?.is_active && verifyPassword(password, data.password_hash)) {
      user = { uid: data.id, name: data.full_name, role: data.role };
    }
  }
  if (!user) return fail();

  const fallback = user.role === "admin" ? "/admin" : "/registro";
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : fallback;
  const res = NextResponse.redirect(new URL(safeNext, req.url), 303);
  res.cookies.set(SESSION_COOKIE, await createSessionToken(user), {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: sessionMaxAge,
  });
  return res;
}
