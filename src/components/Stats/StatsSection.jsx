import React from 'react';
import { translateGenre } from '../../constants/animeData';
import { HOME_STATS_CARD_KEYS, sanitizeHomeStatsCardBackgrounds } from '../../utils/homeStatsBackgrounds';

function StatIcon({ src, alt, fallback }) {
    const [hasError, setHasError] = React.useState(false);
    const resolvedSrc = `${import.meta.env.BASE_URL}${String(src || '').replace(/^\/+/, '')}`;
    React.useEffect(() => {
        setHasError(false);
    }, [resolvedSrc]);

    return (
        <div className="stat-icon">
            {hasError ? (
                <span className="stat-icon-fallback" aria-hidden="true">{fallback}</span>
            ) : (
                <img
                    src={resolvedSrc}
                    alt={alt}
                    loading="eager"
                    decoding="async"
                    onError={() => setHasError(true)}
                />
            )}
        </div>
    );
}

const buildCardBackgroundStyle = (backgroundUrl, positionX = 50, positionY = 50) => {
    if (typeof backgroundUrl !== 'string' || backgroundUrl.trim().length === 0) return undefined;
    const safeX = Number.isFinite(Number(positionX)) ? Number(positionX) : 50;
    const safeY = Number.isFinite(Number(positionY)) ? Number(positionY) : 50;
    return {
        backgroundImage: `url("${backgroundUrl.replace(/"/g, '%22')}")`,
        backgroundSize: 'cover',
        backgroundRepeat: 'no-repeat',
        backgroundPositionX: `${safeX}%`,
        backgroundPositionY: `${safeY}%`,
    };
};

function StatsSection({ animeList, cardBackgrounds = null }) {
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

    const normalizedBackgrounds = sanitizeHomeStatsCardBackgrounds(cardBackgrounds);
    const cards = [
        {
            key: HOME_STATS_CARD_KEYS.totalAnime,
            iconSrc: '/images/picture_1.png',
            iconAlt: 'Anime Count',
            iconFallback: '◎',
            value: `${totalAnime} 作品`,
            label: '登録作品数',
        },
        {
            key: HOME_STATS_CARD_KEYS.totalEpisodes,
            iconSrc: '/images/picture_2.png',
            iconAlt: 'Episodes Count',
            iconFallback: '▶',
            value: `${totalEpisodes} 話`,
            label: '総エピソード',
        },
        {
            key: HOME_STATS_CARD_KEYS.topGenre,
            iconSrc: '/images/picture_3.png',
            iconAlt: 'Top Genre',
            iconFallback: '★',
            value: topGenre !== 'なし' ? translateGenre(topGenre) : 'なし',
            label: '最も見たジャンル',
        },
    ];

    return (
        <div className="stats-container">
            {cards.map((card) => {
                const backgroundEntry = normalizedBackgrounds[card.key];
                const backgroundUrl = backgroundEntry?.image || '';
                const hasBackground = typeof backgroundUrl === 'string' && backgroundUrl.trim().length > 0;
                return (
                    <div
                        key={card.key}
                        className={`stat-card ${hasBackground ? 'has-background' : ''}`}
                        style={hasBackground
                            ? buildCardBackgroundStyle(backgroundUrl, backgroundEntry?.positionX, backgroundEntry?.positionY)
                            : undefined}
                    >
                        <StatIcon src={card.iconSrc} alt={card.iconAlt} fallback={card.iconFallback} />
                        <div className="stat-info">
                            <span className="stat-value">{card.value}</span>
                            <span className="stat-label">{card.label}</span>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

export default StatsSection;
