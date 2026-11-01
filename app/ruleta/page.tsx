import DbError from "@/components/DbError";
import Wheel from "@/components/Wheel";
import Snow from "@/components/Snow";
import PresenterControls from "@/components/PresenterControls";
import HiddenLogout from "@/components/HiddenLogout";
import { getActiveRaffle, getWheelParticipants } from "@/lib/participants";
import { getSession } from "@/lib/auth";
import { readModo, getCadetWheel } from "@/lib/cadetes-store";

export const dynamic = "force-dynamic";

async function RuletaPageContent({ espejo }: { espejo: boolean }) {
  const [raffle, modo, session] = await Promise.all([getActiveRaffle(), readModo(), getSession()]);
  // Modo cadetes: solo los de la lista de cadetes, todos con la misma probabilidad (ver lib/cadetes.ts).
  const { participants, winners } = modo === "cadetes" ? await getCadetWheel(raffle?.id ?? null) : await getWheelParticipants();
  const digits = modo === "cadetes" ? String(participants.length + winners.length).length : String(raffle?.number_max ?? 9999).length;
  // La TV es un espejo: muestra en vivo lo que se gira desde otra pantalla. Un admin puede verlo con ?espejo=1.
  const mirror = session?.role === "tv" || espejo;
  return (
    <div className={`xmas-page${mirror ? " is-mirror" : ""}`}>
      <Snow />
      <div className="garland" aria-hidden="true">
        {Array.from({ length: 24 }, (_, i) => <i key={i} className={`b${i % 4}`} style={{ animationDelay: `${(i % 4) * .25}s` }} />)}
      </div>
      <main className="container wide">
        <div className="topbar">
          <div className="xmas-brand">
            <img className="xmas-logo" src="/escudo.png" alt="Escudo" />
            <div>
              <h1 className="xmas-title">{modo === "cadetes" ? "Ruleta de cadetes" : raffle?.name ?? "Ruleta"}</h1>
            </div>
          </div>
          <div className="topbar-tools">
            <PresenterControls />
            {mirror
              ? <form method="post" action="/api/logout"><button className="btn secondary xmas-ghost">Salir</button></form>
              : <a className="btn secondary xmas-ghost" href="/admin">Panel</a>}
          </div>
        </div>
        <Wheel participants={participants} pastWinners={winners} digits={digits} canManage={session?.role === "admin" && !mirror} mirror={mirror} modo={modo} />
      </main>
      {mirror && <HiddenLogout />}
    </div>
  );
}

export default async function RuletaPage({ searchParams }: { searchParams: Promise<{ espejo?: string }> }) {
  try {
    return await RuletaPageContent({ espejo: (await searchParams).espejo === "1" });
  } catch (e) {
    console.error("RuletaPage", e);
    return <DbError error={e} />;
  }
}
