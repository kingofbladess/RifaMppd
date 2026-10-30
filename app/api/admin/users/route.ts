import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { hashPassword } from "@/lib/auth";

export const runtime = "nodejs";

// Crear usuario (form POST desde /admin/usuarios). Protegido por middleware (solo admin).
export async function POST(req: Request) {
  const form = await req.formData();
  const action = String(form.get("action") ?? "create");
  const back = (q: string) => NextResponse.redirect(new URL(`/admin/usuarios?${q}`, req.url), 303);
  const sb = supabaseAdmin();

  if (action === "toggle") {
    const id = String(form.get("id"));
    const active = form.get("active") === "true";
    await sb.from("app_users").update({ is_active: !active }).eq("id", id);
    return back("ok=1");
  }

  if (action === "reset") {
    const id = String(form.get("id"));
    const password = String(form.get("password") ?? "");
    if (password.length < 8) return back("error=La+contraseña+debe+tener+al+menos+8+caracteres");
    await sb.from("app_users").update({ password_hash: hashPassword(password) }).eq("id", id);
    return back("ok=1");
  }

  const username = String(form.get("username") ?? "").trim().toLowerCase();
  const full_name = String(form.get("full_name") ?? "").trim();
  const password = String(form.get("password") ?? "");
  const role = form.get("role") === "admin" ? "admin" : "operator";
  if (!/^[a-z0-9._-]{3,32}$/.test(username) || username === "admin") return back("error=Usuario+inválido");
  if (full_name.length < 3) return back("error=Nombre+requerido");
  if (password.length < 8) return back("error=La+contraseña+debe+tener+al+menos+8+caracteres");

  const { error } = await sb.from("app_users").insert({ username, full_name, role, password_hash: hashPassword(password) });
  if (error) return back(`error=${encodeURIComponent(error.code === "23505" ? "Ese usuario ya existe" : "No se pudo crear")}`);
  return back("ok=1");
}
