import DbError from "@/components/DbError";
import Wheel from "@/components/Wheel";
import Snow from "@/components/Snow";
import PresenterControls from "@/components/PresenterControls";
import { getActiveRaffle, getWheelParticipants } from "@/lib/participants";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

async function RuletaPageContent() {
  const [raffle, { participants, winners }, session] = await Promise.all([getActiveRaffle(), getWheelParticipants(), getSession()]);
  return (
    <div className="xmas-page">
      <Snow />
      <div className="garland" aria-hidden="true">
        {Array.from({ length: 24 }, (_, i) => <i key={i} className={`b${i % 4}`} style={{ animationDelay: `${(i % 4) * .25}s` }} />)}
      </div>
      <main className="container wide">
        <div className="topbar">
          <div className="xmas-brand">
            <img className="xmas-logo" src="/escudo.png" alt="Escudo" />
            <div>
              <h1 className="xmas-title">{raffle?.name ?? "Ruleta"}</h1>
            </div>
          </div>
          <div className="topbar-tools">
            <PresenterControls />
            {session?.role === "tv"
              ? <form method="post" action="/api/logout"><button className="btn secondary xmas-ghost">Salir</button></form>
              : <a className="btn secondary xmas-ghost" href="/admin">Panel</a>}
          </div>
        </div>
        <Wheel participants={participants} pastWinners={winners} digits={String(raffle?.number_max ?? 9999).length} />
      </main>
    </div>
  );
}

export default async function RuletaPage() {
  try {
    return await RuletaPageContent();
  } catch (e) {
    console.error("RuletaPage", e);
    return <DbError error={e} />;
  }
}
