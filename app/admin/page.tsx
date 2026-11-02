import { createdFromRaffleList } from "@/lib/list-registration-id";
import { readOperatorConfirmations } from "@/lib/operator-confirmations";
import { registrationEvidence } from "@/lib/registration-evidence";
import DbError from "@/components/DbError";
import { getActiveRaffle, fetchAll, signPhotos } from "@/lib/participants";
import { supabaseAdmin } from "@/lib/supabase";
import AutoRefresh from "@/components/AutoRefresh";
import PanelList, { type PanelRow } from "@/components/PanelList";
import { GRADOS, gradoDe } from "@/lib/grados";

export const dynamic = "force-dynamic";

// Con miles de inscritos la lista muestra los más recientes; el buscador consulta toda la rifa en el servidor.
const LIST_LIMIT = 200;
const COLS = "id, raffle_number, full_name, rank, document_type, document_number, phone, birth_date, photo_path, id_document_path, photo_source, registered_by_name, created_at";

async function AdminPageContent({ searchParams }: { searchParams: Promise<{ demo?: string; n?: string; q?: string }> }) {
  const { demo, n, q: rawQ } = await searchParams;
  const q = (rawQ ?? "").trim().slice(0, 60);
  const raffle = await getActiveRaffle();
  const sb = supabaseAdmin();

  let list: Awaited<ReturnType<typeof listQuery>> = [];
  let byOps: { registered_by_name: string | null; document_number: string; rank: string | null }[] = [];
  let totalCount = 0;
  async function listQuery(raffleId: string) {
    let query = sb.from("participants").select(COLS).eq("raffle_id", raffleId);
    if (q) {
      // "V-12345678" o "E12345678": se busca solo el número, que es como se guarda la cédula.
      const plain = /^[VvEe]-?\d{4,}$/.test(q) ? q.replace(/\D/g, "") : q;
      // Las vocales se vuelven comodín para que "martinez" encuentre "Martínez".
      const like = `%${plain.replace(/[%_,()*]/g, " ").replace(/[aeiouáéíóúü]/gi, "_")}%`;
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
      fetchAll<{ registered_by_name: string | null; document_number: string; rank: string | null }>((from, to) =>
        sb.from("participants").select("registered_by_name, document_number, rank").eq("raffle_id", raffle.id).order("id").range(from, to)),
    ]);
    totalCount = byOps.length;
  }
  const photo = await signPhotos(list.map((r) => r.photo_path), 600);
  // Conteo por grado (regla de la ruleta) y grados escritos que no están en la lista: esos sortean como civiles.
  // Militar = grado reconocido, igual que en el sorteo (antes bastaba con tener algo escrito en "Grado", y el panel
  // contaba como militares a personas que la ruleta trata como civiles).
  const porGrado = new Map<number, number>();
  const noReconocidos = new Map<string, number>();
  byOps.forEach((p) => {
    const rank = p.rank?.trim();
    if (!rank) return;
    const g = gradoDe(rank);
    if (g) porGrado.set(g.n, (porGrado.get(g.n) ?? 0) + 1);
    else noReconocidos.set(rank, (noReconocidos.get(rank) ?? 0) + 1);
  });
  const sinReconocer = [...noReconocidos.values()].reduce((a, b) => a + b, 0);
  const militares = [...porGrado.values()].reduce((a, b) => a + b, 0);
  const civiles = totalCount - militares;
  const tempCount = byOps.filter((p) => p.document_number.startsWith("TEMP")).length;
  const demoMsg: Record<string, string> = {
    agregados: `Se agregaron ${n ?? 0} personas de prueba.`, borrados: "Se borraron las personas de prueba.",
    error: "No se pudo completar la acción de prueba.", "sin-rifa": "No hay una rifa activa.",
  };
  const digits = String(raffle?.number_max ?? 9999).length;
  const byOperator = new Map<string, number>();
  byOps.forEach((p) => byOperator.set(p.registered_by_name ?? "—", (byOperator.get(p.registered_by_name ?? "—") ?? 0) + 1));
  const total = raffle ? raffle.number_max - raffle.number_min + 1 : 0;

  const confirmations = await readOperatorConfirmations(list.filter((p) => raffle && createdFromRaffleList(raffle.id, p.document_number, p.photo_path)).map((p) => p.id));
  const panelRows: PanelRow[] = list.map((p) => ({
    id: p.id, number: String(p.raffle_number).padStart(digits, "0"), name: p.full_name, rank: p.rank,
    doc: `${({ CC: "V", CE: "E" } as Record<string, string>)[p.document_type] ?? p.document_type}-${p.document_number}`, phone: p.phone, birthDate: p.birth_date,
    photoUrl: photo.get(p.photo_path) ?? null, hasIdDoc: !!p.id_document_path, photoSource: p.photo_source,
    by: p.registered_by_name, createdAt: p.created_at,
    registrationOrigin: registrationEvidence(!!raffle && createdFromRaffleList(raffle.id, p.document_number, p.photo_path), confirmations.available, confirmations.byId.has(p.id)),
  }));

  return (
    <main className="container wide tema">
      <div className="topbar panel-top">
        <div>
          <h1>Sistema de control de asistencia</h1>
          <p className="sub only-desk" style={{ margin: 0 }}>{totalCount} inscritos ({militares} militares · {civiles} civiles{sinReconocer ? `, ${sinReconocer} con grado no reconocido` : ""}) · {total - totalCount} números disponibles</p>
        </div>
        <div className="panel-actions">
          <a className="btn" href="/ruleta">🎡 <span className="only-desk">Abrir ruleta</span><span className="only-mobile">Ruleta</span></a>
          <a className="btn secondary" href="/registro">➕ Registrar</a>
          <a className="btn secondary" href="/admin/rifa">Lista de la rifa</a>
          <a className="btn secondary" href="/admin/cadetes">🎓 Cadetes</a>
          <a className="btn secondary" href="/admin/ganadores">🏆 Ganadores</a>
          <a className="btn secondary" href="/admin/usuarios">👥 Usuarios</a>
          <form method="post" action="/api/logout"><button className="btn secondary">Salir</button></form>
        </div>
      </div>
      <AutoRefresh seconds={15} />
      <div className="stats only-mobile">
        <div><strong>{totalCount}</strong><span>inscritos</span></div>
        <div><strong>{total - totalCount}</strong><span>disponibles</span></div>
        <div><strong>{militares}</strong><span>militares</span></div>
        <div><strong>{civiles}</strong><span>civiles</span></div>
      </div>
      {byOperator.size > 0 && (
        <div className="op-badges">
          {[...byOperator.entries()].sort((a, b) => b[1] - a[1]).map(([name, n]) => (
            <span key={name} className="badge on">{name}: <strong>{n}</strong></span>
          ))}
        </div>
      )}
      {totalCount > 0 && (
        <details className="grados-box">
          <summary className="small">
            Regla del sorteo y registrados por grado{sinReconocer ? ` · ⚠️ ${sinReconocer} con grado no reconocido (sortean como civiles)` : ""}
          </summary>
          <p className="small" style={{ margin: "6px 0" }}>
            Primero se decide civil o militar según cuántos candidatos elegibles hay de cada uno. Entre militares,
            oficiales y sargentos tienen 50 % por grupo si ambos tienen candidatos; luego se elige una persona con igual
            probabilidad dentro de ese grupo. Si un grupo se agota, se utiliza el otro. Los grados 1–5 están excluidos: generales/almirantes, coroneles y tenientes coroneles, incluidos capitanes de navío y de fragata.
            El reparto no obliga a alternar ganadores. Las cantidades siguientes son registros por grado, no probabilidades.
          </p>
          <div className="op-badges">
            {GRADOS.map((g) => (
              <span key={g.n} className={`badge${porGrado.get(g.n) ? " on" : ""}`}>
                {g.n}. {g.nombre} · {g.peso === 0 ? "Excluido" : g.n <= 9 ? "Oficiales" : "Sargentos"}: <strong>{porGrado.get(g.n) ?? 0}</strong>
              </span>
            ))}
            <span className="badge on">Civiles{sinReconocer ? " (incluye no reconocidos)" : ""}: <strong>{civiles}</strong></span>
          </div>
          {sinReconocer > 0 && (
            <>
              <p className="small" style={{ margin: "6px 0" }}>Grados no reconocidos (revisa cómo están escritos):</p>
              <div className="op-badges">
                {[...noReconocidos.entries()].sort((a, b) => b[1] - a[1]).map(([rank, n]) => (
                  <span key={rank} className="badge">{rank}: <strong>{n}</strong></span>
                ))}
              </div>
            </>
          )}
        </details>
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

export default async function AdminPage(props: Parameters<typeof AdminPageContent>[0]) {
  try {
    return await AdminPageContent(props);
  } catch (e) {
    console.error("AdminPage", e);
    return <DbError error={e} />;
  }
}
