/**
 * threshold.js
 * Converts raw image pixel data to a binary ink/paper mask.
 * Returns Uint8Array where 1 = ink, 0 = paper.
 */

/**
 * @param {ImageData} imageData
 * @param {number} lumThreshold - pixels darker than this are "ink" (0-255)
 * @returns {Uint8Array}
 */
export function extractBinaryMask(imageData, lumThreshold = 140) {
  const { data, width, height } = imageData;
  const mask = new Uint8Array(width * height);

  for (let i = 0; i < width * height; i++) {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    // Perceived luminance (ITU-R BT.601)
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    mask[i] = lum < lumThreshold ? 1 : 0;
  }

  return mask;
}
