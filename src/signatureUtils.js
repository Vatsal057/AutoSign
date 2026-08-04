import { getStroke } from 'perfect-freehand';

export function getSvgPathFromStroke(stroke) {
  if (!stroke.length) return '';
  const d = stroke.reduce(
    (acc, [x0, y0], i, arr) => {
      const [x1, y1] = arr[(i + 1) % arr.length];
      acc.push(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2);
      return acc;
    },
    ['M', ...stroke[0], 'Q']
  );
  d.push('Z');
  return d.join(' ');
}

export function strokesToPngUrl(strokes, thickness, smoothing, taper, color) {
  return new Promise((resolve) => {
    if (!strokes || strokes.length === 0) return resolve(null);
    
    // compute bounding box
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    strokes.forEach(stroke => {
      stroke.forEach(pt => {
        if (pt[0] < minX) minX = pt[0];
        if (pt[0] > maxX) maxX = pt[0];
        if (pt[1] < minY) minY = pt[1];
        if (pt[1] > maxY) maxY = pt[1];
      });
    });
    
    if (minX === Infinity) return resolve(null);
    
    const pad = thickness * 2;
    const width = maxX - minX + pad * 2;
    const height = maxY - minY + pad * 2;
    
    const svgPaths = strokes.map(stroke => {
      const adjustedStroke = stroke.map(pt => [pt[0] - minX + pad, pt[1] - minY + pad, pt[2]]);
      const outline = getStroke(adjustedStroke, { 
        size: thickness, 
        thinning: taper, 
        smoothing,
        streamline: 0.5 
      });
      return `<path d="${getSvgPathFromStroke(outline)}" fill="${color}" filter="url(#ink-texture)" />`;
    }).join('');
    
    const svgString = `
      <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
        <filter id="ink-texture">
          <feTurbulence type="fractalNoise" baseFrequency="0.05" result="noise" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="2" xChannelSelector="R" yChannelSelector="G" />
        </filter>
        ${svgPaths}
      </svg>
    `;
    
    const blob = new Blob([svgString], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    
    // Convert SVG to PNG via Canvas for pdf-lib compatibility
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = width * 2;
      canvas.height = height * 2;
      const ctx = canvas.getContext('2d');
      ctx.scale(2, 2);
      ctx.drawImage(img, 0, 0);
      resolve(canvas.toDataURL('image/png'));
    };
    img.src = url;
  });
}

export function vectorizePathsToPngUrl(paths, thickness, color) {
  return new Promise((resolve) => {
    if (!paths || paths.length === 0) return resolve(null);
    
    // We don't have bounding box from raw paths easily without a DOM node.
    // However, the original SVG had width/height matching the image. 
    // We can just render the paths into a large enough SVG. Wait!
    // imagetracerjs preserves the original image dimensions in the coordinates.
    // It's best if we just use a DOM parser or calculate BBox via an offscreen SVG.
    
    const svgContainer = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    paths.forEach(d => {
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", d);
      svgContainer.appendChild(path);
    });
    document.body.appendChild(svgContainer);
    const bbox = svgContainer.getBBox();
    document.body.removeChild(svgContainer);
    
    if (bbox.width === 0 || bbox.height === 0) return resolve(null);
    
    const pad = thickness * 2 + 10;
    const width = bbox.width + pad * 2;
    const height = bbox.height + pad * 2;
    
    // Offset paths to normalize the bounding box to (0,0)
    // We can just use an SVG viewBox!
    const viewBox = `${bbox.x - pad} ${bbox.y - pad} ${width} ${height}`;
    
    const svgPaths = paths.map(d => {
      return `<path d="${d}" fill="${color}" stroke="${color}" stroke-width="${thickness}" stroke-linejoin="round" stroke-linecap="round" filter="url(#ink-texture)" />`;
    }).join('');
    
    const svgString = `
      <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${viewBox}">
        <filter id="ink-texture">
          <feTurbulence type="fractalNoise" baseFrequency="0.05" result="noise" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="2" xChannelSelector="R" yChannelSelector="G" />
        </filter>
        ${svgPaths}
      </svg>
    `;
    
    const blob = new Blob([svgString], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = width * 2;
      canvas.height = height * 2;
      const ctx = canvas.getContext('2d');
      ctx.scale(2, 2);
      ctx.drawImage(img, 0, 0);
      resolve(canvas.toDataURL('image/png'));
    };
    img.src = url;
  });
}
