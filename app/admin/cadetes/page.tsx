import CadetesImport from "@/components/CadetesImport";
import { getSession } from "@/lib/auth";
import { readModo, cadetesRegistrados, readCadetDraws, readCadetes } from "@/lib/cadetes-store";
import { getActiveRaffle } from "@/lib/participants";

export const dynamic = "force-dynamic";

// Ruleta de cadetes: cargar la lista y cambiar entre la ruleta normal y la de cadetes.
export default async function CadetesPage({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string; n?: string }> }) {
  if ((await getSession())?.role !== "admin") return <main>No autorizado</main>;
  const params = await searchParams;
  let modo: "normal" | "cadetes" = "normal", lista = null, ganados: string[] = [], registrados: { cedula: string }[] = [], loadError = "";
  try {
    const raffle = await getActiveRaffle();
    [modo, lista, ganados, { registrados }] = await Promise.all([readModo(), readCadetes(), readCadetDraws(), cadetesRegistrados(raffle?.id ?? null)]);
  } catch (e) { loadError = (e as Error).message; }
  const cadetes = lista?.cadetes ?? [];
  const ganadosSet = new Set(ganados);
  const registradoSet = new Set(registrados.map((c) => c.cedula));
  const ganaron = registrados.filter((c) => ganadosSet.has(c.cedula)).length;
  const okText: Record<string, string> = {
    lista: `Lista guardada: ${params.n ?? cadetes.length} cadetes.`,
    cadetes: "Ruleta de cadetes activada. La TV cambia sola en unos segundos.",
    normal: "Se volvió a la ruleta normal. La TV cambia sola en unos segundos.",
  };

  return <main className="container wide tema">
    <div className="topbar"><div><h1>Ruleta de cadetes</h1><p>Los cadetes se registran como siempre; esta lista los reconoce por la cédula. Misma probabilidad para todos.</p></div><a className="btn secondary" href="/admin">Volver al panel</a></div>
    {(loadError || params.error) && <p className="error" role="alert">{loadError || params.error}</p>}
    {params.ok && okText[params.ok] && <p role="status">{okText[params.ok]}</p>}

    <div className="card">
      <h2>Modo actual: {modo === "cadetes" ? "🎓 Cadetes" : "Normal"}</h2>
      <p>{modo === "cadetes"
        ? "La ruleta y la TV muestran solo a los cadetes registrados que están en la lista (por cédula), todos con la misma probabilidad."
        : "La ruleta y la TV funcionan como siempre (inscritos, lista de la rifa y regla por grado)."}</p>
      <p className="small">{cadetes.length} cadetes en la lista · {registrados.length} ya registrados · {ganaron} ya ganaron · {registrados.length - ganaron} pueden salir.
        {lista && <> Lista cargada por {lista.updated_by} · {new Date(lista.updated_at).toLocaleString("es-VE")}</>}</p>
      <form method="post" action="/api/admin/cadetes/modo" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {modo === "cadetes"
          ? <button className="btn" name="modo" value="normal" disabled={!!loadError}>Volver a la ruleta normal</button>
          : <button className="btn" name="modo" value="cadetes" disabled={!!loadError || !cadetes.length}>🎓 Activar ruleta de cadetes</button>}
        <a className="btn secondary" href="/ruleta">🎡 Abrir ruleta</a>
      </form>
      {!cadetes.length && <p className="small">Carga la lista abajo para poder activar la ruleta de cadetes.</p>}
      <p className="small">Los ganadores de cadetes se guardan aparte: al volver al modo normal, sus ganadores y su lista siguen igual. Si una ruleta ya estaba abierta en otra pestaña, recárgala.</p>
    </div>

    <CadetesImport />

    {cadetes.length > 0 && <div className="card" style={{ marginTop: 16 }}>
      <details><summary>Ver lista guardada ({cadetes.length})</summary>
        <div className="table-wrap"><table className="list-module-table">
          <thead><tr><th>#</th><th>Cédula</th><th>Nombre</th><th>Grado</th><th>Estado</th></tr></thead>
          <tbody>{cadetes.map((c, i) => <tr key={c.cedula}><td>{i + 1}</td><td>{c.cedula}</td><td>{c.nombre}</td><td>{c.grado ?? "—"}</td><td>{ganadosSet.has(c.cedula) && registradoSet.has(c.cedula) ? "Ya ganó" : registradoSet.has(c.cedula) ? "Registrado · en la ruleta" : "Aún sin registrar"}</td></tr>)}</tbody>
        </table></div>
      </details>
    </div>}
  </main>;
}
