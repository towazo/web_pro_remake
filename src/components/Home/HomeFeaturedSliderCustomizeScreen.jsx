import {
  HOME_FEATURED_SLIDER_SOURCES,
  getHomeFeaturedSliderSourceLabel,
} from '../../utils/homeFeaturedSliderSource';

const FEATURED_SLIDER_SOURCE_OPTIONS = [
  {
    key: HOME_FEATURED_SLIDER_SOURCES.myList,
    title: 'マイリスト',
    description: '登録済みの作品から、今のスライダー仕様で重複なしシャッフルを行います。',
  },
  {
    key: HOME_FEATURED_SLIDER_SOURCES.currentSeason,
    title: '今季放送中',
    description: '今期に放送中の作品から、同じスライダー仕様で重複なしシャッフルを行います。',
  },
];

function HomeFeaturedSliderCustomizeScreen({
  selectedSource = HOME_FEATURED_SLIDER_SOURCES.myList,
  onChangeSource,
  currentSeasonLabel = '',
  isCurrentSeasonLoading = false,
  isCurrentSeasonUnavailable = false,
}) {
  const selectedSourceLabel = getHomeFeaturedSliderSourceLabel(selectedSource);

  return (
    <main className="home-stats-customize-page page-shell">
      <header className="home-stats-customize-header">
        <h2 className="page-main-title">ホームスライド設定</h2>
        <p className="home-stats-customize-subtitle">
          ホーム最上部のスライドで使う母体リストを選べます。切り替えるとホームへすぐ反映されます。
        </p>
      </header>

      <section className="home-stats-customize-controls home-featured-slider-source-panel" aria-label="スライド母体の設定">
        <h3 className="home-stats-customize-section-title">表示元リスト</h3>
        <p className="home-stats-customize-section-note">
          現在の設定: {selectedSourceLabel}
          {selectedSource === HOME_FEATURED_SLIDER_SOURCES.currentSeason && currentSeasonLabel
            ? ` (${currentSeasonLabel})`
            : ''}
        </p>

        <div className="home-featured-slider-source-list">
          {FEATURED_SLIDER_SOURCE_OPTIONS.map((option) => {
            const isActive = option.key === selectedSource;
            return (
              <button
                key={option.key}
                type="button"
                className={`home-featured-slider-source-card ${isActive ? 'active' : ''}`}
                onClick={() => onChangeSource?.(option.key)}
                aria-pressed={isActive}
              >
                <div className="home-featured-slider-source-copy">
                  <span className="home-featured-slider-source-chip">
                    {isActive ? '選択中' : '切替'}
                  </span>
                  <strong className="home-featured-slider-source-title">{option.title}</strong>
                  <span className="home-featured-slider-source-text">
                    {option.key === HOME_FEATURED_SLIDER_SOURCES.currentSeason && currentSeasonLabel
                      ? `${currentSeasonLabel}の作品を対象にします。 ${option.description}`
                      : option.description}
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        {selectedSource === HOME_FEATURED_SLIDER_SOURCES.currentSeason && isCurrentSeasonLoading && (
          <div className="home-featured-slider-source-note" role="status" aria-live="polite">
            今季放送中の一覧を読み込み中です。反映まで少し待つ場合があります。
          </div>
        )}

        {selectedSource === HOME_FEATURED_SLIDER_SOURCES.currentSeason && isCurrentSeasonUnavailable && !isCurrentSeasonLoading && (
          <div className="home-featured-slider-source-note warning" role="status" aria-live="polite">
            今季放送中の一覧を取得できなかったため、スライドを表示できません。時間を置いて再度お試しください。
          </div>
        )}
      </section>

    </main>
  );
}

export default HomeFeaturedSliderCustomizeScreen;
