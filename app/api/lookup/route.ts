import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getActiveRaffle, getActiveRaffleOrCached } from "@/lib/participants";
import { lookupByQr, lookupPerson } from "@/lib/person-api";
import { getInvitados } from "@/lib/invitados";

export const runtime = "nodejs";
export const maxDuration = 130; // Infopress puede tardar hasta ~2 minutos

// Consulta la API de personas y, a la vez, si la cédula ya está inscrita en la rifa activa.
const existingFor = (doc: string) => getActiveRaffle().then((raffle) => raffle
  ? supabaseAdmin().from("participants").select("raffle_number, full_name, registered_by_name")
      .eq("raffle_id", raffle.id).eq("document_number", doc).maybeSingle().then((r) => r.data)
  : null).catch(() => null);

// ¿Sale en la ruleta? "excluido" (lista de excluidos), true/false según la lista de invitados, o null si no hay
// lista cargada (salen todos). Sin internet usa la copia de la laptop.
const invitedFor = (doc: string): Promise<boolean | "excluido" | null> =>
  getActiveRaffleOrCached().then(({ raffle }) => raffle ? getInvitados(raffle.id) : null)
    .then((l) => (!l ? null : l.excluidos.has(doc) ? "excluido" : l.invitados ? l.invitados.has(doc) : null)).catch(() => null);

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  // QR del carnet: Infopress resuelve la cédula a partir del código y devuelve los datos de la persona.
  const qr = params.get("qr");
  if (qr !== null) {
    const t0 = Date.now();
    try {
      const { nat, doc, result } = await lookupByQr(qr.trim());
      const [existing, invited] = await Promise.all([existingFor(doc), invitedFor(doc)]);
      console.log(`lookup QR: API ${((Date.now() - t0) / 1000).toFixed(1)} s`);
      return NextResponse.json({ ...result, nat, doc, existing, invited });
    } catch (e) {
      const err = e as Error;
      const msg = err.name === "TimeoutError" || /fetch failed|ECONN|ENOTFOUND|EAI_AGAIN/i.test(err.message + String(err.cause ?? ""))
        ? "sin comunicación con Infopress; revisa que la laptop esté en la red de Infopress" : err.message;
      console.log(`lookup QR falló en ${((Date.now() - t0) / 1000).toFixed(1)} s`);
      // Sin cédula no hay nada que llenar: se muestra el motivo para que el operador la escriba a mano.
      return NextResponse.json({ error: `No se pudo consultar el QR (${msg}). Escribe la cédula a mano.` }, { status: 422 });
    }
  }
  const doc = (params.get("doc") ?? "").replace(/\D/g, "");
  const nat = params.get("nat") === "E" ? "E" : "V"; // cédula venezolana: V (venezolano) o E (extranjero)
  if (doc.length < 4 || doc.length > 15) return NextResponse.json({ error: "Número de cédula inválido" }, { status: 400 });

  // La consulta a la API arranca de inmediato; la rifa activa y la inscripción previa se buscan en paralelo.
  const t0 = Date.now();
  let apiMs = 0;
  const lookupP = lookupPerson(doc, nat)
    .catch((e: Error) => ({ error: e.message }))
    .finally(() => { apiMs = Date.now() - t0; });
  const [existing, invited, lookup] = await Promise.all([existingFor(doc), invitedFor(doc), lookupP]);
  // Tiempos en la terminal: muestra cuánto tardó la API externa y cuánto la app.
  console.log(`lookup ${nat}${doc.slice(0, 2)}***: API ${(apiMs / 1000).toFixed(1)} s, total ${((Date.now() - t0) / 1000).toFixed(1)} s`);

  if ("error" in lookup) {
    console.error("lookup", lookup.error);
    return NextResponse.json({
      found: false, source: "api", person: null, photo: null, photoDate: null,
      apiError: `No se pudo consultar la API (${lookup.error}). Puedes registrar los datos manualmente.`,
      existing, invited,
    });
  }
  return NextResponse.json({ ...lookup, existing, invited });
}
