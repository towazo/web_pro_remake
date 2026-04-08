function HomeCustomizeHubScreen({
  onOpenStatsCustomize,
  onOpenQuickActionsCustomize,
  onOpenFeaturedSliderCustomize,
  featuredSliderSourceLabel = 'マイリスト',
  onBackHome,
}) {
  return (
    <main className="home-customize-hub page-shell">
      <header className="home-customize-hub-header">
        <h2 className="page-main-title">ホーム設定</h2>
        <p className="page-main-subtitle">項目を選んでください。</p>
      </header>

      <div className="home-customize-hub-grid">
        <button
          type="button"
          className="home-customize-hub-card home-customize-hub-card-featured"
          onClick={onOpenFeaturedSliderCustomize}
        >
          <span className="home-customize-hub-card-kicker">スライド</span>
          <strong className="home-customize-hub-card-title">ホームスライド</strong>
          <span className="home-customize-hub-card-text">
            表示元を選ぶ
            <br />
            現在: {featuredSliderSourceLabel}
          </span>
        </button>

        <button type="button" className="home-customize-hub-card" onClick={onOpenStatsCustomize}>
          <span className="home-customize-hub-card-kicker">背景</span>
          <strong className="home-customize-hub-card-title">上部バナー</strong>
          <span className="home-customize-hub-card-text">
            上部の背景を変える
          </span>
        </button>

        <button type="button" className="home-customize-hub-card" onClick={onOpenQuickActionsCustomize}>
          <span className="home-customize-hub-card-kicker">背景</span>
          <strong className="home-customize-hub-card-title">クイック操作</strong>
          <span className="home-customize-hub-card-text">
            下の背景を変える
          </span>
        </button>
      </div>

      <div className="home-customize-hub-actions">
        <button type="button" className="home-customize-hub-back" onClick={onBackHome}>
          ホームに戻る
        </button>
      </div>
    </main>
  );
}

export default HomeCustomizeHubScreen;
