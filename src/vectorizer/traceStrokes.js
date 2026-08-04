/**
 * traceStrokes.js
 * Converts a 1px skeleton mask into ordered polylines (stroke chains).
 *
 * Strategy:
 *   1. Find connected components via BFS.
 *   2. Within each component find an "endpoint" pixel (0 or 1 neighbors)
 *      as the start of the chain.
 *   3. Walk greedily, at each step preferring the neighbor that best
 *      continues the current direction (minimising angle change).
 *   4. At branch points the current walk follows one arm; any remaining
 *      unvisited pixels become new sub-chains in a second pass.
 */

/** Return the 8-connected skeleton neighbors of (x,y) */
function getNeighbors(skeleton, width, height, x, y) {
  const ns = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && nx < width && ny >= 0 && ny < height && skeleton[ny * width + nx]) {
        ns.push({ x: nx, y: ny });
      }
    }
  }
  return ns;
}

/** Count skeleton neighbors at (x,y) */
function neighborCount(skeleton, width, height, x, y) {
  let count = 0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && nx < width && ny >= 0 && ny < height && skeleton[ny * width + nx]) {
        count++;
      }
    }
  }
  return count;
}

/**
 * Walk a chain greedily from startPt, avoiding visited pixels.
 * Prefers the neighbor that best continues the current direction.
 * @param {{ x:number, y:number }} startPt
 * @param {Set<string>} globalVisited - marked across all chains
 * @param {Uint8Array} skeleton
 * @param {number} width
 * @param {number} height
 * @returns {{ x:number, y:number }[]}
 */
function walkChain(startPt, globalVisited, skeleton, width, height) {
  const chain = [startPt];
  globalVisited.add(`${startPt.x},${startPt.y}`);

  // Direction vector of the last step (initialised to zero)
  let prevDx = 0, prevDy = 0;

  let current = startPt;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const candidates = getNeighbors(skeleton, width, height, current.x, current.y)
      .filter(n => !globalVisited.has(`${n.x},${n.y}`));

    if (candidates.length === 0) break;

    // Score each candidate: prefer the one best aligned with current direction
    let best = candidates[0];
    if (candidates.length > 1 && (prevDx || prevDy)) {
      let bestScore = -Infinity;
      for (const c of candidates) {
        const dx = c.x - current.x;
        const dy = c.y - current.y;
        // Dot product with previous direction (higher = more aligned)
        const score = dx * prevDx + dy * prevDy;
        if (score > bestScore) { bestScore = score; best = c; }
      }
    }

    prevDx = best.x - current.x;
    prevDy = best.y - current.y;
    globalVisited.add(`${best.x},${best.y}`);
    chain.push(best);
    current = best;
  }

  return chain;
}

/**
 * Subsample a chain to at most maxPoints evenly spaced points.
 * Keeps the first and last points.
 */
function subsample(chain, maxPoints) {
  if (chain.length <= maxPoints) return chain;
  const result = [chain[0]];
  const step = (chain.length - 1) / (maxPoints - 1);
  for (let i = 1; i < maxPoints - 1; i++) {
    result.push(chain[Math.round(i * step)]);
  }
  result.push(chain[chain.length - 1]);
  return result;
}

/**
 * Extract all stroke chains from a thinned skeleton.
 * @param {Uint8Array} skeleton
 * @param {number} width
 * @param {number} height
 * @param {number} minChainLength - discard chains shorter than this
 * @param {number} maxPointsPerChain - subsample long chains
 * @returns {{ x:number, y:number }[][]}
 */
export function traceStrokes(skeleton, width, height, minChainLength = 8, maxPointsPerChain = 400) {
  const chains = [];
  const globalVisited = new Set();

  // ── Pass 1: start from endpoints (tip pixels with ≤1 neighbor) ──
  const endpoints = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!skeleton[y * width + x]) continue;
      const nc = neighborCount(skeleton, width, height, x, y);
      if (nc <= 1) endpoints.push({ x, y });
    }
  }

  for (const ep of endpoints) {
    if (globalVisited.has(`${ep.x},${ep.y}`)) continue;
    const chain = walkChain(ep, globalVisited, skeleton, width, height);
    if (chain.length >= minChainLength) {
      chains.push(subsample(chain, maxPointsPerChain));
    }
  }

  // ── Pass 2: pick up any remaining unvisited skeleton pixels ────────
  // (branch-interior pixels that weren't reached from any endpoint)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!skeleton[y * width + x] || globalVisited.has(`${x},${y}`)) continue;
      const chain = walkChain({ x, y }, globalVisited, skeleton, width, height);
      if (chain.length >= minChainLength) {
        chains.push(subsample(chain, maxPointsPerChain));
      }
    }
  }

  return chains;
}
