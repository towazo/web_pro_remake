import React, { useState, useEffect, useRef } from 'react';
import { ANIME_DESCRIPTIONS, translateGenre } from '../../constants/animeData';
import { getCachedTranslation, setCachedTranslation, translateText } from '../../services/translationService';
import useTrailerPlaybackStatus from '../../hooks/useTrailerPlaybackStatus';
import AudioToggleButton from '../Shared/AudioToggleButton';
import TrailerPlayButton from '../Shared/TrailerPlayButton';
import YouTubeTrailerPlayer from '../Shared/YouTubeTrailerPlayer';

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

function Hero({
    anime,
    isActive,
    previewMuted = true,
    onTogglePreviewMute,
    onPlayTrailer,
}) {
    const [translatedDesc, setTranslatedDesc] = useState(null);
    const [isTranslating, setIsTranslating] = useState(false);
    const [canInlinePreview, setCanInlinePreview] = useState(null);
    const [isAutoplayBlocked, setIsAutoplayBlocked] = useState(false);
    const previewFrameRef = useRef(null);
    const isTutorial = Boolean(anime?.isTutorial);
    const {
        trailer,
        hasTrailer,
        isTrailerPlayable,
    } = useTrailerPlaybackStatus(anime, {
        autoProbe: !isTutorial,
        timeoutMs: 5200,
    });

    // Effect to handle translation
    useEffect(() => {
        if (!anime || isTutorial) return;

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
                setTranslatedDesc(localDesc);
                return;
            }

            // Step 2: Check cache
            const animeId = anime.id || anime.title?.romaji || anime.title?.native;
            const cached = getCachedTranslation(animeId);
            if (cached) {
                setTranslatedDesc(cached);
                return;
            }

            // Step 3: If we have English description, translate it
            if (anime.description) {
                setIsTranslating(true);
                const translated = await translateText(anime.description);

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
    }, [anime, isTutorial]);

    const shouldRenderTrailerPreview = hasTrailer && isTrailerPlayable;

    useEffect(() => {
        if (!shouldRenderTrailerPreview || !previewFrameRef.current || typeof window === 'undefined') {
            setCanInlinePreview(null);
            return undefined;
        }

        const node = previewFrameRef.current;
        const updatePreviewCapability = () => {
            const rect = node.getBoundingClientRect();
            setCanInlinePreview(rect.width >= 200 && rect.height >= 200);
        };

        updatePreviewCapability();

        if (typeof window.ResizeObserver === 'function') {
            const observer = new window.ResizeObserver(() => {
                updatePreviewCapability();
            });
            observer.observe(node);
            return () => observer.disconnect();
        }

        window.addEventListener('resize', updatePreviewCapability);
        return () => window.removeEventListener('resize', updatePreviewCapability);
    }, [anime?.id, shouldRenderTrailerPreview, isActive]);

    useEffect(() => {
        setIsAutoplayBlocked(false);
    }, [anime?.id, isActive]);

    if (!anime) return null;

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
    const shouldMountTrailerPlayer = shouldRenderTrailerPreview && isActive && canInlinePreview === true && !isAutoplayBlocked;
    const shouldShowTrailerFallback = shouldRenderTrailerPreview && isActive && (canInlinePreview === false || isAutoplayBlocked);
    const trailerFallbackNote = canInlinePreview === false
        ? '端末サイズの都合でタップ再生に切り替えています'
        : isAutoplayBlocked
            ? 'この端末では自動再生が制限されるためタップ再生に切り替えています'
            : '';

    return (
        <section className={`hero ${isActive ? 'active' : ''} hero-slide ${hasBannerImage ? 'has-banner-image' : 'poster-only-slide'}${shouldRenderTrailerPreview ? ' trailer-preview-slide' : ''}`}>
            {heroImageSrc && (
                <img
                    className={`hero-bg-image ${hasBannerImage ? 'banner' : 'cover-fallback'}`}
                    src={heroImageSrc}
                    srcSet={heroImageSrcSet || undefined}
                    sizes="(min-width: 1400px) 1120px, (min-width: 1100px) 1000px, (min-width: 901px) 920px, 100vw"
                    alt=""
                    decoding="async"
                    loading={isActive ? 'eager' : 'lazy'}
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
                        loading={isActive ? 'eager' : 'lazy'}
                    />
                    {shouldRenderTrailerPreview && trailer && (
                        <div
                            ref={previewFrameRef}
                            className={`hero-media-preview ready${shouldShowTrailerFallback ? ' fallback' : ''}`}
                        >
                            {shouldMountTrailerPlayer && (
                                <>
                                    <YouTubeTrailerPlayer
                                        trailer={trailer}
                                        title={`${anime.title?.native || anime.title?.romaji || anime.title?.english || '作品'} のトレーラープレビュー`}
                                        className="hero-media-preview-frame"
                                        autoplay
                                        loop
                                        controls={false}
                                        muted={previewMuted}
                                        onAutoplayBlocked={() => setIsAutoplayBlocked(true)}
                                    />
                                    <AudioToggleButton
                                        muted={previewMuted}
                                        className="hero-media-audio-toggle"
                                        onClick={onTogglePreviewMute}
                                        labelOn="トレーラーの音声をオンにする"
                                        labelOff="トレーラーの音声をオフにする"
                                    />
                                </>
                            )}
                            {shouldShowTrailerFallback && (
                                <div className="hero-media-trailer-fallback">
                                    <TrailerPlayButton
                                        anime={anime}
                                        onPlayTrailer={onPlayTrailer}
                                        className="hero-media-trailer-fallback-button"
                                    />
                                    {trailerFallbackNote && (
                                        <p className="hero-media-trailer-fallback-note">
                                            {trailerFallbackNote}
                                        </p>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
        </section>
    );
}

export default Hero;
