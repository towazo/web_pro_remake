import { translateGenre } from '../constants/animeData';
import {
  DISPLAY_ALLOWED_COUNTRY_OF_ORIGIN,
  DISPLAY_ALLOWED_MEDIA_FORMATS,
  filterDisplayEligibleAnimeList,
  filterOutHentaiAnimeList,
  isDisplayEligibleAnime,
  isHentaiAnime,
} from '../utils/contentFilters';

const ANILIST_ENDPOINT = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.DEV)
  ? '/anilist/'
  : 'https://graphql.anilist.co';

const ANIME_QUERY = `
  query ($search: String, $formatIn: [MediaFormat], $countryOfOrigin: CountryCode) {
    Media (
      search: $search
      type: ANIME
      format_in: $formatIn
      countryOfOrigin: $countryOfOrigin
    ) {
      id
      title {
        native
        romaji
        english
      }
      coverImage {
        extraLarge
        large
      }
      season
      seasonYear
      status
      startDate {
        year
        month
        day
      }
      averageScore
      episodes
      genres
      format
      countryOfOrigin
      bannerImage
      description
    }
  }
`;

const ANIME_LIST_QUERY = `
  query (
    $search: String,
    $perPage: Int,
    $formatIn: [MediaFormat],
    $countryOfOrigin: CountryCode
  ) {
    Page (perPage: $perPage) {
      media (
        search: $search
        type: ANIME
        format_in: $formatIn
        countryOfOrigin: $countryOfOrigin
      ) {
        id
        title {
          native
          romaji
          english
        }
        coverImage {
          large
        }
        season
        seasonYear
        status
        startDate {
          year
          month
          day
        }
        averageScore
        episodes
        genres
        format
        countryOfOrigin
        description
      }
    }
  }
`;

const ANIME_BY_ID_QUERY = `
  query ($id: Int) {
    Media (id: $id, type: ANIME) {
      id
      title {
        native
        romaji
        english
      }
      coverImage {
        extraLarge
        large
      }
      season
      seasonYear
      status
      startDate {
        year
        month
        day
      }
      averageScore
      episodes
      genres
      format
      countryOfOrigin
      bannerImage
      description
    }
  }
`;

const ANIME_BY_YEAR_QUERY = `
  query (
    $seasonYear: Int,
    $season: MediaSeason,
    $page: Int,
    $perPage: Int,
    $genreIn: [String],
    $formatIn: [MediaFormat],
    $countryOfOrigin: CountryCode,
    $statusIn: [MediaStatus],
    $statusNot: MediaStatus
  ) {
    Page(page: $page, perPage: $perPage) {
      pageInfo {
        total
        perPage
        currentPage
        lastPage
        hasNextPage
      }
      media(
        type: ANIME
        seasonYear: $seasonYear
        season: $season
        genre_in: $genreIn
        format_in: $formatIn
        countryOfOrigin: $countryOfOrigin
        status_in: $statusIn
        status_not: $statusNot
        sort: [POPULARITY_DESC, START_DATE_DESC]
      ) {
        id
        title {
          native
          romaji
          english
        }
        coverImage {
          extraLarge
          large
        }
        bannerImage
        season
        seasonYear
        status
        averageScore
        startDate {
          year
          month
          day
        }
        episodes
        genres
        format
        countryOfOrigin
        description
      }
    }
  }
`;

const ANIME_BY_START_DATE_QUERY = `
  query (
    $startDateGreater: FuzzyDateInt,
    $startDateLesser: FuzzyDateInt,
    $page: Int,
    $perPage: Int,
    $genreIn: [String],
    $formatIn: [MediaFormat],
    $countryOfOrigin: CountryCode
  ) {
    Page(page: $page, perPage: $perPage) {
      pageInfo {
        total
        perPage
        currentPage
        lastPage
        hasNextPage
      }
      media(
        type: ANIME
        startDate_greater: $startDateGreater
        startDate_lesser: $startDateLesser
        genre_in: $genreIn
        format_in: $formatIn
        countryOfOrigin: $countryOfOrigin
        sort: [START_DATE_DESC, POPULARITY_DESC]
      ) {
        id
        title {
          native
          romaji
          english
        }
        coverImage {
          extraLarge
          large
        }
        bannerImage
        season
        seasonYear
        status
        averageScore
        startDate {
          year
          month
          day
        }
        episodes
        genres
        format
        countryOfOrigin
        description
      }
    }
  }
`;

const DEFAULT_YEAR_FORMATS = DISPLAY_ALLOWED_MEDIA_FORMATS;
const DEFAULT_COUNTRY_OF_ORIGIN = DISPLAY_ALLOWED_COUNTRY_OF_ORIGIN;
const normalizeMediaFormatValue = (value) => String(value || '').trim().toUpperCase();
const normalizeCountryValue = (value) => String(value || '').trim().toUpperCase();

const resolveAllowedFormats = (value, fallback = DEFAULT_YEAR_FORMATS) => {
  const source = Array.isArray(value) && value.length > 0 ? value : fallback;
  const normalized = source
    .map((item) => normalizeMediaFormatValue(item))
    .filter((item) => item.length > 0);
  return normalized.length > 0 ? normalized : [...DEFAULT_YEAR_FORMATS];
};

const resolveCountryPreference = (options = {}, fallback = DEFAULT_COUNTRY_OF_ORIGIN) => {
  const hasCountryOverride = (
    Object.prototype.hasOwnProperty.call(options, 'countryOfOrigin')
    && options.countryOfOrigin !== undefined
  );
  const raw = hasCountryOverride
    ? normalizeCountryValue(options.countryOfOrigin)
    : normalizeCountryValue(fallback);
  return {
    hasCountryOverride,
    country: raw || null,
  };
};

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const isAbortError = (error) => error?.name === 'AbortError';

const createAbortError = () => {
  const err = new Error('Aborted');
  err.name = 'AbortError';
  return err;
};

const fetchWithTimeout = async (url, options = {}, timeoutMs) => {
  const { signal: externalSignal, ...restOptions } = options || {};
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const onExternalAbort = () => controller.abort();

  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort();
    } else {
      externalSignal.addEventListener('abort', onExternalAbort, { once: true });
    }
  }

  try {
    return await fetch(url, { ...restOptions, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
    if (externalSignal) {
      externalSignal.removeEventListener('abort', onExternalAbort);
    }
  }
};

const sleepWithSignal = async (ms, signal) => {
  const waitMs = Math.max(0, Number(ms) || 0);
  if (waitMs === 0) return;

  if (!signal) {
    await sleep(waitMs);
    return;
  }

  if (signal.aborted) throw createAbortError();

  await new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      cleanup();
      resolve();
    }, waitMs);

    const onAbort = () => {
      clearTimeout(timeoutId);
      cleanup();
      reject(createAbortError());
    };

    const cleanup = () => {
      signal.removeEventListener('abort', onAbort);
    };

    signal.addEventListener('abort', onAbort, { once: true });
  });
};

const parseRetryAfterMs = (response) => {
  const retryAfter = response.headers?.get?.('Retry-After');
  if (!retryAfter) return null;
  const seconds = Number(retryAfter);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const dateMs = Date.parse(retryAfter);
  if (!Number.isNaN(dateMs)) {
    const delta = dateMs - Date.now();
    return delta > 0 ? delta : 0;
  }
  return null;
};

const readHeaderValue = (response, name) => {
  const value = response?.headers?.get?.(name);
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const extractRateLimitMeta = (response) => ({
  retryAfter: readHeaderValue(response, 'Retry-After'),
  retryAfterMs: parseRetryAfterMs(response),
  remaining: readHeaderValue(response, 'X-RateLimit-Remaining'),
  limit: readHeaderValue(response, 'X-RateLimit-Limit'),
  reset: readHeaderValue(response, 'X-RateLimit-Reset'),
  resetAfter: readHeaderValue(response, 'X-RateLimit-Reset-After'),
});

const isRetryableGraphQLError = (errors) => {
  if (!Array.isArray(errors) || errors.length === 0) return false;
  return errors.some((e) => {
    const status = Number(e?.status);
    if ([429, 500, 502, 503, 504].includes(status)) return true;
    const msg = String(e?.message || '').toLowerCase();
    return (
      msg.includes('too many requests') ||
      msg.includes('rate limit') ||
      msg.includes('timeout') ||
      msg.includes('temporar') ||
      msg.includes('internal server error') ||
      msg.includes('bad gateway') ||
      msg.includes('service unavailable') ||
      msg.includes('gateway timeout')
    );
  });
};

const hasAnyGraphQLData = (data) => {
  if (!data || typeof data !== 'object') return false;
  return Object.values(data).some((value) => value !== null && value !== undefined);
};
const SUPPLEMENTAL_FORMAT_SET = new Set(['OVA', 'TV_SHORT']);

const stripTitleNoise = (value = '') => {
  return String(value)
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[\s\p{P}\p{S}]/gu, '');
};

export const normalizeTitleForCompare = (value = '') => stripTitleNoise(value);

const normalizeTitleSpacing = (value = '') =>
  String(value)
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim();

const stripCommonSeasonSuffix = (value = '') =>
  String(value)
    .replace(
      /\s*(?:第\s*\d+\s*(?:期|部|章|シーズン)|season\s*\d+|s\s*\d+|part\s*\d+|cour\s*\d+|[0-9]+(?:st|nd|rd|th)\s*season|(?:2nd|3rd|4th)\s*season|final\s*season)\s*$/i,
      ''
    )
    .trim();

const stripCommonSubtitle = (value = '') =>
  String(value)
    .replace(/[「『【\[(（].*$/, '')
    .replace(/\s*(?:映画|劇場版|総集編|完結編)\s*$/i, '')
    .trim();

const buildSearchTermVariants = (title, maxTerms = 6) => {
  const baseRaw = String(title || '').trim();
  if (!baseRaw) return [];

  const pushUnique = (arr, term) => {
    const t = normalizeTitleSpacing(term);
    if (t.length < 2) return;
    const normalized = stripTitleNoise(t);
    if (!normalized) return;
    if (!arr.some((x) => stripTitleNoise(x) === normalized)) arr.push(t);
  };

  const variants = [];
  const base = normalizeTitleSpacing(baseRaw);

  pushUnique(variants, baseRaw);
  pushUnique(variants, base);

  const hasTerminalPunctuation = /[!?！？]$/u.test(base);
  if (!hasTerminalPunctuation) {
    pushUnique(variants, `${base}!?`);
    pushUnique(variants, `${base}！？`);
  } else {
    pushUnique(variants, base.replace(/[!?！？]+$/gu, '').trim());
  }

  const noSeason = stripCommonSeasonSuffix(base);
  pushUnique(variants, noSeason);
  pushUnique(variants, stripCommonSubtitle(noSeason));

  const noPunctuation = base
    .replace(/[\p{P}\p{S}]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  pushUnique(variants, noPunctuation);

  const delimiters = [
    '\uFF1A', ':', '\uFF1B', ';', '\uFF5C', '|', '\uFF0F', '/', '\u301C', '\uFF5E',
    '-', '\uFF0D', '\u2014', '\u30FB',
  ];
  for (const delimiter of delimiters) {
    const idx = base.indexOf(delimiter);
    if (idx >= 2) {
      pushUnique(variants, base.slice(0, idx));
    }
  }

  const spaceParts = noPunctuation.split(' ').filter(Boolean);
  if (spaceParts.length >= 2) {
    pushUnique(variants, spaceParts[0]);
    pushUnique(variants, `${spaceParts[0]} ${spaceParts[1]}`);
  }

  for (const particle of ['\u306E', '\u306F']) {
    const idx = base.indexOf(particle);
    if (idx >= 2) {
      pushUnique(variants, base.slice(0, idx));
    }
  }

  return variants.slice(0, Math.max(2, Number(maxTerms) || 6));
};

const toBigrams = (value = '') => {
  const s = stripTitleNoise(value);
  const set = new Set();
  if (!s) return set;
  if (s.length === 1) {
    set.add(s);
    return set;
  }
  for (let i = 0; i < s.length - 1; i++) {
    set.add(s.slice(i, i + 2));
  }
  return set;
};

const diceCoefficient = (a, b) => {
  const aSet = toBigrams(a);
  const bSet = toBigrams(b);
  if (aSet.size === 0 || bSet.size === 0) return 0;
  let intersection = 0;
  for (const token of aSet) {
    if (bSet.has(token)) intersection += 1;
  }
  return (2 * intersection) / (aSet.size + bSet.size);
};

const substringCoverage = (a, b) => {
  const x = stripTitleNoise(a);
  const y = stripTitleNoise(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  if (x.includes(y) || y.includes(x)) {
    const shorter = Math.min(x.length, y.length);
    const longer = Math.max(x.length, y.length);
    return longer > 0 ? shorter / longer : 0;
  }
  return 0;
};

const titleSimilarity = (a, b) => {
  return Math.max(diceCoefficient(a, b), substringCoverage(a, b));
};

const selectBestMediaCandidate = (originalTitle, mediaList, minScore = 0.36) => {
  if (!Array.isArray(mediaList) || mediaList.length === 0) return null;
  const ranked = mediaList
    .map((media) => {
      const titles = [
        media?.title?.native,
        media?.title?.romaji,
        media?.title?.english,
      ].filter(Boolean);
      const score = titles.reduce((best, t) => Math.max(best, titleSimilarity(originalTitle, t)), 0);
      return { media, score };
    })
    .sort((a, b) => b.score - a.score);

  const best = ranked[0];
  const second = ranked[1];
  if (!best || best.score < minScore) return null;

  // Ambiguous low-score matches are likely false positives.
  if (second && best.score < 0.45 && (best.score - second.score) < 0.02) return null;

  const bestFormat = String(best?.media?.format || '').toUpperCase();
  const isSupplementalFormat = SUPPLEMENTAL_FORMAT_SET.has(bestFormat);
  if (isSupplementalFormat) {
    const effectiveMinScore = Math.max(minScore, 0.42);
    if (best.score < effectiveMinScore) return null;

    const originalNorm = stripTitleNoise(originalTitle);
    const bestTitleList = [
      best?.media?.title?.native,
      best?.media?.title?.romaji,
      best?.media?.title?.english,
    ].filter(Boolean);
    const hasContainment = bestTitleList.some((title) => {
      const titleNorm = stripTitleNoise(title);
      if (!originalNorm || !titleNorm) return false;
      return titleNorm.includes(originalNorm) || originalNorm.includes(titleNorm);
    });
    if (!hasContainment && best.score < 0.55) return null;

    if (second && best.score < 0.5 && (best.score - second.score) < 0.03) return null;
  }

  return best.media;
};

const buildAdaptiveSearchTerms = (title, maxTerms = 4) => {
  const base = String(title || '').trim();
  if (!base || base.length < 2) return [];
  const baseNormalized = stripTitleNoise(base);
  return buildSearchTermVariants(base, Math.max(3, Number(maxTerms) || 4))
    .filter((t) => stripTitleNoise(t) !== baseNormalized)
    .slice(0, Math.max(1, Number(maxTerms) || 4));
};

const postAniListGraphQL = async (query, variables, options = {}) => {
  const {
    timeoutMs = 12000,
    maxAttempts = 5,
    baseDelayMs = 500,
    maxRetryDelayMs = 1800,
    onRetry,
    signal,
  } = options;

  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (signal?.aborted) throw createAbortError();
    try {
      const response = await fetchWithTimeout(
        ANILIST_ENDPOINT,
        {
          method: 'POST',
          cache: 'no-store',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          body: JSON.stringify({ query, variables }),
          signal,
        },
        timeoutMs
      );
      const rateLimitMeta = extractRateLimitMeta(response);
      const retryAfterMs = Number.isFinite(Number(rateLimitMeta.retryAfterMs))
        ? Number(rateLimitMeta.retryAfterMs)
        : null;

      if (response.ok) {
        const result = await response.json();
        if (result?.errors?.length) {
          const retryable = isRetryableGraphQLError(result.errors);
          const hasData = hasAnyGraphQLData(result?.data);
          if (retryable && !hasData && attempt < maxAttempts) {
            const backoff = baseDelayMs * Math.pow(2, attempt - 1);
            const jitter = Math.floor(Math.random() * 250);
            const rawWaitMs = retryAfterMs ?? (backoff + jitter);
            const waitMs = Math.min(maxRetryDelayMs, rawWaitMs);
            if (typeof onRetry === 'function') {
              try {
                onRetry({
                  kind: 'graphql',
                  status: Number(result.errors?.[0]?.status) || 200,
                  attempt,
                  maxAttempts,
                  waitMs,
                  search: variables?.search,
                  errors: result.errors,
                  retryAfterMs,
                  rateLimit: rateLimitMeta,
                });
              } catch (_) {
                // ignore callback errors
              }
            }
            if (signal?.aborted) throw createAbortError();
            await sleepWithSignal(waitMs, signal);
            continue;
          }

          return {
            ok: hasData,
            status: 200,
            data: result?.data ?? null,
            errors: result.errors,
            retryAfterMs,
            rateLimit: rateLimitMeta,
          };
        }
        return { ok: true, status: 200, data: result?.data ?? null, retryAfterMs, rateLimit: rateLimitMeta };
      }

      const status = response.status;
      const retryable = status === 404 || status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
      if (!retryable || attempt === maxAttempts) {
        return {
          ok: false,
          status,
          data: null,
          errors: null,
          retryAfterMs,
          rateLimit: rateLimitMeta,
        };
      }

      const backoff = baseDelayMs * Math.pow(2, attempt - 1);
      const jitter = Math.floor(Math.random() * 250);
      const rawWaitMs = retryAfterMs ?? (backoff + jitter);
      const waitMs = Math.min(maxRetryDelayMs, rawWaitMs);
      if (typeof onRetry === 'function') {
        try {
          onRetry({
            kind: 'http',
            status,
            attempt,
            maxAttempts,
            waitMs,
            search: variables?.search,
            retryAfterMs,
            rateLimit: rateLimitMeta,
          });
        } catch (_) {
          // ignore callback errors
        }
      }
      if (signal?.aborted) throw createAbortError();
      await sleepWithSignal(waitMs, signal);
    } catch (error) {
      if (isAbortError(error) || signal?.aborted) {
        throw error;
      }
      lastError = error;
      if (attempt === maxAttempts) break;
      const backoff = baseDelayMs * Math.pow(2, attempt - 1);
      const jitter = Math.floor(Math.random() * 250);
      const rawWaitMs = backoff + jitter;
      const waitMs = Math.min(maxRetryDelayMs, rawWaitMs);
      if (typeof onRetry === 'function') {
        try {
          onRetry({
            kind: 'error',
            status: null,
            attempt,
            maxAttempts,
            waitMs,
            search: variables?.search,
            error,
          });
        } catch (_) {
          // ignore callback errors
        }
      }
      if (signal?.aborted) throw createAbortError();
      await sleepWithSignal(waitMs, signal);
    }
  }

  throw lastError;
};

export const fetchAnimeDetails = async (title, options = {}) => {
  const {
    adaptiveFallback = false,
    adaptiveSkipPrimary = false,
    adaptiveMaxTerms = 4,
    adaptivePerPage = 10,
    adaptiveMinScore = 0.36,
    adaptiveTimeoutMs = 2200,
    adaptiveMaxAttempts = 1,
    onAdaptiveQuery,
    allowUnknownFormat = true,
    allowUnknownCountry = true,
    allowedFormats: allowedFormatsOption,
    formatIn: formatInOption,
    countryOfOrigin: countryOfOriginOption,
    ...requestOptions
  } = options || {};
  const allowedFormats = resolveAllowedFormats(allowedFormatsOption || formatInOption, DEFAULT_YEAR_FORMATS);
  const countryPreferenceInfo = resolveCountryPreference(
    { countryOfOrigin: countryOfOriginOption },
    DEFAULT_COUNTRY_OF_ORIGIN
  );
  const countryPreference = countryPreferenceInfo.country;
  // NOTE:
  // AniList can intermittently respond with 500 when optional enum variables are explicitly sent as null.
  // Omit those variables instead of sending null.
  const queryFormatIn = allowUnknownFormat ? undefined : allowedFormats;
  const queryCountryOfOrigin = allowUnknownCountry ? undefined : countryPreference;

  const fallbackRequestOptions = {
    ...requestOptions,
    allowUnknownFormat,
    allowUnknownCountry,
    allowedFormats,
    countryOfOrigin: countryPreference || '',
    timeoutMs: Math.min(3200, Math.max(1000, Number(adaptiveTimeoutMs) || 2200)),
    maxAttempts: Math.min(2, Math.max(1, Number(adaptiveMaxAttempts) || 1)),
    baseDelayMs: Math.min(300, Math.max(50, Number(requestOptions.baseDelayMs) || 200)),
    maxRetryDelayMs: Math.min(700, Math.max(100, Number(requestOptions.maxRetryDelayMs) || 500)),
  };

  let primaryError = null;

  if (!adaptiveSkipPrimary) {
    try {
      const result = await postAniListGraphQL(
        ANIME_QUERY,
        {
          search: title,
          formatIn: queryFormatIn,
          countryOfOrigin: queryCountryOfOrigin,
        },
        requestOptions
      );
      if (result.ok && result.data?.Media) {
        const media = result.data.Media;
        return isDisplayEligibleAnime(media, {
          allowUnknownFormat,
          allowUnknownCountry,
          allowedFormats,
          countryOfOrigin: countryPreference || undefined,
        })
          ? media
          : null;
      }
    } catch (error) {
      primaryError = error;
      if (isAbortError(error) && requestOptions.signal?.aborted) {
        return null;
      }
    }
  }

  if (!adaptiveFallback) {
    if (primaryError && !isAbortError(primaryError)) {
      console.error(`Error fetching ${title}:`, primaryError);
    }
    return null;
  }

  if (requestOptions.signal?.aborted) return null;

  const fallbackTerms = buildAdaptiveSearchTerms(title, adaptiveMaxTerms);
  if (fallbackTerms.length === 0) return null;
  const originalNormLength = stripTitleNoise(title).length;
  const effectiveMinScore = originalNormLength <= 4
    ? Math.min(0.3, Number(adaptiveMinScore) || 0.36)
    : (Number(adaptiveMinScore) || 0.36);

  try {
    for (const fallbackQuery of fallbackTerms) {
      if (requestOptions.signal?.aborted) return null;

      if (typeof onAdaptiveQuery === 'function') {
        try {
          onAdaptiveQuery({ originalTitle: title, query: fallbackQuery, phase: 'query' });
        } catch (_) {
          // ignore callback errors
        }
      }

      const list = await searchAnimeListInternal(fallbackQuery, adaptivePerPage, fallbackRequestOptions);
      if (!Array.isArray(list) || list.length === 0) continue;

      const selected = selectBestMediaCandidate(title, list, effectiveMinScore);
      if (!selected?.id) continue;

      const details = await fetchAnimeDetailsById(selected.id, fallbackRequestOptions);
      if (details) {
        if (typeof onAdaptiveQuery === 'function') {
          try {
            onAdaptiveQuery({
              originalTitle: title,
              query: fallbackQuery,
              phase: 'matched',
              selectedId: selected.id,
              matchedTitle: details?.title?.native || details?.title?.romaji || details?.title?.english || '',
            });
          } catch (_) {
            // ignore callback errors
          }
        }
        return details;
      }
    }
  } catch (error) {
    if (!isAbortError(error) && !primaryError) {
      console.error(`Error fetching ${title}:`, error);
    }
  }

  if (primaryError && !isAbortError(primaryError)) {
    console.error(`Error fetching ${title}:`, primaryError);
  }
  return null;
};

export const fetchAnimeDetailsById = async (id, options = {}) => {
  const {
    allowUnknownFormat = true,
    allowUnknownCountry = true,
    allowedFormats: allowedFormatsOption,
    formatIn: formatInOption,
    countryOfOrigin: countryOfOriginOption,
    ...requestOptions
  } = options || {};
  const allowedFormats = resolveAllowedFormats(allowedFormatsOption || formatInOption, DEFAULT_YEAR_FORMATS);
  const { country: countryPreference } = resolveCountryPreference(
    { countryOfOrigin: countryOfOriginOption },
    DEFAULT_COUNTRY_OF_ORIGIN
  );
  const numericId = Number(id);
  if (!Number.isFinite(numericId)) return null;

  try {
    const result = await postAniListGraphQL(ANIME_BY_ID_QUERY, { id: numericId }, requestOptions);
    if (!result.ok) return null;
    const media = result.data?.Media ?? null;
    return isDisplayEligibleAnime(media, {
      allowUnknownFormat,
      allowUnknownCountry,
      allowedFormats,
      countryOfOrigin: countryPreference || undefined,
    })
      ? media
      : null;
  } catch (error) {
    if (!isAbortError(error)) {
      console.error(`Error fetching by id ${id}:`, error);
    }
    return null;
  }
};

const searchAnimeListInternal = async (title, perPage = 8, options = {}) => {
  const { allowUnknownFormat = true, allowUnknownCountry = true } = options || {};
  const allowedFormats = resolveAllowedFormats(options?.allowedFormats || options?.formatIn, DEFAULT_YEAR_FORMATS);
  const { country: countryPreference } = resolveCountryPreference(options, DEFAULT_COUNTRY_OF_ORIGIN);
  const queryFormatIn = allowUnknownFormat ? undefined : allowedFormats;
  const queryCountryOfOrigin = allowUnknownCountry ? undefined : countryPreference;
  try {
    const result = await postAniListGraphQL(
      ANIME_LIST_QUERY,
      {
        search: title,
        perPage,
        formatIn: queryFormatIn,
        countryOfOrigin: queryCountryOfOrigin,
      },
      options
    );
    if (!result.ok) return [];
    return filterDisplayEligibleAnimeList(result.data?.Page?.media || [], {
      allowUnknownFormat,
      allowUnknownCountry,
      allowedFormats,
      countryOfOrigin: countryPreference || undefined,
    });
  } catch (error) {
    if (!isAbortError(error)) {
      console.error(`Error searching list for ${title}:`, error);
    }
    return [];
  }
};

const scoreSearchCandidate = (query, media) => {
  const titles = [
    media?.title?.native,
    media?.title?.romaji,
    media?.title?.english,
  ].filter(Boolean);
  if (titles.length === 0) return 0;

  const queryNormalized = stripTitleNoise(query);
  const queryReadable = normalizeTitleSpacing(query).toLowerCase();

  let bestScore = 0;
  for (const title of titles) {
    const titleNormalized = stripTitleNoise(title);
    const titleReadable = normalizeTitleSpacing(title).toLowerCase();
    let score = titleSimilarity(query, title);

    if (queryNormalized && titleNormalized === queryNormalized) {
      score += 1.1;
    } else if (
      queryNormalized
      && titleNormalized
      && (titleNormalized.includes(queryNormalized) || queryNormalized.includes(titleNormalized))
    ) {
      score += 0.35;
    }

    if (queryReadable && titleReadable && titleReadable.startsWith(queryReadable)) {
      score += 0.08;
    }

    if (score > bestScore) bestScore = score;
  }

  return bestScore;
};

const buildSearchCandidateKey = (media) => {
  const id = Number(media?.id);
  if (Number.isFinite(id)) return `id:${id}`;
  const fallbackTitle = media?.title?.native || media?.title?.romaji || media?.title?.english || '';
  const fallbackKey = stripTitleNoise(fallbackTitle);
  return fallbackKey ? `title:${fallbackKey}` : '';
};

const mergeSearchCandidates = (bucket, query, list) => {
  if (!(bucket instanceof Map) || !Array.isArray(list)) return;
  for (const media of list) {
    const key = buildSearchCandidateKey(media);
    if (!key) continue;
    const score = scoreSearchCandidate(query, media);
    const existing = bucket.get(key);
    if (!existing || score > existing.score) {
      bucket.set(key, { media, score });
    }
  }
};

export const fetchAnimeDetailsBulk = async (titles, options = {}) => {
  const safeTitles = Array.isArray(titles)
    ? titles.filter((t) => typeof t === 'string' && t.trim().length > 0)
    : [];

  if (safeTitles.length === 0) return [];

  const {
    concurrency = 3,
    interRequestDelayMs = 120,
    cooldownOn429Ms = 1200,
    timeoutMs = 16000,
    perTitleMaxMs = 9000,
    maxAttempts = 5,
    baseDelayMs = 900,
    maxRetryDelayMs = 1800,
    adaptiveFallback = false,
    adaptiveSkipPrimary = false,
    adaptiveMaxTerms = 4,
    adaptivePerPage = 10,
    adaptiveMinScore = 0.36,
    adaptiveTimeoutMs = 2200,
    adaptiveMaxAttempts = 1,
    onRetry,
    onProgress,
    onTimeout,
    onAdaptiveQuery,
  } = options;

  const workerCount = Math.max(1, Math.min(6, Number(concurrency) || 1));
  const delayMs = Math.max(0, Number(interRequestDelayMs) || 0);
  const cooldownMs = Math.max(0, Number(cooldownOn429Ms) || 0);
  const maxMsPerTitle = Math.max(1000, Number(perTitleMaxMs) || 9000);
  const results = new Array(safeTitles.length).fill(null);

  let nextIndex = 0;
  let completed = 0;

  const runWorker = async () => {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= safeTitles.length) break;

      const title = safeTitles[index];
      let saw429 = false;
      let timedOut = false;
      let adaptiveUsed = false;
      let adaptiveQuery = '';
      const perTitleController = new AbortController();
      const perTitleTimer = setTimeout(() => {
        timedOut = true;
        perTitleController.abort();
      }, maxMsPerTitle);

      let data = null;
      try {
        data = await fetchAnimeDetails(title, {
          timeoutMs,
          maxAttempts,
          baseDelayMs,
          maxRetryDelayMs,
          adaptiveFallback,
          adaptiveSkipPrimary,
          adaptiveMaxTerms,
          adaptivePerPage,
          adaptiveMinScore,
          adaptiveTimeoutMs,
          adaptiveMaxAttempts,
          signal: perTitleController.signal,
          onRetry: (info) => {
            if (info?.status === 429) saw429 = true;
            if (typeof onRetry === 'function') {
              onRetry({ ...info, title, index, total: safeTitles.length });
            }
          },
          onAdaptiveQuery: (info) => {
            adaptiveUsed = true;
            if (info?.query) adaptiveQuery = info.query;
            if (typeof onAdaptiveQuery === 'function') {
              onAdaptiveQuery({ ...info, title, index, total: safeTitles.length });
            }
          },
        });
      } catch (error) {
        if (!timedOut && !isAbortError(error)) {
          console.error(`Bulk fetch error for ${title}:`, error);
        }
        data = null;
      } finally {
        clearTimeout(perTitleTimer);
      }

      if (timedOut && typeof onTimeout === 'function') {
        try {
          onTimeout({ title, index, total: safeTitles.length, maxMsPerTitle });
        } catch (_) {
          // ignore callback errors
        }
      }

      results[index] = data ?? null;
      completed += 1;

      if (typeof onProgress === 'function') {
        onProgress({
          completed,
          total: safeTitles.length,
          index,
          title,
          hit: Boolean(data),
          dataId: data?.id ?? null,
          saw429,
          timedOut,
          adaptiveUsed,
          adaptiveQuery,
        });
      }

      if (delayMs > 0) await sleep(delayMs);
      if (saw429 && cooldownMs > 0) await sleep(cooldownMs);
    }
  };

  const workers = Array.from(
    { length: Math.min(workerCount, safeTitles.length) },
    () => runWorker()
  );
  await Promise.all(workers);

  return results;
};

export const findClosestAnimeCandidates = async (title, options = {}) => {
  const base = String(title || '').trim();
  if (!base) return [];

  const {
    maxTerms = 4,
    perPage = 10,
    limit = 3,
    minScore = 0.2,
    timeoutMs = 5000,
    maxAttempts = 1,
    baseDelayMs = 120,
    maxRetryDelayMs = 500,
  } = options;

  const terms = buildSearchTermVariants(base, Math.max(2, Number(maxTerms) || 4));
  const rankedMap = new Map();

  for (const term of terms) {
    const list = await searchAnimeListInternal(term, perPage, {
      timeoutMs,
      maxAttempts,
      baseDelayMs,
      maxRetryDelayMs,
    });

    for (const media of list) {
      const id = Number(media?.id);
      if (!Number.isFinite(id)) continue;
      const titles = [
        media?.title?.native,
        media?.title?.romaji,
        media?.title?.english,
      ].filter(Boolean);
      const score = titles.reduce((best, t) => Math.max(best, titleSimilarity(base, t)), 0);
      const prev = rankedMap.get(id);
      if (!prev || score > prev.score) {
        rankedMap.set(id, { media, score, matchedBy: term });
      }
    }
  }

  return Array.from(rankedMap.values())
    .filter((item) => item.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(1, Number(limit) || 3));
};

export const fetchAnimeDetailsBatch = async (titles, options = {}) => {
  const safeTitles = Array.isArray(titles) ? titles.filter((t) => typeof t === 'string' && t.trim().length > 0) : [];
  if (safeTitles.length === 0) return [];
  const {
    allowUnknownFormat = true,
    allowUnknownCountry = true,
    allowedFormats: allowedFormatsOption,
    formatIn: formatInOption,
    ...requestOptions
  } = options || {};
  const allowedFormats = resolveAllowedFormats(allowedFormatsOption || formatInOption, DEFAULT_YEAR_FORMATS);
  const { country: countryPreference } = resolveCountryPreference(options, DEFAULT_COUNTRY_OF_ORIGIN);
  const queryFormatIn = allowUnknownFormat ? undefined : allowedFormats;
  const queryCountryOfOrigin = allowUnknownCountry ? undefined : countryPreference;

  const variables = {
    formatIn: queryFormatIn,
    countryOfOrigin: queryCountryOfOrigin,
  };
  const fields = [
    'id',
    'title { native romaji english }',
    'coverImage { extraLarge large }',
    'season',
    'seasonYear',
    'status',
    'startDate { year month day }',
    'averageScore',
    'episodes',
    'genres',
    'format',
    'countryOfOrigin',
    'bannerImage',
    'description',
  ].join('\n');

  const parts = safeTitles.map((_, idx) => {
    const v = `s${idx}`;
    variables[v] = safeTitles[idx];
    return `m${idx}: Media(search: $${v}, type: ANIME, format_in: $formatIn, countryOfOrigin: $countryOfOrigin) {\n${fields}\n}`;
  });

  const query = `query(${safeTitles.map((_, idx) => `$s${idx}: String`).join(', ')}, $formatIn: [MediaFormat], $countryOfOrigin: CountryCode) {\n${parts.join('\n')}\n}`;

  const buildMappedResult = (data) => safeTitles.map((_, idx) => data?.[`m${idx}`] ?? null);

  const fillMissingBySingleFetch = async (mapped) => {
    const next = Array.isArray(mapped) ? [...mapped] : safeTitles.map(() => null);
    const timeoutMs = Number(requestOptions.timeoutMs) > 0 ? Number(requestOptions.timeoutMs) : 12000;
    const singleOptions = {
      timeoutMs,
      maxAttempts: 3,
      baseDelayMs: 800,
      onRetry: requestOptions.onRetry,
      allowUnknownFormat,
      allowUnknownCountry,
      allowedFormats,
      countryOfOrigin: countryPreference || '',
    };

    for (let i = 0; i < next.length; i++) {
      if (next[i]) continue;
      next[i] = await fetchAnimeDetails(safeTitles[i], singleOptions);
      if (i < next.length - 1) {
        await sleep(250);
      }
    }

    return next;
  };

  try {
    const result = await postAniListGraphQL(query, variables, requestOptions);
    const mapped = buildMappedResult(result?.data || {}).map((item) => (
      isDisplayEligibleAnime(item, {
        allowUnknownFormat,
        allowUnknownCountry,
        allowedFormats,
        countryOfOrigin: countryPreference || undefined,
      })
        ? item
        : null
    ));
    if (!result.ok || mapped.some((item) => item === null)) {
      return await fillMissingBySingleFetch(mapped);
    }
    return mapped;
  } catch (error) {
    console.error('Error fetching batch:', error);
    return await fillMissingBySingleFetch(safeTitles.map(() => null));
  }
};

export const searchAnimeList = async (title, perPage = 8, options = {}) => {
  const query = normalizeTitleSpacing(title);
  if (!query) return [];

  const requestedCount = Math.max(1, Math.min(30, Number(perPage) || 8));
  const fetchPerTerm = Math.max(requestedCount, 12);
  const rankedMap = new Map();

  const primaryList = await searchAnimeListInternal(query, fetchPerTerm, options);
  mergeSearchCandidates(rankedMap, query, primaryList);

  const hasStrongPrimary = Array.from(rankedMap.values()).some((entry) => entry.score >= 1);
  if (rankedMap.size < requestedCount || !hasStrongPrimary) {
    const variantTerms = buildSearchTermVariants(query, Math.max(4, Number(options.maxTerms) || 6))
      .filter((term) => stripTitleNoise(term) !== stripTitleNoise(query))
      .slice(0, 4);

    for (const term of variantTerms) {
      const list = await searchAnimeListInternal(term, fetchPerTerm, options);
      mergeSearchCandidates(rankedMap, query, list);
      const hasStrongMatch = Array.from(rankedMap.values()).some((entry) => entry.score >= 1);
      if (rankedMap.size >= requestedCount * 2 && hasStrongMatch) break;
    }
  }

  return Array.from(rankedMap.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, requestedCount)
    .map((entry) => entry.media);
};

export const fetchAnimeByYear = async (seasonYear, options = {}) => {
  const year = Number(seasonYear);
  const page = Math.max(1, Number(options.page) || 1);
  const perPage = Math.max(10, Math.min(50, Number(options.perPage) || 36));
  const seasonRaw = String(options.season || '').toUpperCase();
  const season = ['WINTER', 'SPRING', 'SUMMER', 'FALL'].includes(seasonRaw) ? seasonRaw : null;
  const genreList = Array.isArray(options.genreIn)
    ? options.genreIn.filter((g) => typeof g === 'string' && g.trim().length > 0)
    : [];
  const genreIn = genreList.length > 0 ? genreList : null;
  const allowUnknownFormat = options.allowUnknownFormat !== false;
  const allowUnknownCountry = options.allowUnknownCountry !== false;
  const formatIn = resolveAllowedFormats(options.formatIn, DEFAULT_YEAR_FORMATS);
  const formatInSet = new Set(formatIn);
  const { country: countryOfOrigin } = resolveCountryPreference(options, DEFAULT_COUNTRY_OF_ORIGIN);
  const queryFormatIn = formatIn;
  const queryCountryOfOrigin = countryOfOrigin;
  const statusInList = Array.isArray(options.statusIn)
    ? options.statusIn.filter((s) => typeof s === 'string' && s.trim().length > 0)
    : [];
  const statusIn = statusInList.length > 0 ? statusInList : null;
  const statusNotRaw = Object.prototype.hasOwnProperty.call(options, 'statusNot')
    ? options.statusNot
    : null;
  const statusNot = (typeof statusNotRaw === 'string' && statusNotRaw.trim().length > 0)
    ? statusNotRaw
    : null;
  const startDateGreater = (year * 10000) - 1;
  const startDateLesser = (year + 1) * 10000;
  const debugLog = Boolean(options.debugLog);
  const debugKey = String(options.debugKey || 'yearly');

  const emptyPageInfo = {
    total: null,
    perPage,
    currentPage: page,
    lastPage: page,
    hasNextPage: false,
    hasKnownLastPage: true,
  };

  if (!Number.isFinite(year)) {
    return { items: [], pageInfo: emptyPageInfo, error: null };
  }

  try {
    const requestOptions = {
      timeoutMs: Math.max(4000, Number(options.timeoutMs) || 9000),
      maxAttempts: Math.max(1, Number(options.maxAttempts) || 2),
      baseDelayMs: Math.max(80, Number(options.baseDelayMs) || 250),
      maxRetryDelayMs: Math.max(200, Number(options.maxRetryDelayMs) || 900),
      signal: options.signal,
    };
    const hasSeasonFilter = Boolean(season);
    const baseVariables = hasSeasonFilter
      ? {
        seasonYear: year,
        season,
        page,
        perPage,
        genreIn,
        formatIn: queryFormatIn,
        countryOfOrigin: queryCountryOfOrigin,
        statusIn,
        statusNot,
      }
      : {
        startDateGreater,
        startDateLesser,
        page,
        perPage,
        genreIn,
        formatIn: queryFormatIn,
        countryOfOrigin: queryCountryOfOrigin,
      };
    const hasStatusFilter = hasSeasonFilter && ((statusIn && statusIn.length > 0) || Boolean(statusNot));
    if (debugLog) {
      console.info(`[fetchAnimeByYear:${debugKey}] request`, {
        season: season || null,
        page,
        limit: perPage,
        year,
        formatIn,
        queryFormatIn: queryFormatIn || null,
        countryOfOrigin: countryOfOrigin || null,
        queryCountryOfOrigin: queryCountryOfOrigin || null,
        allowUnknownFormat,
        allowUnknownCountry,
        statusIn,
        statusNot,
      });
    }
    const result = await postAniListGraphQL(
      hasSeasonFilter ? ANIME_BY_YEAR_QUERY : ANIME_BY_START_DATE_QUERY,
      baseVariables,
      requestOptions
    );

    if (!result?.ok && !result?.data?.Page) {
      const statusCode = Number(result?.status) || 0;
      const retryAfterMsRaw = Number(result?.retryAfterMs);
      const retryAfterMs = Number.isFinite(retryAfterMsRaw) && retryAfterMsRaw > 0
        ? retryAfterMsRaw
        : 0;
      const rateLimit = (result?.rateLimit && typeof result.rateLimit === 'object')
        ? result.rateLimit
        : null;
      const graphQLErrorMessage = Array.isArray(result?.errors) && result.errors.length > 0
        ? (result.errors[0]?.message || 'GraphQL Error')
        : (
          statusCode === 429
            ? 'Rate limit exceeded (429)'
            : statusCode >= 500
              ? `Upstream error (${statusCode})`
              : statusCode > 0
                ? `Request failed (${statusCode})`
                : 'Failed to fetch yearly anime'
      );
      const error = new Error(graphQLErrorMessage);
      if (statusCode > 0) error.status = statusCode;
      if (retryAfterMs > 0) error.retryAfterMs = retryAfterMs;
      if (rateLimit) error.rateLimit = rateLimit;
      if (debugLog) {
        console.info(`[fetchAnimeByYear:${debugKey}] response`, {
          total: null,
          totalPages: null,
          page,
          limit: perPage,
          itemsLength: 0,
          error: graphQLErrorMessage,
          status: statusCode || null,
          retryAfterMs: retryAfterMs || null,
          rateLimit: rateLimit
            ? {
              retryAfter: rateLimit.retryAfter ?? null,
              remaining: rateLimit.remaining ?? null,
              limit: rateLimit.limit ?? null,
              reset: rateLimit.reset ?? null,
            }
            : null,
        });
      }
      return { items: [], pageInfo: emptyPageInfo, error };
    }

    const pageData = result?.data?.Page || {};
    const pageInfoRaw = pageData?.pageInfo || emptyPageInfo;
    const currentPage = Math.max(1, Number(pageInfoRaw?.currentPage) || page);
    const apiTotal = Number(pageInfoRaw?.total);
    const hasApiTotal = Number.isFinite(apiTotal) && apiTotal >= 0;
    const apiLastPage = Number(pageInfoRaw?.lastPage);
    const hasApiLastPage = Number.isFinite(apiLastPage) && apiLastPage >= currentPage;
    const hasNextPageRaw = typeof pageInfoRaw?.hasNextPage === 'boolean'
      ? pageInfoRaw.hasNextPage
      : null;
    const rawItems = Array.isArray(pageData?.media) ? pageData.media : [];
    const normalizedItems = rawItems.filter((item) => {
      const itemCountryOfOrigin = normalizeCountryValue(item?.countryOfOrigin);
      if (countryOfOrigin) {
        if (itemCountryOfOrigin) {
          if (itemCountryOfOrigin !== countryOfOrigin) return false;
        } else if (!allowUnknownCountry) {
          return false;
        }
      }

      const itemFormat = normalizeMediaFormatValue(item?.format);
      if (itemFormat) {
        if (formatInSet.size > 0 && !formatInSet.has(itemFormat)) return false;
      } else if (!allowUnknownFormat) {
        return false;
      }

      if (hasSeasonFilter) {
        const itemYear = Number(item?.seasonYear);
        const itemSeason = String(item?.season || '').toUpperCase();
        if (itemYear !== year || itemSeason !== season || isHentaiAnime(item)) return false;
        if (hasStatusFilter) {
          const itemStatus = String(item?.status || '').trim();
          if (statusIn && !statusIn.includes(itemStatus)) return false;
          if (statusNot && itemStatus === statusNot) return false;
        }
        return true;
      }
      if (Number(item?.startDate?.year) !== year || isHentaiAnime(item)) return false;
      if (hasStatusFilter) {
        const itemStatus = String(item?.status || '').trim();
        if (statusIn && !statusIn.includes(itemStatus)) return false;
        if (statusNot && itemStatus === statusNot) return false;
      }
      return true;
    });
    const hasNextPage = hasNextPageRaw ?? (hasApiLastPage ? currentPage < apiLastPage : normalizedItems.length >= perPage);
    const hasKnownLastPage = hasApiLastPage || !hasNextPage;
    const computedLastPage = hasApiLastPage
      ? apiLastPage
      : (hasNextPage ? currentPage + 1 : currentPage);
    const pageInfo = {
      ...emptyPageInfo,
      total: hasApiTotal ? apiTotal : null,
      perPage,
      currentPage,
      lastPage: computedLastPage,
      hasNextPage,
      hasKnownLastPage,
      rawCount: rawItems.length,
      matchedCount: normalizedItems.length,
    };
    if (debugLog) {
      const totalPagesRaw = Number(pageInfoRaw?.lastPage);
      console.info(`[fetchAnimeByYear:${debugKey}] response`, {
        status: Number(result?.status) || null,
        total: hasApiTotal ? apiTotal : null,
        totalPages: Number.isFinite(totalPagesRaw) ? totalPagesRaw : null,
        page: currentPage,
        limit: perPage,
        itemsLength: rawItems.length,
        matchedLength: normalizedItems.length,
        rateLimit: result?.rateLimit
          ? {
            retryAfter: result.rateLimit.retryAfter ?? null,
            remaining: result.rateLimit.remaining ?? null,
            limit: result.rateLimit.limit ?? null,
            reset: result.rateLimit.reset ?? null,
          }
          : null,
      });
    }

    const hasLikelyUnexpectedZero =
      page > 1
      && normalizedItems.length === 0
      && hasSeasonFilter
      && !hasNextPage;
    if (hasLikelyUnexpectedZero) {
      return { items: [], pageInfo: { ...pageInfo, lastPage: Math.max(1, currentPage - 1), hasKnownLastPage: true }, error: null };
    }
    return { items: normalizedItems, pageInfo, error: null };
  } catch (error) {
    if (!isAbortError(error)) {
      console.error(`Error fetching yearly anime for ${year}:`, error);
    }
    return { items: [], pageInfo: emptyPageInfo, error };
  }
};

export const fetchAnimeByYearAllPages = async (seasonYear, options = {}) => {
  const perPage = Math.max(10, Math.min(50, Number(options.perPage) || 50));
  const maxPages = Math.max(1, Math.min(200, Number(options.maxPages) || 80));
  const interPageDelayMs = Math.max(0, Number(options.interPageDelayMs) || 120);
  const firstPage429Retries = Math.max(0, Math.min(5, Number(options.firstPage429Retries) || 2));
  const firstPage429DelayMs = Math.max(400, Number(options.firstPage429DelayMs) || 1500);
  const signal = options.signal;
  const mergedItems = [];
  const seenIds = new Set();
  let lastError = null;
  let knownLastPage = null;
  let emptyMatchStreak = 0;
  let emptyRawStreak = 0;
  let pagesFetched = 0;
  let firstPage429RetryCount = 0;

  for (let page = 1; page <= maxPages; page++) {
    const { items, pageInfo, error } = await fetchAnimeByYear(seasonYear, {
      ...options,
      page,
      perPage,
    });

    if (error) {
      lastError = error;
      const statusCode = Number(error?.status) || 0;
      const isRateLimited = statusCode === 429 || String(error?.message || '').includes('429');
      if (page === 1 && isRateLimited && firstPage429RetryCount < firstPage429Retries) {
        firstPage429RetryCount += 1;
        const waitMs = Math.min(10000, firstPage429DelayMs * firstPage429RetryCount);
        if (Boolean(options.debugLog)) {
          const debugKey = String(options.debugKey || 'yearly');
          console.info(`[fetchAnimeByYearAllPages:${debugKey}] retry`, {
            reason: 'first_page_rate_limit',
            retryCount: firstPage429RetryCount,
            waitMs,
          });
        }
        try {
          await sleepWithSignal(waitMs, signal);
        } catch (waitError) {
          return { items: mergedItems, error: waitError };
        }
        page -= 1;
        continue;
      }
      if (page === 1) {
        return { items: [], error };
      }
      break;
    }
    pagesFetched += 1;

    const chunk = Array.isArray(items) ? items : [];
    let addedCount = 0;
    for (const anime of chunk) {
      const id = Number(anime?.id);
      if (Number.isFinite(id)) {
        if (seenIds.has(id)) continue;
        seenIds.add(id);
      }
      mergedItems.push(anime);
      addedCount += 1;
    }

    if (addedCount === 0) {
      emptyMatchStreak += 1;
    } else {
      emptyMatchStreak = 0;
    }

    const rawCount = Math.max(0, Number(pageInfo?.rawCount) || 0);
    if (rawCount === 0) {
      emptyRawStreak += 1;
    } else {
      emptyRawStreak = 0;
    }

    const pageLastPage = Number(pageInfo?.lastPage);
    if (Number.isFinite(pageLastPage) && pageLastPage >= 1) {
      knownLastPage = Number.isFinite(knownLastPage)
        ? Math.max(knownLastPage, pageLastPage)
        : pageLastPage;
    }

    const hasMoreByLastPage = Number.isFinite(knownLastPage) && page < knownLastPage;
    const hasNextPage = Boolean(pageInfo?.hasNextPage) || hasMoreByLastPage;
    if (!hasNextPage) {
      break;
    }

    // Stop runaway scans when API keeps claiming next page but no useful data comes back.
    const shouldStopForEmptyMatches = emptyMatchStreak >= 20 && page >= 30;
    if ((emptyRawStreak >= 2 && page >= 3) || shouldStopForEmptyMatches) {
      break;
    }

    if (interPageDelayMs > 0) {
      try {
        await sleepWithSignal(interPageDelayMs, signal);
      } catch (delayError) {
        return { items: mergedItems, error: delayError };
      }
    }
  }

  if (Boolean(options.debugLog)) {
    const uiPerPage = Math.max(1, Number(options.uiPerPage) || 0);
    const uiTotalPages = uiPerPage > 0
      ? Math.max(1, Math.ceil(mergedItems.length / uiPerPage))
      : null;
    const formatCounts = mergedItems.reduce((acc, anime) => {
      const key = String(anime?.format || 'UNKNOWN');
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    const statusCounts = mergedItems.reduce((acc, anime) => {
      const key = String(anime?.status || 'UNKNOWN');
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    const debugKey = String(options.debugKey || 'yearly');
    console.info(`[fetchAnimeByYearAllPages:${debugKey}] summary`, {
      year: Number(seasonYear),
      season: String(options.season || '').toUpperCase() || null,
      statusIn: Array.isArray(options.statusIn) ? options.statusIn : null,
      statusNot: options.statusNot || null,
      formatIn: Array.isArray(options.formatIn) ? options.formatIn : null,
      allowUnknownFormat: options.allowUnknownFormat !== false,
      allowUnknownCountry: options.allowUnknownCountry !== false,
      countryOfOrigin: Object.prototype.hasOwnProperty.call(options, 'countryOfOrigin')
        ? (options.countryOfOrigin || null)
        : DEFAULT_COUNTRY_OF_ORIGIN,
      pagesFetched,
      knownLastPage: Number.isFinite(knownLastPage) ? knownLastPage : null,
      mergedItemsLength: mergedItems.length,
      formatCounts,
      statusCounts,
      uiPerPage: uiPerPage > 0 ? uiPerPage : null,
      uiTotalPages,
      error: lastError?.message || null,
    });
  }

  return { items: mergedItems, error: lastError };
};

export const selectFeaturedAnimes = (allAnimes) => {
  const safeAnimes = filterOutHentaiAnimeList(allAnimes);
  // Case 0: Tutorial / Zero State
  if (!safeAnimes || safeAnimes.length === 0) {
    return [
      {
        isTutorial: true,
        badge: "Welcome",
        title: "AniTriggerへようこそ",
        description: "視聴済みアニメを記録・整理し、思い出すきっかけを作るWebアプリです。\n自分だけのアーカイブを作りましょう。",
        image: "/images/logo.png",
        uniqueId: "tut-1"
      },
      {
        isTutorial: true,
        badge: "How to use",
        title: "作品を追加しよう",
        description: "画面下部の追加ボタンから、視聴したアニメ作品を追加してみましょう。",
        uniqueId: "tut-2"
      },
      {
        isTutorial: true,
        badge: "Features",
        title: "新しい発見を",
        description: "作品が増えると、ジャンルごとにランダムで「今日の一本」をスライドで表示します。\n記録が増えるほど楽しさが広がります。",
        uniqueId: "tut-3"
      }
    ];
  }

  // Case 1: Few items, show all
  if (safeAnimes.length <= 2) {
    return safeAnimes.map(a => ({
      ...a,
      selectionReason: "コレクション",
      uniqueId: `all-${a.id}`
    }));
  }

  // Case 2: Many items, pick random via genres
  const allGenres = [...new Set(safeAnimes.flatMap(a => a.genres))];
  const shuffledGenres = allGenres.sort(() => 0.5 - Math.random());
  const targetGenres = shuffledGenres.slice(0, 3);

  const selected = [];
  const selectedIds = new Set();

  targetGenres.forEach(genre => {
    const candidates = safeAnimes.filter(a =>
      a.genres.includes(genre) && !selectedIds.has(a.id)
    );

    if (candidates.length > 0) {
      const picked = candidates[Math.floor(Math.random() * candidates.length)];
      selected.push({
        ...picked,
        selectionReason: `ジャンル: ${translateGenre(genre)}`,
        uniqueId: `genre-${picked.id}-${genre}`
      });
      selectedIds.add(picked.id);
    }
  });

  while (selected.length < 3 && selected.length < safeAnimes.length) {
    const remaining = safeAnimes.filter(a => !selectedIds.has(a.id));
    if (remaining.length === 0) break;

    const picked = remaining[Math.floor(Math.random() * remaining.length)];
    selected.push({
      ...picked,
      selectionReason: "おすすめ",
      uniqueId: `random-${picked.id}`
    });
    selectedIds.add(picked.id);
  }

  return selected;
};
