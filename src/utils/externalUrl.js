const ABSOLUTE_URL_SCHEME_PATTERN = /^[a-zA-Z][a-zA-Z\d+\-.]*:/;
const ALLOWED_PROTOCOL_SET = new Set(['http:', 'https:']);

export const normalizeAnimeExternalUrl = (value) => {
  if (typeof value !== 'string') return '';

  const trimmed = value.trim();
  if (!trimmed) return '';

  const candidate = ABSOLUTE_URL_SCHEME_PATTERN.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  try {
    const parsed = new URL(candidate);
    if (!ALLOWED_PROTOCOL_SET.has(parsed.protocol)) return '';
    if (!parsed.hostname) return '';
    return parsed.toString();
  } catch (_) {
    return '';
  }
};
