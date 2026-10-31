// Se ejecuta una vez al arrancar el servidor (Next.js).
// En la red de Infopress abrir cada conexión nueva a Supabase tarda ~4 s, pero una conexión ya abierta responde en ~0,2 s.
// Node cierra las conexiones tras 4 s sin uso, así que entre una cédula y otra se pagaban esos 4 s varias veces.
// Aquí se alargan las conexiones vivas y, en la PC local, se mantienen calientes con un ping liviano.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // En Vercel no se toca nada: cada función vive poco y, con Node 26, cambiar el despachador rompe el fetch de toda la app.
  if (process.env.VERCEL) return;

  // El fetch de Node usa este "despachador" global; se reemplaza por uno igual pero con keep-alive largo.
  await fetch("data:,").catch(() => {});
  const sym = Symbol.for("undici.globalDispatcher.1");
  const g = globalThis as unknown as Record<symbol, { constructor: new (o: object) => unknown } | undefined>;
  const Agent = g[sym]?.constructor;
  // Si la versión de Node no lo acepta, se deja el de fábrica (más lento en Infopress, pero funciona).
  const original = g[sym];
  try {
    if (Agent) g[sym] = new Agent({ keepAliveTimeout: 120_000, keepAliveMaxTimeout: 600_000 }) as never;
    await fetch("data:,");
  } catch {
    g[sym] = original;
  }

  // El ping solo tiene sentido en la PC que corre `npm run red` / `npm run rapido`.
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "").trim().replace(/^["']|["']$/g, "").replace(/\/+$/, "");
  if (!url) return;
  const ping = () => fetch(`${url}/auth/v1/health`, { cache: "no-store" }).then((r) => r.body?.cancel()).catch(() => {});
  ping();
  setInterval(ping, 20_000).unref();
}
