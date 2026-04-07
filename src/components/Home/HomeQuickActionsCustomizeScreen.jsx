import { useEffect, useMemo, useRef, useState } from 'react';
import HomeQuickActionsSection from './HomeQuickActionsSection';
import {
  HOME_QUICK_ACTION_KEYS,
  HOME_QUICK_ACTION_OVERLAY_TONES,
  createEmptyHomeQuickActionBackgrounds,
  getDefaultHomeQuickActionOverlayTone,
  sanitizeHomeQuickActionBackgrounds,
} from '../../utils/homeQuickActionBackgrounds';
import {
  IMAGE_FILE_ACCEPT,
  MAX_INPUT_FILE_BYTES,
  clampBackgroundPosition,
  convertImageFileToDataUrl,
} from '../../utils/backgroundImageTools';

const TILE_IMAGE_CONTROLS = [
  {
    key: HOME_QUICK_ACTION_KEYS.myList,
    label: 'マイリストの背景画像',
    note: 'プレビューをタップするとオーバーレイが黒/白で切り替わります。初期値は黒です。',
  },
  {
    key: HOME_QUICK_ACTION_KEYS.bookmarks,
    label: 'ブックマークの背景画像',
    note: 'プレビューをタップするとオーバーレイが黒/白で切り替わります。初期値は黒です。',
  },
  {
    key: HOME_QUICK_ACTION_KEYS.currentSeason,
    label: '今季作品の背景画像',
    note: 'プレビューをタップするとオーバーレイが黒/白で切り替わります。初期値は白です。',
  },
  {
    key: HOME_QUICK_ACTION_KEYS.nextSeason,
    label: '来季作品の背景画像',
    note: 'プレビューをタップするとオーバーレイが黒/白で切り替わります。初期値は白です。',
  },
];

const areSameBackgrounds = (a, b) => {
  const left = sanitizeHomeQuickActionBackgrounds(a);
  const right = sanitizeHomeQuickActionBackgrounds(b);
  return TILE_IMAGE_CONTROLS.every(({ key }) => (
    left[key].image === right[key].image
    && left[key].positionX === right[key].positionX
    && left[key].positionY === right[key].positionY
    && left[key].overlayTone === right[key].overlayTone
  ));
};

function HomeQuickActionsCustomizeScreen({
  animeCount = 0,
  bookmarkCount = 0,
  savedBackgrounds = null,
  onSave,
  onBackHome,
  backButtonLabel = '設定に戻る',
}) {
  const [draftBackgrounds, setDraftBackgrounds] = useState(() => sanitizeHomeQuickActionBackgrounds(savedBackgrounds));
  const [notice, setNotice] = useState({ type: '', message: '' });
  const [processingTileKey, setProcessingTileKey] = useState('');
  const fileInputRefs = useRef({});

  useEffect(() => {
    setDraftBackgrounds(sanitizeHomeQuickActionBackgrounds(savedBackgrounds));
  }, [savedBackgrounds]);

  useEffect(() => {
    if (!notice.message) return;
    const timer = setTimeout(() => {
      setNotice({ type: '', message: '' });
    }, 2400);
    return () => clearTimeout(timer);
  }, [notice]);

  const isDirty = useMemo(
    () => !areSameBackgrounds(draftBackgrounds, savedBackgrounds),
    [draftBackgrounds, savedBackgrounds]
  );

  const openImagePicker = (tileKey) => {
    const inputElement = fileInputRefs.current[tileKey];
    if (!inputElement) return;
    inputElement.click();
  };

  const handlePickImage = async (tileKey, event) => {
    const selectedFile = event.target.files?.[0];
    event.target.value = '';
    if (!selectedFile) return;

    if (!selectedFile.type.startsWith('image/')) {
      setNotice({ type: 'error', message: '画像ファイル（jpg/png/webpなど）を選択してください。' });
      return;
    }

    if (selectedFile.size > MAX_INPUT_FILE_BYTES) {
      setNotice({ type: 'error', message: '画像サイズが大きすぎます。12MB以下の画像を選択してください。' });
      return;
    }

    setProcessingTileKey(tileKey);
    try {
      const dataUrl = await convertImageFileToDataUrl(selectedFile);
      setDraftBackgrounds((prev) => {
        const current = prev[tileKey] || {};
        return {
          ...prev,
          [tileKey]: {
            image: dataUrl,
            positionX: clampBackgroundPosition(current.positionX),
            positionY: clampBackgroundPosition(current.positionY),
            overlayTone: current.overlayTone || getDefaultHomeQuickActionOverlayTone(tileKey),
          },
        };
      });
      setNotice({ type: 'success', message: 'プレビューに反映しました。保存するとホームに適用されます。' });
    } catch (error) {
      setNotice({ type: 'error', message: error?.message || '画像の読み込みに失敗しました。' });
    } finally {
      setProcessingTileKey('');
    }
  };

  const handleClearSingleBackground = (tileKey) => {
    setDraftBackgrounds((prev) => ({
      ...prev,
      [tileKey]: {
        image: '',
        positionX: 50,
        positionY: 50,
        overlayTone: prev[tileKey]?.overlayTone || getDefaultHomeQuickActionOverlayTone(tileKey),
      },
    }));
    setNotice({ type: 'success', message: '選択した背景をリセットしました。' });
  };

  const handleChangeTileOverlayTone = (tileKey, overlayTone) => {
    setDraftBackgrounds((prev) => {
      const current = prev[tileKey] || {};
      return {
        ...prev,
        [tileKey]: {
          image: typeof current.image === 'string' ? current.image : '',
          positionX: clampBackgroundPosition(current.positionX),
          positionY: clampBackgroundPosition(current.positionY),
          overlayTone,
        },
      };
    });
  };

  const handleToggleTileOverlayTone = (tileKey) => {
    const currentOverlayTone = draftBackgrounds?.[tileKey]?.overlayTone || getDefaultHomeQuickActionOverlayTone(tileKey);
    const nextOverlayTone = currentOverlayTone === HOME_QUICK_ACTION_OVERLAY_TONES.dark
      ? HOME_QUICK_ACTION_OVERLAY_TONES.light
      : HOME_QUICK_ACTION_OVERLAY_TONES.dark;
    handleChangeTileOverlayTone(tileKey, nextOverlayTone);
  };

  const handleChangeTilePosition = (tileKey, axis, value) => {
    const normalizedValue = clampBackgroundPosition(value);
    setDraftBackgrounds((prev) => {
      const current = prev[tileKey] || {};
      return {
        ...prev,
        [tileKey]: {
          image: typeof current.image === 'string' ? current.image : '',
          positionX: axis === 'positionX' ? normalizedValue : clampBackgroundPosition(current.positionX),
          positionY: axis === 'positionY' ? normalizedValue : clampBackgroundPosition(current.positionY),
          overlayTone: current.overlayTone || getDefaultHomeQuickActionOverlayTone(tileKey),
        },
      };
    });
  };

  const handleResetTilePosition = (tileKey) => {
    setDraftBackgrounds((prev) => {
      const current = prev[tileKey] || {};
      return {
        ...prev,
        [tileKey]: {
          image: typeof current.image === 'string' ? current.image : '',
          positionX: 50,
          positionY: 50,
          overlayTone: current.overlayTone || getDefaultHomeQuickActionOverlayTone(tileKey),
        },
      };
    });
  };

  const handleResetAllBackgrounds = () => {
    setDraftBackgrounds(createEmptyHomeQuickActionBackgrounds());
    setNotice({ type: 'success', message: 'クイック操作の背景を初期状態に戻しました。' });
  };

  const handleSave = () => {
    if (typeof onSave === 'function') {
      onSave(draftBackgrounds);
    }
    setNotice({ type: 'success', message: 'クイック操作の背景設定を保存しました。' });
  };

  const handleBackHome = () => {
    if (isDirty) {
      const confirmed = window.confirm('未保存の変更があります。保存せずに設定一覧へ戻りますか？');
      if (!confirmed) return;
    }
    onBackHome?.();
  };

  return (
    <main className="home-stats-customize-page page-shell">
      <header className="home-stats-customize-header">
        <h2 className="page-main-title">クイック操作背景カスタマイズ</h2>
        <p className="home-stats-customize-subtitle">
          4つのショートカットごとに背景画像を設定できます。プレビューのボタンをタップするとオーバーレイ色が切り替わります。
        </p>
      </header>

      <section className="home-stats-customize-preview home-stats-customize-preview-summary" aria-label="クイック操作のプレビュー">
        <h3 className="home-stats-customize-section-title">プレビュー</h3>
        <p className="home-stats-customize-section-note">
          各プレビューのボタンをタップすると、黒と白のオーバーレイを切り替えられます。
        </p>
        <div className="home-stats-customize-preview-frame home-quick-actions-customize-preview-frame">
          <HomeQuickActionsSection
            animeCount={animeCount}
            bookmarkCount={bookmarkCount}
            backgrounds={draftBackgrounds}
            title="クイック操作プレビュー"
            isPreview
            isInteractivePreview
            onOpenMyList={() => handleToggleTileOverlayTone(HOME_QUICK_ACTION_KEYS.myList)}
            onOpenBookmarks={() => handleToggleTileOverlayTone(HOME_QUICK_ACTION_KEYS.bookmarks)}
            onOpenCurrentSeason={() => handleToggleTileOverlayTone(HOME_QUICK_ACTION_KEYS.currentSeason)}
            onOpenNextSeason={() => handleToggleTileOverlayTone(HOME_QUICK_ACTION_KEYS.nextSeason)}
          />
        </div>
      </section>

      <div className="home-stats-customize-editor">
        <section className="home-stats-customize-controls" aria-label="クイック操作背景の選択">
          <h3 className="home-stats-customize-section-title">背景画像を選択</h3>
          <div className="home-stats-customize-control-list">
            {TILE_IMAGE_CONTROLS.map(({ key, label, note }) => {
              const tileBackground = draftBackgrounds[key] || {
                image: '',
                positionX: 50,
                positionY: 50,
                overlayTone: getDefaultHomeQuickActionOverlayTone(key),
              };
              const hasBackground = Boolean(tileBackground.image);
              const isProcessing = processingTileKey === key;
              return (
                <div key={key} className="home-stats-customize-control-item">
                  <div className="home-stats-customize-control-copy">
                    <p className="home-stats-customize-control-label">{label}</p>
                    <p className="home-stats-customize-control-note">{note}</p>
                  </div>
                  <div className="home-stats-customize-inline-preview" aria-hidden="true">
                    <HomeQuickActionsSection
                      animeCount={animeCount}
                      bookmarkCount={bookmarkCount}
                      backgrounds={draftBackgrounds}
                      visibleTileKeys={[key]}
                      showHeader={false}
                      showShareShortcut={false}
                      isPreview
                      isInteractivePreview
                      onOpenMyList={() => handleToggleTileOverlayTone(key)}
                      onOpenBookmarks={() => handleToggleTileOverlayTone(key)}
                      onOpenCurrentSeason={() => handleToggleTileOverlayTone(key)}
                      onOpenNextSeason={() => handleToggleTileOverlayTone(key)}
                    />
                  </div>
                  <div className="home-stats-customize-control-buttons">
                    <button
                      type="button"
                      className="home-stats-customize-pick-button"
                      onClick={() => openImagePicker(key)}
                      disabled={isProcessing}
                    >
                      {isProcessing ? '処理中...' : '画像を選択'}
                    </button>
                    <button
                      type="button"
                      className="home-stats-customize-clear-button"
                      onClick={() => handleClearSingleBackground(key)}
                      disabled={!hasBackground || isProcessing}
                    >
                      この背景をリセット
                    </button>
                  </div>
                  <div className="home-stats-customize-position-controls">
                    <label className="home-stats-customize-position-label" htmlFor={`quick-tile-position-x-${key}`}>
                      表示位置（横）: {tileBackground.positionX}%
                    </label>
                    <input
                      id={`quick-tile-position-x-${key}`}
                      type="range"
                      min="0"
                      max="100"
                      step="1"
                      className="home-stats-customize-position-slider"
                      value={tileBackground.positionX}
                      onInput={(event) => handleChangeTilePosition(key, 'positionX', event.currentTarget.value)}
                      onChange={(event) => handleChangeTilePosition(key, 'positionX', event.target.value)}
                      disabled={!hasBackground || isProcessing}
                    />
                    <label className="home-stats-customize-position-label" htmlFor={`quick-tile-position-y-${key}`}>
                      表示位置（縦）: {tileBackground.positionY}%
                    </label>
                    <input
                      id={`quick-tile-position-y-${key}`}
                      type="range"
                      min="0"
                      max="100"
                      step="1"
                      className="home-stats-customize-position-slider"
                      value={tileBackground.positionY}
                      onInput={(event) => handleChangeTilePosition(key, 'positionY', event.currentTarget.value)}
                      onChange={(event) => handleChangeTilePosition(key, 'positionY', event.target.value)}
                      disabled={!hasBackground || isProcessing}
                    />
                    <button
                      type="button"
                      className="home-stats-customize-position-reset-button"
                      onClick={() => handleResetTilePosition(key)}
                      disabled={!hasBackground || isProcessing}
                    >
                      表示位置を中央に戻す
                    </button>
                  </div>
                  <input
                    ref={(element) => {
                      fileInputRefs.current[key] = element;
                    }}
                    type="file"
                    accept={IMAGE_FILE_ACCEPT}
                    className="home-stats-customize-file-input"
                    onChange={(event) => handlePickImage(key, event)}
                  />
                </div>
              );
            })}
          </div>
        </section>

        {notice.message && (
          <div className={`home-stats-customize-notice ${notice.type}`}>
            {notice.message}
          </div>
        )}

        <div className="home-stats-customize-actions">
          <button
            type="button"
            className="home-stats-customize-save-button"
            onClick={handleSave}
            disabled={!isDirty}
          >
            保存
          </button>
          <button type="button" className="home-stats-customize-back-button" onClick={handleBackHome}>
            {backButtonLabel}
          </button>
          <button type="button" className="home-stats-customize-reset-button" onClick={handleResetAllBackgrounds}>
            背景をリセット
          </button>
        </div>
      </div>
    </main>
  );
}

export default HomeQuickActionsCustomizeScreen;
