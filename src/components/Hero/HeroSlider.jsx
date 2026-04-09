import React, { useState, useEffect, useCallback, useRef } from 'react';
import Hero from './Hero';
import AudioToggleButton from '../Shared/AudioToggleButton';

const MAX_DOT_INDICATORS = 8;
const INITIAL_BUFFER_SIZE = 10;
const BUFFER_REPLENISH_THRESHOLD = 5;
const TIMELINE_HANDLE_EDGE_OFFSET_PX = 7;

function RestartIcon() {
    return (
        <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
            className="slider-refresh-icon"
        >
            <path
                d="M3 8V3H8"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
            <path
                d="M4.5 15A8 8 0 1 0 7 5.5L3 8"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    );
}

function HeroSliderLoading() {
    return (
        <div className="hero-slider-shell hero-slider-shell-loading" aria-busy="true" aria-live="polite">
            <div className="hero-slider-container hero-slider-loading-container">
                <div className="hero-slider-loading-layout">
                    <div className="hero-slider-loading-copy">
                        <span className="hero-slider-loading-chip hero-slider-loading-block" />
                        <span className="hero-slider-loading-title hero-slider-loading-block" />
                        <span className="hero-slider-loading-meta hero-slider-loading-block" />
                        <span className="hero-slider-loading-text hero-slider-loading-block" />
                        <span className="hero-slider-loading-text short hero-slider-loading-block" />
                    </div>
                    <div className="hero-slider-loading-media hero-slider-loading-block" />
                </div>
            </div>

            <div className="hero-slider-toolbar hero-slider-toolbar-loading" role="status">
                <div className="hero-slider-loading-toolbar-box hero-slider-loading-block" />
                <span className="hero-slider-loading-message">スライドを読み込み中…</span>
            </div>
        </div>
    );
}

function HeroSlider({
    slides,
    sourceType = '',
    myListIdSet = null,
    bookmarkIdSet = null,
    onAddAnime,
    onRemoveAnime,
    onToggleBookmark,
    onRefresh,
    onCycleComplete,
    showRefreshButton = false,
    isRefreshing = false,
    isLoading = false,
}) {
    const totalSlides = Array.isArray(slides) ? slides.length : 0;
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isPreviewMuted, setIsPreviewMuted] = useState(true);
    const [hasUnlockedPreviewAudio, setHasUnlockedPreviewAudio] = useState(false);
    const [previewMutedChangeToken, setPreviewMutedChangeToken] = useState(0);
    const [activePreviewMuted, setActivePreviewMuted] = useState(true);
    const [activePreviewAudioAvailable, setActivePreviewAudioAvailable] = useState(false);
    const [activePreviewPlaybackStarted, setActivePreviewPlaybackStarted] = useState(false);
    const [lastViewedAnime, setLastViewedAnime] = useState(null);
    const [currentSlideRestartToken, setCurrentSlideRestartToken] = useState(0);
    const timelineRef = useRef(null);
    const progressFillRef = useRef(null);
    const progressHandleRef = useRef(null);
    const activeHeroRef = useRef(null);
    const activeSlideAnimeRef = useRef(null);
    const slideSessionKeyRef = useRef('');
    const timelineDragCleanupRef = useRef(null);
    const isTimelineScrubbingRef = useRef(false);
    const currentProgressRef = useRef(0);
    const touchStartRef = useRef(null);
    const touchEndRef = useRef(null);
    const suppressSwipeUntilRef = useRef(0);
    const slideIdentityKey = Array.isArray(slides)
        ? slides.map((anime, index) => String(anime?.uniqueId || anime?.id || index)).join('|')
        : '';
    const getSlideKey = (anime, index) => String(anime?.uniqueId || anime?.id || index);
    const getSlideDistance = (fromIndex, toIndex) => Math.abs(fromIndex - toIndex);
    const isLikelyMobileAutoplayEnvironment = () => (
        typeof window !== 'undefined'
        && typeof window.matchMedia === 'function'
        && (
            window.matchMedia('(pointer: coarse)').matches
            || window.matchMedia('(max-width: 768px)').matches
        )
    );
    const isMobileAutoplayEnvironment = isLikelyMobileAutoplayEnvironment();

    // Reset index when slides change
    useEffect(() => {
        setCurrentIndex(0);
    }, [slideIdentityKey]);

    useEffect(() => {
        setCurrentSlideRestartToken(0);
    }, [currentIndex, slideIdentityKey]);

    useEffect(() => {
        const sessionKey = `${sourceType}:${slideIdentityKey}`;
        const currentAnime = Array.isArray(slides) ? (slides[currentIndex] || null) : null;

        if (slideSessionKeyRef.current !== sessionKey) {
            slideSessionKeyRef.current = sessionKey;
            activeSlideAnimeRef.current = currentAnime;
            setLastViewedAnime(null);
            return;
        }

        const previousAnime = activeSlideAnimeRef.current;
        if (
            previousAnime
            && currentAnime
            && Number(previousAnime?.id) !== Number(currentAnime?.id)
        ) {
            setLastViewedAnime(previousAnime);
        }
        activeSlideAnimeRef.current = currentAnime;
    }, [currentIndex, slideIdentityKey, slides, sourceType]);

    useEffect(() => {
        if (!isMobileAutoplayEnvironment) return;
        setIsPreviewMuted(true);
        setHasUnlockedPreviewAudio(false);
        setPreviewMutedChangeToken((prev) => prev + 1);
    }, [isMobileAutoplayEnvironment, slideIdentityKey]);

    useEffect(() => {
        setActivePreviewMuted(true);
        setActivePreviewAudioAvailable(false);
        setActivePreviewPlaybackStarted(false);
        currentProgressRef.current = 0;
        if (progressFillRef.current) {
            progressFillRef.current.style.transform = 'translateY(-50%) scaleX(0)';
        }
        if (progressHandleRef.current) {
            progressHandleRef.current.style.left = `${TIMELINE_HANDLE_EDGE_OFFSET_PX}px`;
        }
    }, [currentIndex, slideIdentityKey]);

    const syncTimelineProgress = useCallback((value) => {
        const normalizedValue = Math.min(1, Math.max(0, Number(value) || 0));
        currentProgressRef.current = normalizedValue;
        if (progressFillRef.current) {
            progressFillRef.current.style.transform = `translateY(-50%) scaleX(${normalizedValue})`;
        }
        if (progressHandleRef.current) {
            progressHandleRef.current.style.left = `clamp(${TIMELINE_HANDLE_EDGE_OFFSET_PX}px, ${normalizedValue * 100}%, calc(100% - ${TIMELINE_HANDLE_EDGE_OFFSET_PX}px))`;
        }
    }, []);

    const handleSlideProgressChange = useCallback((value) => {
        if (isTimelineScrubbingRef.current) return;
        syncTimelineProgress(value);
    }, [syncTimelineProgress]);

    useEffect(() => () => {
        timelineDragCleanupRef.current?.();
    }, []);

    const resetMobilePreviewAudioForNextSlide = useCallback(() => {
        if (!isLikelyMobileAutoplayEnvironment()) return;
        setIsPreviewMuted(true);
        setHasUnlockedPreviewAudio(false);
        setPreviewMutedChangeToken((prev) => prev + 1);
    }, []);

    const nextSlide = useCallback(() => {
        if (totalSlides <= 1) return;
        resetMobilePreviewAudioForNextSlide();
        const nextIndex = currentIndex + 1;
        if (nextIndex < totalSlides) {
            setCurrentIndex(nextIndex);
            return;
        }

        if (typeof onCycleComplete === 'function') {
            onCycleComplete(slides[currentIndex]);
            return;
        }

        setCurrentIndex(0);
    }, [currentIndex, onCycleComplete, resetMobilePreviewAudioForNextSlide, slides, totalSlides]);

    const prevSlide = useCallback(() => {
        if (totalSlides <= 1) return;
        resetMobilePreviewAudioForNextSlide();
        if (currentIndex === 0) {
            setCurrentIndex(totalSlides - 1);
            return;
        }

        setCurrentIndex((prev) => prev - 1);
    }, [currentIndex, resetMobilePreviewAudioForNextSlide, totalSlides]);

    const clearSwipeGesture = useCallback(() => {
        touchStartRef.current = null;
        touchEndRef.current = null;
    }, []);

    const suppressSwipeGesture = useCallback((durationMs = 220) => {
        const now = window.performance?.now?.() ?? Date.now();
        suppressSwipeUntilRef.current = now + durationMs;
        clearSwipeGesture();
    }, [clearSwipeGesture]);

    const shouldIgnoreSwipeGesture = useCallback((eventTarget = null) => {
        const now = window.performance?.now?.() ?? Date.now();
        return (
            isTimelineScrubbingRef.current
            || suppressSwipeUntilRef.current > now
            || Boolean(eventTarget && timelineRef.current?.contains(eventTarget))
        );
    }, []);

    // the required distance between touchStart and touchEnd to be detected as a swipe
    const minSwipeDistance = 50;

    const onTouchStart = (e) => {
        if (shouldIgnoreSwipeGesture(e.target)) {
            clearSwipeGesture();
            return;
        }
        touchEndRef.current = null;
        touchStartRef.current = e.targetTouches[0].clientX;
    };

    const onTouchMove = (e) => {
        if (shouldIgnoreSwipeGesture(e.target)) {
            clearSwipeGesture();
            return;
        }
        touchEndRef.current = e.targetTouches[0].clientX;
    };

    const onTouchEnd = () => {
        if (shouldIgnoreSwipeGesture()) {
            clearSwipeGesture();
            return;
        }
        const touchStart = touchStartRef.current;
        const touchEnd = touchEndRef.current;
        clearSwipeGesture();
        if (touchStart == null || touchEnd == null) return;
        const distance = touchStart - touchEnd;
        const isLeftSwipe = distance > minSwipeDistance;
        const isRightSwipe = distance < -minSwipeDistance;
        if (isLeftSwipe) {
            nextSlide();
        } else if (isRightSwipe) {
            prevSlide();
        }
    };

    const handleRestartCurrentSlide = () => {
        if (totalSlides === 0) return;
        resetMobilePreviewAudioForNextSlide();
        syncTimelineProgress(0);
        setCurrentSlideRestartToken((prev) => prev + 1);
    };

    const handleTogglePreviewMuted = () => {
        if (isPreviewMuted) {
            setHasUnlockedPreviewAudio(true);
        }
        setIsPreviewMuted((prev) => !prev);
        setPreviewMutedChangeToken((prev) => prev + 1);
    };

    const handleRetryPreviewUnmute = () => {
        setHasUnlockedPreviewAudio(true);
        setPreviewMutedChangeToken((prev) => prev + 1);
    };

    const handleSliderAudioToggle = () => {
        if (activePreviewAudioAvailable && activePreviewMuted && !isPreviewMuted) {
            handleRetryPreviewUnmute();
            return;
        }

        handleTogglePreviewMuted();
    };

    const shouldShowDots = totalSlides <= MAX_DOT_INDICATORS;
    const bufferStartIndex = Math.floor(currentIndex / BUFFER_REPLENISH_THRESHOLD) * BUFFER_REPLENISH_THRESHOLD;
    const bufferEndIndex = Math.min(totalSlides, bufferStartIndex + INITIAL_BUFFER_SIZE);
    const bufferedSlides = slides.slice(bufferStartIndex, bufferEndIndex);
    const isCurrentSeasonSlider = String(sourceType || '').startsWith('current-season');
    const numericLastViewedAnimeId = Number(lastViewedAnime?.id);
    const isLastViewedAnimeInMyList = Number.isFinite(numericLastViewedAnimeId)
        && myListIdSet instanceof Set
        && myListIdSet.has(numericLastViewedAnimeId);
    const isLastViewedAnimeBookmarked = Number.isFinite(numericLastViewedAnimeId)
        && bookmarkIdSet instanceof Set
        && bookmarkIdSet.has(numericLastViewedAnimeId);
    const canAddLastViewedAnimeToMyList = Boolean(lastViewedAnime)
        && (
            (isLastViewedAnimeInMyList && typeof onRemoveAnime === 'function')
            || (!isLastViewedAnimeInMyList && typeof onAddAnime === 'function')
        );
    const canBookmarkLastViewedAnime = Boolean(lastViewedAnime)
        && !isLastViewedAnimeInMyList
        && typeof onToggleBookmark === 'function';
    const sliderAudioStatusText = isPreviewMuted
        ? '音声設定はオフです'
        : '音声設定はオンです';
    const isSliderAudioToggleDisabled = activePreviewAudioAvailable && !activePreviewPlaybackStarted;
    const previousSlideStatusText = !lastViewedAnime
        ? 'まだありません'
        : isLastViewedAnimeInMyList
            ? 'マイリスト追加済み'
            : isLastViewedAnimeBookmarked
                ? 'ブックマーク済み'
                : '追加先を選ぶ';
    const previousSlideTitle = lastViewedAnime?.title?.native
        || lastViewedAnime?.title?.romaji
        || lastViewedAnime?.title?.english
        || '前の作品';
    const previousSlideImage = lastViewedAnime?.coverImage?.large
        || lastViewedAnime?.coverImage?.extraLarge
        || '';
    const myListActionLabel = isLastViewedAnimeInMyList ? '取消' : 'マイリスト';
    const bookmarkActionLabel = isLastViewedAnimeBookmarked ? '解除' : 'ブックマーク';
    const handleGoToSlide = (index) => {
        if (index === currentIndex) return;
        resetMobilePreviewAudioForNextSlide();
        setCurrentIndex(index);
    };
    const handleAddLastViewedAnimeToMyList = () => {
        if (!canAddLastViewedAnimeToMyList) return;
        if (isLastViewedAnimeInMyList) {
            onRemoveAnime(lastViewedAnime.id);
            return;
        }
        onAddAnime(lastViewedAnime);
    };
    const handleBookmarkLastViewedAnime = () => {
        if (!canBookmarkLastViewedAnime) return;
        onToggleBookmark(lastViewedAnime);
    };

    const getTimelineProgressFromClientX = useCallback((clientX) => {
        const timelineNode = timelineRef.current;
        if (!timelineNode) return 0;
        const rect = timelineNode.getBoundingClientRect();
        if (!(rect.width > 0)) return 0;
        return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    }, []);

    const applyTimelineSeek = useCallback((nextProgress) => {
        const normalizedProgress = Math.min(1, Math.max(0, Number(nextProgress) || 0));
        syncTimelineProgress(normalizedProgress);
        activeHeroRef.current?.seekToProgress?.(normalizedProgress);
    }, [syncTimelineProgress]);

    const handleTimelinePointerDown = useCallback((event) => {
        if (totalSlides === 0) return;
        event.preventDefault();
        event.stopPropagation();
        suppressSwipeGesture(320);
        timelineDragCleanupRef.current?.();
        isTimelineScrubbingRef.current = true;
        applyTimelineSeek(getTimelineProgressFromClientX(event.clientX));

        const finishScrub = (clientX = null) => {
            if (clientX !== null) {
                applyTimelineSeek(getTimelineProgressFromClientX(clientX));
            }
            isTimelineScrubbingRef.current = false;
            suppressSwipeGesture(220);
            timelineDragCleanupRef.current?.();
            timelineDragCleanupRef.current = null;
        };

        const handlePointerMove = (moveEvent) => {
            applyTimelineSeek(getTimelineProgressFromClientX(moveEvent.clientX));
        };

        const handlePointerUp = (upEvent) => {
            finishScrub(upEvent.clientX);
        };

        const handlePointerCancel = () => {
            finishScrub();
        };

        timelineDragCleanupRef.current = () => {
            window.removeEventListener('pointermove', handlePointerMove);
            window.removeEventListener('pointerup', handlePointerUp);
            window.removeEventListener('pointercancel', handlePointerCancel);
        };

        window.addEventListener('pointermove', handlePointerMove);
        window.addEventListener('pointerup', handlePointerUp);
        window.addEventListener('pointercancel', handlePointerCancel);
    }, [applyTimelineSeek, getTimelineProgressFromClientX, suppressSwipeGesture, totalSlides]);

    const handleTimelineTouchStartCapture = useCallback((event) => {
        suppressSwipeGesture(320);
        event.stopPropagation();
    }, [suppressSwipeGesture]);

    const handleTimelineTouchMoveCapture = useCallback((event) => {
        suppressSwipeGesture(320);
        event.stopPropagation();
    }, [suppressSwipeGesture]);

    const handleTimelineTouchEndCapture = useCallback((event) => {
        suppressSwipeGesture(220);
        event.stopPropagation();
    }, [suppressSwipeGesture]);

    const handleTimelineKeyDown = useCallback((event) => {
        const step = event.shiftKey ? 0.1 : 0.05;
        if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
            event.preventDefault();
            applyTimelineSeek(currentProgressRef.current - step);
            return;
        }
        if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
            event.preventDefault();
            applyTimelineSeek(currentProgressRef.current + step);
            return;
        }
        if (event.key === 'Home') {
            event.preventDefault();
            applyTimelineSeek(0);
            return;
        }
        if (event.key === 'End') {
            event.preventDefault();
            applyTimelineSeek(1);
        }
    }, [applyTimelineSeek]);

    if (totalSlides === 0) {
        if (isLoading) {
            return <HeroSliderLoading />;
        }

        return null;
    }

    return (
        <div className="hero-slider-shell">
            <div
                className="hero-slider-container"
                onTouchStart={onTouchStart}
                onTouchMove={onTouchMove}
                onTouchEnd={onTouchEnd}
            >
                {totalSlides > 0 && (
                    <button
                        type="button"
                        className="slider-refresh-button"
                        onClick={handleRestartCurrentSlide}
                        aria-label="このページを最初から見る"
                        title="このページを最初から見る"
                    >
                        <RestartIcon />
                    </button>
                )}

                {bufferedSlides.map((anime, index) => {
                    const actualIndex = bufferStartIndex + index;
                    const slideDistance = getSlideDistance(actualIndex, currentIndex);
                    if (slideDistance > 1) return null;

                    return (
                        <Hero
                            ref={actualIndex === currentIndex ? activeHeroRef : undefined}
                            key={getSlideKey(anime, actualIndex)}
                            anime={anime}
                            isActive={actualIndex === currentIndex}
                            shouldPreloadTrailer={slideDistance === 1}
                            previewMuted={isPreviewMuted}
                            allowPersistentPreviewAudio={!isMobileAutoplayEnvironment && hasUnlockedPreviewAudio}
                            previewMutedChangeToken={previewMutedChangeToken}
                            restartToken={actualIndex === currentIndex ? currentSlideRestartToken : 0}
                            onPreviewMuteStateChange={actualIndex === currentIndex ? setActivePreviewMuted : undefined}
                            onPreviewAvailabilityChange={actualIndex === currentIndex ? setActivePreviewAudioAvailable : undefined}
                            onPreviewPlaybackStartedChange={actualIndex === currentIndex ? setActivePreviewPlaybackStarted : undefined}
                            onSlideProgressChange={actualIndex === currentIndex ? handleSlideProgressChange : undefined}
                            onRequestAdvance={actualIndex === currentIndex ? nextSlide : undefined}
                        />
                    );
                })}

                {totalSlides > 1 && (
                    <>
                        <button type="button" className="slider-nav-button slider-prev" onClick={prevSlide}>
                            &#10094;
                        </button>
                        <button type="button" className="slider-nav-button slider-next" onClick={nextSlide}>
                            &#10095;
                        </button>
                        {shouldShowDots && (
                            <div className="slider-indicators">
                                {slides.map((_, index) => (
                                    <button
                                        key={index}
                                        type="button"
                                        className={`slider-dot ${index === currentIndex ? 'active' : ''}`}
                                        onClick={() => handleGoToSlide(index)}
                                        aria-label={`${index + 1}枚目を表示`}
                                    />
                                ))}
                            </div>
                        )}
                    </>
                )}

                <div
                    ref={timelineRef}
                    className="slider-timeline"
                    onPointerDown={handleTimelinePointerDown}
                    onKeyDown={handleTimelineKeyDown}
                    onTouchStartCapture={handleTimelineTouchStartCapture}
                    onTouchMoveCapture={handleTimelineTouchMoveCapture}
                    onTouchEndCapture={handleTimelineTouchEndCapture}
                    tabIndex={0}
                    aria-label="スライド進捗を操作"
                    title="進捗をドラッグして再生位置や表示時間を変更"
                >
                    <div
                        ref={progressFillRef}
                        className="slider-timeline-fill"
                    />
                    <div
                        ref={progressHandleRef}
                        className="slider-timeline-handle"
                    />
                </div>
            </div>

            <div
                className={`hero-slider-toolbar ${isCurrentSeasonSlider ? 'has-previous-control' : 'is-simple-toolbar'}`.trim()}
                role="group"
                aria-label="スライダーコントロール"
            >
                {isCurrentSeasonSlider && (
                    <div className="hero-slider-previous-control">
                        {previousSlideImage ? (
                            <img
                                src={previousSlideImage}
                                alt=""
                                className="slider-previous-thumb"
                                loading="lazy"
                                decoding="async"
                            />
                        ) : (
                            <div className="slider-previous-thumb placeholder" aria-hidden="true" />
                        )}
                        <div className="slider-previous-main">
                            <div className="slider-previous-copy">
                                <span className="slider-audio-label">前の作品</span>
                                {lastViewedAnime && (
                                    <span className="slider-previous-title" title={previousSlideTitle}>
                                        {previousSlideTitle}
                                    </span>
                                )}
                                <span className="slider-audio-status" aria-live="polite">
                                    {previousSlideStatusText}
                                </span>
                            </div>
                            <div className="slider-previous-actions">
                                <button
                                    type="button"
                                    className={`slider-previous-action-button ${isLastViewedAnimeInMyList ? 'is-active' : ''}`.trim()}
                                    onClick={handleAddLastViewedAnimeToMyList}
                                    disabled={!canAddLastViewedAnimeToMyList}
                                    title={isLastViewedAnimeInMyList
                                        ? `${previousSlideTitle}をマイリストから外す`
                                        : `${previousSlideTitle}をマイリストに追加`}
                                >
                                    {myListActionLabel}
                                </button>
                                <button
                                    type="button"
                                    className={`slider-previous-action-button secondary ${isLastViewedAnimeBookmarked ? 'is-active' : ''}`.trim()}
                                    onClick={handleBookmarkLastViewedAnime}
                                    disabled={!canBookmarkLastViewedAnime}
                                    title={isLastViewedAnimeBookmarked
                                        ? `${previousSlideTitle}のブックマークを外す`
                                        : `${previousSlideTitle}をブックマークに追加`}
                                >
                                    {bookmarkActionLabel}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                <div className={`hero-slider-secondary-row ${shouldShowDots ? 'count-hidden' : 'has-count'}`.trim()}>
                    <div className="hero-slider-audio-control">
                        <AudioToggleButton
                            muted={isPreviewMuted}
                            className="slider-audio-toggle"
                            onClick={handleSliderAudioToggle}
                            disabled={isSliderAudioToggleDisabled}
                            labelOn="スライダーのトレーラー音声をオンにする"
                            labelOff="スライダーのトレーラー音声をオフにする"
                            labelDisabled="トレーラーの再生開始後に音声を切り替えられます"
                        />
                        <div className="slider-audio-copy">
                            <span className="slider-audio-label">トレーラー音声</span>
                            <span className="slider-audio-status" aria-live="polite">
                                {sliderAudioStatusText}
                            </span>
                        </div>
                    </div>
                    {!shouldShowDots && (
                        <div className="hero-slider-count-control">
                            <div className="slider-progress-count slider-progress-count-inline" aria-live="polite">
                                {currentIndex + 1} / {totalSlides}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export default HeroSlider;
