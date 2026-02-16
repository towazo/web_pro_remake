const HENTAI_GENRE_KEY = 'hentai';

const normalizeGenre = (genre) => String(genre || '').trim().toLowerCase();

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

// Backward-compatible exports for existing imports.
export const isHentaiOnlyGenres = hasHentaiGenreInGenres;
export const isHentaiOnlyAnime = isHentaiAnime;
export const filterOutHentaiOnlyAnimeList = filterOutHentaiAnimeList;
