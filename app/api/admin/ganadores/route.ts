import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { informeGanadores, horaVe } from "@/lib/ganadores";

export const dynamic = "force-dynamic";

// Excel (CSV con ";" y BOM: Excel en español lo abre en columnas y con acentos).
export async function GET() {
  if ((await getSession())?.role !== "admin") return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const { ganadores } = await informeGanadores(false);
  const cell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const rows = [["N°", "Ruleta", "Nombre", "Cédula", "Grado", "N° de rifa", "Hora del sorteo"],
    ...ganadores.map((g) => [g.orden, g.ruleta, g.nombre, g.cedula, g.grado, g.numero ?? "", horaVe(g.hora)])];
  const csv = "﻿" + rows.map((r) => r.map(cell).join(";")).join("\r\n");
  return new NextResponse(csv, { headers: {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": 'attachment; filename="ganadores-rifa.csv"',
    "Cache-Control": "no-store",
  } });
}
