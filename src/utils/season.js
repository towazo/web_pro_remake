export const SEASON_LABELS = {
  WINTER: '冬',
  SPRING: '春',
  SUMMER: '夏',
  FALL: '秋',
};

const getSeasonByMonth = (month) => {
  if (month >= 1 && month <= 3) return 'WINTER';
  if (month >= 4 && month <= 6) return 'SPRING';
  if (month >= 7 && month <= 9) return 'SUMMER';
  return 'FALL';
};

const getNowInJst = () => {
  const formatter = new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: 'numeric',
  });
  const parts = formatter.formatToParts(new Date());
  const year = Number(parts.find((part) => part.type === 'year')?.value);
  const month = Number(parts.find((part) => part.type === 'month')?.value);
  return {
    year: Number.isFinite(year) ? year : new Date().getFullYear(),
    month: Number.isFinite(month) ? month : (new Date().getMonth() + 1),
  };
};

export const getCurrentSeasonInfo = () => {
  const { year, month } = getNowInJst();
  return { year, season: getSeasonByMonth(month) };
};

export const getNextSeasonInfo = ({ year, season }) => {
  if (season === 'WINTER') return { year, season: 'SPRING' };
  if (season === 'SPRING') return { year, season: 'SUMMER' };
  if (season === 'SUMMER') return { year, season: 'FALL' };
  return { year: year + 1, season: 'WINTER' };
};

export const seasonToFilterKey = (season) => {
  if (season === 'WINTER') return 'winter';
  if (season === 'SPRING') return 'spring';
  if (season === 'SUMMER') return 'summer';
  if (season === 'FALL') return 'autumn';
  return '';
};
