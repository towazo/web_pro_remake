import React, { useState, useEffect } from 'react';
import Hero from './Hero';

function HeroSlider({ slides, onRefresh, showRefreshButton = false, isRefreshing = false }) {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [touchStart, setTouchStart] = useState(null);
    const [touchEnd, setTouchEnd] = useState(null);

    // Reset index when slides change
    useEffect(() => {
        setCurrentIndex(0);
    }, [slides]);

    if (!slides || slides.length === 0) return null;

    const nextSlide = () => {
        setCurrentIndex((prev) => (prev + 1) % slides.length);
    };

    const prevSlide = () => {
        setCurrentIndex((prev) => (prev === 0 ? slides.length - 1 : prev - 1));
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
                    <img
                        src="/images/icon-update.png"
                        alt=""
                        className={`slider-refresh-icon ${isRefreshing ? 'spinning' : ''}`}
                    />
                    <span className="slider-refresh-label">{isRefreshing ? '更新中' : '更新'}</span>
                </button>
            )}

            {showRefreshButton && isRefreshing && (
                <div className="slider-refresh-loading" role="status" aria-live="polite">
                    スライダーを更新中...
                </div>
            )}

            {slides.map((anime, index) => (
                <Hero
                    key={anime.uniqueId || anime.id || index}
                    anime={anime}
                    isActive={index === currentIndex}
                />
            ))}

            {slides.length > 1 && (
                <>
                    <button type="button" className="slider-nav-button slider-prev" onClick={prevSlide}>
                        &#10094;
                    </button>
                    <button type="button" className="slider-nav-button slider-next" onClick={nextSlide}>
                        &#10095;
                    </button>
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
                </>
            )}
        </div>
    );
}

export default HeroSlider;
