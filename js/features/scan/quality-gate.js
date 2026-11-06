/**
 * @file quality-gate.js
 * @description Local, free pre-scan image quality gate.
 * Validates image blur (Laplacian variance), brightness/histogram clipping,
 * minimum resolution, and edge touching before any AI extraction call is made.
 */

export const QUALITY_DEFAULTS = {
  minBlurScore: 80,         // Laplacian variance threshold (below = blurry)
  minResolution: 600,       // Minimum side in pixels
  maxDarkRatio: 0.35,       // Max allowed fraction of pixels with luminance < 25 (underexposed)
  maxBrightRatio: 0.35,     // Max allowed fraction of pixels with luminance > 230 (overexposed / glare)
  edgeMarginPx: 6           // Margin to check for clipped text/edges
};

/**
 * Calculates brightness and clipping metrics from pixel data.
 * @param {ImageData|{data: Uint8ClampedArray|Array, width: number, height: number}} imgData 
 * @returns {Object} { meanBrightness, darkRatio, brightRatio, histogram }
 */
export function computeBrightnessMetrics(imgData) {
  const data = imgData.data;
  const totalPixels = imgData.width * imgData.height;
  if (totalPixels === 0) return { meanBrightness: 0, darkRatio: 0, brightRatio: 0 };

  const histogram = new Uint32Array(256);
  let luminanceSum = 0;
  let darkPixels = 0;
  let brightPixels = 0;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    // Standard perceptual luminance formula (ITU-R BT.601)
    const lum = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
    histogram[lum]++;
    luminanceSum += lum;

    if (lum < 25) darkPixels++;
    else if (lum > 230) brightPixels++;
  }

  return {
    meanBrightness: Math.round(luminanceSum / totalPixels),
    darkRatio: darkPixels / totalPixels,
    brightRatio: brightPixels / totalPixels,
    histogram
  };
}

/**
 * Calculates blur score using discrete Laplacian variance on grayscale representation.
 * Higher variance indicates sharper edges; low variance indicates blur.
 * @param {ImageData|{data: Uint8ClampedArray|Array, width: number, height: number}} imgData 
 * @returns {number} Laplacian variance score
 */
export function computeBlurScore(imgData) {
  const { width, height, data } = imgData;
  if (width < 3 || height < 3) return 0;

  // Convert to 1D grayscale buffer for fast 2D convolution
  const gray = new Uint8Array(width * height);
  for (let i = 0, j = 0; i < data.length; i += 4, j++) {
    gray[j] = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
  }

  // 3x3 Discrete Laplacian Kernel:
  // [ 0,  1,  0 ]
  // [ 1, -4,  1 ]
  // [ 0,  1,  0 ]
  let sumL = 0;
  let sumL2 = 0;
  let count = 0;

  for (let y = 1; y < height - 1; y++) {
    const rowOffset = y * width;
    const upOffset = (y - 1) * width;
    const downOffset = (y + 1) * width;

    for (let x = 1; x < width - 1; x++) {
      const center = gray[rowOffset + x];
      const lap =
        gray[upOffset + x] +
        gray[downOffset + x] +
        gray[rowOffset + (x - 1)] +
        gray[rowOffset + (x + 1)] -
        (center * 4);

      sumL += lap;
      sumL2 += lap * lap;
      count++;
    }
  }

  if (count === 0) return 0;
  const mean = sumL / count;
  const variance = (sumL2 / count) - (mean * mean);
  return Math.max(0, Math.round(variance * 10) / 10);
}

/**
 * Checks if dark content/text appears right on the outer boundary pixels.
 * @param {ImageData|{data: Uint8ClampedArray|Array, width: number, height: number}} imgData 
 * @param {number} margin 
 * @returns {boolean} true if content is dangerously touching edges
 */
export function checkEdgeTouching(imgData, margin = 6) {
  const { width, height, data } = imgData;
  if (width <= margin * 2 || height <= margin * 2) return false;

  let edgeDarkPixels = 0;
  let checkedPixels = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const isMargin = x < margin || x >= width - margin || y < margin || y >= height - margin;
      if (isMargin) {
        const idx = (y * width + x) * 4;
        const lum = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
        if (lum < 75) edgeDarkPixels++;
        checkedPixels++;
      }
    }
  }

  return checkedPixels > 0 && (edgeDarkPixels / checkedPixels) > 0.15;
}

/**
 * Runs the complete Quality Gate evaluation.
 * @param {HTMLCanvasElement|ImageData|Object} source 
 * @param {Object} options 
 * @returns {Object} Quality assessment report
 */
export function evaluateQuality(source, options = {}) {
  const cfg = { ...QUALITY_DEFAULTS, ...options };
  let imgData;
  let width = 0;
  let height = 0;

  if (typeof HTMLCanvasElement !== 'undefined' && source instanceof HTMLCanvasElement) {
    const ctx = source.getContext('2d');
    width = source.width;
    height = source.height;
    imgData = ctx.getImageData(0, 0, width, height);
  } else if (source && source.data && source.width && source.height) {
    imgData = source;
    width = source.width;
    height = source.height;
  } else {
    throw new TypeError('Invalid image source provided to evaluateQuality');
  }

  const issues = [];

  // 1. Resolution Check
  const minSide = Math.min(width, height);
  if (minSide < cfg.minResolution) {
    issues.push({
      type: 'resolution_low',
      severity: 'error',
      message: `Image resolution is too low (${width}×${height}px). Minimum recommended is ${cfg.minResolution}px.`,
      metric: minSide,
      threshold: cfg.minResolution
    });
  }

  // 2. Brightness & Clipping
  const brightness = computeBrightnessMetrics(imgData);
  if (brightness.darkRatio > cfg.maxDarkRatio) {
    issues.push({
      type: 'brightness_dark',
      severity: 'warning',
      message: 'The photo is very dark. Bill text may be difficult to read accurately.',
      metric: Math.round(brightness.darkRatio * 100),
      threshold: Math.round(cfg.maxDarkRatio * 100)
    });
  } else if (brightness.brightRatio > cfg.maxBrightRatio) {
    issues.push({
      type: 'brightness_glare',
      severity: 'warning',
      message: 'Significant light glare or overexposure detected. Important numbers might be washed out.',
      metric: Math.round(brightness.brightRatio * 100),
      threshold: Math.round(cfg.maxBrightRatio * 100)
    });
  }

  // 3. Blur Detection
  const blurScore = computeBlurScore(imgData);
  if (blurScore < cfg.minBlurScore) {
    issues.push({
      type: 'blur_high',
      severity: 'warning',
      message: 'Image appears blurry. Please hold camera steady or retake in better lighting.',
      metric: blurScore,
      threshold: cfg.minBlurScore
    });
  }

  // 4. Edge Content Touching
  const touchesEdge = checkEdgeTouching(imgData, cfg.edgeMarginPx);
  if (touchesEdge) {
    issues.push({
      type: 'edge_clipped',
      severity: 'info',
      message: 'Bill text touches outer image edges. Part of the bill may be cropped.',
      metric: true,
      threshold: false
    });
  }

  const hasErrors = issues.some(i => i.severity === 'error');
  const hasWarnings = issues.some(i => i.severity === 'warning');

  return {
    pass: !hasErrors && !hasWarnings,
    canScanAnyway: true, // Quality gate warns, never hard-blocks
    issues,
    metrics: {
      width,
      height,
      minSide,
      blurScore,
      meanBrightness: brightness.meanBrightness,
      darkRatio: brightness.darkRatio,
      brightRatio: brightness.brightRatio,
      touchesEdge
    }
  };
}
