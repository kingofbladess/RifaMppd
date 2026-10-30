import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "Rifa", description: "Inscríbete y obtén tu número de la suerte" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
