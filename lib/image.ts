// Convierte cualquier imagen (JPG, PNG, HEIC soportado por el navegador, etc.) a JPG comprimido.
// Así todo se guarda en JPG y cada envío queda bajo el límite de 4.5 MB de Vercel.
export async function toJpeg(file: File, maxSide: number, quality = 0.85): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("No se pudo convertir la imagen"))), "image/jpeg", quality)
  );
}

// Convierte una imagen en data URL (foto de la API, incluso SVG/PNG) a JPG.
export async function dataUrlToJpeg(src: string, maxSide: number, quality = 0.88): Promise<Blob> {
  const img = new Image();
  img.src = src;
  await img.decode();
  const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.naturalWidth * scale);
  canvas.height = Math.round(img.naturalHeight * scale);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("No se pudo convertir la foto"))), "image/jpeg", quality)
  );
}
