/**
 * skeleton.js
 * Zhang-Suen morphological thinning algorithm.
 * Iteratively peels border layers off ink blobs until only a
 * 1-pixel-wide centerline skeleton remains — the same approach
 * used internally by Inkscape and Adobe Illustrator's Image Trace.
 */

/**
 * Count 0→1 transitions in the ordered circular neighborhood sequence.
 * @param {number[]} seq - 8 neighbors + repeated first (length 9)
 */
function countTransitions(seq) {
  let A = 0;
  for (let i = 0; i < 8; i++) {
    if (seq[i] === 0 && seq[i + 1] === 1) A++;
  }
  return A;
}

/**
 * Run Zhang-Suen thinning on a binary mask.
 * @param {Uint8Array} mask  - 1=ink, 0=paper
 * @param {number} width
 * @param {number} height
 * @returns {Uint8Array} - thinned skeleton (same shape, 1=skeleton pixel)
 */
export function thinSkeleton(mask, width, height) {
  // Work on a copy so we don't mutate the original mask
  const skel = new Uint8Array(mask);

  // Safe neighbor accessor
  const p = (x, y) =>
    x < 0 || x >= width || y < 0 || y >= height ? 0 : skel[y * width + x];

  const MAX_ITERATIONS = 500;
  let changed = true;
  let iter = 0;

  while (changed && iter < MAX_ITERATIONS) {
    changed = false;
    iter++;

    // ── Sub-iteration 1 ──────────────────────────────────────────────
    // Remove pixels on the outer boundary (south/east/south-east borders)
    const remove1 = [];

    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        if (!skel[y * width + x]) continue;

        const p2 = p(x, y - 1), p3 = p(x + 1, y - 1), p4 = p(x + 1, y);
        const p5 = p(x + 1, y + 1), p6 = p(x, y + 1), p7 = p(x - 1, y + 1);
        const p8 = p(x - 1, y), p9 = p(x - 1, y - 1);

        const B = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9;
        if (B < 2 || B > 6) continue;

        const A = countTransitions([p2, p3, p4, p5, p6, p7, p8, p9, p2]);
        if (A !== 1) continue;

        // Condition 3 & 4 for sub-iteration 1
        if (p2 * p4 * p6 !== 0) continue;
        if (p4 * p6 * p8 !== 0) continue;

        remove1.push(y * width + x);
      }
    }

    if (remove1.length > 0) {
      for (const i of remove1) skel[i] = 0;
      changed = true;
    }

    // ── Sub-iteration 2 ──────────────────────────────────────────────
    // Remove pixels on the opposite boundary (north/west/north-west borders)
    const remove2 = [];

    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        if (!skel[y * width + x]) continue;

        const p2 = p(x, y - 1), p3 = p(x + 1, y - 1), p4 = p(x + 1, y);
        const p5 = p(x + 1, y + 1), p6 = p(x, y + 1), p7 = p(x - 1, y + 1);
        const p8 = p(x - 1, y), p9 = p(x - 1, y - 1);

        const B = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9;
        if (B < 2 || B > 6) continue;

        const A = countTransitions([p2, p3, p4, p5, p6, p7, p8, p9, p2]);
        if (A !== 1) continue;

        // Condition 3 & 4 for sub-iteration 2
        if (p2 * p4 * p8 !== 0) continue;
        if (p2 * p6 * p8 !== 0) continue;

        remove2.push(y * width + x);
      }
    }

    if (remove2.length > 0) {
      for (const i of remove2) skel[i] = 0;
      changed = true;
    }
  }

  return skel;
}
