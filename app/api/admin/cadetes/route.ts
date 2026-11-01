import { getSession } from "@/lib/auth";
import { seeOther } from "@/lib/redirect";
import { validarCadetes } from "@/lib/cadetes";
import { writeCadetes } from "@/lib/cadetes-store";

export const runtime = "nodejs";

// Guarda (reemplaza) la lista de cadetes. No toca inscritos, ganadores normales ni la lista de la rifa.
export async function POST(req: Request) {
  const session = await getSession();
  if (session?.role !== "admin") return new Response("Solo el administrador", { status: 403 });
  const back = (q: string) => seeOther(`/admin/cadetes?${q}`);
  try {
    const form = await req.formData();
    let data: unknown;
    try { data = JSON.parse(String(form.get("cadetes") ?? "")); } catch { return back(`error=${encodeURIComponent("La lista llegó incompleta. Vuelve a cargar el archivo.")}`); }
    const cadetes = validarCadetes(data);
    await writeCadetes(cadetes, session.name);
    return back(`ok=lista&n=${cadetes.length}`);
  } catch (e) {
    return back(`error=${encodeURIComponent(e instanceof Error ? e.message : "No se pudo guardar la lista")}`);
  }
}
