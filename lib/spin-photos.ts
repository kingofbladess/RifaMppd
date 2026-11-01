// Fotos de la secuencia visual: como máximo unas 101 por giro, no todo el padrón.
// Se conservan ya decodificadas y reducidas en memoria para pintar sin red durante la animación.
export const CARD_INTERVAL_MS = 100;
const SIDE = 192;
const CONCURRENCY = 4;
const TIMEOUT_MS = 8000;
const PREPARATION_MS = 20000;

function loadPhoto(url: string, signal: AbortSignal): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    let finished = false;
    const finish = (error?: Error) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      img.onload = null;
      img.onerror = null;
      if (error) { img.src = ""; reject(error); return; }
      try {
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = SIDE;
        const ctx = canvas.getContext("2d");
        if (!ctx || !img.naturalWidth || !img.naturalHeight) throw new Error("Foto inválida");
        const side = Math.min(img.naturalWidth, img.naturalHeight);
        ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, SIDE, SIDE);
        resolve(canvas);
      } catch (e) { reject(e); }
    };
    const abort = () => finish(new Error("Preparación cancelada"));
    const timer = setTimeout(() => finish(new Error("Tiempo de carga agotado")), TIMEOUT_MS);
    img.onerror = () => finish(new Error("Foto no disponible"));
    img.onload = () => {
      // decode evita trasladar el costo de decodificación al primer cuadro visible.
      void img.decode().then(() => finish(), () => finish(new Error("No se pudo decodificar la foto")));
    };
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort(); else img.src = url;
  });
}

export async function prepareSpinPhotos(urls: string[], onProgress: (ready: number, total: number) => void) {
  const unique = [...new Set(urls)];
  const photos = new Map<string, HTMLCanvasElement>();
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), PREPARATION_MS);
  let next = 0, completed = 0;
  onProgress(0, unique.length);
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, unique.length) }, async () => {
    while (next < unique.length) {
      const url = unique[next++];
      for (let attempt = 0; attempt < 2 && !controller.signal.aborted; attempt++) {
        try { photos.set(url, await loadPhoto(url, controller.signal)); break; } catch { /* un segundo intento ante cortes transitorios */ }
      }
      onProgress(++completed, unique.length);
    }
  }));
  clearTimeout(deadline);
  return { photos, failed: unique.filter((url) => !photos.has(url)) };
}
