"use client";

// Limpia la lista de ganadores (ruleta, TV e informe) sin borrar sorteos: quien ya ganó sigue sin poder ganar otra vez.
export default function LimpiarGanadores() {
  return <form method="post" action="/api/admin/ganadores/limpiar" style={{ display: "contents" }}
    onSubmit={(e) => { if (!confirm("¿Limpiar la lista de ganadores?\n\nLa ruleta, la TV y este informe empezarán vacíos. Los ganadores anteriores NO se borran y siguen sin poder ganar otra vez.\n\nRecarga la pantalla de la TV después.")) e.preventDefault(); }}>
    <button className="btn secondary" type="submit">🧹 Limpiar lista de ganadores</button>
  </form>;
}
