import "server-only";

// Lee variables en tiempo de ejecución (sin que Next las fije durante el build)
// y acepta los nombres que usa la integración de Supabase en Vercel.
function read(...names: string[]): string | undefined {
  for (const n of names) {
    const v = process.env[n]?.trim().replace(/^["']|["']$/g, "");
    if (v) return v;
  }
  return undefined;
}

export function supabaseEnv() {
  const url = read("SUPABASE_URL", "NEXT_PUBLIC_" + "SUPABASE_URL");
  const key = read("SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_KEY");
  const missing = [!url && "NEXT_PUBLIC_SUPABASE_URL", !key && "SUPABASE_SERVICE_ROLE_KEY"].filter(Boolean) as string[];
  return { url, key, missing };
}

export const adminPassword = () => read("ADMIN_PASSWORD") ?? "";

// Nombres (nunca valores) de variables parecidas, para diagnosticar errores de escritura.
export function similarEnvNames(): string[] {
  return Object.keys(process.env).filter((k) => /SUPABASE|ADMIN|SESSION/i.test(k)).sort();
}
