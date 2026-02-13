import { translateGenre } from '../../constants/animeData';

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
                <div className="card-meta">
                    {anime.seasonYear && <span className="meta-tag year">{anime.seasonYear}年</span>}
                    {anime.genres?.map((genre, idx) => (
                        <span key={idx} className="meta-tag genre">{translateGenre(genre)}</span>
                    ))}
                </div>
            </div>
        </div>
    );
}

export default AnimeCard;
