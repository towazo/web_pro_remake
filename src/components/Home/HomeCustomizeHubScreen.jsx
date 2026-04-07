function HomeCustomizeHubScreen({
  onOpenStatsCustomize,
  onOpenQuickActionsCustomize,
  onBackHome,
}) {
  return (
    <main className="home-customize-hub page-shell">
      <header className="home-customize-hub-header">
        <h2 className="page-main-title">ホーム設定</h2>
        <p className="page-main-subtitle">変更したい場所を選んでください。</p>
      </header>

      <div className="home-customize-hub-grid">
        <button type="button" className="home-customize-hub-card" onClick={onOpenStatsCustomize}>
          <span className="home-customize-hub-card-kicker">背景</span>
          <strong className="home-customize-hub-card-title">上部バナー背景</strong>
          <span className="home-customize-hub-card-text">
            登録作品数・総エピソード数・最も見たジャンルの背景を設定
          </span>
        </button>

        <button type="button" className="home-customize-hub-card" onClick={onOpenQuickActionsCustomize}>
          <span className="home-customize-hub-card-kicker">背景</span>
          <strong className="home-customize-hub-card-title">クイック操作背景</strong>
          <span className="home-customize-hub-card-text">
            マイリスト・ブックマーク・今季作品・来季作品の背景を設定
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
