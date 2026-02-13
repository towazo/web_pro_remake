import React from 'react';

function AnimeCard({ anime, onRemove }) {
    return (
        <div className="anime-card">
            <div className="card-image-wrapper">
                <img
                    src={anime.coverImage.large}
                    alt={anime.title.native}
                    loading="lazy"
                />
                <div className="episodes-badge">{anime.episodes || '?'} 話</div>
                <button
                    className="delete-button"
                    onClick={(e) => {
                        e.stopPropagation();
                        if (window.confirm(`「${anime.title.native || anime.title.romaji}」を削除しますか？`)) {
                            onRemove(anime.id);
                        }
                    }}
                    title="削除"
                >
                    ×
                </button>
            </div>
            <div className="card-info">
                <h3>{anime.title.native || anime.title.romaji}</h3>
                <p className="card-meta">
                    {anime.seasonYear} {anime.genres?.[0]}
                </p>
            </div>
        </div>
    );
}

export default AnimeCard;
