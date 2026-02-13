import React from 'react';

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
                <div className="stat-icon">📚</div>
                <div className="stat-info">
                    <span className="stat-value">{totalAnime} 作品</span>
                    <span className="stat-label">登録作品数</span>
                </div>
            </div>
            <div className="stat-card">
                <div className="stat-icon">📺</div>
                <div className="stat-info">
                    <span className="stat-value">{totalEpisodes} 話</span>
                    <span className="stat-label">総エピソード</span>
                </div>
            </div>
            <div className="stat-card">
                <div className="stat-icon">❤️</div>
                <div className="stat-info">
                    <span className="stat-value">{topGenre}</span>
                    <span className="stat-label">最愛ジャンル</span>
                </div>
            </div>
        </div>
    );
}

export default StatsSection;
