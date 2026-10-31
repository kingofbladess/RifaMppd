"use client";
import { useRef, useState } from "react";

// Pantalla espejo (TV): no se ve ningún botón. Tocar el escudo 3 veces seguidas muestra "Cerrar sesión" por 8 s.
export default function HiddenLogout() {
  const [open, setOpen] = useState(false);
  const taps = useRef<number[]>([]);
  const hide = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const tap = () => {
    const now = Date.now();
    taps.current = [...taps.current.filter((t) => now - t < 2000), now];
    if (taps.current.length >= 3) {
      taps.current = [];
      setOpen(true);
      clearTimeout(hide.current);
      hide.current = setTimeout(() => setOpen(false), 8000);
    }
  };
  return (
    <>
      <button type="button" className="hidden-logout-trigger" onClick={tap} aria-label="Opciones de la pantalla" />
      {open && (
        <form method="post" action="/api/logout" className="hidden-logout">
          <button className="btn secondary xmas-ghost">Cerrar sesión</button>
        </form>
      )}
    </>
  );
}
