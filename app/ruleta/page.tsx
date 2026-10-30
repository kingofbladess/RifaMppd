import Wheel from "@/components/Wheel";
import { getActiveRaffle, getWheelParticipants } from "@/lib/participants";

export const dynamic = "force-dynamic";

export default async function RuletaPage() {
  const [raffle, participants] = await Promise.all([getActiveRaffle(), getWheelParticipants()]);
  return (
    <main className="container wide">
      <div className="topbar">
        <div>
          <h1>🎡 {raffle?.name ?? "Ruleta"}</h1>
          {raffle?.prize && <p className="sub" style={{ margin: 0 }}>Premio: {raffle.prize}</p>}
        </div>
        <a className="btn secondary" href="/admin">Panel</a>
      </div>
      <Wheel participants={participants} digits={String(raffle?.number_max ?? 9999).length} />
    </main>
  );
}
