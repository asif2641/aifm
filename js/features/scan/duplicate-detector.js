/**
 * @file duplicate-detector.js
 * @description Multi-layer pre-scan duplicate detector (Layer 1 SHA-256, Layer 2 dHash 9x8).
 * Runs completely locally and for free before any AI request is dispatched.
 */

import { bufferToHex } from '../../core/utils.js';

export const DUPLICATE_DEFAULTS = {
  dHashMaxDistance: 10 // Hamming distance <= 10 indicates a near-duplicate photo of the same bill
};

/**
 * Calculates SHA-256 hex digest of an ArrayBuffer or Uint8Array.
 * @param {ArrayBuffer|Uint8Array} buffer 
 * @returns {Promise<string>} 64-character lowercase hex string
 */
export async function computeSHA256(buffer) {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const digest = await crypto.subtle.digest('SHA-256', buffer);
    return bufferToHex(digest);
  }
  throw new Error('WebCrypto subtle digest is unavailable');
}

/**
 * Calculates 64-bit dHash (Difference Hash) 9x8 from an ImageData or Canvas.
 * 9 columns and 8 rows produces 8 comparisons per row = 64 bits = 16 hex characters.
 * @param {ImageData|HTMLCanvasElement|{data: Uint8ClampedArray, width: number, height: number}} source 
 * @returns {string} 16-character hex string representing 64-bit perceptual hash
 */
export function computeDHash9x8(source) {
  let imgData;
  if (typeof HTMLCanvasElement !== 'undefined' && source instanceof HTMLCanvasElement) {
    // Resize down to 9x8 directly using a temporary 9x8 canvas
    const smallCanvas = document.createElement('canvas');
    smallCanvas.width = 9;
    smallCanvas.height = 8;
    const ctx = smallCanvas.getContext('2d');
    ctx.drawImage(source, 0, 0, 9, 8);
    imgData = ctx.getImageData(0, 0, 9, 8);
  } else if (source && source.width === 9 && source.height === 8) {
    imgData = source;
  } else if (source && source.data) {
    // If given an arbitrary sized ImageData, sample a 9x8 grid
    const { width, height, data } = source;
    const sample = new Uint8ClampedArray(9 * 8 * 4);
    for (let r = 0; r < 8; r++) {
      const srcY = Math.min(height - 1, Math.floor((r / 8) * height));
      for (let c = 0; c < 9; c++) {
        const srcX = Math.min(width - 1, Math.floor((c / 9) * width));
        const srcIdx = (srcY * width + srcX) * 4;
        const dstIdx = (r * 9 + c) * 4;
        sample[dstIdx] = data[srcIdx];
        sample[dstIdx + 1] = data[srcIdx + 1];
        sample[dstIdx + 2] = data[srcIdx + 2];
        sample[dstIdx + 3] = 255;
      }
    }
    imgData = { width: 9, height: 8, data: sample };
  } else {
    throw new TypeError('Invalid source for dHash computation');
  }

  // Convert 9x8 pixels to grayscale
  const gray = new Uint8Array(9 * 8);
  for (let i = 0, j = 0; i < imgData.data.length; i += 4, j++) {
    gray[j] = Math.round(0.299 * imgData.data[i] + 0.587 * imgData.data[i + 1] + 0.114 * imgData.data[i + 2]);
  }

  // 8 rows, 8 comparisons each -> 64 bits
  let binaryString = '';
  for (let row = 0; row < 8; row++) {
    const rowOffset = row * 9;
    for (let col = 0; col < 8; col++) {
      const left = gray[rowOffset + col];
      const right = gray[rowOffset + col + 1];
      binaryString += left > right ? '1' : '0';
    }
  }

  // Convert 64-bit binary string to 16 hex chars
  let hex = '';
  for (let i = 0; i < 64; i += 4) {
    const nibble = binaryString.slice(i, i + 4);
    hex += parseInt(nibble, 2).toString(16);
  }
  return hex.padStart(16, '0');
}

/**
 * Calculates Hamming distance (number of differing bits) between two 64-bit hex strings.
 * @param {string} hashA (16-char hex)
 * @param {string} hashB (16-char hex)
 * @returns {number} Distance between 0 and 64
 */
export function hammingDistance(hashA, hashB) {
  if (!hashA || !hashB || hashA.length !== 16 || hashB.length !== 16) {
    return 64;
  }
  let dist = 0;
  for (let i = 0; i < 16; i++) {
    const valA = parseInt(hashA[i], 16);
    const valB = parseInt(hashB[i], 16);
    let xor = valA ^ valB;
    // Count set bits in 4-bit nibble
    while (xor > 0) {
      dist += xor & 1;
      xor >>= 1;
    }
  }
  return dist;
}

/**
 * Checks an incoming page against a list of existing stored documents.
 * @param {Object} incomingPage { sha256: string, dHash: string, pageIndex: number }
 * @param {Array<Object>} existingDocuments List of saved document objects from IndexedDB
 * @param {Object} options { dHashThreshold?: number }
 * @returns {Object|null} Match details or null if no duplicate detected
 */
export function findDuplicateMatch(incomingPage, existingDocuments = [], options = {}) {
  const threshold = options.dHashThreshold ?? DUPLICATE_DEFAULTS.dHashMaxDistance;
  const { sha256, dHash, pageIndex = 1 } = incomingPage;

  if (!Array.isArray(existingDocuments) || existingDocuments.length === 0) {
    return null;
  }

  // 1. Layer 1: Exact Byte Match (SHA-256)
  if (sha256) {
    for (const doc of existingDocuments) {
      if (doc.sha256 === sha256) {
        return {
          layer: 1,
          type: 'exact_file_match',
          incomingPageIndex: pageIndex,
          matchedDocId: doc.id,
          matchedTransactionId: doc.transactionId,
          billNumber: doc.billNumber || doc.metadata?.billNumber || 'Unknown',
          vendorName: doc.vendorName || doc.metadata?.vendorName || 'Unknown',
          date: doc.date || doc.createdAt,
          thumbnailUrl: doc.thumbnailUrl || doc.previewDataUrl,
          message: 'Exact duplicate file detected. This file has already been saved previously.'
        };
      }
    }
  }

  // 2. Layer 2: Perceptual Match (dHash 9x8 with Hamming Distance <= 10)
  if (dHash) {
    let bestMatch = null;
    let minDistance = 65;

    for (const doc of existingDocuments) {
      const docDHash = doc.dHash || doc.metadata?.dHash;
      if (docDHash) {
        const dist = hammingDistance(dHash, docDHash);
        if (dist <= threshold && dist < minDistance) {
          minDistance = dist;
          bestMatch = doc;
        }
      }
    }

    if (bestMatch) {
      return {
        layer: 2,
        type: 'perceptual_near_duplicate',
        incomingPageIndex: pageIndex,
        matchedDocId: bestMatch.id,
        matchedTransactionId: bestMatch.transactionId,
        billNumber: bestMatch.billNumber || bestMatch.metadata?.billNumber || 'Unknown',
        vendorName: bestMatch.vendorName || bestMatch.metadata?.vendorName || 'Unknown',
        date: bestMatch.date || bestMatch.createdAt,
        thumbnailUrl: bestMatch.thumbnailUrl || bestMatch.previewDataUrl,
        distance: minDistance,
        threshold,
        message: `Likely duplicate photo detected (${minDistance} bit difference). This appears to be the same bill photo.`
      };
    }
  }

  return null;
}
