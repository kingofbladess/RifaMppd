"use client";
import { useEffect, useRef } from "react";

// Pantalla espejo (TV): botón oculto para cerrar sesión. Está en la esquina inferior izquierda, invisible hasta
// acercar el mouse o tocar ahí; pide confirmación para que un toque accidental no saque la TV.
// Funciona también en pantalla completa. Atajo: Ctrl + Shift + S.
export default function HiddenLogout() {
  const form = useRef<HTMLFormElement>(null);
  const ask = () => { if (confirm("¿Cerrar sesión de esta pantalla?")) form.current?.requestSubmit(); };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && (e.key === "S" || e.key === "s")) { e.preventDefault(); ask(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <form ref={form} method="post" action="/api/logout" className="hidden-logout">
      <button type="button" onClick={ask} title="Cerrar sesión (Ctrl + Shift + S)" aria-label="Cerrar sesión">⏻ Salir</button>
    </form>
  );
}
