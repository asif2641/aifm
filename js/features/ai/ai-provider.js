/**
 * @file ai-provider.js
 * @description Central AI Provider abstraction with SHA-256 caching, quota enforcement, and audit recording.
 */

import { extractBillWithGemini, testGeminiConnection } from './providers/gemini.js';
import { get, put, count, getAll } from '../../core/db.js';
import { normalizeDraftTransaction } from '../scan/normalizer.js';
import { mergeMultiPageExtractions } from '../scan/multi-page-merge.js';

export const AI_PROVIDERS = {
  GEMINI: 'gemini'
};

/**
 * Loads AI settings from database.
 * @returns {Promise<Object>}
 */
export async function getAISettings() {
  const setting = await get('settings', 'ai');
  return setting?.value || {
    provider: 'gemini',
    apiKey: '',
    model: 'gemini-1.5-flash',
    monthlyLimitRequests: 100,
    monthlyLimitSpendUsd: 5.00
  };
}

/**
 * Saves AI settings to database.
 * @param {Object} val 
 */
export async function saveAISettings(val) {
  return put('settings', {
    key: 'ai',
    value: val
  });
}

/**
 * Computes a combined SHA-256 cache key for multiple pages.
 * @param {Array<Object>} pages Array of { sha256: string }
 * @returns {string}
 */
export function getExtractionCacheKey(pages) {
  return pages.map(p => p.sha256).sort().join('_');
}

/**
 * Checks if monthly AI usage exceeds limits.
 * @returns {Promise<{ allowed: boolean, currentCount: number, limit: number }>}
 */
export async function checkMonthlyQuota() {
  const settings = await getAISettings();
  const limit = settings.monthlyLimitRequests || 100;

  // Count usage in the current calendar month
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const allUsage = await getAll('apiUsage');
  const thisMonthCount = allUsage.filter(u => u.createdAt >= startOfMonth).length;

  return {
    allowed: thisMonthCount < limit,
    currentCount: thisMonthCount,
    limit
  };
}

/**
 * Dispatches bill extraction to the active provider with caching and quota enforcement.
 * @param {Object} params { pages: Array<{ base64: string, sha256: string, pageIndex: number, dHash: string }>, currency?: string }
 * @returns {Promise<{ draft: Object, fromCache: boolean, usage?: Object, notes: Array<string> }>}
 */
export async function extractBill({ pages = [], currency = 'PKR' }) {
  if (pages.length === 0) {
    throw new Error('No pages provided for extraction.');
  }

  const settings = await getAISettings();
  const cacheKey = getExtractionCacheKey(pages);

  // 1. Check IndexedDB Cache
  const cached = await get('apiUsage', 'cache_' + cacheKey);
  if (cached && cached.extractedData) {
    const { mergedDraft, deduplicatedCount, notes } = mergeMultiPageExtractions(
      cached.extractedData.pageResults || [cached.extractedData],
      pages,
      currency
    );
    notes.unshift('Loaded instantly from local SHA-256 cache (0 API quota used).');
    return {
      draft: mergedDraft,
      fromCache: true,
      notes
    };
  }

  // 2. Check Monthly Quota
  const quota = await checkMonthlyQuota();
  if (!quota.allowed) {
    throw new Error(`Monthly AI extraction limit reached (${quota.currentCount}/${quota.limit} requests). You can increase the limit in Settings > AI or enter the bill manually.`);
  }

  // 3. Check for API key
  if (!settings.apiKey || settings.apiKey.trim() === '') {
    throw new Error('NO_API_KEY');
  }

  // 4. Chunk requests if > 4 pages (Gemini handles 1-4 pages best per prompt)
  const chunkSize = 4;
  const pageResults = [];
  let totalPromptTokens = 0;
  let totalCandidatesTokens = 0;

  for (let i = 0; i < pages.length; i += chunkSize) {
    const chunk = pages.slice(i, i + chunkSize);
    const result = await extractBillWithGemini({
      images: chunk.map(c => ({ base64: c.base64, pageIndex: c.pageIndex })),
      apiKey: settings.apiKey,
      model: settings.model || 'gemini-1.5-flash'
    });

    pageResults.push(result.rawJson);
    totalPromptTokens += result.usage?.promptTokens || 0;
    totalCandidatesTokens += result.usage?.candidatesTokens || 0;
  }

  // 5. Merge Multi-Page Results
  const { mergedDraft, deduplicatedCount, notes } = mergeMultiPageExtractions(pageResults, pages, currency);

  // 6. Record Cache and API Usage in IndexedDB
  await put('apiUsage', {
    id: 'cache_' + cacheKey,
    cacheKey,
    provider: settings.provider,
    model: settings.model,
    pageCount: pages.length,
    promptTokens: totalPromptTokens,
    candidatesTokens: totalCandidatesTokens,
    extractedData: { pageResults },
    createdAt: new Date().toISOString()
  });

  return {
    draft: mergedDraft,
    fromCache: false,
    usage: { promptTokens: totalPromptTokens, candidatesTokens: totalCandidatesTokens },
    notes
  };
}

export { testGeminiConnection };
