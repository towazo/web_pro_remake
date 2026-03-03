const ALLOWED_SHARE_IMAGE_HOST_SUFFIXES = ['.anilist.co', '.anili.st'];

const parseAllowedShareImageUrl = (rawUrl) => {
  if (!rawUrl) return null;

  try {
    const parsed = new URL(String(rawUrl));
    const protocol = String(parsed.protocol || '').toLowerCase();
    const hostname = String(parsed.hostname || '').toLowerCase();
    const isAllowedHost = (
      hostname === 'anilist.co'
      || hostname === 'anili.st'
      || ALLOWED_SHARE_IMAGE_HOST_SUFFIXES.some((suffix) => hostname.endsWith(suffix))
    );

    if (!['https:', 'http:'].includes(protocol) || !isAllowedHost) {
      return null;
    }

    return parsed.toString();
  } catch (_) {
    return null;
  }
};

const jsonResponse = (statusCode, payload) => ({
  statusCode,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  },
  body: JSON.stringify(payload),
});

exports.handler = async (event) => {
  const targetUrl = parseAllowedShareImageUrl(event?.queryStringParameters?.url);
  if (!targetUrl) {
    return jsonResponse(400, {
      error: 'Invalid share image url.',
      code: 'INVALID_SHARE_IMAGE_URL',
    });
  }

  try {
    const upstream = await fetch(targetUrl, {
      headers: {
        Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        'User-Agent': 'AniTriggerShareImageProxy/1.0',
        Referer: 'https://anilist.co/',
      },
    });

    if (!upstream.ok) {
      return jsonResponse(502, {
        error: `Upstream image request failed (${upstream.status}).`,
        code: 'SHARE_IMAGE_UPSTREAM_FAILED',
      });
    }

    const contentType = String(upstream.headers.get('content-type') || '').toLowerCase();
    if (!contentType.startsWith('image/')) {
      return jsonResponse(415, {
        error: 'Upstream response was not an image.',
        code: 'SHARE_IMAGE_INVALID_CONTENT_TYPE',
      });
    }

    const buffer = Buffer.from(await upstream.arrayBuffer());
    const cacheControl = String(upstream.headers.get('cache-control') || '').trim()
      || 'public, max-age=86400';

    return {
      statusCode: 200,
      isBase64Encoded: true,
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(buffer.length),
        'Cache-Control': cacheControl,
      },
      body: buffer.toString('base64'),
    };
  } catch (error) {
    return jsonResponse(500, {
      error: 'Unexpected server error.',
      code: 'UNEXPECTED_SERVER_ERROR',
      detail: String(error?.message || error || 'unknown error'),
    });
  }
};
