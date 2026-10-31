import { seeOther } from "@/lib/redirect";
import { timingSafeEqual, createHash } from "node:crypto";
import { SESSION_COOKIE, createSessionToken, sessionMaxAge, type Session } from "@/lib/session";
import { verifyPassword } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";
import { adminPassword } from "@/lib/env";

export const runtime = "nodejs";

const sha = (v: string) => createHash("sha256").update(v).digest();

export async function POST(req: Request) {
  const form = await req.formData();
  const username = String(form.get("username") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const next = String(form.get("next") ?? "");
  const fail = () => seeOther(`/login?error=1&next=${encodeURIComponent(next)}`);

  let user: Omit<Session, "exp"> | null = null;

  // Cuenta maestra "admin" definida por variable de entorno (sirve para el primer acceso y para crear operadores).
  const envPass = adminPassword();
  if (username === "admin" && envPass && timingSafeEqual(sha(password), sha(envPass))) {
    user = { uid: "env-admin", name: "Administrador", role: "admin" };
  } else if (username !== "admin") {
    try {
      const { data } = await supabaseAdmin().from("app_users")
        .select("id, full_name, role, password_hash, is_active").eq("username", username).maybeSingle();
      if (data?.is_active && verifyPassword(password, data.password_hash)) {
        user = { uid: data.id, name: data.full_name, role: data.role };
      }
    } catch (e) {
      console.error("login", e);
      return seeOther(`/login?error=config&next=${encodeURIComponent(next)}`);
    }
  }
  if (!user) return fail();

  const fallback = user.role === "admin" ? "/admin" : "/registro";
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : fallback;
  const res = seeOther(safeNext);
  res.cookies.set(SESSION_COOKIE, await createSessionToken(user), {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: sessionMaxAge,
  });
  return res;
}
