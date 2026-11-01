import { createdFromRaffleList } from "@/lib/list-registration-id";
import { readOperatorConfirmations } from "@/lib/operator-confirmations";
import { registrationEvidence } from "@/lib/registration-evidence";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getActiveRaffle } from "@/lib/participants";
import { lookupByQr, lookupPerson } from "@/lib/person-api";

export const runtime = "nodejs";
export const maxDuration = 130; // Infopress puede tardar hasta ~2 minutos

// Consulta la API de personas y, a la vez, si la cédula ya está inscrita en la rifa activa.
const existingFor = async (doc: string) => {
  try {
    const raffle = await getActiveRaffle();
    if (!raffle) return null;
    const { data, error } = await supabaseAdmin().from("participants")
      .select("id, raffle_number, full_name, registered_by_name, photo_path, document_number")
      .eq("raffle_id", raffle.id).eq("document_number", doc).maybeSingle();
    if (error || !data) return null;
    const fromList = createdFromRaffleList(raffle.id, data.document_number, data.photo_path);
    const confirmations = fromList ? await readOperatorConfirmations([data.id]) : { available: true, byId: new Map() };
    const confirmation = confirmations.byId.get(data.id);
    return { id: data.id, raffle_number: data.raffle_number, full_name: data.full_name,
      registered_by_name: data.registered_by_name,
      registration_origin: registrationEvidence(fromList, confirmations.available, !!confirmation),
      confirmation_available: confirmations.available, confirmed_at: confirmation?.confirmed_at ?? null,
      confirmed_by_name: confirmation?.confirmed_by_name ?? null };
  } catch { return null; }
};

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  // QR del carnet: Infopress resuelve la cédula a partir del código y devuelve los datos de la persona.
  const qr = params.get("qr");
  if (qr !== null) {
    const t0 = Date.now();
    try {
      const { nat, doc, result } = await lookupByQr(qr.trim());
      const existing = await existingFor(doc);
      console.log(`lookup QR: API ${((Date.now() - t0) / 1000).toFixed(1)} s`);
      return NextResponse.json({ ...result, nat, doc, existing });
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
  const existingP = existingFor(doc);
  const [existing, lookup] = await Promise.all([existingP, lookupP]);
  // Tiempos en la terminal: muestra cuánto tardó la API externa y cuánto la app.
  console.log(`lookup ${nat}${doc.slice(0, 2)}***: API ${(apiMs / 1000).toFixed(1)} s, total ${((Date.now() - t0) / 1000).toFixed(1)} s`);

  if ("error" in lookup) {
    console.error("lookup", lookup.error);
    return NextResponse.json({
      found: false, source: "api", person: null, photo: null, photoDate: null,
      apiError: `No se pudo consultar la API (${lookup.error}). Puedes registrar los datos manualmente.`,
      existing,
    });
  }
  return NextResponse.json({ ...lookup, existing });
}
