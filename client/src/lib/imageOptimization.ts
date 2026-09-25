const MAX_DIMENSION = 2200;
const QUALITY = 0.82;

export async function prepareImageForUpload(file: File): Promise<{ data: string; contentType: "image/jpeg" | "image/png" | "image/webp"; fileName: string }> {
  if (file.type === "image/gif") return { data: await readAsDataUrl(file), contentType: "image/png", fileName: file.name.replace(/\.gif$/i, ".png") };
  if (typeof createImageBitmap !== "function") return { data: await readAsDataUrl(file), contentType: file.type === "image/png" ? "image/png" : "image/jpeg", fileName: file.name };
  let bitmap: ImageBitmap;
  try { bitmap = await createImageBitmap(file); } catch { return { data: await readAsDataUrl(file), contentType: file.type === "image/png" ? "image/png" : "image/jpeg", fileName: file.name }; }
  const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return { data: await readAsDataUrl(file), contentType: file.type === "image/png" ? "image/png" : "image/jpeg", fileName: file.name };
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const data = canvas.toDataURL("image/webp", QUALITY);
  return { data, contentType: "image/webp", fileName: file.name.replace(/\.[^.]+$/, ".webp") };
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(file); });
}
