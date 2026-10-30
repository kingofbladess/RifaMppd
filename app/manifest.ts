import type { MetadataRoute } from "next";

// Permite instalar la app en el celular desde el navegador (PWA).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Rifa · Registro",
    short_name: "Rifa",
    description: "Registro de participantes y ruleta de la rifa",
    start_url: "/registro",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f6f4ef",
    theme_color: "#d6336c",
    lang: "es",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
