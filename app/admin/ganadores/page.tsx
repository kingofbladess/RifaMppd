import { getSession } from "@/lib/auth";
import { informeGanadores, horaVe, type Ganador } from "@/lib/ganadores";
import PrintButton from "@/components/PrintButton";

export const dynamic = "force-dynamic";

// Informe imprimible de los ganadores de las dos ruletas, con foto. "Imprimir" permite guardarlo como PDF.
export default async function GanadoresPage() {
  if ((await getSession())?.role !== "admin") return <main>No autorizado</main>;
  let data: Awaited<ReturnType<typeof informeGanadores>> = { rifa: "", ganadores: [] }, error = "";
  try { data = await informeGanadores(true); } catch (e) { error = (e as Error).message; }
  const principal = data.ganadores.filter((g) => g.ruleta === "Principal");
  const cadetes = data.ganadores.filter((g) => g.ruleta === "Cadetes");
  const hoy = new Date().toLocaleDateString("es-VE", { timeZone: "America/Caracas", day: "numeric", month: "long", year: "numeric" });

  const tarjetas = (lista: Ganador[]) => <div className="inf-grid">
    {lista.map((g) => <div className="inf-card" key={`${g.ruleta}-${g.orden}`}>
      <div className="inf-n">{g.orden}</div>
      {g.photoUrl ? <img src={g.photoUrl} alt="" className="inf-foto" /> : <div className="inf-foto inf-sin">Sin foto</div>}
      <div className="inf-nombre">{g.nombre}</div>
      <div className="inf-dato">C.I. {g.cedula}</div>
      <div className="inf-dato"><b>{g.grado}</b></div>
      <div className="inf-hora">{horaVe(g.hora)}</div>
    </div>)}
  </div>;

  return <main className="container wide tema informe">
    <style>{`
      .informe h1{margin:0}.inf-head{display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;align-items:flex-start;margin-bottom:12px}
      .inf-tot{display:flex;gap:12px;flex-wrap:wrap;margin:8px 0 20px}.inf-tot div{background:#0b2545;color:#fff;border-radius:10px;padding:8px 14px;font-weight:600}
      .inf-sec{margin:24px 0 10px;padding-bottom:6px;border-bottom:3px solid #0b2545;color:#0b2545}
      .inf-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:12px}
      .inf-card{position:relative;background:#fff;color:#0b2545;border:1px solid #c9d3e0;border-radius:12px;padding:10px;text-align:center;break-inside:avoid;page-break-inside:avoid}
      .inf-n{position:absolute;top:6px;left:6px;background:#0b2545;color:#fff;border-radius:999px;min-width:26px;height:26px;line-height:26px;font-size:13px;font-weight:700}
      .inf-foto{width:100%;aspect-ratio:3/4;object-fit:cover;border-radius:8px;background:#e8edf3;display:block}
      .inf-sin{display:flex;align-items:center;justify-content:center;color:#7a8799;font-size:13px}
      .inf-nombre{font-weight:700;margin-top:8px;font-size:14px;line-height:1.2}.inf-dato{font-size:13px;margin-top:2px}.inf-hora{font-size:11px;color:#5d6b7e;margin-top:4px}
      @media print{
        @page{size:A4;margin:12mm}
        body{background:#fff!important}.no-print,.snow,canvas{display:none!important}
        .informe{max-width:none!important;padding:0!important;color:#000}
        .inf-grid{grid-template-columns:repeat(4,1fr);gap:8px}.inf-card{padding:6px}.inf-nombre{font-size:12px}.inf-dato{font-size:11px}
        .inf-tot div,.inf-n{-webkit-print-color-adjust:exact;print-color-adjust:exact}
      }`}</style>
    <div className="inf-head">
      <div>
        <h1>Informe de ganadores</h1>
        <p style={{ margin: "4px 0 0" }}>{data.rifa}{data.rifa ? " · " : ""}Generado el {hoy}</p>
      </div>
      <div className="no-print" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <PrintButton />
        <a className="btn secondary" href="/api/admin/ganadores">⬇️ Descargar Excel</a>
        <a className="btn secondary" href="/admin">Volver al panel</a>
      </div>
    </div>
    {error && <p className="error">No se pudieron cargar los ganadores: {error}</p>}
    <div className="inf-tot">
      <div>Total: {data.ganadores.length}</div>
      <div>Ruleta principal: {principal.length}</div>
      <div>Ruleta de cadetes: {cadetes.length}</div>
    </div>
    {principal.length > 0 && <><h2 className="inf-sec">Ruleta principal ({principal.length})</h2>{tarjetas(principal)}</>}
    {cadetes.length > 0 && <><h2 className="inf-sec">Ruleta de cadetes ({cadetes.length})</h2>{tarjetas(cadetes)}</>}
    {!error && data.ganadores.length === 0 && <p>Todavía no hay ganadores.</p>}
  </main>;
}
