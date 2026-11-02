// Correcciones manuales del informe de ganadores (no tocan la base de datos ni el sorteo).
// La clave es el N° de orden del informe. Hugo, 2026-11-02: el ganador 9 debe ser esta persona.
export type Correccion = { nombre?: string; cedula?: string; grado?: string; dependencia?: string; foto?: string };

export const CORRECCIONES: Record<number, Correccion> = {
  9: {
    nombre: "Adrian Sebastian Lamus Barreto",
    cedula: "27169815",
    grado: "Sargento Primero",
    dependencia: "Apoyo del Desarrollo Nacional del CEOFAN",
    foto: "/informe/ganador-9.jpg",
  },
};
