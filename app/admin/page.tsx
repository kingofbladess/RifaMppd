import { getActiveRaffle } from "@/lib/participants";
import { supabaseAdmin, BUCKET_PHOTOS } from "@/lib/supabase";
import AutoRefresh from "@/components/AutoRefresh";
import PanelList, { type PanelRow } from "@/components/PanelList";

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
          <p className="sub only-desk" style={{ margin: 0 }}>{list.length} inscritos · {total - list.length} números disponibles</p>
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
        <div><strong>{list.length}</strong><span>inscritos</span></div>
        <div><strong>{total - list.length}</strong><span>disponibles</span></div>
      </div>
      {byOperator.size > 0 && (
        <div className="op-badges">
          {[...byOperator.entries()].sort((a, b) => b[1] - a[1]).map(([name, n]) => (
            <span key={name} className="badge on">{name}: <strong>{n}</strong></span>
          ))}
        </div>
      )}
      <PanelList rows={panelRows} />
    </main>
  );
}
