import React, { useState, useEffect, useImperativeHandle, useRef } from 'react';
import { ANIME_DESCRIPTIONS, translateGenre } from '../../constants/animeData';
import { getCachedTranslation, setCachedTranslation, translateText } from '../../services/translationService';
import useTrailerPlaybackStatus from '../../hooks/useTrailerPlaybackStatus';
import YouTubeTrailerPlayer from '../Shared/YouTubeTrailerPlayer';

const TRAILER_START_TIMEOUT_MS = 8000;
const NO_TRAILER_ADVANCE_DELAY_MS = 8200;
const STALLED_TRAILER_ADVANCE_DELAY_MS = 2400;

const normalizeAnimeRating = (value) => {
    const parsed = Number(value);
    if (!Number.isInteger(parsed)) return null;
    if (parsed < 1 || parsed > 5) return null;
    return parsed;
};

const splitTutorialDescriptionLines = (value) => {
    const source = String(value || '')
        .replace(/\r\n?/g, '\n')
        .trim();
    if (!source) return [];

    return source
        .split('\n')
        .flatMap((line) => line.match(/[^。]+。?/g) || [])
        .map((line) => line.trim())
        .filter(Boolean);
};

const normalizeProgressRatio = (value) => Math.min(1, Math.max(0, Number(value) || 0));

const Hero = React.forwardRef(function Hero({
    anime,
    isActive,
    shouldPreloadTrailer = false,
    previewMuted = true,
    allowPersistentPreviewAudio = false,
    previewMutedChangeToken = 0,
    restartToken = 0,
    onPreviewMuteStateChange,
    onPreviewAvailabilityChange,
    onSlideProgressChange,
    onRequestAdvance,
}, ref) {
    const [translatedDesc, setTranslatedDesc] = useState(null);
    const [isTranslating, setIsTranslating] = useState(false);
    const [actualPreviewMuted, setActualPreviewMuted] = useState(true);
    const [hasTrailerPlaybackStarted, setHasTrailerPlaybackStarted] = useState(false);
    const [hasTrailerPlaybackStalled, setHasTrailerPlaybackStalled] = useState(false);
    const trailerPlayerRef = useRef(null);
    const fallbackTimelineFrameRef = useRef(0);
    const fallbackTimelineStartedAtRef = useRef(0);
    const fallbackTimelineDurationRef = useRef(NO_TRAILER_ADVANCE_DELAY_MS);
    const fallbackTimelineAdvanceTriggeredRef = useRef(false);
    const slideProgressChangeRef = useRef(onSlideProgressChange);
    const requestAdvanceRef = useRef(onRequestAdvance);
    const isTutorial = Boolean(anime?.isTutorial);
    const {
        trailer,
        hasTrailer,
        canRenderTrailer,
    } = useTrailerPlaybackStatus(anime);

    // Effect to handle translation
    useEffect(() => {
        if (!anime || isTutorial || (!isActive && !shouldPreloadTrailer)) return undefined;
        let cancelled = false;

        async function loadDescription() {
            // Step 1: Check ANIME_DESCRIPTIONS dictionary
            let localDesc = null;

            if (anime.title?.native) {
                localDesc = ANIME_DESCRIPTIONS[anime.title.native];
            }
            if (!localDesc && anime.title?.romaji) {
                localDesc = ANIME_DESCRIPTIONS[anime.title.romaji];
            }
            if (!localDesc && anime.title?.english) {
                localDesc = ANIME_DESCRIPTIONS[anime.title.english];
            }

            // If found in dictionary, use it
            if (localDesc) {
                if (!cancelled) {
                    setTranslatedDesc(localDesc);
                }
                return;
            }

            // Step 2: Check cache
            const animeId = anime.id || anime.title?.romaji || anime.title?.native;
            const cached = getCachedTranslation(animeId);
            if (cached) {
                if (!cancelled) {
                    setTranslatedDesc(cached);
                }
                return;
            }

            // Step 3: If we have English description, translate it
            if (anime.description) {
                if (!cancelled) {
                    setIsTranslating(true);
                }
                const translated = await translateText(anime.description);

                if (cancelled) {
                    return;
                }
                if (translated) {
                    setTranslatedDesc(translated);
                    setCachedTranslation(animeId, translated);
                } else {
                    // Translation failed, use English
                    setTranslatedDesc(null);
                }
                setIsTranslating(false);
            }
        }

        loadDescription();
        return () => {
            cancelled = true;
        };
    }, [anime, isTutorial, isActive, shouldPreloadTrailer]);

    const shouldRenderTrailerPreview = hasTrailer && canRenderTrailer;

    // Use a different structure if it's a tutorial slide
    if (isTutorial) {
        const tutorialLines = splitTutorialDescriptionLines(anime.description);
        return (
            <section className={`hero ${isActive ? 'active' : ''} hero-slide tutorial-hero`}>
                <div className="hero-content tutorial-content">
                    <span className="badge tutorial-badge">{anime.badge}</span>
                    <h1 className="tutorial-title">{anime.title}</h1>
                    <div className="hero-desc tutorial-desc">
                        {tutorialLines.length > 0 ? (
                            tutorialLines.map((line, index) => (
                                <span key={`${anime.uniqueId || anime.id || 'tutorial'}-line-${index}`}>
                                    {line}
                                    {index < tutorialLines.length - 1 && <br />}
                                </span>
                            ))
                        ) : (
                            anime.description
                        )}
                    </div>
                    {anime.image && (
                        <div className="tutorial-image-wrapper">
                            <img src={anime.image} alt="Tutorial" className="tutorial-image" />
                        </div>
                    )}
                </div>
            </section>
        );
    }

    // Determine final description to display
    const description = translatedDesc || anime.description || '詳細情報がありません。';
    const showTranslateLink = !translatedDesc && anime.description && !isTranslating;

    // Background Image logic (prefer banner image, fallback to cover image with srcSet for high DPI)
    const hasBannerImage = Boolean(anime.bannerImage);
    const coverLarge = anime?.coverImage?.large || '';
    const coverExtraLarge = anime?.coverImage?.extraLarge || '';
    const heroImageSrc = anime.bannerImage || coverExtraLarge || coverLarge || '';
    const posterImageSrc = coverExtraLarge || coverLarge || '';
    const mediaImageSrc = hasBannerImage ? anime.bannerImage : posterImageSrc;
    const rating = normalizeAnimeRating(anime?.rating);
    const heroImageSrcSet = !hasBannerImage
        ? [coverLarge ? `${coverLarge} 1x` : '', coverExtraLarge ? `${coverExtraLarge} 2x` : '']
            .filter(Boolean)
            .join(', ')
        : '';
    const mediaImageSizes = shouldRenderTrailerPreview
        ? "(max-width: 480px) calc(100vw - 28px), (max-width: 768px) calc(100vw - 36px), (min-width: 1400px) 430px, (min-width: 1100px) 390px, (min-width: 901px) 340px, 84vw"
        : hasBannerImage
            ? "(min-width: 1400px) 430px, (min-width: 1100px) 390px, (min-width: 901px) 340px, 84vw"
            : "(max-width: 768px) 42vw, 220px";
    const shouldPrepareTrailerPlayer = !isTutorial && isActive;
    const shouldMountTrailerPlayer = shouldRenderTrailerPreview && shouldPrepareTrailerPlayer;
    const shouldEagerLoadHeroAssets = isActive || shouldPreloadTrailer;
    const shouldUseFallbackTimeline = isActive
        && !isTutorial
        && (!shouldRenderTrailerPreview || hasTrailerPlaybackStalled);
    const shouldUseTrailerStartupTimeout = isActive
        && !isTutorial
        && shouldRenderTrailerPreview
        && !hasTrailerPlaybackStarted
        && !hasTrailerPlaybackStalled;
    const getFallbackTimelineDuration = () => (
        shouldRenderTrailerPreview && hasTrailerPlaybackStalled
            ? STALLED_TRAILER_ADVANCE_DELAY_MS
            : NO_TRAILER_ADVANCE_DELAY_MS
    );

    useEffect(() => {
        slideProgressChangeRef.current = onSlideProgressChange;
    }, [onSlideProgressChange]);

    useEffect(() => {
        requestAdvanceRef.current = onRequestAdvance;
    }, [onRequestAdvance]);

    const clearFallbackTimeline = () => {
        if (fallbackTimelineFrameRef.current) {
            window.cancelAnimationFrame(fallbackTimelineFrameRef.current);
            fallbackTimelineFrameRef.current = 0;
        }
        fallbackTimelineAdvanceTriggeredRef.current = false;
    };

    const startFallbackTimeline = (durationMs, initialProgress = 0) => {
        clearFallbackTimeline();
        const safeDurationMs = Math.max(1, Number(durationMs) || NO_TRAILER_ADVANCE_DELAY_MS);
        const safeProgress = normalizeProgressRatio(initialProgress);
        fallbackTimelineDurationRef.current = safeDurationMs;
        fallbackTimelineStartedAtRef.current = (window.performance?.now?.() ?? Date.now()) - (safeProgress * safeDurationMs);
        fallbackTimelineAdvanceTriggeredRef.current = false;
        slideProgressChangeRef.current?.(safeProgress);

        const tick = (timestamp) => {
            const elapsedMs = Math.max(0, timestamp - fallbackTimelineStartedAtRef.current);
            const nextProgress = Math.min(1, elapsedMs / fallbackTimelineDurationRef.current);
            slideProgressChangeRef.current?.(nextProgress);

            if (nextProgress >= 1) {
                fallbackTimelineFrameRef.current = 0;
                if (!fallbackTimelineAdvanceTriggeredRef.current) {
                    fallbackTimelineAdvanceTriggeredRef.current = true;
                    requestAdvanceRef.current?.();
                }
                return;
            }

            fallbackTimelineFrameRef.current = window.requestAnimationFrame(tick);
        };

        fallbackTimelineFrameRef.current = window.requestAnimationFrame(tick);
    };

    const seekFallbackTimeline = (progressRatio) => {
        const safeProgress = normalizeProgressRatio(progressRatio);
        fallbackTimelineStartedAtRef.current = (window.performance?.now?.() ?? Date.now())
            - (safeProgress * fallbackTimelineDurationRef.current);
        fallbackTimelineAdvanceTriggeredRef.current = false;
        slideProgressChangeRef.current?.(safeProgress);

        if (!fallbackTimelineFrameRef.current) {
            startFallbackTimeline(fallbackTimelineDurationRef.current, safeProgress);
        }
    };

    useImperativeHandle(ref, () => ({
        seekToProgress(progressRatio) {
            const safeProgress = normalizeProgressRatio(progressRatio);
            if (!isActive || isTutorial) return false;

            if (shouldRenderTrailerPreview) {
                return trailerPlayerRef.current?.seekToProgress?.(safeProgress, {
                    userInitiated: true,
                    resumePlayback: true,
                }) || false;
            }

            seekFallbackTimeline(safeProgress);
            return true;
        },
    }), [isActive, isTutorial, shouldRenderTrailerPreview, anime?.id]);

    useEffect(() => {
        if (!isActive || !shouldRenderTrailerPreview) {
            setActualPreviewMuted(true);
            setHasTrailerPlaybackStarted(false);
            setHasTrailerPlaybackStalled(false);
            return;
        }

        setActualPreviewMuted(true);
        setHasTrailerPlaybackStarted(false);
        setHasTrailerPlaybackStalled(false);
    }, [anime?.id, isActive, shouldRenderTrailerPreview, restartToken]);

    useEffect(() => {
        if (previewMuted) {
            setActualPreviewMuted(true);
        }
    }, [previewMuted]);

    useEffect(() => {
        if (typeof onPreviewAvailabilityChange !== 'function') {
            return undefined;
        }

        onPreviewAvailabilityChange(Boolean(isActive && shouldRenderTrailerPreview && !hasTrailerPlaybackStalled));
        return undefined;
    }, [hasTrailerPlaybackStalled, isActive, onPreviewAvailabilityChange, shouldRenderTrailerPreview, anime?.id]);

    useEffect(() => {
        if (typeof onPreviewMuteStateChange !== 'function') {
            return undefined;
        }

        if (!isActive || !shouldRenderTrailerPreview || hasTrailerPlaybackStalled) {
            onPreviewMuteStateChange(true);
            return undefined;
        }

        onPreviewMuteStateChange(actualPreviewMuted);
        return undefined;
    }, [
        actualPreviewMuted,
        hasTrailerPlaybackStalled,
        isActive,
        onPreviewMuteStateChange,
        shouldRenderTrailerPreview,
        anime?.id,
    ]);

    useEffect(() => {
        if (typeof onSlideProgressChange !== 'function') {
            return undefined;
        }

        if (!isActive) {
            onSlideProgressChange(0);
        }

        return undefined;
    }, [isActive, onSlideProgressChange, anime?.id]);

    useEffect(() => {
        if (!shouldUseTrailerStartupTimeout || typeof onRequestAdvance !== 'function') {
            return undefined;
        }

        clearFallbackTimeline();
        slideProgressChangeRef.current?.(0);

        const timeoutId = window.setTimeout(() => {
            onRequestAdvance();
        }, TRAILER_START_TIMEOUT_MS);

        return () => {
            window.clearTimeout(timeoutId);
        };
    }, [
        onRequestAdvance,
        restartToken,
        shouldUseTrailerStartupTimeout,
        anime?.id,
    ]);

    useEffect(() => {
        if (!shouldUseFallbackTimeline || typeof onSlideProgressChange !== 'function') {
            clearFallbackTimeline();
            return undefined;
        }

        startFallbackTimeline(getFallbackTimelineDuration(), 0);

        return () => {
            clearFallbackTimeline();
        };
    }, [
        hasTrailerPlaybackStalled,
        onSlideProgressChange,
        restartToken,
        shouldUseFallbackTimeline,
        anime?.id,
    ]);

    useEffect(() => () => {
        clearFallbackTimeline();
    }, []);

    if (!anime) return null;

    return (
        <section className={`hero ${isActive ? 'active' : ''}${shouldPreloadTrailer ? ' is-preloading' : ''} hero-slide ${hasBannerImage ? 'has-banner-image' : 'poster-only-slide'}${shouldRenderTrailerPreview ? ' trailer-preview-slide' : ''}`}>
            {heroImageSrc && (
                <img
                    className={`hero-bg-image ${hasBannerImage ? 'banner' : 'cover-fallback'}`}
                    src={heroImageSrc}
                    srcSet={heroImageSrcSet || undefined}
                    sizes="(min-width: 1400px) 1120px, (min-width: 1100px) 1000px, (min-width: 901px) 920px, 100vw"
                    alt=""
                    decoding="async"
                    loading={shouldEagerLoadHeroAssets ? 'eager' : 'lazy'}
                    fetchPriority={isActive ? 'high' : 'auto'}
                />
            )}
            {/* Overlay for readability */}
            <div className="hero-overlay"></div>

            <div className="hero-content">
                {anime.selectionReason ? (
                    <div className="selection-reason-badge">
                        {anime.selectionReason}
                    </div>
                ) : (
                    <span className="badge">今日の一本</span>
                )}
                <h1>{anime.title ? (anime.title.native || anime.title.romaji) : 'No Title'}</h1>
                <div className="hero-meta">
                    <span>{anime.seasonYear ? `${anime.seasonYear}年` : '不明'}</span>
                    <span className="dot">•</span>
                    <span>{anime.genres ? anime.genres.slice(0, 3).map(translateGenre).join(' / ') : ''}</span>
                    <span className="dot">•</span>
                    <span>{anime.episodes || '?'} 話</span>
                    {rating !== null && (
                        <>
                            <span className="dot">•</span>
                            <span className="hero-rating" aria-label={`評価 ${rating} / 5`}>★{rating}</span>
                        </>
                    )}
                </div>

                {isTranslating ? (
                    <p className="hero-desc" style={{ fontStyle: 'italic', opacity: 0.7 }}>
                        翻訳中...
                    </p>
                ) : (
                    <p className="hero-desc" dangerouslySetInnerHTML={{ __html: description }} />
                )}

                {showTranslateLink && (
                    <div className="hero-actions">
                        <span style={{ fontSize: '0.9rem', color: '#666' }}>
                            ⚠️ 自動翻訳に失敗しました
                        </span>
                    </div>
                )}
            </div>

            {mediaImageSrc && (
                <div className={`hero-media-panel ${hasBannerImage ? 'banner-media' : 'poster-media'}${shouldRenderTrailerPreview ? ' has-trailer-preview' : ''}`}>
                    <img
                        src={mediaImageSrc}
                        srcSet={hasBannerImage ? undefined : (heroImageSrcSet || undefined)}
                        sizes={mediaImageSizes}
                        alt=""
                        className={`hero-media-image ${hasBannerImage ? 'banner-media-image' : 'poster-media-image'}`}
                        decoding="async"
                        loading={shouldEagerLoadHeroAssets ? 'eager' : 'lazy'}
                    />
                    {shouldRenderTrailerPreview && trailer && (
                        <div className="hero-media-preview ready">
                            {shouldMountTrailerPlayer && (
                                <>
                                    <YouTubeTrailerPlayer
                                        ref={trailerPlayerRef}
                                        trailer={trailer}
                                        title={`${anime.title?.native || anime.title?.romaji || anime.title?.english || '作品'} のトレーラープレビュー`}
                                        className="hero-media-preview-frame"
                                        autoplay={isActive}
                                        loop={false}
                                        controls={false}
                                        muted={isActive ? previewMuted : true}
                                        allowPersistentAutoplayUnmute={allowPersistentPreviewAudio}
                                        muteChangeToken={previewMutedChangeToken}
                                        restartToken={restartToken}
                                        deferVisibilityUntilPlaying
                                        onEnded={isActive ? onRequestAdvance : undefined}
                                        onPlaybackStart={isActive ? () => {
                                            setHasTrailerPlaybackStarted(true);
                                            setHasTrailerPlaybackStalled(false);
                                        } : undefined}
                                        onPlaybackStalled={isActive ? () => setHasTrailerPlaybackStalled(true) : undefined}
                                        onMuteStateChange={isActive ? setActualPreviewMuted : undefined}
                                        onProgressChange={isActive ? onSlideProgressChange : undefined}
                                    />
                                </>
                            )}
                        </div>
                    )}
                </div>
            )}
        </section>
    );
});

export default Hero;
