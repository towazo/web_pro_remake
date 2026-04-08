import React, { useState, useEffect } from 'react';
import Hero from './Hero';

const MAX_DOT_INDICATORS = 8;
const SLIDE_ADVANCE_FALLBACK_MS = 8200;
const INITIAL_BUFFER_SIZE = 10;
const BUFFER_REPLENISH_THRESHOLD = 5;

function RefreshIcon({ spinning = false }) {
    return (
        <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
            className={`slider-refresh-icon ${spinning ? 'spinning' : ''}`}
        >
            <path
                d="M20 4v7h-7"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
            <path
                d="M20 11a8 8 0 1 0-2.34 5.66"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    );
}

function HeroSlider({
    slides,
    onRefresh,
    onPlayTrailer,
    onCycleComplete,
    showRefreshButton = false,
    isRefreshing = false,
}) {
    const totalSlides = Array.isArray(slides) ? slides.length : 0;
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isPreviewMuted, setIsPreviewMuted] = useState(true);
    const [previewMutedChangeToken, setPreviewMutedChangeToken] = useState(0);
    const [touchStart, setTouchStart] = useState(null);
    const [touchEnd, setTouchEnd] = useState(null);
    const slideIdentityKey = Array.isArray(slides)
        ? slides.map((anime, index) => String(anime?.uniqueId || anime?.id || index)).join('|')
        : '';
    const getSlideKey = (anime, index) => String(anime?.uniqueId || anime?.id || index);
    const getSlideDistance = (fromIndex, toIndex) => Math.abs(fromIndex - toIndex);

    // Reset index when slides change
    useEffect(() => {
        setCurrentIndex(0);
    }, [slideIdentityKey]);

    if (totalSlides === 0) return null;

    const nextSlide = () => {
        if (totalSlides <= 1) return;
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
    };

    const prevSlide = () => {
        if (totalSlides <= 1) return;
        if (currentIndex === 0) {
            setCurrentIndex(totalSlides - 1);
            return;
        }

        setCurrentIndex((prev) => prev - 1);
    };

    // the required distance between touchStart and touchEnd to be detected as a swipe
    const minSwipeDistance = 50;

    const onTouchStart = (e) => {
        setTouchEnd(null);
        setTouchStart(e.targetTouches[0].clientX);
    };

    const onTouchMove = (e) => setTouchEnd(e.targetTouches[0].clientX);

    const onTouchEnd = () => {
        if (!touchStart || !touchEnd) return;
        const distance = touchStart - touchEnd;
        const isLeftSwipe = distance > minSwipeDistance;
        const isRightSwipe = distance < -minSwipeDistance;
        if (isLeftSwipe) {
            nextSlide();
        } else if (isRightSwipe) {
            prevSlide();
        }
    };

    const handleRefresh = () => {
        if (typeof onRefresh !== 'function' || isRefreshing) return;
        onRefresh();
    };

    const handleTogglePreviewMuted = () => {
        setIsPreviewMuted((prev) => !prev);
        setPreviewMutedChangeToken((prev) => prev + 1);
    };

    const shouldShowDots = totalSlides <= MAX_DOT_INDICATORS;
    const bufferStartIndex = Math.floor(currentIndex / BUFFER_REPLENISH_THRESHOLD) * BUFFER_REPLENISH_THRESHOLD;
    const bufferEndIndex = Math.min(totalSlides, bufferStartIndex + INITIAL_BUFFER_SIZE);
    const bufferedSlides = slides.slice(bufferStartIndex, bufferEndIndex);

    return (
        <div
            className="hero-slider-container"
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
        >
            {showRefreshButton && typeof onRefresh === 'function' && (
                <button
                    type="button"
                    className={`slider-refresh-button ${isRefreshing ? 'loading' : ''}`}
                    onClick={handleRefresh}
                    disabled={isRefreshing}
                    aria-label={isRefreshing ? 'スライダーを更新中' : 'スライダーを更新'}
                    title={isRefreshing ? '更新中' : 'スライダーを更新'}
                >
                    <RefreshIcon spinning={isRefreshing} />
                </button>
            )}

            {showRefreshButton && isRefreshing && (
                <div className="slider-refresh-loading" role="status" aria-live="polite">
                    スライダーを更新中...
                </div>
            )}

            {bufferedSlides.map((anime, index) => {
                const actualIndex = bufferStartIndex + index;
                const slideDistance = getSlideDistance(actualIndex, currentIndex);
                if (slideDistance > 1) return null;

                return (
                    <Hero
                        key={getSlideKey(anime, actualIndex)}
                        anime={anime}
                        isActive={actualIndex === currentIndex}
                        shouldPreloadTrailer={slideDistance === 1}
                        noTrailerAdvanceDelayMs={SLIDE_ADVANCE_FALLBACK_MS}
                        previewMuted={isPreviewMuted}
                        previewMutedChangeToken={previewMutedChangeToken}
                        onTogglePreviewMuted={handleTogglePreviewMuted}
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
                    {shouldShowDots ? (
                        <div className="slider-indicators">
                            {slides.map((_, index) => (
                                <button
                                    key={index}
                                    type="button"
                                    className={`slider-dot ${index === currentIndex ? 'active' : ''}`}
                                    onClick={() => setCurrentIndex(index)}
                                    aria-label={`${index + 1}枚目を表示`}
                                />
                            ))}
                        </div>
                    ) : (
                        <div className="slider-progress-count" aria-live="polite">
                            {currentIndex + 1} / {totalSlides}
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

export default HeroSlider;
