import {
  HOME_QUICK_ACTION_KEYS,
  sanitizeHomeQuickActionBackgrounds,
} from '../../utils/homeQuickActionBackgrounds';

const buildTileBackgroundStyle = (entry, variant) => {
  const image = typeof entry?.image === 'string' ? entry.image.trim() : '';
  if (!image) return undefined;

  const position = `${entry?.positionX ?? 50}% ${entry?.positionY ?? 50}%`;
  const overlay = variant === 'library'
    ? 'linear-gradient(180deg, rgba(24, 24, 24, 0.72) 0%, rgba(8, 8, 8, 0.8) 100%)'
    : 'linear-gradient(180deg, rgba(255, 255, 255, 0.62) 0%, rgba(236, 240, 245, 0.78) 100%)';

  return {
    backgroundImage: `${overlay}, url("${image}")`,
    backgroundPosition: `center center, ${position}`,
    backgroundSize: 'cover, cover',
    backgroundRepeat: 'no-repeat, no-repeat',
  };
};

function HomeQuickActionsSection({
  animeCount = 0,
  bookmarkCount = 0,
  backgrounds = null,
  onOpenMyList,
  onOpenBookmarks,
  onOpenCurrentSeason,
  onOpenNextSeason,
  onOpenShare,
  shareDisabled = false,
  title = 'クイック操作',
  showHeader = true,
  showShareShortcut = true,
  visibleTileKeys = null,
  isPreview = false,
}) {
  const normalizedBackgrounds = sanitizeHomeQuickActionBackgrounds(backgrounds);
  const visibleTileKeySet = Array.isArray(visibleTileKeys) && visibleTileKeys.length > 0
    ? new Set(visibleTileKeys)
    : null;
  const quickTiles = [
    {
      key: HOME_QUICK_ACTION_KEYS.myList,
      className: 'home-quick-tile home-quick-library-tile',
      ariaLabel: `マイリストを開く (${animeCount}件)`,
      label: 'マイリスト',
      count: animeCount,
      onClick: onOpenMyList,
      style: buildTileBackgroundStyle(normalizedBackgrounds[HOME_QUICK_ACTION_KEYS.myList], 'library'),
    },
    {
      key: HOME_QUICK_ACTION_KEYS.bookmarks,
      className: 'home-quick-tile home-quick-library-tile',
      ariaLabel: `ブックマークを開く (${bookmarkCount}件)`,
      label: 'ブックマーク',
      count: bookmarkCount,
      onClick: onOpenBookmarks,
      style: buildTileBackgroundStyle(normalizedBackgrounds[HOME_QUICK_ACTION_KEYS.bookmarks], 'library'),
    },
    {
      key: HOME_QUICK_ACTION_KEYS.currentSeason,
      className: 'home-quick-tile home-quick-add-tile',
      ariaLabel: '今季作品追加画面へ',
      title: '今季作品を追加',
      label: '今季作品を追加',
      onClick: onOpenCurrentSeason,
      style: buildTileBackgroundStyle(normalizedBackgrounds[HOME_QUICK_ACTION_KEYS.currentSeason], 'add'),
    },
    {
      key: HOME_QUICK_ACTION_KEYS.nextSeason,
      className: 'home-quick-tile home-quick-add-tile',
      ariaLabel: '来季作品追加画面へ',
      title: '来季作品を追加',
      label: '来季作品を追加',
      onClick: onOpenNextSeason,
      style: buildTileBackgroundStyle(normalizedBackgrounds[HOME_QUICK_ACTION_KEYS.nextSeason], 'add'),
    },
  ];
  const visibleTiles = visibleTileKeySet
    ? quickTiles.filter((tile) => visibleTileKeySet.has(tile.key))
    : quickTiles;

  return (
    <section
      className={`home-quick-actions${isPreview ? ' is-preview' : ''}${visibleTiles.length === 1 ? ' is-single-tile' : ''}`}
      aria-label="ホームのショートカット"
    >
      {showHeader && (
        <div className="home-quick-actions-header">
          <h2 className="home-quick-actions-title">{title}</h2>
        </div>
      )}

      <div className="home-quick-grid" role="group" aria-label="ホームの主要ショートカット">
        {visibleTiles.map((tile) => (
          <button
            key={tile.key}
            type="button"
            className={tile.className}
            onClick={tile.onClick}
            aria-label={tile.ariaLabel}
            title={tile.title}
            style={tile.style}
            tabIndex={isPreview ? -1 : undefined}
          >
            <span className="home-quick-tile-label">{tile.label}</span>
            {typeof tile.count === 'number' && (
              <span className="home-quick-tile-count">{tile.count}</span>
            )}
          </button>
        ))}
      </div>

      {showShareShortcut && (
        <div className="home-quick-share-row">
          <button
            type="button"
            className="home-share-shortcut page-action-button"
            onClick={onOpenShare}
            disabled={shareDisabled}
            tabIndex={isPreview ? -1 : undefined}
          >
            作品を共有
          </button>
        </div>
      )}
    </section>
  );
}

export default HomeQuickActionsSection;
