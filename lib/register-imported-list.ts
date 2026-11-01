export type ImportRegistration = { doc: string; status: "registered" | "existing" | "error"; error?: string; number?: number };

export async function registerImportedList(documents: string[], raffleId: string, nat: "V" | "E", signal: AbortSignal,
  onProgress: (results: ImportRegistration[]) => void, request: typeof fetch = fetch) {
  const results: ImportRegistration[] = [];
  for (const doc of [...new Set(documents)]) {
    if (signal.aborted) break;
    let stop = false;
    try {
      for (let attempt = 0; ; attempt++) {
        const response = await request("/api/admin/register-list", { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ doc, raffleId, nat }), signal: AbortSignal.any([signal, AbortSignal.timeout(180000)]) });
        const data = await response.json();
        if (data.retryPhoto && attempt < 2) {
          await new Promise<void>((resolve, reject) => {
            const cancel = () => { clearTimeout(timer); reject(new Error("Cancelado")); };
            const timer = setTimeout(() => { signal.removeEventListener("abort", cancel); resolve(); }, 3000);
            signal.addEventListener("abort", cancel, { once: true });
            if (signal.aborted) cancel();
          });
          continue;
        }
        const status = response.ok && (data.status === "existing" || data.status === "registered") ? data.status : "error";
        results.push({ doc, status, number: data.number, error: status === "error" ? data.error ?? "No se pudo registrar" : undefined });
        stop = !!data.stop || response.status === 401 || response.status === 403;
        break;
      }
    } catch {
      if (signal.aborted) break;
      results.push({ doc, status: "error", error: "La petición no terminó. Reintentar es seguro: se comprobará si ya quedó registrado." });
    }
    onProgress([...results]);
    if (stop) break;
  }
  return results;
}
