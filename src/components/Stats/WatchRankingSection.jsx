import { useEffect, useMemo, useState } from 'react';
import WatchCountBadge from '../Shared/WatchCountBadge';
import { translateGenre } from '../../constants/animeData';
import {
  normalizeAnimeRating,
  normalizeAnimeWatchCount,
  resolveAnimeTitle,
} from '../../utils/animeList';

const MAX_RANKING_ITEMS = 5;
const ALL_GENRES_OPTION = '__all__';

function WatchRankingSection({ animeList = [] }) {
  const [selectedGenre, setSelectedGenre] = useState(ALL_GENRES_OPTION);

  const genreOptions = useMemo(() => {
    const genreSet = new Set();
    (Array.isArray(animeList) ? animeList : []).forEach((anime) => {
      (Array.isArray(anime?.genres) ? anime.genres : []).forEach((genre) => {
        const normalizedGenre = String(genre || '').trim();
        if (normalizedGenre) {
          genreSet.add(normalizedGenre);
        }
      });
    });

    return Array.from(genreSet).sort((left, right) => (
      translateGenre(left).localeCompare(translateGenre(right), 'ja')
    ));
  }, [animeList]);

  useEffect(() => {
    if (selectedGenre === ALL_GENRES_OPTION) return;
    if (genreOptions.includes(selectedGenre)) return;
    setSelectedGenre(ALL_GENRES_OPTION);
  }, [genreOptions, selectedGenre]);

  const rankingItems = useMemo(() => {
    const safeList = (Array.isArray(animeList) ? animeList : [])
      .map((anime) => ({
        ...anime,
        watchCount: normalizeAnimeWatchCount(anime?.watchCount, { minimum: 1, defaultValue: 1 }),
      }));

    const scopedList = selectedGenre === ALL_GENRES_OPTION
      ? safeList
      : safeList.filter((anime) => (
        Array.isArray(anime?.genres) && anime.genres.includes(selectedGenre)
      ));

    const sortedItems = [...scopedList]
      .sort((left, right) => {
        const watchCountDiff = (right.watchCount || 0) - (left.watchCount || 0);
        if (watchCountDiff !== 0) return watchCountDiff;

        const ratingDiff = (normalizeAnimeRating(right?.rating) || 0) - (normalizeAnimeRating(left?.rating) || 0);
        if (ratingDiff !== 0) return ratingDiff;

        const addedAtDiff = (Number(right?.addedAt) || 0) - (Number(left?.addedAt) || 0);
        if (addedAtDiff !== 0) return addedAtDiff;
        return resolveAnimeTitle(left).localeCompare(resolveAnimeTitle(right), 'ja');
      })
      .slice(0, MAX_RANKING_ITEMS);

    let previousWatchCount = null;
    let previousDisplayRank = 0;

    return sortedItems.map((anime, index) => {
      const currentWatchCount = anime.watchCount || 0;
      const isTied = index > 0 && currentWatchCount === previousWatchCount;
      const displayRank = isTied ? previousDisplayRank : index + 1;

      previousWatchCount = currentWatchCount;
      previousDisplayRank = displayRank;

      return { ...anime, displayRank };
    });
  }, [animeList, selectedGenre]);

  if (rankingItems.length === 0) return null;

  return (
    <section className="watch-ranking-section" aria-labelledby="watch-ranking-title">
      <div className="watch-ranking-header">
        <div>
          <h3 id="watch-ranking-title" className="watch-ranking-title">視聴回数ランキング</h3>
        </div>
        {genreOptions.length > 0 && (
          <label className="watch-ranking-filter">
            <select
              className="watch-ranking-filter-select"
              value={selectedGenre}
              onChange={(event) => setSelectedGenre(event.target.value)}
              aria-label="視聴回数ランキングの表示範囲"
            >
              <option value={ALL_GENRES_OPTION}>全体</option>
              {genreOptions.map((genre) => (
                <option key={genre} value={genre}>
                  {translateGenre(genre)}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <div className="watch-ranking-list">
        {rankingItems.map((anime) => (
          <article key={anime.id} className="watch-ranking-item">
            <div className={`watch-ranking-rank rank-${anime.displayRank}`}>
              {anime.displayRank}
            </div>
            <img
              src={anime?.coverImage?.large || anime?.coverImage?.extraLarge || ''}
              alt=""
              className="watch-ranking-thumb"
              loading="lazy"
            />
            <div className="watch-ranking-body">
              <h4 className="watch-ranking-item-title">{resolveAnimeTitle(anime)}</h4>
              <p className="watch-ranking-item-meta" aria-label={`視聴回数 ${anime.watchCount}回`}>
                <WatchCountBadge
                  count={anime.watchCount}
                  className="watch-ranking-count-badge"
                  iconClassName="watch-ranking-count-icon"
                  countClassName="watch-ranking-count-number"
                />
              </p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

export default WatchRankingSection;
