// Solo servidor. Sin "server-only" para poder usarse también desde instrumentation.ts (sincroniza al arrancar).
import { readLocal, saveLocal, localCacheEnabled } from "./local-cache";

// Copia local de los usuarios para poder iniciar sesión en la laptop aunque se caiga el internet.
// La contraseña ya viene cifrada (scrypt) desde la base; nunca se guarda en texto.
export type CachedUser = { id: string; username: string; full_name: string; role: "admin" | "operator" | "tv"; password_hash: string; is_active: boolean };

const env = (...names: string[]) => names.map((n) => process.env[n]?.trim().replace(/^["']|["']$/g, "")).find(Boolean) ?? "";

export async function syncUsers() {
  if (!localCacheEnabled()) return;
  const url = env("SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL").replace(/\/(rest|auth|storage)\/v1\/?$/, "").replace(/\/+$/, "");
  const key = env("SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_KEY");
  if (!url || !key) return;
  const r = await fetch(`${url}/rest/v1/app_users?select=id,username,full_name,role,password_hash,is_active`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` }, cache: "no-store", signal: AbortSignal.timeout(15_000),
  });
  if (!r.ok) { await r.text().catch(() => ""); return; }
  const data = (await r.json()) as CachedUser[];
  if (Array.isArray(data)) await saveLocal("usuarios", data);
}

export async function cachedUser(username: string): Promise<CachedUser | null> {
  const list = await readLocal<CachedUser[]>("usuarios");
  return list?.find((u) => u.username === username) ?? null;
}
