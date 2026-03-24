// Translation Cache Management (v2: 300 char limit)
const TRANSLATION_CACHE_KEY = 'anime_translation_cache_v2';

const buildTranslationRequestUrl = (text, sourceLang, targetLang) => (
    `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sourceLang}&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`
);

const extractTranslatedText = (data) => {
    if (data && data[0]) {
        return data[0].map((item) => item[0]).join('');
    }
    throw new Error('Translation failed: Invalid response format');
};

const sanitizeTranslationText = (text, options = {}) => {
    const {
        truncateLongText = true,
        maxChars = 300,
    } = options;

    let cleanText = String(text || '')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/\(Source:.*$/s, '')
        .replace(/\nNote:.*$/s, '')
        .trim();

    if (!truncateLongText || cleanText.length <= maxChars) {
        return cleanText;
    }

    const truncated = cleanText.substring(0, maxChars);
    const lastPeriod = Math.max(
        truncated.lastIndexOf('. '),
        truncated.lastIndexOf('.\n'),
        truncated.lastIndexOf('! '),
        truncated.lastIndexOf('? ')
    );
    if (lastPeriod > maxChars * 0.3) {
        return truncated.substring(0, lastPeriod + 1);
    }
    return `${truncated}...`;
};

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
        const cleanText = sanitizeTranslationText(text, {
            truncateLongText: true,
            maxChars: 300,
        });
        if (!cleanText) return null;

        const response = await fetch(buildTranslationRequestUrl(cleanText, sourceLang, targetLang));

        if (!response.ok) {
            throw new Error(`Translation API error: ${response.status}`);
        }

        const data = await response.json();
        return extractTranslatedText(data);
    } catch (error) {
        console.error('Translation failed:', error);
        return null;
    }
}

export async function translateTexts(texts, sourceLang = 'en', targetLang = 'ja') {
    const sourceList = Array.isArray(texts) ? texts : [];
    if (sourceList.length === 0) return [];

    const normalizedItems = sourceList.map((text, index) => ({
        index,
        text: sanitizeTranslationText(text, {
            truncateLongText: false,
            maxChars: 120,
        }),
    })).filter((entry) => entry.text.length > 0);

    if (normalizedItems.length === 0) {
        return sourceList.map(() => null);
    }

    const markedPayload = normalizedItems
        .map((entry) => `[[[${entry.index}]]] ${entry.text}`)
        .join('\n');

    try {
        const response = await fetch(buildTranslationRequestUrl(markedPayload, sourceLang, targetLang));
        if (!response.ok) {
            throw new Error(`Translation API error: ${response.status}`);
        }

        const data = await response.json();
        const translatedText = extractTranslatedText(data);
        const translatedMap = new Map();
        const segmentPattern = /\[\[\[(\d+)\]\]\]\s*([\s\S]*?)(?=(?:\[\[\[\d+\]\]\])|$)/g;
        let match = segmentPattern.exec(translatedText);

        while (match) {
            const itemIndex = Number(match[1]);
            const value = String(match[2] || '').trim();
            if (Number.isInteger(itemIndex) && value) {
                translatedMap.set(itemIndex, value);
            }
            match = segmentPattern.exec(translatedText);
        }

        return sourceList.map((_, index) => translatedMap.get(index) || null);
    } catch (error) {
        console.error('Batch translation failed:', error);
        return sourceList.map(() => null);
    }
}
