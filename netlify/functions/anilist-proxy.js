const ANILIST_GRAPHQL_ENDPOINT = 'https://graphql.anilist.co';
const FORWARDED_RESPONSE_HEADERS = [
  'retry-after',
  'x-ratelimit-limit',
  'x-ratelimit-remaining',
  'x-ratelimit-reset',
  'x-ratelimit-reset-after',
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

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: {
        Allow: 'POST, OPTIONS',
        'Cache-Control': 'no-store',
      },
      body: '',
    };
  }

  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, {
      error: 'Method not allowed.',
      code: 'METHOD_NOT_ALLOWED',
    }, { Allow: 'POST, OPTIONS' });
  }

  const requestBody = event.isBase64Encoded
    ? Buffer.from(event.body || '', 'base64')
    : (event.body || '');

  if (!requestBody || requestBody.length === 0) {
    return jsonResponse(400, {
      error: 'GraphQL request body is required.',
      code: 'ANILIST_BODY_REQUIRED',
    });
  }

  try {
    const upstream = await fetch(ANILIST_GRAPHQL_ENDPOINT, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'User-Agent': 'AniTriggerAniListProxy/1.0',
      },
      body: requestBody,
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
      error: 'AniList request failed.',
      code: 'ANILIST_PROXY_FAILED',
      detail: String(error?.message || error || 'unknown error'),
    });
  }
};
