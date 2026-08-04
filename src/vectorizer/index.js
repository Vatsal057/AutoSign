/**
 * index.js — Vectorization pipeline orchestrator.
 *
 * Expensive one-time work (threshold → thin → trace) is done here.
 * The result (chains + dimensions) is stored in component state so
 * that SVG re-rendering on every style change is instant.
 *
 * Performance notes:
 *   - Input images are downscaled to MAX_DIM on the longest axis before
 *     processing.  Chains are scaled back up before being stored.
 *   - Thinning runs in the main thread but is capped at ~800px, keeping
 *     it well under 500 ms on typical hardware.
 */

import { extractBinaryMask } from './threshold.js';
import { thinSkeleton } from './skeleton.js';
import { traceStrokes } from './traceStrokes.js';

const MAX_DIM = 800; // Maximum dimension for the processing canvas

/**
 * Vectorize a signature image.
 *
 * @param {string} imageSrc - Any URL / object URL of the signature photo
 * @param {number} [lumThreshold=140] - Pixels darker than this are "ink"
 * @returns {Promise<{ chains: {x:number,y:number}[][], width:number, height:number }>}
 *   chains   — ordered polylines in the original image's coordinate space
 *   width    — original image width  (use for SVG viewBox)
 *   height   — original image height
 */
export function vectorize(imageSrc, lumThreshold = 140) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'Anonymous';

    img.onerror = reject;

    img.onload = () => {
      const origW = img.naturalWidth;
      const origH = img.naturalHeight;

      // ── Downscale for processing ───────────────────────────────
      const longestSide = Math.max(origW, origH);
      const scale = longestSide > MAX_DIM ? MAX_DIM / longestSide : 1;
      const procW = Math.round(origW * scale);
      const procH = Math.round(origH * scale);

      const canvas = document.createElement('canvas');
      canvas.width = procW;
      canvas.height = procH;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, procW, procH);

      const imageData = ctx.getImageData(0, 0, procW, procH);

      // ── Step 1: Binary mask ────────────────────────────────────
      const mask = extractBinaryMask(imageData, lumThreshold);

      // ── Step 2: Zhang-Suen thinning ───────────────────────────
      const skeleton = thinSkeleton(mask, procW, procH);

      // ── Step 3: Trace stroke chains ───────────────────────────
      const rawChains = traceStrokes(skeleton, procW, procH);

      // ── Scale chains back to original image coordinates ───────
      const upscale = 1 / scale;
      const chains = rawChains.map(chain =>
        chain.map(pt => ({
          x: pt.x * upscale,
          y: pt.y * upscale,
        }))
      );

      resolve({ chains, width: origW, height: origH });
    };

    img.src = imageSrc;
  });
}
