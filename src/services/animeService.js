import { translateGenre } from '../constants/animeData';

const ANILIST_ENDPOINT = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.DEV)
  ? '/anilist/'
  : 'https://graphql.anilist.co';

const ANIME_QUERY = `
  query ($search: String) {
    Media (search: $search, type: ANIME) {
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
      bannerImage
      description
    }
  }
`;

const ANIME_LIST_QUERY = `
  query ($search: String, $perPage: Int) {
    Page (perPage: $perPage) {
      media (search: $search, type: ANIME) {
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
    $formatIn: [MediaFormat]
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
      }
    }
  }
`;

const ANIME_BY_YEAR_WITH_STATUS_QUERY = `
  query (
    $seasonYear: Int,
    $season: MediaSeason,
    $page: Int,
    $perPage: Int,
    $genreIn: [String],
    $formatIn: [MediaFormat],
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
        status_in: $statusIn
        status_not: $statusNot
        genre_in: $genreIn
        format_in: $formatIn
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
      }
    }
  }
`;

const DEFAULT_YEAR_FORMATS = ['TV', 'TV_SHORT', 'MOVIE', 'SPECIAL', 'OVA', 'ONA', 'MUSIC'];

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
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          body: JSON.stringify({ query, variables }),
          signal,
        },
        timeoutMs
      );

      if (response.ok) {
        const result = await response.json();
        if (result?.errors?.length) {
          const retryable = isRetryableGraphQLError(result.errors);
          const hasData = hasAnyGraphQLData(result?.data);
          if (retryable && !hasData && attempt < maxAttempts) {
            const retryAfterMs = parseRetryAfterMs(response);
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
                });
              } catch (_) {
                // ignore callback errors
              }
            }
            if (signal?.aborted) throw createAbortError();
            await sleepWithSignal(waitMs, signal);
            continue;
          }

          return { ok: hasData, status: 200, data: result?.data ?? null, errors: result.errors };
        }
        return { ok: true, status: 200, data: result?.data ?? null };
      }

      const status = response.status;
      const retryable = status === 404 || status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
      if (!retryable || attempt === maxAttempts) {
        return { ok: false, status, data: null, errors: null };
      }

      const retryAfterMs = parseRetryAfterMs(response);
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
    ...requestOptions
  } = options || {};

  const fallbackRequestOptions = {
    ...requestOptions,
    timeoutMs: Math.min(3200, Math.max(1000, Number(adaptiveTimeoutMs) || 2200)),
    maxAttempts: Math.min(2, Math.max(1, Number(adaptiveMaxAttempts) || 1)),
    baseDelayMs: Math.min(300, Math.max(50, Number(requestOptions.baseDelayMs) || 200)),
    maxRetryDelayMs: Math.min(700, Math.max(100, Number(requestOptions.maxRetryDelayMs) || 500)),
  };

  let primaryError = null;

  if (!adaptiveSkipPrimary) {
    try {
      const result = await postAniListGraphQL(ANIME_QUERY, { search: title }, requestOptions);
      if (result.ok && result.data?.Media) {
        return result.data.Media;
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
  const numericId = Number(id);
  if (!Number.isFinite(numericId)) return null;

  try {
    const result = await postAniListGraphQL(ANIME_BY_ID_QUERY, { id: numericId }, options);
    return result.ok ? (result.data?.Media ?? null) : null;
  } catch (error) {
    if (!isAbortError(error)) {
      console.error(`Error fetching by id ${id}:`, error);
    }
    return null;
  }
};

const searchAnimeListInternal = async (title, perPage = 8, options = {}) => {
  try {
    const result = await postAniListGraphQL(ANIME_LIST_QUERY, { search: title, perPage }, options);
    return result.ok ? (result.data?.Page?.media || []) : [];
  } catch (error) {
    if (!isAbortError(error)) {
      console.error(`Error searching list for ${title}:`, error);
    }
    return [];
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

  const variables = {};
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
    'bannerImage',
    'description',
  ].join('\n');

  const parts = safeTitles.map((_, idx) => {
    const v = `s${idx}`;
    variables[v] = safeTitles[idx];
    return `m${idx}: Media(search: $${v}, type: ANIME) {\n${fields}\n}`;
  });

  const query = `query(${safeTitles.map((_, idx) => `$s${idx}: String`).join(', ')}) {\n${parts.join('\n')}\n}`;

  const buildMappedResult = (data) => safeTitles.map((_, idx) => data?.[`m${idx}`] ?? null);

  const fillMissingBySingleFetch = async (mapped) => {
    const next = Array.isArray(mapped) ? [...mapped] : safeTitles.map(() => null);
    const timeoutMs = Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : 12000;
    const singleOptions = {
      timeoutMs,
      maxAttempts: 3,
      baseDelayMs: 800,
      onRetry: options.onRetry,
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
    const result = await postAniListGraphQL(query, variables, options);
    const mapped = buildMappedResult(result?.data || {});
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
  return await searchAnimeListInternal(title, perPage, options);
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
  const formatIn = Array.isArray(options.formatIn) && options.formatIn.length > 0
    ? options.formatIn
    : DEFAULT_YEAR_FORMATS;
  const statusInList = Array.isArray(options.statusIn)
    ? options.statusIn.filter((s) => typeof s === 'string' && s.trim().length > 0)
    : [];
  const statusIn = statusInList.length > 0 ? statusInList : null;
  const statusNot = Object.prototype.hasOwnProperty.call(options, 'statusNot')
    ? options.statusNot
    : null;

  const emptyPageInfo = {
    total: 0,
    perPage,
    currentPage: page,
    lastPage: 1,
    hasNextPage: false,
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
    const baseVariables = { seasonYear: year, season, page, perPage, genreIn, formatIn };
    const withStatusVariables = { ...baseVariables, statusIn, statusNot };
    const hasStatusFilter = (statusIn && statusIn.length > 0) || Boolean(statusNot);

    let result = hasStatusFilter
      ? await postAniListGraphQL(ANIME_BY_YEAR_WITH_STATUS_QUERY, withStatusVariables, requestOptions)
      : await postAniListGraphQL(ANIME_BY_YEAR_QUERY, baseVariables, requestOptions);

    // AniList occasionally fails on status_* filters (500). Fallback to safe query.
    if (!result?.ok && !result?.data?.Page && hasStatusFilter) {
      result = await postAniListGraphQL(ANIME_BY_YEAR_QUERY, baseVariables, requestOptions);
    }

    if (!result?.ok && !result?.data?.Page) {
      const graphQLErrorMessage = Array.isArray(result?.errors) && result.errors.length > 0
        ? (result.errors[0]?.message || 'GraphQL Error')
        : 'Failed to fetch yearly anime';
      return { items: [], pageInfo: emptyPageInfo, error: new Error(graphQLErrorMessage) };
    }

    const pageData = result?.data?.Page || {};
    const pageInfo = pageData?.pageInfo || emptyPageInfo;
    const items = Array.isArray(pageData?.media) ? pageData.media : [];
    return { items, pageInfo, error: null };
  } catch (error) {
    if (!isAbortError(error)) {
      console.error(`Error fetching yearly anime for ${year}:`, error);
    }
    return { items: [], pageInfo: emptyPageInfo, error };
  }
};

export const selectFeaturedAnimes = (allAnimes) => {
  // Case 0: Tutorial / Zero State
  if (!allAnimes || allAnimes.length === 0) {
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
  if (allAnimes.length <= 2) {
    return allAnimes.map(a => ({
      ...a,
      selectionReason: "コレクション",
      uniqueId: `all-${a.id}`
    }));
  }

  // Case 2: Many items, pick random via genres
  const allGenres = [...new Set(allAnimes.flatMap(a => a.genres))];
  const shuffledGenres = allGenres.sort(() => 0.5 - Math.random());
  const targetGenres = shuffledGenres.slice(0, 3);

  const selected = [];
  const selectedIds = new Set();

  targetGenres.forEach(genre => {
    const candidates = allAnimes.filter(a =>
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

  while (selected.length < 3 && selected.length < allAnimes.length) {
    const remaining = allAnimes.filter(a => !selectedIds.has(a.id));
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
