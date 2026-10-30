import Wheel from "@/components/Wheel";
import Snow from "@/components/Snow";
import PresenterControls from "@/components/PresenterControls";
import { getActiveRaffle, getWheelParticipants } from "@/lib/participants";

export const dynamic = "force-dynamic";

export default async function RuletaPage() {
  const [raffle, { participants, winners }] = await Promise.all([getActiveRaffle(), getWheelParticipants()]);
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
              {raffle?.prize && <p className="sub xmas-sub">🎁 Premio: {raffle.prize}</p>}
            </div>
          </div>
          <div className="topbar-tools">
            <PresenterControls />
            <a className="btn secondary xmas-ghost" href="/admin">Panel</a>
          </div>
        </div>
        <Wheel participants={participants} pastWinners={winners} digits={String(raffle?.number_max ?? 9999).length} />
      </main>
    </div>
  );
}
