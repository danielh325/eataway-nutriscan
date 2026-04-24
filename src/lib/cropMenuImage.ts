import type { MenuImageBBox } from "@/lib/api/menu";

/**
 * Crop a region from a base64 menu image using a percentage bounding box.
 * Returns { dataUrl, base64 } of the cropped region as JPEG.
 */
export async function cropImageRegion(
  imageBase64: string,
  mimeType: string,
  bbox: MenuImageBBox,
  options?: { padding?: number; maxSize?: number }
): Promise<{ dataUrl: string; base64: string } | null> {
  const padding = options?.padding ?? 2; // % padding around the crop
  const maxSize = options?.maxSize ?? 512;

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const x = Math.max(0, (bbox.x - padding) / 100) * img.width;
        const y = Math.max(0, (bbox.y - padding) / 100) * img.height;
        const w = Math.min(100, bbox.width + padding * 2) / 100 * img.width;
        const h = Math.min(100, bbox.height + padding * 2) / 100 * img.height;

        // Scale down for size if needed
        const scale = Math.min(1, maxSize / Math.max(w, h));
        const outW = Math.max(1, Math.round(w * scale));
        const outH = Math.max(1, Math.round(h * scale));

        const canvas = document.createElement("canvas");
        canvas.width = outW;
        canvas.height = outH;
        const ctx = canvas.getContext("2d");
        if (!ctx) return resolve(null);
        ctx.drawImage(img, x, y, w, h, 0, 0, outW, outH);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
        const base64 = dataUrl.split(",")[1] || "";
        resolve({ dataUrl, base64 });
      } catch (e) {
        console.warn("crop failed", e);
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = `data:${mimeType};base64,${imageBase64}`;
  });
}
