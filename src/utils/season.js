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

export const getCurrentSeasonInfo = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
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
