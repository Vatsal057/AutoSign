import ImageTracer from 'imagetracerjs';

export function vectorizeSignature(dataUrl, smoothingLevel) {
  return new Promise((resolve) => {
    // imagetracerjs options
    // smoothingLevel from UI (0 to 2, default 1). 
    // ltres and qtres are linear/quadratic thresholds. Higher = smoother/simpler curves.
    const threshold = smoothingLevel === 0 ? 0.1 : Math.pow(10, smoothingLevel - 1);
    
    const options = {
      ltres: threshold,
      qtres: threshold,
      pathomit: 20, // Ignore tiny noise specks
      colorquantcycles: 1, 
      layering: 0,
      scale: 1,
      // We force a strict 2-color palette (black and white) so it traces cleanly
      pal: [{r: 255, g: 255, b: 255, a: 0}, {r: 0, g: 0, b: 0, a: 255}]
    };
    
    ImageTracer.imageToSVG(dataUrl, function(svgstr) {
      // The SVG string contains paths. We can extract the `d` attributes using regex
      // or just return the whole string and parse it in React.
      // A quick regex to grab all path 'd' attributes:
      const paths = [];
      const regex = /<path[^>]*d="([^"]*)"[^>]*fill="rgb\(0,0,0\)"/g;
      let match;
      while ((match = regex.exec(svgstr)) !== null) {
        paths.push(match[1]);
      }
      
      // Fallback if the palette mapping slightly differed
      if (paths.length === 0) {
         const backupRegex = /<path[^>]*d="([^"]*)"/g;
         while ((match = backupRegex.exec(svgstr)) !== null) {
           paths.push(match[1]);
         }
      }
      resolve(paths);
    }, options);
  });
}
