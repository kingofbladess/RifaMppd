import RegistrationFlow from "@/components/RegistrationFlow";
import DbError from "@/components/DbError";
import { getActiveRaffleOrCached } from "@/lib/participants";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

async function RegistroPageContent() {
  const [{ raffle: cached, offline }, session] = await Promise.all([getActiveRaffleOrCached(), getSession()]);
  // Sin internet y sin copia local (laptop recién instalada): se deja registrar igual, todo va a la cola del teléfono.
  const raffle = cached ?? (offline ? { name: "Rifa", number_max: 9999 } : null);
  return (
    <main className="container tema reg-page">
      <div className="topbar compact">
        <div>
          <h1>🎟️ {raffle?.name ?? "Rifa"}</h1>
          <p className="sub" style={{ margin: 0 }}>👤 {session?.name}</p>
        </div>
        <div className="top-actions">
          {session?.role === "admin" && <a className="btn secondary" href="/admin">Panel</a>}
          <form method="post" action="/api/logout"><button className="btn secondary">Salir</button></form>
        </div>
      </div>
      {offline && <div className="card warn-card small">⚠️ Sin internet: puedes seguir consultando y registrando. Los registros quedan guardados en este teléfono y se envían solos cuando vuelva la conexión (el número de rifa llega en ese momento).</div>}
      {raffle ? <RegistrationFlow digits={String(raffle.number_max).length} />
        : <div className="card">No hay una rifa activa. Pide al administrador que active una.</div>}
    </main>
  );
}

// Si Supabase no responde (p. ej. la laptop perdió internet), se explica la causa en vez de "Application error".
export default async function RegistroPage() {
  try {
    return await RegistroPageContent();
  } catch (e) {
    console.error("RegistroPage", e);
    return <DbError error={e} />;
  }
}
