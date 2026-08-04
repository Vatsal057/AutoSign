export async function processSignature(imageSrc, colorHex) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;

      // Convert hex to rgb
      const r = parseInt(colorHex.slice(1, 3), 16);
      const g = parseInt(colorHex.slice(3, 5), 16);
      const b = parseInt(colorHex.slice(5, 7), 16);

      let minX = canvas.width, minY = canvas.height, maxX = 0, maxY = 0;

      for (let i = 0; i < data.length; i += 4) {
        const pr = data[i];
        const pg = data[i + 1];
        const pb = data[i + 2];
        
        // Luminance
        const lum = 0.299 * pr + 0.587 * pg + 0.114 * pb;
        
        // Anti-aliasing smooth transition
        const blackPoint = 100;
        const whitePoint = 210;
        let opacity = 0;
        
        if (lum <= blackPoint) {
          opacity = 255;
        } else if (lum >= whitePoint) {
          opacity = 0;
        } else {
          opacity = Math.round(255 * (1 - (lum - blackPoint) / (whitePoint - blackPoint)));
        }

        if (opacity > 10) {
          data[i] = r;
          data[i+1] = g;
          data[i+2] = b;
          data[i+3] = opacity;

          const x = (i / 4) % canvas.width;
          const y = Math.floor((i / 4) / canvas.width);
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        } else {
          data[i+3] = 0;
        }
      }
      ctx.putImageData(imageData, 0, 0);

      // Add padding
      const pad = 20;
      minX = Math.max(0, minX - pad);
      minY = Math.max(0, minY - pad);
      maxX = Math.min(canvas.width, maxX + pad);
      maxY = Math.min(canvas.height, maxY + pad);

      const cropWidth = maxX - minX;
      const cropHeight = maxY - minY;

      if (cropWidth > 0 && cropHeight > 0) {
        const cropCanvas = document.createElement("canvas");
        cropCanvas.width = cropWidth;
        cropCanvas.height = cropHeight;
        const cropCtx = cropCanvas.getContext("2d");
        cropCtx.putImageData(ctx.getImageData(minX, minY, cropWidth, cropHeight), 0, 0);
        resolve(cropCanvas.toDataURL("image/png"));
      } else {
        // Fallback if bounding box fails
        resolve(canvas.toDataURL("image/png"));
      }
    };
    img.onerror = reject;
    img.src = imageSrc;
  });
}
