import { NextResponse } from "next/server";

// Redirección con ruta relativa: el navegador la resuelve contra la dirección que está usando.
// Con new URL(ruta, req.url), al correr con "npm run red" (-H 0.0.0.0) salía https://0.0.0.0:3001/... y no abría.
export function seeOther(path: string) {
  return new NextResponse(null, { status: 303, headers: { Location: path } });
}
