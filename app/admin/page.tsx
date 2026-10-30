import { getActiveRaffle } from "@/lib/participants";
import { supabaseAdmin, BUCKET_PHOTOS } from "@/lib/supabase";
import AutoRefresh from "@/components/AutoRefresh";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const raffle = await getActiveRaffle();
  const sb = supabaseAdmin();
  const { data: rows } = raffle
    ? await sb.from("participants")
        .select("id, raffle_number, full_name, rank, document_type, document_number, email, phone, city, photo_path, id_document_path, photo_source, registered_by_name, created_at")
        .eq("raffle_id", raffle.id).order("created_at", { ascending: false })
    : { data: [] };
  const list = rows ?? [];
  const { data: signed } = list.length
    ? await sb.storage.from(BUCKET_PHOTOS).createSignedUrls(list.map((r) => r.photo_path), 600)
    : { data: [] };
  const photo = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));
  const digits = String(raffle?.number_max ?? 9999).length;
  const byOperator = new Map<string, number>();
  list.forEach((p) => byOperator.set(p.registered_by_name ?? "—", (byOperator.get(p.registered_by_name ?? "—") ?? 0) + 1));
  const total = raffle ? raffle.number_max - raffle.number_min + 1 : 0;

  return (
    <main className="container wide">
      <div className="topbar">
        <div>
          <h1>Panel · {raffle?.name ?? "Sin rifa activa"}</h1>
          <p className="sub" style={{ margin: 0 }}>{list.length} inscritos · {total - list.length} números disponibles</p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <a className="btn" href="/ruleta">🎡 Abrir ruleta</a>
          <a className="btn secondary" href="/registro">➕ Registrar</a>
          <a className="btn secondary" href="/admin/usuarios">👥 Usuarios</a>
          <form method="post" action="/api/logout"><button className="btn secondary">Salir</button></form>
        </div>
      </div>
      <AutoRefresh seconds={15} />
      {byOperator.size > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
          {[...byOperator.entries()].sort((a, b) => b[1] - a[1]).map(([name, n]) => (
            <span key={name} className="badge on" style={{ fontSize: ".85rem", padding: "6px 12px" }}>{name}: <strong>{n}</strong></span>
          ))}
        </div>
      )}
      <div className="card table-wrap">
        <table>
          <thead>
            <tr><th></th><th>N.º</th><th>Nombre</th><th>Documento</th><th>Contacto</th><th>Ciudad</th><th>Registró</th><th>Fecha</th><th></th></tr>
          </thead>
          <tbody>
            {list.map((p) => (
              <tr key={p.id}>
                <td>{photo.get(p.photo_path) ? <img className="avatar" src={photo.get(p.photo_path)!} alt="" /> : <div className="avatar" />}</td>
                <td><strong>{String(p.raffle_number).padStart(digits, "0")}</strong></td>
                <td>{p.full_name}{p.rank && <><br /><span className="small">{p.rank}</span></>}</td>
                <td>{p.document_type} {p.document_number}</td>
                <td>{p.phone}<br /><span className="small">{p.email ?? ""}</span></td>
                <td>{p.city ?? "—"}</td>
                <td>{p.registered_by_name ?? "—"}</td>
                <td className="small">{new Date(p.created_at).toLocaleString("es")}</td>
                <td>{p.id_document_path ? <a href={`/api/admin/document/${p.id}`} target="_blank" rel="noreferrer">Ver cédula</a> : <span className="small">{p.photo_source === "api" ? "Foto API" : "Foto nueva"}</span>}</td>
              </tr>
            ))}
            {!list.length && <tr><td colSpan={9} className="small">Sin inscritos todavía.</td></tr>}
          </tbody>
        </table>
      </div>
    </main>
  );
}
