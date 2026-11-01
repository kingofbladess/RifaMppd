// Regla de probabilidades por grado militar (ver ruleta-probabilidades/regla-por-grado.md).
// A más antigüedad, menos probabilidad: el grado 1 nunca gana y el 16 es el que más tiene.
// Ejército y Armada valen lo mismo. El peso es del GRADO (no de cada persona), así el orden se cumple
// aunque haya muchos más de un grado que de otro.

export type Grado = { n: number; nombre: string; peso: number; nombres: string[] };

export const GRADOS: Grado[] = [
  { n: 1, nombre: "Mayor General = Almirante (y General/Almirante en Jefe)", peso: 0, nombres: ["Mayor General", "Almirante", "General en Jefe", "Almirante en Jefe"] },
  { n: 2, nombre: "General de División = Vicealmirante", peso: 5, nombres: ["General de División", "Vicealmirante", "Vice Almirante"] },
  { n: 3, nombre: "General de Brigada = Contraalmirante", peso: 6, nombres: ["General de Brigada", "Contraalmirante", "Contralmirante", "Contra Almirante"] },
  { n: 4, nombre: "Coronel = Capitán de Navío", peso: 8, nombres: ["Coronel", "Capitán de Navío"] },
  { n: 5, nombre: "Teniente Coronel = Capitán de Fragata", peso: 10, nombres: ["Teniente Coronel", "Capitán de Fragata"] },
  { n: 6, nombre: "Mayor = Capitán de Corbeta", peso: 12, nombres: ["Mayor", "Capitán de Corbeta"] },
  { n: 7, nombre: "Capitán = Teniente de Navío", peso: 15, nombres: ["Capitán", "Capitana", "Teniente de Navío"] },
  { n: 8, nombre: "Primer Teniente = Teniente de Fragata", peso: 19, nombres: ["Primer Teniente", "Primera Teniente", "Teniente de Fragata"] },
  { n: 9, nombre: "Teniente = Teniente de Corbeta", peso: 23, nombres: ["Teniente", "Teniente de Corbeta"] },
  { n: 10, nombre: "Sargento Supervisor", peso: 28, nombres: ["Sargento Supervisor"] },
  { n: 11, nombre: "Sargento Ayudante", peso: 35, nombres: ["Sargento Ayudante"] },
  { n: 12, nombre: "Sargento Mayor de Primera", peso: 43, nombres: ["Sargento Mayor de Primera", "Sargento Mayor de Primero"] },
  { n: 13, nombre: "Sargento Mayor de Segunda", peso: 53, nombres: ["Sargento Mayor de Segunda", "Sargento Mayor de Segundo"] },
  { n: 14, nombre: "Sargento Mayor de Tercera", peso: 65, nombres: ["Sargento Mayor de Tercera", "Sargento Mayor de Tercero"] },
  { n: 15, nombre: "Sargento Primero", peso: 80, nombres: ["Sargento Primero", "Sargento Primera"] },
  { n: 16, nombre: "Sargento Segundo", peso: 100, nombres: ["Sargento Segundo", "Sargento Segunda"] },
];

// Abreviaturas comunes, por si el grado llega escrito corto ("Tte. Cnel.", "Sgto. 1ro", "Gral. de Div.").
// Solo se cambian palabras sueltas completas; un texto que aun así no coincide sale en el panel como no reconocido.
const ABREV: Record<string, string> = {
  gral: "general", grl: "general", my: "mayor", cnel: "coronel", tcnel: "teniente coronel", tte: "teniente", tnte: "teniente",
  cap: "capitan", capt: "capitan", cptn: "capitan", sgto: "sargento", sgt: "sargento", sarg: "sargento",
  sm: "sargento mayor", div: "division", brig: "brigada", alm: "almirante", valm: "vicealmirante", calm: "contraalmirante",
  "1er": "primer", "1ro": "primero", "1ra": "primera", "1era": "primera", "2do": "segundo", "2da": "segunda",
  "3ro": "tercero", "3ra": "tercera", "3era": "tercera",
};

// Palabras que acompañan al grado pero no lo cambian: componente, situación o "asimilado"
// ("Coronel EJ", "Capitán GNB", "Sargento Primero (ARV)", "Teniente Coronel Asimilado", "Mayor Retirado").
const IGNORAR = new Set([
  "de", "ej", "ejb", "ejercito", "bolivariano", "bolivariana", "gnb", "gn", "guardia", "nacional", "arv", "arm", "armada",
  "av", "amb", "aviacion", "militar", "milicia", "mb", "fanb", "asimilado", "asimilada", "retirado", "retirada", "r",
  "activo", "activa",
]);

// Minúsculas, sin acentos, sin puntos ni lo que venga entre paréntesis, abreviaturas escritas completas
// y sin "de" ni el componente ("Sargento Mayor 1ra EJ" = "Sargento Mayor de Primera").
export function normalizarGrado(texto: string | null | undefined): string {
  return (texto ?? "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\bs m\b/g, "sm") // "S/M 1ra"
    // "SM1", "SM 2da", "SM3RA": Sargento Mayor de Primera/Segunda/Tercera
    .replace(/\bsm ?([123])(?:ra|era|da|a)?\b/g, (_, d: string) => `sargento mayor ${["primera", "segunda", "tercera"][Number(d) - 1]}`)
    .split(" ")
    .map((w) => ABREV[w] ?? w)
    .join(" ").split(" ")
    .filter((w) => w && !IGNORAR.has(w))
    .join(" ");
}

const POR_NOMBRE = new Map<string, Grado>();
for (const g of GRADOS) for (const nombre of g.nombres) POR_NOMBRE.set(normalizarGrado(nombre), g);

// Grado de la lista o null (civil, o un grado que no está en la lista: se trata como civil).
// Se compara el texto completo, no un pedazo: "Teniente" no debe confundirse con "Teniente Coronel".
// Se recuerda cada texto ya visto: con miles de inscritos se repiten los mismos pocos grados.
const visto = new Map<string, Grado | null>();
export function gradoDe(rank: string | null | undefined): Grado | null {
  const key = rank ?? "";
  let g = visto.get(key);
  if (g === undefined) {
    g = POR_NOMBRE.get(normalizarGrado(key)) ?? null;
    if (visto.size < 5000) visto.set(key, g);
  }
  return g;
}

// Militar para la ruleta = grado reconocido. Un grado escrito que no está en la lista sortea como civil,
// así que el panel y el registro también lo cuentan como civil (antes bastaba con tener algo escrito).
export const esMilitar = (rank: string | null | undefined) => !!gradoDe(rank);

// Elige al ganador en 3 pasos. `azar(n)` devuelve un entero 0..n-1 (en el servidor, randomInt de crypto).
// 1) Civil o militar, según cuántos hay de cada uno (los civiles quedan igual que antes).
// 2) Si es militar, el grado según su peso, entre los grados que todavía tienen gente.
// 3) Una persona al azar de ese grado.
// Los de peso 0 (Mayor General) siguen en la ruleta pero nunca salen. Devuelve null si nadie puede ganar.
export function elegirGanador<T extends { rank: string | null }>(pool: T[], azar: (n: number) => number): T | null {
  const civiles: T[] = [];
  const porGrado = new Map<number, T[]>();
  for (const p of pool) {
    const g = gradoDe(p.rank);
    if (!g) { civiles.push(p); continue; }
    if (g.peso <= 0) continue;
    const lista = porGrado.get(g.n);
    if (lista) lista.push(p); else porGrado.set(g.n, [p]);
  }
  let militares = 0;
  porGrado.forEach((l) => { militares += l.length; });
  if (!civiles.length && !militares) return null;

  if (azar(civiles.length + militares) < civiles.length) return civiles[azar(civiles.length)];

  const grados = GRADOS.filter((g) => porGrado.has(g.n));
  const suma = grados.reduce((s, g) => s + g.peso, 0);
  let r = azar(suma);
  for (const g of grados) {
    if (r < g.peso) { const lista = porGrado.get(g.n)!; return lista[azar(lista.length)]; }
    r -= g.peso;
  }
  return null; // no ocurre: r siempre cae en algún grado
}
