// Translation Cache Management (v2: 300 char limit)
const TRANSLATION_CACHE_KEY = 'anime_translation_cache_v2';

export function getCachedTranslation(animeId) {
    try {
        const cache = JSON.parse(localStorage.getItem(TRANSLATION_CACHE_KEY) || '{}');
        return cache[animeId];
    } catch (e) {
        console.error('Failed to read translation cache:', e);
        return null;
    }
}

export function setCachedTranslation(animeId, translation) {
    try {
        const cache = JSON.parse(localStorage.getItem(TRANSLATION_CACHE_KEY) || '{}');
        cache[animeId] = translation;
        localStorage.setItem(TRANSLATION_CACHE_KEY, JSON.stringify(cache));
    } catch (e) {
        console.error('Failed to save translation cache:', e);
    }
}

// Google Translate (unofficial) API Function
export async function translateText(text, sourceLang = 'en', targetLang = 'ja') {
    try {
        // Clean HTML tags from text before translation
        let cleanText = text.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '');

        // Remove common appendixes that aren't part of the synopsis
        // e.g. "(Source: ...)", "Note:", "Includes ..."
        cleanText = cleanText.replace(/\(Source:.*$/s, '').trim();
        cleanText = cleanText.replace(/\nNote:.*$/s, '').trim();

        // Truncate at a natural sentence boundary if too long (max ~500 chars)
        const MAX_CHARS = 300;
        if (cleanText.length > MAX_CHARS) {
            // Find the last sentence-ending punctuation before the limit
            const truncated = cleanText.substring(0, MAX_CHARS);
            const lastPeriod = Math.max(
                truncated.lastIndexOf('. '),
                truncated.lastIndexOf('.\n'),
                truncated.lastIndexOf('! '),
                truncated.lastIndexOf('? ')
            );
            if (lastPeriod > MAX_CHARS * 0.3) {
                cleanText = truncated.substring(0, lastPeriod + 1);
            } else {
                cleanText = truncated + '...';
            }
        }

        // Google Translate unofficial API endpoint
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sourceLang}&tl=${targetLang}&dt=t&q=${encodeURIComponent(cleanText)}`;

        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`Translation API error: ${response.status}`);
        }

        const data = await response.json();

        // Google returns nested arrays: [[["translated","original",...],...]...]
        if (data && data[0]) {
            const translated = data[0].map(item => item[0]).join('');
            return translated;
        }
        throw new Error('Translation failed: Invalid response format');
    } catch (error) {
        console.error('Translation failed:', error);
        return null;
    }
}
