/**
 * @file gemini.js
 * @description Google Gemini Vision API provider implementation.
 * Supports gemini-1.5-flash and customizable models with structured JSON schema mode,
 * exponential backoff retry on 429/5xx, timeout protection, and direct CORS diagnostics.
 */

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

export const EXTRACTION_SYSTEM_PROMPT = `You are an expert financial auditor and bill extraction engine.
Parse all receipt / invoice / bill images provided and return a single valid JSON object strictly adhering to the schema below.
Follow these rules strictly:
1. Support English, Urdu script (Nastaliq), Roman Urdu, and handwritten bills.
2. For items with Urdu names, provide nameUrdu (in original script) and nameEnglish (English translation or transliteration).
3. COPY PRINTED NUMBERS EXACTLY AS WRITTEN. NEVER calculate, fix, or round numbers yourself.
4. For unreadable or partially cut-off text/numbers, output null and assign confidence < 50.
5. Identify and flag summary or brought-forward rows with isCarriedForward: true.
6. Return only valid JSON. Do not include markdown code block formatting like \`\`\`json.`;

export const EXTRACTION_SCHEMA_INSTRUCTION = `
Output JSON format:
{
  "vendor": { "name": "...", "taxId": "...", "phone": "..." },
  "customer": { "name": "..." },
  "billNumber": "...",
  "date": "YYYY-MM-DD",
  "time": "HH:MM",
  "paymentMode": "cash" | "credit" | "bank" | "other",
  "currencyHint": "PKR" | "USD" | "INR" | "EUR" | "GBP" | "AED" | "SAR",
  "taxes": [{ "name": "...", "ratePercent": 0, "amount": 0 }],
  "discount": 0,
  "freight": 0,
  "printedGrandTotal": 0,
  "lines": [
    {
      "nameRaw": "...",
      "nameEnglish": "...",
      "nameUrdu": "...",
      "category": "...",
      "qty": 1,
      "unit": "pcs" | "kg" | "g" | "box" | "pack" | "litre",
      "unitPrice": 0,
      "lineTotal": 0,
      "taxable": true,
      "confidence": 95,
      "pageIndex": 1
    }
  ]
}`;

/**
 * Strips data URL header to leave raw base64 string.
 * @param {string} dataUrl 
 * @returns {string} pure base64
 */
function cleanBase64(dataUrl) {
  if (dataUrl.includes(',')) {
    return dataUrl.split(',')[1];
  }
  return dataUrl;
}

/**
 * Calls Gemini API with exponential backoff on 429 / 5xx.
 * @param {string} endpoint 
 * @param {Object} payload 
 * @param {number} maxRetries 
 * @returns {Promise<Response>}
 */
async function fetchWithRetry(endpoint, payload, maxRetries = 2) {
  let attempt = 0;
  let delay = 1000;

  while (attempt <= maxRetries) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 35000);

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (response.ok) return response;

      // Check for rate limit (429) or transient server error (500, 503)
      if ((response.status === 429 || response.status >= 500) && attempt < maxRetries) {
        attempt++;
        await new Promise(r => setTimeout(r, delay));
        delay *= 2;
        continue;
      }

      return response;
    } catch (err) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        throw new Error('AI request timed out after 35 seconds. Please check your connection.');
      }
      if (attempt < maxRetries) {
        attempt++;
        await new Promise(r => setTimeout(r, delay));
        delay *= 2;
        continue;
      }
      throw err;
    }
  }
}

/**
 * Extracts bill data from base64 images via Gemini.
 * @param {Object} params { images: Array<{ base64: string, pageIndex: number }>, apiKey: string, model?: string }
 * @returns {Promise<{ rawJson: Object, usage: { promptTokens: number, candidatesTokens: number } }>}
 */
export async function extractBillWithGemini({ images = [], apiKey, model = 'gemini-1.5-flash' }) {
  if (!apiKey || apiKey.trim() === '') {
    throw new Error('Gemini API key is not configured. Please set your API key in Settings > AI.');
  }
  if (!images || images.length === 0) {
    throw new Error('No images provided for AI extraction.');
  }

  const endpoint = `${GEMINI_API_BASE}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey.trim())}`;

  // Assemble parts: prompt instructions + each page's image
  const parts = [
    { text: `${EXTRACTION_SYSTEM_PROMPT}\n\n${EXTRACTION_SCHEMA_INSTRUCTION}` }
  ];

  for (const img of images) {
    const isPdf = img.mimeType === 'application/pdf' || (img.dataUrl && img.dataUrl.includes('application/pdf')) || (img.base64 && img.base64.startsWith('data:application/pdf'));
    parts.push({
      inlineData: {
        mimeType: isPdf ? 'application/pdf' : 'image/jpeg',
        data: cleanBase64(img.base64 || img.dataUrl || '')
      }
    });
  }

  const payload = {
    contents: [{ parts }],
    generationConfig: {
      temperature: 0.1,
      responseMimeType: 'application/json'
    }
  };

  let response;
  try {
    response = await fetchWithRetry(endpoint, payload, 2);
  } catch (netErr) {
    // Check if browser blocked request due to CORS
    if (netErr.message && netErr.message.toLowerCase().includes('failed to fetch')) {
      throw new Error('Network error or CORS restriction blocked direct connection to Google Gemini API. Check your internet connection or browser security settings.');
    }
    throw netErr;
  }

  if (!response.ok) {
    let errDetail = '';
    try {
      const errJson = await response.json();
      errDetail = errJson.error?.message || response.statusText;
    } catch {
      errDetail = response.statusText;
    }
    throw new Error(`Gemini API Error (${response.status}): ${errDetail}`);
  }

  const data = await response.json();
  const textOutput = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!textOutput) {
    throw new Error('Gemini returned an empty response. The document might not have been recognized.');
  }

  // Parse structured JSON output
  let parsed;
  try {
    parsed = JSON.parse(textOutput);
  } catch (parseErr) {
    // Attempt cleanup if markdown ticks survived
    const cleaned = textOutput.replace(/^```json\s*/, '').replace(/\s*```$/, '').trim();
    parsed = JSON.parse(cleaned);
  }

  const usageMetadata = data.usageMetadata || {};
  return {
    rawJson: parsed,
    usage: {
      promptTokens: usageMetadata.promptTokenCount || 0,
      candidatesTokens: usageMetadata.candidatesTokenCount || 0,
      totalTokens: usageMetadata.totalTokenCount || 0
    }
  };
}

/**
 * Tests connection to the Gemini API endpoint.
 * @param {string} apiKey 
 * @param {string} model 
 * @returns {Promise<{ success: boolean, message: string }>}
 */
export async function testGeminiConnection(apiKey, model = 'gemini-1.5-flash') {
  if (!apiKey || apiKey.trim() === '') {
    return { success: false, message: 'API Key is empty.' };
  }

  const endpoint = `${GEMINI_API_BASE}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey.trim())}`;
  const payload = {
    contents: [{ parts: [{ text: 'Respond with exactly {"status": "ok"}' }] }],
    generationConfig: { responseMimeType: 'application/json' }
  };

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (res.ok) {
      return { success: true, message: `Connected successfully to ${model}.` };
    }
    const err = await res.json().catch(() => ({}));
    return { success: false, message: `Error ${res.status}: ${err.error?.message || res.statusText}` };
  } catch (err) {
    return {
      success: false,
      message: `Connection failed: ${err.message}. If in a restricted environment, verify CORS and HTTPS.`
    };
  }
}
