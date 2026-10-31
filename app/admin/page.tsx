import { getActiveRaffle, fetchAll, signPhotos } from "@/lib/participants";
import { supabaseAdmin } from "@/lib/supabase";
import AutoRefresh from "@/components/AutoRefresh";
import PanelList, { type PanelRow } from "@/components/PanelList";

export const dynamic = "force-dynamic";

// Con miles de inscritos la lista muestra los más recientes; el buscador consulta toda la rifa en el servidor.
const LIST_LIMIT = 200;
const COLS = "id, raffle_number, full_name, rank, document_type, document_number, email, phone, city, photo_path, id_document_path, photo_source, registered_by_name, created_at";

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ demo?: string; n?: string; q?: string }> }) {
  const { demo, n, q: rawQ } = await searchParams;
  const q = (rawQ ?? "").trim().slice(0, 60);
  const raffle = await getActiveRaffle();
  const sb = supabaseAdmin();

  let list: Awaited<ReturnType<typeof listQuery>> = [];
  let byOps: { registered_by_name: string | null; document_number: string }[] = [];
  let totalCount = 0;
  async function listQuery(raffleId: string) {
    let query = sb.from("participants").select(COLS).eq("raffle_id", raffleId);
    if (q) {
      // Las vocales se vuelven comodín para que "martinez" encuentre "Martínez".
      const like = `%${q.replace(/[%_,()*]/g, " ").replace(/[aeiouáéíóúü]/gi, "_")}%`;
      const ors = [`full_name.ilike.${like}`, `document_number.ilike.${like}`, `rank.ilike.${like}`, `registered_by_name.ilike.${like}`];
      if (/^\d{1,6}$/.test(q)) ors.push(`raffle_number.eq.${Number(q)}`);
      query = query.or(ors.join(","));
    }
    const { data } = await query.order("created_at", { ascending: false }).limit(LIST_LIMIT);
    return data ?? [];
  }
  if (raffle) {
    [list, byOps] = await Promise.all([
      listQuery(raffle.id),
      fetchAll<{ registered_by_name: string | null; document_number: string }>((from, to) =>
        sb.from("participants").select("registered_by_name, document_number").eq("raffle_id", raffle.id).order("id").range(from, to)),
    ]);
    totalCount = byOps.length;
  }
  const photo = await signPhotos(list.map((r) => r.photo_path), 600);
  const tempCount = byOps.filter((p) => p.document_number.startsWith("TEMP")).length;
  const demoMsg: Record<string, string> = {
    agregados: `Se agregaron ${n ?? 0} personas de prueba.`, borrados: "Se borraron las personas de prueba.",
    error: "No se pudo completar la acción de prueba.", "sin-rifa": "No hay una rifa activa.",
  };
  const digits = String(raffle?.number_max ?? 9999).length;
  const byOperator = new Map<string, number>();
  byOps.forEach((p) => byOperator.set(p.registered_by_name ?? "—", (byOperator.get(p.registered_by_name ?? "—") ?? 0) + 1));
  const total = raffle ? raffle.number_max - raffle.number_min + 1 : 0;

  const panelRows: PanelRow[] = list.map((p) => ({
    id: p.id, number: String(p.raffle_number).padStart(digits, "0"), name: p.full_name, rank: p.rank,
    doc: `${p.document_type} ${p.document_number}`, phone: p.phone, email: p.email, city: p.city,
    photoUrl: photo.get(p.photo_path) ?? null, hasIdDoc: !!p.id_document_path, photoSource: p.photo_source,
    by: p.registered_by_name, createdAt: p.created_at,
  }));

  return (
    <main className="container wide">
      <div className="topbar panel-top">
        <div>
          <h1>Panel · {raffle?.name ?? "Sin rifa activa"}</h1>
          <p className="sub only-desk" style={{ margin: 0 }}>{totalCount} inscritos · {total - totalCount} números disponibles</p>
        </div>
        <div className="panel-actions">
          <a className="btn" href="/ruleta">🎡 <span className="only-desk">Abrir ruleta</span><span className="only-mobile">Ruleta</span></a>
          <a className="btn secondary" href="/registro">➕ Registrar</a>
          <a className="btn secondary" href="/admin/usuarios">👥 Usuarios</a>
          <form method="post" action="/api/logout"><button className="btn secondary">Salir</button></form>
        </div>
      </div>
      <AutoRefresh seconds={15} />
      <div className="stats only-mobile">
        <div><strong>{totalCount}</strong><span>inscritos</span></div>
        <div><strong>{total - totalCount}</strong><span>disponibles</span></div>
      </div>
      {byOperator.size > 0 && (
        <div className="op-badges">
          {[...byOperator.entries()].sort((a, b) => b[1] - a[1]).map(([name, n]) => (
            <span key={name} className="badge on">{name}: <strong>{n}</strong></span>
          ))}
        </div>
      )}
      {demo && demoMsg[demo] && <p className={demo === "error" || demo === "sin-rifa" ? "error" : "small"} style={{ marginTop: 0 }}>{demoMsg[demo]}</p>}
      <PanelList rows={panelRows} total={totalCount} query={q} limit={LIST_LIMIT} />
      <div className="demo-box">
        <span className="small">Datos de prueba{tempCount ? ` · ${tempCount} en la rifa` : ""}</span>
        <form method="post" action="/api/admin/demo" className="demo-add">
          <select name="count" defaultValue="5" aria-label="Cantidad de prueba">
            <option value="5">5</option><option value="100">100</option><option value="1000">1000</option><option value="5000">5000</option>
          </select>
          <button className="btn secondary">🧪 Agregar de prueba</button>
        </form>
        {tempCount > 0 && (
          <form method="post" action="/api/admin/demo">
            <input type="hidden" name="action" value="clear" />
            <button className="btn secondary danger">🗑️ Borrar prueba</button>
          </form>
        )}
      </div>
    </main>
  );
}
