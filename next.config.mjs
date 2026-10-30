/** @type {import('next').NextConfig} */
const nextConfig = {
  // Las imágenes se comprimen en el navegador antes de subir (límite de 4.5 MB por petición en Vercel).
  poweredByHeader: false,
  // Permite abrir el servidor de desarrollo desde los celulares de la red local (npm run red).
  allowedDevOrigins: ["192.168.150.40", "192.168.*.*", "10.*.*.*"],
};
export default nextConfig;
