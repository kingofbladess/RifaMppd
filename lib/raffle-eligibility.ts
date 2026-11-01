// La lista de elegibles no modifica la asistencia ni los datos que muestra la ruleta.
export function normalizeRaffleDocument(value: string): string | null {
  const doc = value.trim().replace(/^[VE]\s*-?\s*(?=\d)/i, "").replace(/[.\s-]/g, "");
  return /^\d{4,15}$/.test(doc) && !/^0+$/.test(doc) ? doc.replace(/^0+(?=\d)/, "") : null;
}

export function parseRaffleDocuments(text: string): string[] {
  if (text.length > 250_000) throw new Error("La lista supera el tamaño permitido");
  const lines = text.split(/[\r\n,;]+/).map((line) => line.trim()).filter(Boolean);
  if (!lines.length) throw new Error("La lista debe contener al menos una cédula");
  const documents = new Set<string>();
  for (let i = 0; i < lines.length; i++) {
    const doc = normalizeRaffleDocument(lines[i]);
    if (!doc) throw new Error(`Cédula inválida en la entrada ${i + 1}. Usa solo cédulas, sin nombres ni encabezados.`);
    documents.add(doc);
  }
  if (documents.size > 10000) throw new Error("La lista admite hasta 10000 cédulas");
  return [...documents];
}

export function eligibleRafflePool<T extends { id: string; document_number: string }>(
  participants: T[], documents: string[], won: Set<string>, onScreen: Set<string> | null = null,
): T[] {
  const allowed = new Set(documents);
  return participants.filter((p) => {
    const doc = normalizeRaffleDocument(p.document_number);
    return doc !== null && allowed.has(doc) && !won.has(p.id) && (!onScreen || onScreen.has(p.id));
  });
}
