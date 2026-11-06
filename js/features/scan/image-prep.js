/**
 * @file image-prep.js
 * @description Image downscaling, thumbnail generation, and auto-enhancement preview.
 * Preserves the original file while providing lightweight, high-performance derivatives for AI & UI.
 */

/**
 * Loads a Blob or File into an HTMLImageElement.
 * @param {Blob|File} blob 
 * @returns {Promise<HTMLImageElement>}
 */
export function loadImageElement(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (err) => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image file: ' + (err?.message || 'Invalid format')));
    };
    img.src = url;
  });
}

/**
 * Downscales an image so that neither width nor height exceeds maxSide.
 * @param {HTMLImageElement|HTMLCanvasElement} img 
 * @param {number} maxSide 
 * @param {number} quality JPEG quality (0.1 to 1.0)
 * @returns {Promise<{ canvas: HTMLCanvasElement, blob: Blob, dataUrl: string, width: number, height: number }>}
 */
export async function downscaleImage(img, maxSide = 2000, quality = 0.85) {
  const origWidth = img.naturalWidth || img.width;
  const origHeight = img.naturalHeight || img.height;

  let width = origWidth;
  let height = origHeight;

  if (origWidth > maxSide || origHeight > maxSide) {
    if (origWidth >= origHeight) {
      width = maxSide;
      height = Math.round((origHeight * maxSide) / origWidth);
    } else {
      height = maxSide;
      width = Math.round((origWidth * maxSide) / origHeight);
    }
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, width, height);

  const dataUrl = canvas.toDataURL('image/jpeg', quality);
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));

  return { canvas, blob, dataUrl, width, height };
}

/**
 * Generates a thumbnail for multi-page tray, vault, and perceptual hashing.
 * @param {HTMLImageElement|HTMLCanvasElement} img 
 * @param {number} maxSide (default 240px)
 * @returns {Promise<{ canvas: HTMLCanvasElement, dataUrl: string }>}
 */
export async function createThumbnail(img, maxSide = 240) {
  const origWidth = img.naturalWidth || img.width;
  const origHeight = img.naturalHeight || img.height;

  let width = origWidth;
  let height = origHeight;

  if (origWidth > maxSide || origHeight > maxSide) {
    if (origWidth >= origHeight) {
      width = maxSide;
      height = Math.round((origHeight * maxSide) / origWidth);
    } else {
      height = maxSide;
      width = Math.round((origWidth * maxSide) / origHeight);
    }
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, width, height);

  const dataUrl = canvas.toDataURL('image/jpeg', 0.75);
  return { canvas, dataUrl, width, height };
}

/**
 * Applies contrast stretching (auto-enhance) to a canvas.
 * Never overwrites the stored raw image; produces an enhanced canvas or DataURL.
 * @param {HTMLCanvasElement} srcCanvas 
 * @returns {HTMLCanvasElement} New enhanced canvas
 */
export function autoEnhanceCanvas(srcCanvas) {
  const width = srcCanvas.width;
  const height = srcCanvas.height;
  const outCanvas = document.createElement('canvas');
  outCanvas.width = width;
  outCanvas.height = height;

  const ctx = outCanvas.getContext('2d');
  ctx.drawImage(srcCanvas, 0, 0);
  const imgData = ctx.getImageData(0, 0, width, height);
  const data = imgData.data;

  // Find min and max luminance for linear contrast stretching (with 1% clipping)
  const hist = new Uint32Array(256);
  for (let i = 0; i < data.length; i += 4) {
    const lum = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
    hist[lum]++;
  }

  const totalPixels = width * height;
  const lowClipCount = totalPixels * 0.02;
  const highClipCount = totalPixels * 0.98;

  let acc = 0;
  let minLum = 0;
  let maxLum = 255;

  for (let i = 0; i < 256; i++) {
    acc += hist[i];
    if (acc >= lowClipCount && minLum === 0) minLum = i;
    if (acc >= highClipCount) { maxLum = i; break; }
  }

  if (maxLum <= minLum) {
    return outCanvas; // Cannot stretch
  }

  const factor = 255 / (maxLum - minLum);

  for (let i = 0; i < data.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      const val = data[i + c];
      const stretched = Math.min(255, Math.max(0, Math.round((val - minLum) * factor)));
      data[i + c] = stretched;
    }
  }

  ctx.putImageData(imgData, 0, 0);
  return outCanvas;
}
