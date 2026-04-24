// Client-side OCR pre-pass using Tesseract.js.
// Extracts visible text from a menu image so the AI gets cleaner ground truth
// alongside the raw photo. This dramatically reduces dish-name hallucinations.

import Tesseract from "tesseract.js";

let workerPromise: Promise<Tesseract.Worker> | null = null;

async function getWorker(): Promise<Tesseract.Worker> {
  if (!workerPromise) {
    workerPromise = Tesseract.createWorker("eng", 1, {
      // Suppress noisy logs in production
      logger: () => {},
    });
  }
  return workerPromise;
}

export interface OcrResult {
  text: string;
  confidence: number;
  durationMs: number;
}

/**
 * Run OCR on a menu image (File or base64 string).
 * Returns concatenated visible text — empty string on failure.
 * Designed to never throw: OCR is a best-effort enhancement.
 */
export async function ocrMenuImage(input: File | string): Promise<OcrResult> {
  const start = performance.now();
  try {
    const worker = await getWorker();
    const source =
      typeof input === "string"
        ? input.startsWith("data:")
          ? input
          : `data:image/jpeg;base64,${input}`
        : input;

    const { data } = await worker.recognize(source);
    const cleaned = (data.text || "")
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0)
      .join("\n");

    const durationMs = Math.round(performance.now() - start);
    console.log(
      `[OCR] Extracted ${cleaned.length} chars (conf ${data.confidence?.toFixed?.(0) ?? "?"}%) in ${durationMs}ms`
    );

    return {
      text: cleaned,
      confidence: data.confidence ?? 0,
      durationMs,
    };
  } catch (err) {
    console.warn("[OCR] failed, continuing without OCR text:", err);
    return { text: "", confidence: 0, durationMs: Math.round(performance.now() - start) };
  }
}

export async function terminateOcrWorker() {
  if (workerPromise) {
    try {
      const w = await workerPromise;
      await w.terminate();
    } catch {
      /* ignore */
    }
    workerPromise = null;
  }
}
