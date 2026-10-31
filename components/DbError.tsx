// Cuando la base de datos falla, el panel y la ruleta muestran la causa probable en vez de
// "Application error". Solo lo ve quien ya inició sesión como administrador.
export default function DbError({ error }: { error: unknown }) {
  const e = error as { message?: string; code?: string; cause?: { code?: string } } | null;
  const msg = String(e?.message ?? error ?? "");
  let hint = "Revisa las variables de Supabase en Vercel (Settings → Environment Variables) y haz Redeploy.";
  if (/Faltan variables/i.test(msg)) hint = msg;
  else if (/invalid api key|jwt|unauthorized|401|secret/i.test(msg))
    hint = "La clave SUPABASE_SERVICE_ROLE_KEY no es válida. Si la cambiaste en Supabase, pega la nueva en Vercel y haz Redeploy.";
  else if (/fetch failed|ENOTFOUND|ECONNREFUSED|getaddrinfo|network/i.test(msg) || e?.cause?.code)
    hint = "No se puede conectar con Supabase: revisa que NEXT_PUBLIC_SUPABASE_URL esté bien escrita y que el proyecto de Supabase no esté pausado.";
  else if (e?.code === "42P01" || /does not exist/i.test(msg))
    hint = "Faltan tablas en la base de datos: ejecuta supabase/schema.sql en el SQL Editor de Supabase.";
  return (
    <main className="container tema">
      <div className="card" style={{ marginTop: 40 }}>
        <h1 style={{ marginTop: 0 }}>⚠️ No se pudo conectar con la base de datos</h1>
        <p>{hint}</p>
        <p className="small">Detalle técnico: <code>{msg.slice(0, 300) || "desconocido"}</code></p>
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <a className="btn" href="">Reintentar</a>
          <form method="post" action="/api/logout"><button className="btn secondary">Salir</button></form>
        </div>
      </div>
    </main>
  );
}
