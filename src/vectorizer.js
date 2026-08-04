import ImageTracer from 'imagetracerjs';

export function vectorizeSignature(dataUrl, smoothingLevel) {
  return new Promise((resolve) => {
    // We need to convert the image to strict Black & White with no alpha channel.
    // imagetracerjs works best when tracing solid colors rather than alpha gradients.
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      
      // Fill white background
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imgData.data;
      
      // Strict binary threshold
      for (let i = 0; i < data.length; i += 4) {
        // Luminance
        const lum = 0.299 * data[i] + 0.587 * data[i+1] + 0.114 * data[i+2];
        const val = lum < 200 ? 0 : 255; // 0 = black ink, 255 = white paper
        data[i] = val;
        data[i+1] = val;
        data[i+2] = val;
        data[i+3] = 255; // fully opaque
      }
      ctx.putImageData(imgData, 0, 0);
      const bwDataUrl = canvas.toDataURL('image/png');
      
      const threshold = smoothingLevel === 0 ? 0.1 : Math.pow(10, smoothingLevel - 1);
      
      const options = {
        ltres: threshold,
        qtres: threshold,
        pathomit: 20,
        colorquantcycles: 1, 
        layering: 0,
        scale: 1,
        // We trace specifically for black (ink) and white (paper)
        pal: [{r: 255, g: 255, b: 255, a: 255}, {r: 0, g: 0, b: 0, a: 255}]
      };
      
      ImageTracer.imageToSVG(bwDataUrl, function(svgstr) {
        const paths = [];
        // Extract the black paths
        const regex = /<path[^>]*d="([^"]*)"[^>]*fill="rgb\(0,0,0\)"/g;
        let match;
        while ((match = regex.exec(svgstr)) !== null) {
          paths.push(match[1]);
        }
        
        if (paths.length === 0) {
           const backupRegex = /<path[^>]*d="([^"]*)"/g;
           while ((match = backupRegex.exec(svgstr)) !== null) {
             // Avoid the bounding box path which usually starts at 0,0 and spans the whole image
             if (!match[1].startsWith('M 0 0 L ' + canvas.width)) {
               paths.push(match[1]);
             }
           }
        }
        resolve(paths);
      }, options);
    };
    img.src = dataUrl;
  });
}
