// Local CLIP-based image↔text verifier using @huggingface/transformers.
// Runs entirely in the browser (WebGPU/WASM) — no API credits consumed.
//
// Replaces the verify-dish-photo Edge Function's Gemini call with a free
// open-source model. We compute cosine similarity between the cropped image
// embedding and each candidate dish-name embedding, then pick the best match.

import { pipeline, env } from "@huggingface/transformers";

// Cache models in browser; allow CDN fetch.
env.allowLocalModels = false;
env.useBrowserCache = true;

type ImageFE = (img: string | Blob, opts?: any) => Promise<{ data: Float32Array; dims: number[] }>;
type TextFE = (text: string | string[], opts?: any) => Promise<{ data: Float32Array; dims: number[] }>;

let imagePipePromise: Promise<ImageFE> | null = null;
let textPipePromise: Promise<TextFE> | null = null;

const MODEL_ID = "Xenova/clip-vit-base-patch32";

async function getImagePipe(): Promise<ImageFE> {
  if (!imagePipePromise) {
    imagePipePromise = (pipeline as any)("image-feature-extraction", MODEL_ID, {
      device: "webgpu",
    }).catch(() =>
      // Fallback to wasm if webgpu unavailable
      (pipeline as any)("image-feature-extraction", MODEL_ID)
    );
  }
  return imagePipePromise as Promise<ImageFE>;
}

async function getTextPipe(): Promise<TextFE> {
  if (!textPipePromise) {
    textPipePromise = (pipeline as any)("feature-extraction", MODEL_ID, {
      device: "webgpu",
    }).catch(() => (pipeline as any)("feature-extraction", MODEL_ID));
  }
  return textPipePromise as Promise<TextFE>;
}

function cosineSim(a: Float32Array, b: Float32Array): number {
  let dot = 0,
    na = 0,
    nb = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export interface ClipVerdict {
  matches: boolean;
  confidence: number;
  bestDish: string;
  scores: { dish: string; score: number }[];
  is_food_photo: boolean;
}

/**
 * Verify whether a cropped image matches `assignedDish` using local CLIP.
 *
 * @param imageDataUrl  data: URL of the cropped photo
 * @param assignedDish  the name the extractor tentatively assigned
 * @param candidateDishes  other dishes on the menu (for reassignment)
 * @returns verdict with cosine-similarity scores and a food/non-food check
 */
export async function clipVerifyDishPhoto(
  imageDataUrl: string,
  assignedDish: string,
  candidateDishes: string[]
): Promise<ClipVerdict | null> {
  try {
    const [imgPipe, txtPipe] = await Promise.all([getImagePipe(), getTextPipe()]);

    // 1. Image embedding
    const imgEmb = await imgPipe(imageDataUrl, { pooling: "mean", normalize: true });

    // 2. Build candidate prompts. Prepend a generic "a photo of food"
    //    sentinel so we can detect non-food crops (logos, text, decoration).
    const allDishes = [assignedDish, ...candidateDishes.filter((d) => d !== assignedDish)];
    const prompts = [
      "a photograph of plain decorative graphic, logo, or printed text",
      ...allDishes.map((d) => `a photograph of ${d}, a prepared food dish`),
    ];

    const txtEmb = await txtPipe(prompts, { pooling: "mean", normalize: true });

    // txtEmb.data is a flat Float32Array of shape [prompts.length, dim]
    const dim = txtEmb.dims[txtEmb.dims.length - 1];
    const scores: { dish: string; score: number }[] = [];
    let nonFoodScore = 0;

    for (let i = 0; i < prompts.length; i++) {
      const slice = txtEmb.data.subarray(i * dim, (i + 1) * dim);
      const score = cosineSim(imgEmb.data, slice);
      if (i === 0) {
        nonFoodScore = score;
      } else {
        scores.push({ dish: allDishes[i - 1], score });
      }
    }

    scores.sort((a, b) => b.score - a.score);
    const top = scores[0];
    const assignedScore = scores.find((s) => s.dish === assignedDish)?.score ?? 0;

    // Heuristics:
    // - is_food_photo: any dish prompt out-scores the "non-food" sentinel
    //   AND the top dish similarity is reasonably above threshold.
    const is_food_photo = top.score > nonFoodScore && top.score > 0.18;

    // Match logic: assignedDish must be the top OR within 0.02 of top
    const matches =
      is_food_photo &&
      (top.dish === assignedDish || Math.abs(top.score - assignedScore) < 0.02);

    // Convert raw cosine (typically 0.15-0.35 for CLIP) to a 0-1 confidence.
    // Map [0.18, 0.32] → [0, 1] then clamp.
    const norm = (v: number) => Math.max(0, Math.min(1, (v - 0.18) / 0.14));
    const confidence = matches ? norm(assignedScore) : norm(top.score);

    return {
      matches,
      confidence,
      bestDish: top.dish,
      scores,
      is_food_photo,
    };
  } catch (err) {
    console.warn("[CLIP] verification failed:", err);
    return null;
  }
}

/**
 * Pre-warm the CLIP models. Call once on app/page mount to hide the ~5-10s
 * first-load model download behind UX time.
 */
export function preloadClipModels() {
  // Fire and forget
  getImagePipe().catch(() => {});
  getTextPipe().catch(() => {});
}
