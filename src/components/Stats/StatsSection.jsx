import React from 'react';
import { translateGenre } from '../../constants/animeData';

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
                <div className="stat-icon">
                    <img src="/images/picture_1.png" alt="Anime Count" />
                </div>
                <div className="stat-info">
                    <span className="stat-value">{totalAnime} 作品</span>
                    <span className="stat-label">登録作品数</span>
                </div>
            </div>
            <div className="stat-card">
                <div className="stat-icon">
                    <img src="/images/picture_2.png.png" alt="Episodes Count" />
                </div>
                <div className="stat-info">
                    <span className="stat-value">{totalEpisodes} 話</span>
                    <span className="stat-label">総エピソード</span>
                </div>
            </div>
            <div className="stat-card">
                <div className="stat-icon">
                    <img src="/images/picture_3.png.png" alt="Top Genre" />
                </div>
                <div className="stat-info">
                    <span className="stat-value">{topGenre !== 'なし' ? translateGenre(topGenre) : 'なし'}</span>
                    <span className="stat-label">最も見たジャンル</span>
                </div>
            </div>
        </div>
    );
}

export default StatsSection;
