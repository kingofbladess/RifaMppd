import { seeOther } from "@/lib/redirect";
import { getSession } from "@/lib/auth";
import { writeCorte } from "@/lib/ganadores-corte";

export const runtime = "nodejs";

// Solo admin (middleware protege /api/admin). Limpia la lista de ganadores sin borrar sorteos (ver lib/ganadores-corte.ts).
export async function POST() {
  const session = await getSession();
  try {
    await writeCorte(session?.name ?? "admin");
  } catch (e) {
    console.error("limpiar ganadores", e);
    return seeOther("/admin/ganadores?limpia=error");
  }
  return seeOther("/admin/ganadores?limpia=1");
}
