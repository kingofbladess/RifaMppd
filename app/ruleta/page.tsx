import DbError from "@/components/DbError";
import Wheel, { type WheelParticipant } from "@/components/Wheel";
import Snow from "@/components/Snow";
import PresenterControls from "@/components/PresenterControls";
import HiddenLogout from "@/components/HiddenLogout";
import { getActiveRaffle } from "@/lib/participants";
import { getSession } from "@/lib/auth";
import { readModo, getCadetWheel, ruletaVisible, ganadoresCadetes } from "@/lib/cadetes-store";

export const dynamic = "force-dynamic";

async function RuletaPageContent({ espejo }: { espejo: boolean }) {
  const [raffle, modo, session] = await Promise.all([getActiveRaffle(), readModo(), getSession()]);
  // La ruleta se ve igual en los dos modos: pasan todos los inscritos que no han ganado (ver ruletaVisible).
  // Solo cambia quién puede ganar: en modo cadetes, solo un cadete de la lista; en el normal, los de la lista de la rifa.
  // drawIds (solo cadetes): todos los sorteos guardados, para que la TV no se recargue sin parar (ver getCadetWheel).
  // otherWinners: los ganadores de la otra ruleta, que también salen en la lista de ganadores (solo se muestran).
  const { participants, winners, drawIds, otherWinners }: { participants: WheelParticipant[]; winners: WheelParticipant[]; drawIds?: string[]; otherWinners: WheelParticipant[] } =
    modo === "cadetes"
      ? await getCadetWheel(raffle?.id ?? null)
      : await Promise.all([ruletaVisible(), ganadoresCadetes(raffle?.id ?? null)]).then(([w, otherWinners]) => ({ ...w, otherWinners }));
  const digits = String(raffle?.number_max ?? 9999).length;
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
              {/* Mismo título en los dos modos: el público no debe notar que es la ruleta de cadetes. */}
              <h1 className="xmas-title">{raffle?.name ?? "Ruleta"}</h1>
            </div>
          </div>
          <div className="topbar-tools">
            <PresenterControls />
            {mirror
              ? <form method="post" action="/api/logout"><button className="btn secondary xmas-ghost">Salir</button></form>
              : <a className="btn secondary xmas-ghost" href="/admin">Panel</a>}
          </div>
        </div>
        <Wheel participants={participants} pastWinners={winners} digits={digits} canManage={session?.role === "admin" && !mirror} mirror={mirror} modo={modo} drawIds={drawIds} otherWinners={otherWinners} />
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
