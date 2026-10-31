import RegistrationFlow from "@/components/RegistrationFlow";
import DbError from "@/components/DbError";
import { getActiveRaffle } from "@/lib/participants";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

async function RegistroPageContent() {
  const [raffle, session] = await Promise.all([getActiveRaffle(), getSession()]);
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
