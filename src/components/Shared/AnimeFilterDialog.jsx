import { useEffect, useMemo, useState } from 'react';
import { translateGenre, translateTag } from '../../constants/animeData';
import {
  FILTER_MATCH_MODE_OPTIONS,
  MIN_RATING_FILTER_OPTIONS,
  buildAppliedAnimeFilterChips,
  normalizeFilterMatchMode,
  normalizeMinRatingFilter,
} from '../../utils/animeFilters';
import useTagTranslationVersion from '../../hooks/useTagTranslationVersion';

const normalizeArray = (values) => (
  Array.isArray(values)
    ? values.filter((value, index, source) => source.indexOf(value) === index)
    : []
);

function AnimeFilterDialog({
  contextId = 'default',
  title = '絞り込み',
  triggerLabel = '絞り込む',
  emptySummaryText = '条件未設定',
  helperText = 'AND / OR はジャンルとタグの一致条件に適用されます。',
  staticNotice = '',
  applyLabel = '適用',
  appliedGenres = [],
  appliedTags = [],
  appliedYear = '',
  appliedSeasons = [],
  appliedMinRating = '',
  appliedMatchMode = 'and',
  availableGenres = [],
  availableTags = [],
  availableYears = [],
  availableSeasons = [],
  showGenres = true,
  showTags = true,
  showYear = true,
  showSeasons = false,
  showMinRating = false,
  requireYearSelection = false,
  disableYearSelection = false,
  disableSeasonSelection = false,
  isLoadingGenres = false,
  isLoadingTags = false,
  isLoadingSeasons = false,
  loadingGenresText = 'ジャンル候補を取得中です…',
  loadingTagsText = 'タグ候補を取得中です…',
  loadingSeasonsText = '放送時期候補を取得中です…',
  emptyGenresText = 'ジャンル情報がある作品はまだありません。',
  emptyTagsText = 'タグ情報がある作品はまだありません。',
  emptySeasonsText = '放送時期の情報がある作品はまだありません。',
  yearLabel = '放送年',
  yearPlaceholder = '指定なし',
  includeYearChip = true,
  includeSeasonChip = true,
  includeMinRatingChip = true,
  triggerDisabled = false,
  triggerTitle = '',
  toolbarSupplement = null,
  onApply,
  onClear,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [draftGenres, setDraftGenres] = useState(() => normalizeArray(appliedGenres));
  const [draftTags, setDraftTags] = useState(() => normalizeArray(appliedTags));
  const [draftYear, setDraftYear] = useState(() => (appliedYear ? String(appliedYear) : ''));
  const [draftSeasons, setDraftSeasons] = useState(() => normalizeArray(appliedSeasons));
  const [draftMinRating, setDraftMinRating] = useState(() => normalizeMinRatingFilter(appliedMinRating));
  const [draftMatchMode, setDraftMatchMode] = useState(() => normalizeFilterMatchMode(appliedMatchMode));
  const [draftError, setDraftError] = useState('');
  const tagTranslationVersion = useTagTranslationVersion();

  const appliedChips = useMemo(() => buildAppliedAnimeFilterChips({
    selectedGenres: appliedGenres,
    selectedTags: appliedTags,
    selectedYear: appliedYear,
    selectedSeasons: appliedSeasons,
    minRating: appliedMinRating,
    matchMode: appliedMatchMode,
  }, {
    availableSeasons,
    includeYearChip,
    includeSeasonChip,
    includeMinRatingChip,
  }), [
    appliedGenres,
    appliedTags,
    appliedYear,
    appliedSeasons,
    appliedMinRating,
    appliedMatchMode,
    availableSeasons,
    includeMinRatingChip,
    includeSeasonChip,
    includeYearChip,
    tagTranslationVersion,
  ]);

  const syncDraftFromApplied = () => {
    setDraftGenres(normalizeArray(appliedGenres));
    setDraftTags(normalizeArray(appliedTags));
    setDraftYear(appliedYear ? String(appliedYear) : '');
    setDraftSeasons(normalizeArray(appliedSeasons));
    setDraftMinRating(normalizeMinRatingFilter(appliedMinRating));
    setDraftMatchMode(normalizeFilterMatchMode(appliedMatchMode));
    setDraftError('');
  };

  useEffect(() => {
    if (!isOpen) return;
    syncDraftFromApplied();
  }, [isOpen, contextId]);

  useEffect(() => {
    if (!isOpen) return undefined;

    document.body.classList.add('filter-modal-open');

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.classList.remove('filter-modal-open');
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const toggleDraftValue = (setter, value) => {
    const normalizedValue = String(value || '').trim();
    if (!normalizedValue) return;
    setter((prev) => (
      prev.includes(normalizedValue)
        ? prev.filter((item) => item !== normalizedValue)
        : [...prev, normalizedValue]
    ));
  };

  const handleMatchModePress = (event, value) => {
    event.preventDefault();
    event.stopPropagation();
    setDraftMatchMode(value);
  };

  const handleOptionPress = (event, setter, value) => {
    event.preventDefault();
    event.stopPropagation();
    toggleDraftValue(setter, value);
  };

  const handleOpen = () => {
    if (triggerDisabled) return;
    syncDraftFromApplied();
    setIsOpen(true);
  };

  const handleApply = () => {
    if (showYear && requireYearSelection && !draftYear) {
      setDraftError(`${yearLabel}を選択してください。`);
      return;
    }

    const result = onApply?.({
      selectedGenres: draftGenres,
      selectedTags: draftTags,
      selectedYear: draftYear,
      selectedSeasons: draftSeasons,
      minRating: draftMinRating,
      matchMode: draftMatchMode,
    });
    if (result === false) return;
    setIsOpen(false);
  };

  const handleClear = () => {
    onClear?.();
    setDraftError('');
    setIsOpen(false);
  };

  const handleSummaryChipRemove = (chip) => {
    if (!chip?.removable || typeof onApply !== 'function') return;

    const nextFilters = {
      selectedGenres: normalizeArray(appliedGenres),
      selectedTags: normalizeArray(appliedTags),
      selectedYear: appliedYear ? String(appliedYear) : '',
      selectedSeasons: normalizeArray(appliedSeasons),
      minRating: normalizeMinRatingFilter(appliedMinRating),
      matchMode: normalizeFilterMatchMode(appliedMatchMode),
    };

    switch (chip.kind) {
      case 'genre':
        nextFilters.selectedGenres = nextFilters.selectedGenres.filter((genre) => genre !== chip.value);
        break;
      case 'tag':
        nextFilters.selectedTags = nextFilters.selectedTags.filter((tag) => tag !== chip.value);
        break;
      case 'year':
        nextFilters.selectedYear = '';
        break;
      case 'season':
        nextFilters.selectedSeasons = nextFilters.selectedSeasons.filter((season) => season !== chip.value);
        break;
      case 'rating':
        nextFilters.minRating = '';
        break;
      default:
        return;
    }

    const result = onApply(nextFilters);
    if (result === false) return;
  };

  const handleSummaryChipSwitch = (chip) => {
    if (!chip?.switchable || typeof onApply !== 'function') return;

    const nextFilters = {
      selectedGenres: normalizeArray(appliedGenres),
      selectedTags: normalizeArray(appliedTags),
      selectedYear: appliedYear ? String(appliedYear) : '',
      selectedSeasons: normalizeArray(appliedSeasons),
      minRating: normalizeMinRatingFilter(appliedMinRating),
      matchMode: normalizeFilterMatchMode(chip.switchValue),
    };

    const result = onApply(nextFilters);
    if (result === false) return;
  };

  const renderLoadingState = (label) => (
    <div className="anime-filter-loading-state" role="status" aria-live="polite">
      <div className="anime-filter-loading-inline">
        <span className="anime-filter-loading-spinner" aria-hidden="true" />
        <span className="anime-filter-loading-text">{label}</span>
      </div>
    </div>
  );

  return (
    <div className="anime-filter-panel">
      <div className={`anime-filter-toolbar ${toolbarSupplement ? 'has-toolbar-supplement' : ''}`.trim()}>
        <button
          type="button"
          className="anime-filter-open-button"
          onClick={handleOpen}
          aria-haspopup="dialog"
          aria-expanded={isOpen}
          disabled={triggerDisabled}
          title={triggerTitle || undefined}
        >
          {appliedChips.length > 0 ? `${triggerLabel} (${appliedChips.length})` : triggerLabel}
        </button>
        {toolbarSupplement}
        {appliedChips.length > 0 && typeof onClear === 'function' && (
          <button
            type="button"
            className="anime-filter-reset-button"
            onClick={onClear}
          >
            解除
          </button>
        )}
      </div>

      {appliedChips.length > 0 ? (
        <div className="anime-filter-summary-card" aria-label="適用中の絞り込み条件">
          <p className="anime-filter-summary-title">適用中の条件</p>
          <div className="anime-filter-summary-chips">
            {appliedChips.map((chip) => (
              <span
                key={chip.key}
                className={`anime-filter-summary-chip ${chip.kind || ''} ${chip.removable ? 'removable' : ''} ${chip.switchable ? 'switchable' : ''}`.trim()}
              >
                <span className="anime-filter-summary-chip-label">{chip.label}</span>
                {chip.switchable && (
                  <button
                    type="button"
                    className="anime-filter-summary-chip-switch"
                    onClick={() => handleSummaryChipSwitch(chip)}
                    aria-label={`一致条件を${chip.switchLabel}に切り替える`}
                  >
                    {chip.switchLabel}
                  </button>
                )}
                {chip.removable && (
                  <button
                    type="button"
                    className="anime-filter-summary-chip-remove"
                    onClick={() => handleSummaryChipRemove(chip)}
                    aria-label={`絞り込み条件「${chip.label}」を解除`}
                  >
                    ×
                  </button>
                )}
              </span>
            ))}
          </div>
        </div>
      ) : (
        <p className="anime-filter-empty-summary">{emptySummaryText}</p>
      )}

      {isOpen && (
        <div
          className="anime-filter-modal-backdrop"
          onClick={() => setIsOpen(false)}
        >
          <div
            className="anime-filter-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby={`anime-filter-title-${contextId}`}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="anime-filter-modal-header">
              <div>
                <h3 id={`anime-filter-title-${contextId}`} className="anime-filter-modal-title">
                  {title}
                </h3>
                <p className="anime-filter-modal-helper">{helperText}</p>
                {staticNotice && (
                  <p className="anime-filter-modal-static-note">{staticNotice}</p>
                )}
              </div>
              <button
                type="button"
                className="anime-filter-close-button"
                onClick={() => setIsOpen(false)}
                aria-label="絞り込みモーダルを閉じる"
              >
                ×
              </button>
            </div>

            <div className="anime-filter-modal-body">
              {(showGenres || showTags) && (
                <section className="anime-filter-section">
                  <div className="anime-filter-section-title">一致条件</div>
                  <div className="anime-filter-match-toggle" role="group" aria-label="一致条件の切り替え">
                    {FILTER_MATCH_MODE_OPTIONS.map((option) => {
                      const isActive = draftMatchMode === option.value;
                      return (
                        <button
                          key={option.value}
                          type="button"
                          className={`anime-filter-match-button ${isActive ? 'active' : ''}`}
                          onClick={(event) => handleMatchModePress(event, option.value)}
                          aria-pressed={isActive}
                        >
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                </section>
              )}

              {showYear && (
                <section className="anime-filter-section">
                  <label className="anime-filter-section-title" htmlFor={`anime-filter-year-${contextId}`}>
                    {yearLabel}
                  </label>
                  <select
                    id={`anime-filter-year-${contextId}`}
                    className="anime-filter-select"
                    value={draftYear}
                    onChange={(event) => setDraftYear(event.target.value)}
                    disabled={disableYearSelection}
                  >
                    <option value="" disabled={requireYearSelection}>
                      {requireYearSelection ? `${yearLabel}を選択してください` : yearPlaceholder}
                    </option>
                    {availableYears.map((year) => (
                      <option key={year} value={year}>
                        {year}年
                      </option>
                    ))}
                  </select>
                </section>
              )}

              {showMinRating && (
                <section className="anime-filter-section">
                  <label className="anime-filter-section-title" htmlFor={`anime-filter-rating-${contextId}`}>
                    最低評価
                  </label>
                  <select
                    id={`anime-filter-rating-${contextId}`}
                    className="anime-filter-select"
                    value={draftMinRating}
                    onChange={(event) => setDraftMinRating(event.target.value)}
                  >
                    {MIN_RATING_FILTER_OPTIONS.map((option) => (
                      <option key={option.value || 'all'} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </section>
              )}

              {showSeasons && (
                <section className="anime-filter-section">
                  <div className="anime-filter-section-title">放送時期</div>
                  {availableSeasons.length > 0 ? (
                    <div className="anime-filter-option-list">
                      {availableSeasons.map((season) => {
                        const isActive = draftSeasons.includes(season.key);
                        return (
                          <button
                            key={season.key}
                            type="button"
                            className={`anime-filter-chip-button ${isActive ? 'active' : ''}`}
                            onClick={(event) => handleOptionPress(event, setDraftSeasons, season.key)}
                            disabled={disableSeasonSelection}
                            aria-pressed={isActive}
                          >
                            {season.label}
                          </button>
                        );
                      })}
                    </div>
                  ) : isLoadingSeasons ? (
                    renderLoadingState(loadingSeasonsText)
                  ) : (
                    <p className="anime-filter-empty-text">{emptySeasonsText}</p>
                  )}
                </section>
              )}

              {showGenres && (
                <section className="anime-filter-section">
                  <div className="anime-filter-section-title">ジャンル</div>
                  {availableGenres.length > 0 ? (
                    <div className="anime-filter-option-list anime-filter-option-list-scroll">
                      {availableGenres.map((genre) => {
                        const isActive = draftGenres.includes(genre);
                        return (
                          <button
                            key={genre}
                            type="button"
                            className={`anime-filter-chip-button ${isActive ? 'active' : ''}`}
                            onClick={(event) => handleOptionPress(event, setDraftGenres, genre)}
                            aria-pressed={isActive}
                          >
                            {translateGenre(genre)}
                          </button>
                        );
                      })}
                    </div>
                  ) : isLoadingGenres ? (
                    renderLoadingState(loadingGenresText)
                  ) : (
                    <p className="anime-filter-empty-text">{emptyGenresText}</p>
                  )}
                </section>
              )}

              {showTags && (
                <section className="anime-filter-section">
                  <div className="anime-filter-section-title">タグ</div>
                  {availableTags.length > 0 ? (
                    <div className="anime-filter-option-list anime-filter-option-list-scroll">
                      {availableTags.map((tag) => {
                        const isActive = draftTags.includes(tag);
                        return (
                          <button
                            key={tag}
                            type="button"
                            className={`anime-filter-chip-button ${isActive ? 'active' : ''}`}
                            onClick={(event) => handleOptionPress(event, setDraftTags, tag)}
                            aria-pressed={isActive}
                            title={tag}
                          >
                            {translateTag(tag)}
                          </button>
                        );
                      })}
                    </div>
                  ) : isLoadingTags ? (
                    renderLoadingState(loadingTagsText)
                  ) : (
                    <p className="anime-filter-empty-text">{emptyTagsText}</p>
                  )}
                </section>
              )}

              {draftError && (
                <div className="anime-filter-error-message" role="alert">
                  {draftError}
                </div>
              )}
            </div>

            <div className="anime-filter-modal-footer">
              <button
                type="button"
                className="anime-filter-footer-button secondary"
                onClick={handleClear}
              >
                条件をクリア
              </button>
              <button
                type="button"
                className="anime-filter-footer-button primary"
                onClick={handleApply}
              >
                {applyLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AnimeFilterDialog;
