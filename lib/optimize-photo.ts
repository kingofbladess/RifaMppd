import "server-only";

// Las fotos se reducen en el servidor antes de subirlas a Supabase, venga de donde venga (cámara, API, teléfono viejo).
// La ruleta muestra la cara a 190 px como máximo (cartel de ganador) y el panel a 40 px: 480 px de lado mayor
// se ve nítido incluso en una TV 4K y pesa ~4 veces menos que la foto de 900 px que se guardaba antes.
// sharp además quita los metadatos (EXIF: modelo del teléfono, ubicación) y endereza la foto según su orientación.
export const FOTO = { side: 480, quality: 78 };
export const CEDULA = { side: 1400, quality: 75 }; // se sigue leyendo bien el texto de la cédula

export async function optimizeJpeg(buf: Uint8Array<ArrayBuffer>, opts: { side: number; quality: number }): Promise<Uint8Array<ArrayBuffer>> {
  try {
    const sharp = (await import("sharp")).default;
    const out = await sharp(buf).rotate()
      .resize({ width: opts.side, height: opts.side, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: opts.quality, mozjpeg: true })
      .toBuffer();
    // Si por algo sale más pesada (foto ya muy comprimida), se guarda la original.
    return out.length < buf.length ? new Uint8Array(out) : buf;
  } catch (e) {
    console.warn(`no se pudo optimizar la foto: ${(e as Error).message}`);
    return buf; // sin sharp se guarda tal como llegó, igual que antes
  }
}
