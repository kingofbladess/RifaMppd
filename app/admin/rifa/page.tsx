import RaffleListManager from "@/components/RaffleListManager";
import { getSession } from "@/lib/auth";
import { getActiveRaffle, fetchAll } from "@/lib/participants";
import { supabaseAdmin } from "@/lib/supabase";
import { readEligibilityList } from "@/lib/raffle-eligibility-store";
import { eligibleRafflePool, normalizeRaffleDocument } from "@/lib/raffle-eligibility";
import { gradoDe } from "@/lib/grados";

export const dynamic = "force-dynamic";

export default async function RaffleListPage({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string }> }) {
  if ((await getSession())?.role !== "admin") return <main>No autorizado</main>;
  const params = await searchParams;
  const raffle = await getActiveRaffle();
  if (!raffle) return <main className="container tema"><h1>No hay rifa activa</h1><a href="/admin">Volver al panel</a></main>;
  const sb = supabaseAdmin();
  let list = null, loadError = "";
  try { list = await readEligibilityList(raffle.id); } catch (e) { loadError = (e as Error).message; }
  const [participants, draws] = await Promise.all([
    fetchAll<{ id: string; document_number: string; rank: string | null; full_name: string }>((from, to) => sb.from("participants")
      .select("id, document_number, rank, full_name").eq("raffle_id", raffle.id).order("id").range(from, to)),
    fetchAll<{ participant_id: string }>((from, to) => sb.from("draws").select("participant_id")
      .eq("raffle_id", raffle.id).order("id").range(from, to)),
  ]);
  const documents = list?.document_numbers ?? [];
  const registered = new Set(participants.map((p) => normalizeRaffleDocument(p.document_number)));
  const absent = documents.filter((doc) => !registered.has(doc));
  const pool = eligibleRafflePool(participants, documents, new Set(draws.map((d) => d.participant_id)));
  const canWin = pool.filter((p) => { const g = gradoDe(p.rank); return !g || g.peso > 0; }).length;
  return <main className="container wide tema">
    <div className="topbar"><div><h1>Administración de la lista de la rifa</h1><p>{raffle.name}</p></div><a className="btn secondary" href="/admin">Volver al panel</a></div>
    <p>Esta lista limita quién puede ganar. Todos los asistentes siguen registrados y visibles en la pantalla pública. Se mantienen los pesos por grado y la exclusión de ganadores anteriores.</p>
    {(loadError || params.error) && <p className="error" role="alert">{loadError || params.error}</p>}
    {params.ok && <p role="status">Lista guardada. Se aplicará a los próximos sorteos.</p>}
    <div className="card">
      <p>{documents.length} cédulas en la lista · {documents.length - absent.length} registradas en el evento · {absent.length} aún sin registrar · {canWin} disponibles para ganar.</p>
      <p className="small">Una persona de la lista solo puede ganar después de registrarse en el evento. Los grados con peso cero conservan su exclusión.</p>
      {!list && <p className="error">El sorteo está bloqueado hasta cargar una lista válida.</p>}
      {list && <p className="small">Actualizada por {list.updated_by} · {list.updated_at}</p>}
    </div>
    <RaffleListManager raffleId={raffle.id} documents={documents} registered={participants.map((p) => ({ ...p,
      drawStatus: draws.some((d) => d.participant_id === p.id) ? "winner" as const : gradoDe(p.rank)?.peso === 0 ? "excluded" as const : "available" as const,
    }))} disabled={!!loadError}/>

  </main>;
}
