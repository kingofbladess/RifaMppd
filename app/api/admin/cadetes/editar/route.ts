import { getSession } from "@/lib/auth";
import { seeOther } from "@/lib/redirect";
import { validarCadetes, MAX_CADETES } from "@/lib/cadetes";
import { normalizeRaffleDocument } from "@/lib/raffle-eligibility";
import { readCadetes, writeCadetes } from "@/lib/cadetes-store";

export const runtime = "nodejs";

// Quitar o agregar un cadete de la lista guardada, sin volver a subir el Excel.
export async function POST(req: Request) {
  const session = await getSession();
  if (session?.role !== "admin") return new Response("Solo el administrador", { status: 403 });
  const back = (q: string) => seeOther(`/admin/cadetes?${q}`);
  try {
    const form = await req.formData();
    const accion = String(form.get("accion") ?? "");
    const cedula = normalizeRaffleDocument(String(form.get("cedula") ?? "").replace(/,/g, ""));
    if (!cedula) return back(`error=${encodeURIComponent("Escribe una cédula válida.")}`);
    const lista = (await readCadetes())?.cadetes ?? [];
    if (accion === "quitar") {
      const resto = lista.filter((c) => c.cedula !== cedula);
      if (resto.length === lista.length) return back(`error=${encodeURIComponent("Esa cédula no está en la lista de cadetes.")}`);
      if (!resto.length) return back(`error=${encodeURIComponent("La lista no puede quedar vacía: carga otra lista o vuelve a la ruleta normal.")}`);
      await writeCadetes(resto, session.name);
      return back(`ok=quitado&c=${cedula}`);
    }
    if (accion === "agregar") {
      if (lista.some((c) => c.cedula === cedula)) return back(`error=${encodeURIComponent("Esa cédula ya está en la lista de cadetes.")}`);
      if (lista.length >= MAX_CADETES) return back(`error=${encodeURIComponent(`La lista admite hasta ${MAX_CADETES} cadetes.`)}`);
      const [nuevo] = validarCadetes([{ cedula, nombre: form.get("nombre"), grado: form.get("grado") }]);
      await writeCadetes([...lista, nuevo], session.name);
      return back(`ok=agregado&c=${cedula}`);
    }
    return back(`error=${encodeURIComponent("Acción desconocida")}`);
  } catch (e) {
    return back(`error=${encodeURIComponent(e instanceof Error ? e.message.replace("en la posición 1", "") : "No se pudo guardar")}`);
  }
}
