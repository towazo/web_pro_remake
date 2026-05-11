const JIKAN_ANIME_SEARCH_ENDPOINT = 'https://api.jikan.moe/v4/anime';
const FORWARDED_RESPONSE_HEADERS = [
  'retry-after',
  'x-ratelimit-limit',
  'x-ratelimit-remaining',
  'x-ratelimit-reset',
];

const jsonResponse = (statusCode, payload, extraHeaders = {}) => ({
  statusCode,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...extraHeaders,
  },
  body: JSON.stringify(payload),
});

const buildForwardedHeaders = (upstream) => {
  const headers = {};
  FORWARDED_RESPONSE_HEADERS.forEach((name) => {
    const value = upstream.headers.get(name);
    if (value) headers[name] = value;
  });
  return headers;
};

const buildJikanAnimeSearchUrl = (rawQuery, rawLimit) => {
  const query = String(rawQuery || '').normalize('NFKC').replace(/\s+/g, ' ').trim();
  if (!query || query.length > 160) return null;
  const limit = Math.max(1, Math.min(24, Number(rawLimit) || 12));
  const params = new URLSearchParams();
  params.set('q', query);
  params.set('limit', String(limit));
  params.set('sfw', 'true');
  return `${JIKAN_ANIME_SEARCH_ENDPOINT}?${params.toString()}`;
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: {
        Allow: 'GET, OPTIONS',
        'Cache-Control': 'no-store',
      },
      body: '',
    };
  }

  if (event.httpMethod !== 'GET') {
    return jsonResponse(405, {
      error: 'Method not allowed.',
      code: 'METHOD_NOT_ALLOWED',
    }, { Allow: 'GET, OPTIONS' });
  }

  const targetUrl = buildJikanAnimeSearchUrl(
    event.queryStringParameters?.q,
    event.queryStringParameters?.limit
  );
  if (!targetUrl) {
    return jsonResponse(400, {
      error: 'Search query is required.',
      code: 'JIKAN_QUERY_REQUIRED',
    });
  }

  try {
    const upstream = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'User-Agent': 'AniTriggerJikanProxy/1.0',
      },
    });

    const text = await upstream.text();
    const contentType = upstream.headers.get('content-type') || 'application/json; charset=utf-8';

    return {
      statusCode: upstream.status,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'no-store',
        ...buildForwardedHeaders(upstream),
      },
      body: text,
    };
  } catch (error) {
    return jsonResponse(502, {
      error: 'Jikan request failed.',
      code: 'JIKAN_PROXY_FAILED',
      detail: String(error?.message || error || 'unknown error'),
    });
  }
};
