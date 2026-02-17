const HENTAI_GENRE_KEY = 'hentai';
export const DISPLAY_ALLOWED_MEDIA_FORMATS = Object.freeze(['TV', 'TV_SHORT', 'MOVIE', 'OVA', 'ONA', 'SPECIAL']);
export const DISPLAY_ALLOWED_COUNTRY_OF_ORIGIN = 'JP';
const DISPLAY_ALLOWED_MEDIA_FORMAT_SET = new Set(DISPLAY_ALLOWED_MEDIA_FORMATS);
const SUPPLEMENTAL_FORMAT_SET = new Set(['OVA', 'TV_SHORT', 'ONA', 'SPECIAL']);
const ONA_LIKE_FORMAT_SET = new Set(['ONA', 'SPECIAL']);
const PROMOTIONAL_KEYWORD_PATTERNS = [
  /\b(?:pv|cm|mv|teaser|trailer|promo|promotional|commercial)\b/i,
  /(?:music\s*video|ミュージック\s*ビデオ|音楽\s*映像|楽曲\s*映像)/i,
  /(?:non[-\s]?credit|creditless|ノンクレジット|ノンテロップ)/i,
  /(?:web\s*cm|番宣|特報|予告|告知(?:映像)?)/i,
];
const ANCILLARY_KEYWORD_PATTERNS = [
  /\b(?:bonus|extra|omake|digest|recap|web\s*special|special\s*program|behind[-\s]?the[-\s]?scenes|making[-\s]?of)\b/i,
  /(?:映像特典|特典映像|おまけ|番外編|総集編|ダイジェスト|メイキング|特別番組|ミニアニメ|短編|予告編)/i,
];

const normalizeGenre = (genre) => String(genre || '').trim().toLowerCase();
const normalizeMediaFormat = (format) => String(format || '').trim().toUpperCase();
const normalizeCountryOfOrigin = (country) => String(country || '').trim().toUpperCase();
const normalizeText = (value) => String(value || '').normalize('NFKC').toLowerCase();
const toFiniteNumber = (value) => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' && value.trim().length === 0) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

export const isHentaiGenre = (genre) => normalizeGenre(genre) === HENTAI_GENRE_KEY;

export const hasHentaiGenreInGenres = (genres) => {
  if (!Array.isArray(genres)) return false;
  const normalized = genres
    .map((genre) => normalizeGenre(genre))
    .filter((genre) => genre.length > 0);
  if (normalized.length === 0) return false;
  return normalized.some((genre) => genre === HENTAI_GENRE_KEY);
};

export const isHentaiAnime = (anime) => {
  if (!anime || typeof anime !== 'object') return false;
  return hasHentaiGenreInGenres(anime.genres);
};

export const filterOutHentaiAnimeList = (list) => {
  if (!Array.isArray(list)) return [];
  return list.filter((anime) => !isHentaiAnime(anime));
};

const createAllowedMediaFormatSet = (allowedFormats) => {
  if (!Array.isArray(allowedFormats) || allowedFormats.length === 0) {
    return DISPLAY_ALLOWED_MEDIA_FORMAT_SET;
  }
  const normalized = allowedFormats
    .map((item) => normalizeMediaFormat(item))
    .filter((item) => item.length > 0);
  if (normalized.length === 0) return DISPLAY_ALLOWED_MEDIA_FORMAT_SET;
  return new Set(normalized);
};

export const isAllowedAnimeFormat = (anime, options = {}) => {
  if (!anime || typeof anime !== 'object') return false;
  const { allowUnknownFormat = false, allowedFormats } = options || {};
  const mediaFormat = normalizeMediaFormat(anime.format);
  if (!mediaFormat) return Boolean(allowUnknownFormat);
  const allowedSet = createAllowedMediaFormatSet(allowedFormats);
  return allowedSet.has(mediaFormat);
};

export const isAllowedCountryOfOrigin = (anime, options = {}) => {
  if (!anime || typeof anime !== 'object') return false;
  const {
    allowUnknownCountry = false,
    countryOfOrigin = DISPLAY_ALLOWED_COUNTRY_OF_ORIGIN,
  } = options || {};
  const requiredCountry = normalizeCountryOfOrigin(countryOfOrigin || DISPLAY_ALLOWED_COUNTRY_OF_ORIGIN);
  const actualCountry = normalizeCountryOfOrigin(anime.countryOfOrigin);
  if (!actualCountry) return Boolean(allowUnknownCountry);
  return actualCountry === requiredCountry;
};

const isLikelyPromotionalEntry = (anime) => {
  if (!anime || typeof anime !== 'object') return false;
  const mediaFormat = normalizeMediaFormat(anime.format);
  if (!SUPPLEMENTAL_FORMAT_SET.has(mediaFormat)) return false;

  const titleNative = normalizeText(anime?.title?.native);
  const titleRomaji = normalizeText(anime?.title?.romaji);
  const titleEnglish = normalizeText(anime?.title?.english);
  const description = normalizeText(anime?.description);
  const text = [titleNative, titleRomaji, titleEnglish, description]
    .filter((chunk) => chunk.length > 0)
    .join(' ');

  if (!text) return false;
  const hasPromotionalKeyword = PROMOTIONAL_KEYWORD_PATTERNS.some((pattern) => pattern.test(text));
  if (hasPromotionalKeyword) return true;

  const hasAncillaryKeyword = ANCILLARY_KEYWORD_PATTERNS.some((pattern) => pattern.test(text));
  if (!hasAncillaryKeyword) return false;

  const episodes = toFiniteNumber(anime?.episodes);
  // Upcoming ONA/SPECIAL titles often have unknown episode counts.
  // Treat unknown episodes as undecidable (allow), and only block when
  // ancillary keywords are present with a concrete short length.
  if (episodes === null) return false;
  return episodes <= 1;
};

const isLikelyAncillaryMusicClip = (anime) => {
  if (!anime || typeof anime !== 'object') return false;
  const mediaFormat = normalizeMediaFormat(anime.format);
  if (!ONA_LIKE_FORMAT_SET.has(mediaFormat)) return false;
  const episodes = toFiniteNumber(anime?.episodes);
  if (episodes !== 1) return false;
  const genres = Array.isArray(anime?.genres) ? anime.genres.map((genre) => normalizeGenre(genre)) : [];
  if (genres.length === 0) return false;
  return genres.every((genre) => genre === 'music');
};

const isMainlineSupplementalAnime = (anime) => {
  if (!anime || typeof anime !== 'object') return false;
  const mediaFormat = normalizeMediaFormat(anime.format);
  if (!SUPPLEMENTAL_FORMAT_SET.has(mediaFormat)) return true;

  if (isLikelyPromotionalEntry(anime)) return false;
  if (isLikelyAncillaryMusicClip(anime)) return false;

  const episodes = toFiniteNumber(anime?.episodes);
  if (episodes !== null && episodes <= 0) return false;
  return true;
};

export const isDisplayEligibleAnime = (anime, options = {}) => {
  if (!anime || typeof anime !== 'object') return false;
  if (isHentaiAnime(anime)) return false;
  if (!isAllowedAnimeFormat(anime, options)) return false;
  if (!isAllowedCountryOfOrigin(anime, options)) return false;
  if (!isMainlineSupplementalAnime(anime)) return false;
  return true;
};

export const filterDisplayEligibleAnimeList = (list, options = {}) => {
  if (!Array.isArray(list)) return [];
  return list.filter((anime) => isDisplayEligibleAnime(anime, options));
};

// Backward-compatible exports for existing imports.
export const isHentaiOnlyGenres = hasHentaiGenreInGenres;
export const isHentaiOnlyAnime = isHentaiAnime;
export const filterOutHentaiOnlyAnimeList = filterOutHentaiAnimeList;
