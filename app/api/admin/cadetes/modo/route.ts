import { getSession } from "@/lib/auth";
import { seeOther } from "@/lib/redirect";
import { readCadetes, writeModo } from "@/lib/cadetes-store";
import { writeWheelState } from "@/lib/wheel-state";

export const runtime = "nodejs";

// Cambia entre la ruleta normal y la de cadetes. La TV lo nota en segundos y se recarga sola.
export async function POST(req: Request) {
  const session = await getSession();
  if (session?.role !== "admin") return new Response("Solo el administrador", { status: 403 });
  const back = (q: string) => seeOther(`/admin/cadetes?${q}`);
  try {
    const modo = String((await req.formData()).get("modo") ?? "");
    if (modo !== "normal" && modo !== "cadetes") return back(`error=${encodeURIComponent("Modo desconocido")}`);
    if (modo === "cadetes" && !(await readCadetes())?.cadetes.length) return back(`error=${encodeURIComponent("Carga primero la lista de cadetes.")}`);
    await writeModo(modo, session.name);
    // El cartel de ganador abierto era de la otra ruleta: se olvida para que la TV arranque limpia.
    await writeWheelState({ closed: null, at: new Date().toISOString() }).catch(() => {});
    return back(`ok=${modo}`);
  } catch (e) {
    return back(`error=${encodeURIComponent(e instanceof Error ? e.message : "No se pudo cambiar el modo")}`);
  }
}
