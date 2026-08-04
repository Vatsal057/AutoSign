/**
 * buildSvg.js
 * Converts vectorized stroke chains into a parametric SVG.
 *
 * Rendering modes:
 *   Taper ON  → each chain becomes a FILLED polygon built from pairs of
 *               points offset perpendicular to the stroke tangent.  Width
 *               follows a sin-bell pressure profile: zero at both tips,
 *               maximum at the midpoint — exactly like a dip pen.
 *
 *   Taper OFF → chains are rendered as stroked <path> elements so the
 *               stroke-linecap setting is respected directly.
 *
 * Smoothing  → Moving-average passes applied before curve fitting.
 * Curves     → Catmull-Rom → cubic Bézier conversion (fast, looks great
 *               for organic handwriting data).
 * Texture    → SVG feTurbulence + feDisplacementMap filter.
 */

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

/** Smooth a polyline with N passes of a 3-point moving average. */
function smoothChain(chain, passes) {
  let pts = chain;
  for (let p = 0; p < passes; p++) {
    const s = [pts[0]];
    for (let i = 1; i < pts.length - 1; i++) {
      s.push({
        x: (pts[i - 1].x + pts[i].x + pts[i + 1].x) / 3,
        y: (pts[i - 1].y + pts[i].y + pts[i + 1].y) / 3,
      });
    }
    s.push(pts[pts.length - 1]);
    pts = s;
  }
  return pts;
}

/**
 * Convert a polyline to an SVG cubic Bézier path string.
 * Uses the Catmull-Rom → cubic Bézier formula:
 *   cp1 = P1 + (P2 - P0) / tension
 *   cp2 = P2 - (P3 - P1) / tension
 * tension=6 gives a natural, slightly loose curve well-suited to handwriting.
 *
 * @param {{ x:number, y:number }[]} chain
 * @param {number} tension - higher = looser curve
 */
function chainToPath(chain, tension = 6) {
  if (chain.length < 2) return '';

  let d = `M ${chain[0].x.toFixed(1)} ${chain[0].y.toFixed(1)}`;

  for (let i = 0; i < chain.length - 1; i++) {
    const p0 = chain[Math.max(0, i - 1)];
    const p1 = chain[i];
    const p2 = chain[i + 1];
    const p3 = chain[Math.min(chain.length - 1, i + 2)];

    const cp1x = p1.x + (p2.x - p0.x) / tension;
    const cp1y = p1.y + (p2.y - p0.y) / tension;
    const cp2x = p2.x - (p3.x - p1.x) / tension;
    const cp2y = p2.y - (p3.y - p1.y) / tension;

    d += ` C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)}, ${cp2x.toFixed(2)} ${cp2y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
  }

  return d;
}

/**
 * Build a pressure-tapered FILLED polygon from a chain.
 *
 * For each point we compute:
 *   - A unit tangent from the previous point to the next.
 *   - A unit normal (perpendicular to tangent).
 *   - A "pressure" width: lerp between uniform and sin-bell based on taperAmount.
 *
 * We then offset the point ±halfWidth in the normal direction to get a left
 * and right border, then close the polygon.
 *
 * @param {{ x:number, y:number }[]} chain
 * @param {number} thickness  - maximum half-width in pixels
 * @param {number} taperAmount  - 0 = uniform, 1 = fully tapered ends
 * @param {number} tension  - Catmull-Rom tension for the border curves
 */
function buildTaperedPolygon(chain, thickness, taperAmount, tension = 6) {
  if (chain.length < 2) return '';

  const n = chain.length;
  const left = [];
  const right = [];

  for (let i = 0; i < n; i++) {
    const t = i / (n - 1); // normalised position along stroke [0..1]

    // Sin-bell pressure: 0 at tips, 1 at centre
    const bell = Math.sin(Math.PI * t);
    const halfW = (thickness / 2) * (1 - taperAmount + taperAmount * bell);

    // Tangent: use central differences clamped at endpoints
    const prev = chain[Math.max(0, i - 1)];
    const next = chain[Math.min(n - 1, i + 1)];
    const tx = next.x - prev.x;
    const ty = next.y - prev.y;
    const len = Math.sqrt(tx * tx + ty * ty) || 1;

    // Normal (rotate tangent 90°)
    const nx = -ty / len;
    const ny = tx / len;

    const { x, y } = chain[i];
    left.push({ x: x + nx * halfW, y: y + ny * halfW });
    right.push({ x: x - nx * halfW, y: y - ny * halfW });
  }

  // Combine into closed polygon path using Catmull-Rom curves for smooth borders
  const leftPath = chainToPath(left, tension);
  // Reverse right border to close the shape
  const rightReversed = right.slice().reverse();
  const rightPath = chainToPath(rightReversed, tension);

  // Connect: M (start left) [left curve] L (start right reversed) [right curve] Z
  // We strip the initial 'M ...' from rightPath and use 'L' to transition
  const rightBody = rightPath.replace(/^M [\d.\-]+ [\d.\-]+/, `L ${rightReversed[0].x.toFixed(2)} ${rightReversed[0].y.toFixed(2)}`);

  return `${leftPath} ${rightBody} Z`;
}

// ──────────────────────────────────────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} SigStyle
 * @property {string}  color         - CSS color string, e.g. '#000f55'
 * @property {number}  thickness     - Base stroke width in pixels (0.5–12)
 * @property {number}  smoothness    - Moving-average passes (0–12)
 * @property {number}  taperAmount   - 0=uniform, 1=fully tapered
 * @property {string}  linecap       - 'round' | 'butt' | 'square' (non-taper mode)
 * @property {number}  texture       - 0=clean, 1=max grain
 * @property {boolean} useTaper      - toggle between filled-polygon and stroked mode
 * @property {number}  tension       - Catmull-Rom tension (3–12); higher = looser
 */

/**
 * Render stroke chains to an SVG string.
 * This is a pure function — call it on every style change without
 * re-running the expensive vectorization pipeline.
 *
 * @param {{ x:number, y:number }[][]} chains
 * @param {number} width   - original image width (sets SVG viewBox)
 * @param {number} height  - original image height
 * @param {SigStyle} style
 * @returns {string} - complete SVG string
 */
export function buildSvg(chains, width, height, style) {
  const {
    color = '#000f55',
    thickness = 4,
    smoothness = 5,
    taperAmount = 0.65,
    linecap = 'round',
    texture = 0,
    useTaper = true,
    tension = 6,
  } = style;

  // ── Texture filter ──────────────────────────────────────────────
  let defs = '';
  let filterAttr = '';

  if (texture > 0.01) {
    const baseFreq = (0.03 + texture * 0.07).toFixed(4);
    const numOctaves = Math.max(2, Math.round(1 + texture * 4));
    const dispScale = (texture * 5).toFixed(2);

    defs = `
  <defs>
    <filter id="grain" x="-20%" y="-20%" width="140%" height="140%">
      <feTurbulence type="fractalNoise" baseFrequency="${baseFreq}" numOctaves="${numOctaves}" seed="7" result="noise"/>
      <feDisplacementMap in="SourceGraphic" in2="noise" scale="${dispScale}" xChannelSelector="R" yChannelSelector="G"/>
    </filter>
  </defs>`;
    filterAttr = 'filter="url(#grain)"';
  }

  // ── Build each stroke path ──────────────────────────────────────
  const pathElements = chains.map(rawChain => {
    const chain = smoothChain(rawChain, smoothness);
    if (chain.length < 2) return '';

    if (useTaper && chain.length >= 4) {
      const d = buildTaperedPolygon(chain, thickness, taperAmount, tension);
      return `<path d="${d}" fill="${color}" stroke="none" ${filterAttr}/>`;
    } else {
      const d = chainToPath(chain, tension);
      return `<path d="${d}" fill="none" stroke="${color}" stroke-width="${thickness}" stroke-linecap="${linecap}" stroke-linejoin="round" ${filterAttr}/>`;
    }
  }).filter(Boolean).join('\n  ');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
  ${defs}
  ${pathElements}
</svg>`;
}
