// Fotos de la secuencia visual: como máximo unas 101 por giro, no todo el padrón.
// Se conservan ya decodificadas y reducidas en memoria para pintar sin red durante la animación.
export const CARD_INTERVAL_MS = 100;
const SIDE = 192;
const CONCURRENCY = 6; // al girar: casi todo sale de la caché del navegador, no de la red
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

// ---- Precarga al abrir la ruleta ----
// Apenas carga la página se bajan en segundo plano las fotos de todos los participantes, de pocas en pocas
// para no saturar la red. Las primeras MAX_DECODED quedan ya listas en memoria (pintar sin espera); el resto
// queda en la caché del navegador, así al girar se leen del disco en vez de la red. Durante el giro se pausa.
const MAX_DECODED = 500; // ~70 MB de retratos listos; con 5000 personas guardarlos todos trabaría la TV
const PRELOAD_CONCURRENCY = 3;
const decoded = new Map<string, HTMLCanvasElement>();
const warmed = new Set<string>();
const failedPreload = new Set<string>();
let paused = false;
let resumeWaiters: (() => void)[] = [];

function keep(url: string, canvas: HTMLCanvasElement) {
  if (decoded.size < MAX_DECODED) decoded.set(url, canvas);
  warmed.add(url);
}

export function pausePhotoPreload(value: boolean) {
  paused = value;
  if (!value) { const w = resumeWaiters; resumeWaiters = []; w.forEach((f) => f()); }
}

async function warm(url: string, signal: AbortSignal) {
  const ctrl = AbortSignal.any ? AbortSignal.any([signal, AbortSignal.timeout(TIMEOUT_MS)]) : signal;
  const r = await fetch(url, { signal: ctrl, priority: "low" } as RequestInit);
  if (!r.ok) throw new Error("Foto no disponible");
  await r.blob();
}

export type PreloadStatus = { ready: number; total: number; failed: number };

// Devuelve una función para cancelar (al cambiar la lista o salir de la página).
export function preloadPhotos(urls: string[], onProgress: (s: PreloadStatus) => void): () => void {
  const unique = [...new Set(urls)];
  const controller = new AbortController();
  const done = (u: string) => warmed.has(u) || failedPreload.has(u);
  const pending = unique.filter((u) => !done(u));
  let ready = unique.length - pending.length, next = 0;
  const report = () => onProgress({ ready, total: unique.length, failed: unique.filter((u) => failedPreload.has(u)).length });
  report();
  void Promise.all(Array.from({ length: Math.min(PRELOAD_CONCURRENCY, pending.length) }, async () => {
    while (next < pending.length && !controller.signal.aborted) {
      if (paused) { await new Promise<void>((r) => resumeWaiters.push(r)); continue; }
      const url = pending[next++];
      if (!done(url)) {
        let ok = false;
        for (let attempt = 0; attempt < 2 && !ok && !controller.signal.aborted; attempt++) {
          try {
            if (decoded.size < MAX_DECODED) keep(url, await loadPhoto(url, controller.signal));
            else { await warm(url, controller.signal); warmed.add(url); }
            ok = true;
          } catch { /* un segundo intento ante cortes transitorios */ }
        }
        if (controller.signal.aborted) return;
        if (!ok) failedPreload.add(url);
      }
      ready++;
      report();
    }
  }));
  return () => controller.abort();
}

// Al girar: los retratos ya precargados salen al instante; los que falten se leen (casi siempre de la caché)
// con prioridad. El giro espera como mucho waitMs: lo que no llegue a tiempo sigue cargando durante la
// animación y aparece en cuanto está; mientras tanto se ven las iniciales.
export function prepareSpinPhotos(urls: string[], onProgress: (ready: number, total: number) => void, waitMs = 2500) {
  const unique = [...new Set(urls)];
  const photos = new Map<string, HTMLCanvasElement>();
  for (const u of unique) { const c = decoded.get(u); if (c) photos.set(u, c); }
  const missing = unique.filter((u) => !photos.has(u));
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), PREPARATION_MS);
  let next = 0, completed = unique.length - missing.length;
  onProgress(completed, unique.length);
  const all = Promise.all(Array.from({ length: Math.min(CONCURRENCY, missing.length) }, async () => {
    while (next < missing.length) {
      const url = missing[next++];
      for (let attempt = 0; attempt < 2 && !controller.signal.aborted; attempt++) {
        try { const c = await loadPhoto(url, controller.signal); photos.set(url, c); keep(url, c); break; } catch { /* reintento */ }
      }
      onProgress(++completed, unique.length);
    }
  })).then(() => { clearTimeout(deadline); return unique.filter((url) => !photos.has(url)); });
  const ready = Promise.race([all.then(() => undefined), new Promise<void>((r) => setTimeout(r, waitMs))]);
  return { photos, ready, done: all };
}
