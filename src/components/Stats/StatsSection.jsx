import React from 'react';
import { translateGenre } from '../../constants/animeData';

function StatIcon({ src, alt, fallback }) {
    const [hasError, setHasError] = React.useState(false);

    return (
        <div className="stat-icon">
            {hasError ? (
                <span className="stat-icon-fallback" aria-hidden="true">{fallback}</span>
            ) : (
                <img
                    src={src}
                    alt={alt}
                    loading="eager"
                    decoding="async"
                    onError={() => setHasError(true)}
                />
            )}
        </div>
    );
}

function StatsSection({ animeList }) {
    const totalAnime = animeList.length;
    const totalEpisodes = animeList.reduce((sum, anime) => sum + (anime.episodes || 0), 0);

    // Simple favorite genre logic
    const genreCounts = {};
    animeList.forEach(anime => {
        anime.genres?.forEach(genre => {
            genreCounts[genre] = (genreCounts[genre] || 0) + 1;
        });
    });

    const topGenre = Object.entries(genreCounts)
        .sort((a, b) => b[1] - a[1])[0]?.[0] || 'なし';

    return (
        <div className="stats-container">
            <div className="stat-card">
                <StatIcon src="/images/picture_1.png" alt="Anime Count" fallback="1" />
                <div className="stat-info">
                    <span className="stat-value">{totalAnime} 作品</span>
                    <span className="stat-label">登録作品数</span>
                </div>
            </div>
            <div className="stat-card">
                <StatIcon src="/images/picture_2.png" alt="Episodes Count" fallback="E" />
                <div className="stat-info">
                    <span className="stat-value">{totalEpisodes} 話</span>
                    <span className="stat-label">総エピソード</span>
                </div>
            </div>
            <div className="stat-card">
                <StatIcon src="/images/picture_3.png" alt="Top Genre" fallback="G" />
                <div className="stat-info">
                    <span className="stat-value">{topGenre !== 'なし' ? translateGenre(topGenre) : 'なし'}</span>
                    <span className="stat-label">最も見たジャンル</span>
                </div>
            </div>
        </div>
    );
}

export default StatsSection;
