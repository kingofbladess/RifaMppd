import { seeOther } from "@/lib/redirect";
import { supabaseAdmin } from "@/lib/supabase";
import { getActiveRaffle } from "@/lib/participants";
import { leerListaInvitados } from "@/lib/lista-invitados";
import { olvidarInvitados } from "@/lib/invitados";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BYTES = 10 * 1024 * 1024;
const CHUNK = 1000;

// Solo admin (middleware protege /api/admin). Sube la lista de invitados (Excel .xlsx o CSV) y reemplaza la
// anterior de la rifa activa; con action=clear la borra (vuelven a salir todos los inscritos en la ruleta).
export async function POST(req: Request) {
  const back = (params: Record<string, string | number>) =>
    seeOther(`/admin?${new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]))}`);
  const form = await req.formData().catch(() => null);
  if (!form) return back({ inv: "error", msg: "No llegó el archivo" });
  const raffle = await getActiveRaffle();
  if (!raffle) return back({ inv: "error", msg: "No hay una rifa activa" });
  const sb = supabaseAdmin();
  const falla = (e: { message?: string; code?: string }) => back({
    inv: "error",
    msg: ["42P01", "PGRST205"].includes(e.code ?? "")
      ? "Falta crear la tabla de invitados en Supabase (corre el SQL de la actualización)"
      : e.message ?? "Error al guardar",
  });

  if (form.get("action") === "clear") {
    const { error } = await sb.from("guests").delete().eq("raffle_id", raffle.id);
    olvidarInvitados();
    return error ? falla(error) : back({ inv: "borrada" });
  }

  const file = form.get("file");
  if (!(file instanceof File) || !file.size) return back({ inv: "error", msg: "Elige el archivo de la lista" });
  if (file.size > MAX_BYTES) return back({ inv: "error", msg: "El archivo pesa más de 10 MB" });

  let lectura;
  try {
    lectura = leerListaInvitados(Buffer.from(await file.arrayBuffer()), file.name);
  } catch (e) {
    return back({ inv: "error", msg: `No se pudo leer el archivo: ${(e as Error).message}` });
  }
  if (!lectura.invitados.length) return back({ inv: "error", msg: "No se encontró ninguna cédula en el archivo (revisa que tenga una columna de cédula)" });

  // Se reemplaza la lista completa: primero se borra la anterior y luego se guarda la nueva por tandas.
  const del = await sb.from("guests").delete().eq("raffle_id", raffle.id);
  if (del.error) return falla(del.error);
  for (let i = 0; i < lectura.invitados.length; i += CHUNK) {
    const rows = lectura.invitados.slice(i, i + CHUNK)
      .map((g) => ({ raffle_id: raffle.id, document_number: g.doc, full_name: g.name, rank: g.rank }));
    const { error } = await sb.from("guests").insert(rows);
    if (error) { olvidarInvitados(); return falla(error); }
  }
  olvidarInvitados();
  return back({ inv: "ok", n: lectura.invitados.length, om: lectura.omitidas, rep: lectura.repetidas });
}
