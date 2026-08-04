/**
 * index.js — Vectorization pipeline orchestrator.
 *
 * Stage 1 — ML Background Removal (@imgly/background-removal)
 *   Uses a U2-Net ONNX model (~30 MB) that is automatically downloaded
 *   on first use and cached in the browser's IndexedDB.  This gives a
 *   perfectly clean ink-on-transparent RGBA image regardless of paper
 *   colour, shadows, or uneven camera lighting.
 *
 * Stage 2 — Zhang-Suen thinning (skeleton.js)
 *   The alpha channel of the ML output is used directly as the binary
 *   mask — no fragile luminance threshold needed.
 *
 * Stage 3 — Stroke tracing (traceStrokes.js)
 *   Direction-aware greedy walk extracts ordered polylines.
 *
 * The expensive stages (ML + thinning) run once per image upload.
 * SVG re-rendering on every style change is instant.
 */

import { removeBackground } from '@imgly/background-removal';
import { thinSkeleton } from './skeleton.js';
import { traceStrokes } from './traceStrokes.js';

const MAX_DIM = 800; // Processing canvas cap (pixels on longest side)

// ─── Internal: draw a Blob/URL onto a canvas and return its ImageData ─────────
async function imageDataFromBlob(blob, targetW, targetH) {
  const url = URL.createObjectURL(blob);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = targetW;
      canvas.height = targetH;
      canvas.getContext('2d').drawImage(img, 0, 0, targetW, targetH);
      URL.revokeObjectURL(url);
      resolve(canvas.getContext('2d').getImageData(0, 0, targetW, targetH));
    };
    img.onerror = reject;
    img.src = url;
  });
}

// ─── Internal: load an object URL into an HTMLImageElement ────────────────────
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/**
 * Vectorize a signature image using ML background removal + skeleton tracing.
 *
 * @param {string} imageSrc   - object URL of the signature photo
 * @param {Function} [onProgress] - optional (phase: string, pct: number) => void
 * @returns {Promise<{ chains: {x:number,y:number}[][], width:number, height:number }>}
 */
export async function vectorize(imageSrc, onProgress) {
  const report = (phase, pct) => onProgress?.(phase, pct);

  // ── Load original image to get dimensions ─────────────────────────────────
  report('Loading image…', 0);
  const origImg = await loadImage(imageSrc);
  const origW = origImg.naturalWidth;
  const origH = origImg.naturalHeight;

  // ── Stage 1: ML Background Removal ───────────────────────────────────────
  // The library downloads its ONNX model on first call and caches it.
  report('Downloading model…', 5);

  // Convert the object URL to a Blob so the library can process it
  const sourceBlob = await fetch(imageSrc).then(r => r.blob());

  const cleanBlob = await removeBackground(sourceBlob, {
    // Use the "small" quality model for speed; still significantly better
    // than any luminance threshold on real photographs.
    model: 'small',
    output: {
      format: 'image/png',
      quality: 1,
    },
    progress: (key, current, total) => {
      // key is the asset name being loaded (model weights, etc.)
      if (total > 0) {
        const pct = 5 + Math.round((current / total) * 50);
        report(`Downloading model…`, pct);
      }
    },
  });

  report('Tracing strokes…', 60);

  // ── Stage 2: Extract binary mask from ML output alpha channel ────────────
  // Downscale to MAX_DIM for the thinning algorithm
  const longestSide = Math.max(origW, origH);
  const scale = longestSide > MAX_DIM ? MAX_DIM / longestSide : 1;
  const procW = Math.round(origW * scale);
  const procH = Math.round(origH * scale);

  const imageData = await imageDataFromBlob(cleanBlob, procW, procH);
  const { data } = imageData;

  // Build binary mask from the alpha channel (ML output: ink = opaque, background = transparent)
  const mask = new Uint8Array(procW * procH);
  for (let i = 0; i < procW * procH; i++) {
    // Alpha > 30 means the model classified this pixel as foreground (ink)
    mask[i] = data[i * 4 + 3] > 30 ? 1 : 0;
  }

  // ── Stage 3: Zhang-Suen thinning ─────────────────────────────────────────
  report('Thinning skeleton…', 70);
  const skeleton = thinSkeleton(mask, procW, procH);

  // ── Stage 4: Trace stroke chains ─────────────────────────────────────────
  report('Building paths…', 85);
  const rawChains = traceStrokes(skeleton, procW, procH);

  // Scale chain coordinates back to original image space
  const upscale = 1 / scale;
  const chains = rawChains.map(chain =>
    chain.map(pt => ({ x: pt.x * upscale, y: pt.y * upscale }))
  );

  report('Done', 100);
  return { chains, width: origW, height: origH };
}
