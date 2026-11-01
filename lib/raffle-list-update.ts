export type ListSnapshot = { document_numbers: string[]; updated_at: string };
type Adapter = {
  read: () => Promise<ListSnapshot | null>;
  create: (documents: string[], version: string) => Promise<boolean>;
  update: (documents: string[], version: string, previousVersion: string) => Promise<boolean>;
};

// Comparar la versión en la misma escritura evita perder altas de otras pestañas/operadores.
export async function saveRaffleList(adapter: Adapter, incoming: string[], mode: "append" | "edit", expectedVersion = "") {
  for (let attempt = 0; attempt < 4; attempt++) {
    const current = await adapter.read();
    if (mode === "edit" && (current?.updated_at ?? "") !== expectedVersion) {
      throw new Error("La lista cambió en otra pestaña. Recarga antes de editar para no perder integrantes.");
    }
    const documents = mode === "append" ? [...new Set([...(current?.document_numbers ?? []), ...incoming])] : incoming;
    if (documents.length > 10000) throw new Error("La lista completa supera 10000 cédulas");
    const version = new Date(Math.max(Date.now(), current ? Date.parse(current.updated_at) + 1 : 0)).toISOString();
    const saved = current ? await adapter.update(documents, version, current.updated_at) : await adapter.create(documents, version);
    if (saved) return documents;
    if (mode === "edit") throw new Error("La lista cambió mientras guardabas. Recarga antes de editar.");
  }
  throw new Error("La lista está siendo actualizada. Intenta guardar nuevamente.");
}
