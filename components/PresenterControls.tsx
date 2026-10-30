"use client";
import { useEffect } from "react";

// Modo presentador: pantalla completa sin el botón "Panel" ni ayudas; el cursor se oculta si no se mueve.
// Tecla F: entrar/salir. Esc (del navegador) también sale.
export default function PresenterControls() {
  useEffect(() => {
    const root = document.documentElement;
    let idle: ReturnType<typeof setTimeout> | undefined;
    const sync = () => {
      if (document.fullscreenElement) root.dataset.presenter = "1";
      else { delete root.dataset.presenter; delete root.dataset.idle; }
    };
    const onMove = () => {
      delete root.dataset.idle;
      clearTimeout(idle);
      if (root.dataset.presenter) idle = setTimeout(() => { root.dataset.idle = "1"; }, 2500);
    };
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === "f" || e.key === "F") && !e.ctrlKey && !e.metaKey && !e.altKey && !(e.target instanceof HTMLInputElement)) toggle();
    };
    document.addEventListener("fullscreenchange", sync);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("fullscreenchange", sync);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("keydown", onKey);
      clearTimeout(idle);
      delete root.dataset.presenter; delete root.dataset.idle;
    };
  }, []);
  return (
    <button type="button" className="btn secondary xmas-ghost presenter-btn" onClick={toggle} title="Pantalla completa (F)">
      ⛶ <span className="only-desk">Modo presentador</span>
    </button>
  );
}

function toggle() {
  if (document.fullscreenElement) document.exitFullscreen?.();
  else document.documentElement.requestFullscreen?.().catch(() => {});
}
