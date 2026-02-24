import React, { useEffect, useMemo, useRef, useState } from 'react';
import StatsSection from './StatsSection';
import {
  HOME_STATS_CARD_KEYS,
  createEmptyHomeStatsCardBackgrounds,
  sanitizeHomeStatsCardBackgrounds,
} from '../../utils/homeStatsBackgrounds';

const IMAGE_FILE_ACCEPT = 'image/*';
const MAX_INPUT_FILE_BYTES = 12 * 1024 * 1024;

const CARD_IMAGE_CONTROLS = [
  {
    key: HOME_STATS_CARD_KEYS.totalAnime,
    label: '登録作品数の背景画像を選択',
  },
  {
    key: HOME_STATS_CARD_KEYS.totalEpisodes,
    label: '総エピソード数の背景画像を選択',
  },
  {
    key: HOME_STATS_CARD_KEYS.topGenre,
    label: '最も見たジャンルの背景画像を選択',
  },
];

const convertImageFileToDataUrl = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => {
    const sourceDataUrl = typeof reader.result === 'string' ? reader.result : '';
    if (!sourceDataUrl) {
      reject(new Error('画像の読み込みに失敗しました。'));
      return;
    }

    const image = new Image();
    image.onload = () => {
      const sourceWidth = image.naturalWidth || image.width;
      const sourceHeight = image.naturalHeight || image.height;
      if (!sourceWidth || !sourceHeight) {
        resolve(sourceDataUrl);
        return;
      }

      const maxEdge = 1600;
      const scale = Math.min(1, maxEdge / Math.max(sourceWidth, sourceHeight));
      const targetWidth = Math.max(1, Math.round(sourceWidth * scale));
      const targetHeight = Math.max(1, Math.round(sourceHeight * scale));

      const canvas = document.createElement('canvas');
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const context = canvas.getContext('2d');
      if (!context) {
        resolve(sourceDataUrl);
        return;
      }

      context.drawImage(image, 0, 0, targetWidth, targetHeight);
      resolve(canvas.toDataURL('image/jpeg', 0.86));
    };
    image.onerror = () => reject(new Error('画像を読み込めませんでした。'));
    image.src = sourceDataUrl;
  };
  reader.onerror = () => reject(new Error('画像の読み込みに失敗しました。'));
  reader.readAsDataURL(file);
});

const clampPosition = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 50;
  return Math.min(100, Math.max(0, Math.round(parsed)));
};

const areSameBackgrounds = (a, b) => {
  const left = sanitizeHomeStatsCardBackgrounds(a);
  const right = sanitizeHomeStatsCardBackgrounds(b);
  return CARD_IMAGE_CONTROLS.every(({ key }) => (
    left[key].image === right[key].image
    && left[key].positionX === right[key].positionX
    && left[key].positionY === right[key].positionY
  ));
};

function HomeStatsCustomizeScreen({
  animeList = [],
  savedBackgrounds = null,
  onSave,
  onBackHome,
}) {
  const [draftBackgrounds, setDraftBackgrounds] = useState(() => sanitizeHomeStatsCardBackgrounds(savedBackgrounds));
  const [notice, setNotice] = useState({ type: '', message: '' });
  const [processingCardKey, setProcessingCardKey] = useState('');
  const fileInputRefs = useRef({});

  useEffect(() => {
    setDraftBackgrounds(sanitizeHomeStatsCardBackgrounds(savedBackgrounds));
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

  const openImagePicker = (cardKey) => {
    const inputElement = fileInputRefs.current[cardKey];
    if (!inputElement) return;
    inputElement.click();
  };

  const handlePickImage = async (cardKey, event) => {
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

    setProcessingCardKey(cardKey);
    try {
      const dataUrl = await convertImageFileToDataUrl(selectedFile);
      setDraftBackgrounds((prev) => {
        const current = prev[cardKey] || {};
        return {
          ...prev,
          [cardKey]: {
            image: dataUrl,
            positionX: clampPosition(current.positionX),
            positionY: clampPosition(current.positionY),
          },
        };
      });
      setNotice({ type: 'success', message: 'プレビューに反映しました。保存するとホームに適用されます。' });
    } catch (error) {
      setNotice({ type: 'error', message: error?.message || '画像の読み込みに失敗しました。' });
    } finally {
      setProcessingCardKey('');
    }
  };

  const handleClearSingleBackground = (cardKey) => {
    setDraftBackgrounds((prev) => ({
      ...prev,
      [cardKey]: {
        image: '',
        positionX: 50,
        positionY: 50,
      },
    }));
    setNotice({ type: 'success', message: '選択したカードの背景をリセットしました。' });
  };

  const handleChangeCardPosition = (cardKey, axis, value) => {
    const normalizedValue = clampPosition(value);
    setDraftBackgrounds((prev) => {
      const current = prev[cardKey] || {};
      return {
        ...prev,
        [cardKey]: {
          image: typeof current.image === 'string' ? current.image : '',
          positionX: axis === 'positionX' ? normalizedValue : clampPosition(current.positionX),
          positionY: axis === 'positionY' ? normalizedValue : clampPosition(current.positionY),
        },
      };
    });
  };

  const handleResetCardPosition = (cardKey) => {
    setDraftBackgrounds((prev) => {
      const current = prev[cardKey] || {};
      return {
        ...prev,
        [cardKey]: {
          image: typeof current.image === 'string' ? current.image : '',
          positionX: 50,
          positionY: 50,
        },
      };
    });
  };

  const handleResetAllBackgrounds = () => {
    setDraftBackgrounds(createEmptyHomeStatsCardBackgrounds());
    setNotice({ type: 'success', message: 'すべての背景を初期状態に戻しました。' });
  };

  const handleSave = () => {
    if (typeof onSave === 'function') {
      onSave(draftBackgrounds);
    }
    setNotice({ type: 'success', message: '背景設定を保存しました。' });
  };

  const handleBackHome = () => {
    if (isDirty) {
      const confirmed = window.confirm('未保存の変更があります。保存せずにホームへ戻りますか？');
      if (!confirmed) return;
    }
    onBackHome?.();
  };

  return (
    <main className="home-stats-customize-page page-shell">
      <header className="home-stats-customize-header">
        <h2 className="page-main-title">ホーム背景カスタマイズ</h2>
        <p className="home-stats-customize-subtitle">
          3つの統計カードごとに背景画像を設定できます。プレビューはその場で更新されます。
        </p>
      </header>

      <section className="home-stats-customize-preview" aria-label="ホーム統計カードのプレビュー">
        <h3 className="home-stats-customize-section-title">プレビュー</h3>
        <p className="home-stats-customize-section-note">ホーム画面の表示イメージに近い状態で確認できます。</p>
        <StatsSection animeList={animeList} cardBackgrounds={draftBackgrounds} />
      </section>

      <section className="home-stats-customize-controls" aria-label="背景画像の選択">
        <h3 className="home-stats-customize-section-title">背景画像を選択</h3>
        <div className="home-stats-customize-control-list">
          {CARD_IMAGE_CONTROLS.map(({ key, label }) => {
            const cardBackground = draftBackgrounds[key] || { image: '', positionX: 50, positionY: 50 };
            const hasBackground = Boolean(cardBackground.image);
            const isProcessing = processingCardKey === key;
            return (
              <div key={key} className="home-stats-customize-control-item">
                <p className="home-stats-customize-control-label">{label}</p>
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
                    このカードをリセット
                  </button>
                </div>
                <div className="home-stats-customize-position-controls">
                  <label className="home-stats-customize-position-label" htmlFor={`card-position-x-${key}`}>
                    表示位置（横）: {cardBackground.positionX}%
                  </label>
                  <input
                    id={`card-position-x-${key}`}
                    type="range"
                    min="0"
                    max="100"
                    step="1"
                    className="home-stats-customize-position-slider"
                    value={cardBackground.positionX}
                    onInput={(event) => handleChangeCardPosition(key, 'positionX', event.currentTarget.value)}
                    onChange={(event) => handleChangeCardPosition(key, 'positionX', event.target.value)}
                    disabled={!hasBackground || isProcessing}
                  />
                  <label className="home-stats-customize-position-label" htmlFor={`card-position-y-${key}`}>
                    表示位置（縦）: {cardBackground.positionY}%
                  </label>
                  <input
                    id={`card-position-y-${key}`}
                    type="range"
                    min="0"
                    max="100"
                    step="1"
                    className="home-stats-customize-position-slider"
                    value={cardBackground.positionY}
                    onInput={(event) => handleChangeCardPosition(key, 'positionY', event.currentTarget.value)}
                    onChange={(event) => handleChangeCardPosition(key, 'positionY', event.target.value)}
                    disabled={!hasBackground || isProcessing}
                  />
                  <button
                    type="button"
                    className="home-stats-customize-position-reset-button"
                    onClick={() => handleResetCardPosition(key)}
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
          ホームに戻る
        </button>
        <button type="button" className="home-stats-customize-reset-button" onClick={handleResetAllBackgrounds}>
          背景をリセット
        </button>
      </div>
    </main>
  );
}

export default HomeStatsCustomizeScreen;
