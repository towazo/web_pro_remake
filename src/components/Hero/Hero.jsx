import React, { useState, useEffect } from 'react';
import { ANIME_DESCRIPTIONS, translateGenre } from '../../constants/animeData';
import { getCachedTranslation, setCachedTranslation, translateText } from '../../services/translationService';

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

function Hero({ anime, isActive }) {
    const [translatedDesc, setTranslatedDesc] = useState(null);
    const [isTranslating, setIsTranslating] = useState(false);

    if (!anime) return null;

    // Use a different structure if it's a tutorial slide
    if (anime.isTutorial) {
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

    // Effect to handle translation
    useEffect(() => {
        if (!anime || anime.isTutorial) return;

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
    }, [anime]);

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

    return (
        <section className={`hero ${isActive ? 'active' : ''} hero-slide ${hasBannerImage ? 'has-banner-image' : 'poster-only-slide'}`}>
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
                <div className={`hero-media-panel ${hasBannerImage ? 'banner-media' : 'poster-media'}`}>
                    <img
                        src={mediaImageSrc}
                        srcSet={hasBannerImage ? undefined : (heroImageSrcSet || undefined)}
                        sizes={hasBannerImage
                            ? "(min-width: 1400px) 430px, (min-width: 1100px) 390px, (min-width: 901px) 340px, 84vw"
                            : "(max-width: 768px) 42vw, 220px"}
                        alt=""
                        className={`hero-media-image ${hasBannerImage ? 'banner-media-image' : 'poster-media-image'}`}
                        decoding="async"
                        loading={isActive ? 'eager' : 'lazy'}
                    />
                </div>
            )}
        </section>
    );
}

export default Hero;
