// Saca la cédula (nacionalidad V/E y número) del texto de un QR o código de barras de un documento.
// Acepta los formatos más comunes: "V-12.345.678", "V12345678", "CI: 12345678", JSON {"cedula": ...},
// enlaces con ?cedula=... y, como último recurso, el primer número de 6 a 9 cifras.
export type QrCedula = { nat: "V" | "E"; number: string };

const valid = (n: string) => n.length >= 5 && n.length <= 9 && !/^0+$/.test(n);
const natOf = (s?: string | null): "V" | "E" => (s && /^e/i.test(s.trim()) ? "E" : "V");

export function parseCedula(raw: string): QrCedula | null {
  const text = (raw ?? "").trim();
  if (!text) return null;

  // JSON con campos conocidos
  if (/^[[{]/.test(text)) {
    try {
      const o = JSON.parse(text) as Record<string, unknown>;
      const flat = Object.fromEntries(Object.entries(o).map(([k, v]) => [k.toLowerCase(), String(v ?? "")]));
      const key = Object.keys(flat).find((k) => /^(cedula|cédula|ci|c_i|documento|nro_?documento|numero_?cedula|id_?number|dni)$/.test(k));
      if (key) {
        const r = parseCedula(flat[key]);
        const natKey = Object.keys(flat).find((k) => /^(nacionalidad|nac|nationality|letra)$/.test(k));
        if (r) return natKey ? { ...r, nat: natOf(flat[natKey]) } : r;
      }
    } catch { /* no es JSON */ }
  }

  // Enlace con parámetro de cédula
  const param = /[?&](?:cedula|ci|documento|doc|id)=([VEve]?)[-\s]?([\d.]{5,12})/i.exec(text);
  if (param) {
    const n = param[2].replace(/\D/g, "");
    if (valid(n)) return { nat: natOf(param[1]), number: n };
  }

  // V-12.345.678 / E 1234567 / V12345678
  const withLetter = /(?:^|[^A-Za-z])([VEve])\s*[-.:]?\s*(\d{1,3}(?:\.\d{3}){1,2}|\d{5,9})(?!\d)/.exec(text);
  if (withLetter) {
    const n = withLetter[2].replace(/\D/g, "");
    if (valid(n)) return { nat: natOf(withLetter[1]), number: n };
  }

  // C.I. / Cédula / CI: seguido del número
  const labeled = /(?:c\.?\s?i\.?|c[eé]dula|documento)\s*(?:n[°ºo.]*)?\s*[:#-]?\s*([VEve])?\s*[-.]?\s*(\d{1,3}(?:\.\d{3}){1,2}|\d{5,9})(?!\d)/i.exec(text);
  if (labeled) {
    const n = labeled[2].replace(/\D/g, "");
    if (valid(n)) return { nat: natOf(labeled[1]), number: n };
  }

  // Último recurso: el primer número de 6 a 9 cifras (con o sin puntos), que no sea parte de una fecha
  const plain = text.replace(/(\d)\.(?=\d{3}(?!\d))/g, "$1");
  for (const m of plain.matchAll(/(?<![\d/-])(\d{6,9})(?![\d/-])/g)) {
    if (valid(m[1])) return { nat: "V", number: m[1] };
  }
  return null;
}
