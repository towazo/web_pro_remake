import React, { useState, useEffect } from 'react';
import {
    fetchAnimeByYearAllPages,
    fetchAnimeDetails,
    fetchAnimeDetailsBulk,
    normalizeTitleForCompare,
    searchAnimeList,
} from '../../services/animeService';
import { translateGenre } from '../../constants/animeData';

const ANILIST_SEASON_TO_FILTER_KEY = {
    WINTER: 'winter',
    SPRING: 'spring',
    SUMMER: 'summer',
    FALL: 'autumn'
};
const BROWSE_ALLOWED_MEDIA_FORMATS = Object.freeze(['TV', 'TV_SHORT', 'MOVIE', 'OVA']);
const BROWSE_RESULTS_CACHE = new Map();
const BROWSE_RESULTS_CACHE_TTL_MS = 15 * 60 * 1000;

function AddAnimeScreen({
    onAdd,
    onRemove,
    onToggleBookmark,
    onBack,
    animeList = [],
    bookmarkList = [],
    screenTitle = '作品の追加',
    screenSubtitle = 'マイリストやブックマークに追加する作品を探せます。',
    backButtonLabel = '← ホームへ戻る',
    initialEntryTab = 'search',
    browsePreset = null
}) {
    const RECOMMENDED_BULK_TITLES = 20;
    const MAX_BULK_TITLES = 20;
    const YEAR_PER_PAGE = 36;
    const SEASON_FILTER_OPTIONS = [
        { key: 'winter', label: '冬 (1〜3月)' },
        { key: 'spring', label: '春 (4〜6月)' },
        { key: 'summer', label: '夏 (7〜9月)' },
        { key: 'autumn', label: '秋 (10〜12月)' },
        { key: 'other', label: '開始月不明' }
    ];
    const BULK_PER_REQUEST_TIMEOUT_MS = 7000;
    const BULK_PER_TITLE_TIMEOUT_MS = 4000;
    const BULK_MAX_RETRY_ATTEMPTS = 2;
    const BULK_RETRY_BASE_DELAY_MS = 250;
    const BULK_RETRY_DELAY_CAP_MS = 900;
    const BULK_FAST_PER_REQUEST_TIMEOUT_MS = 5000;
    const BULK_FAST_PER_TITLE_TIMEOUT_MS = 2500;
    const BULK_FAST_MAX_RETRY_ATTEMPTS = 1;
    const BULK_FAST_RETRY_BASE_DELAY_MS = 150;
    const BULK_FAST_RETRY_DELAY_CAP_MS = 450;
    const normalizedBrowsePreset = React.useMemo(() => {
        const preset = browsePreset && typeof browsePreset === 'object' ? browsePreset : null;
        const year = Number(preset?.year);
        if (!preset || !Number.isFinite(year) || year < 1900) return null;

        const mediaSeasonRaw = String(preset.mediaSeason || '').toUpperCase();
        const mediaSeason = ['WINTER', 'SPRING', 'SUMMER', 'FALL'].includes(mediaSeasonRaw)
            ? mediaSeasonRaw
            : '';
        const seasonKeyRaw = String(preset.seasonKey || '').toLowerCase();
        const seasonKey = seasonKeyRaw
            || (mediaSeason ? ANILIST_SEASON_TO_FILTER_KEY[mediaSeason] : '');
        const statusIn = Array.isArray(preset.statusIn)
            ? preset.statusIn.filter((item) => typeof item === 'string' && item.trim().length > 0)
            : null;
        const hasStatusNot = Object.prototype.hasOwnProperty.call(preset, 'statusNot');

        return {
            year,
            mediaSeason: mediaSeason || null,
            seasonKey: seasonKey || '',
            statusIn: statusIn && statusIn.length > 0 ? statusIn : null,
            statusNot: hasStatusNot ? preset.statusNot : null,
            title: String(preset.title || '').trim(),
            description: String(preset.description || '').trim(),
            locked: preset.locked !== false
        };
    }, [browsePreset]);

    const isBrowsePresetLocked = Boolean(normalizedBrowsePreset?.locked);
    const [entryTab, setEntryTab] = useState(() => (
        normalizedBrowsePreset ? 'browse' : (initialEntryTab === 'browse' ? 'browse' : 'search')
    )); // 'search' or 'browse'
    const [showGuide, setShowGuide] = useState(false);
    const [mode, setMode] = useState('normal'); // 'normal' or 'bulk'
    const [query, setQuery] = useState('');
    const [bulkQuery, setBulkQuery] = useState('');
    const [suggestions, setSuggestions] = useState([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [isSuggesting, setIsSuggesting] = useState(false);
    const [previewData, setPreviewData] = useState(null);
    const [status, setStatus] = useState({ type: '', message: '' });
    const [isSearching, setIsSearching] = useState(false);
    const autocompleteRequestIdRef = React.useRef(0);

    // Bulk Add States
    const [bulkProgress, setBulkProgress] = useState({ current: 0, total: 0 });
    const [bulkLiveStats, setBulkLiveStats] = useState({
        processed: 0,
        total: 0,
        hits: 0,
        notFound: 0,
        alreadyAdded: 0,
        timedOut: 0
    });
    const [bulkPhase, setBulkPhase] = useState('idle'); // idle | firstPass | retryPass
    const [bulkRetryProgress, setBulkRetryProgress] = useState({ current: 0, total: 0 });
    const [bulkCurrentTitle, setBulkCurrentTitle] = useState('');
    const [bulkResults, setBulkResults] = useState({
        hits: [],
        notFound: [],
        alreadyAdded: []
    });
    const [bulkOverflowInfo, setBulkOverflowInfo] = useState(null);
    const [bulkNotFoundStatus, setBulkNotFoundStatus] = useState({});
    const [bulkTarget, setBulkTarget] = useState('mylist'); // mylist | bookmark
    const [bulkExecutionSummary, setBulkExecutionSummary] = useState({
        added: 0,
        skipped: 0,
        target: 'mylist'
    });
    const [showReview, setShowReview] = useState(false);
    const [isBulkComplete, setIsBulkComplete] = useState(false);
    const [pendingList, setPendingList] = useState([]);
    const [browseYearDraft, setBrowseYearDraft] = useState(() => (
        normalizedBrowsePreset ? String(normalizedBrowsePreset.year) : ''
    ));
    const [selectedBrowseYear, setSelectedBrowseYear] = useState(() => (
        normalizedBrowsePreset ? normalizedBrowsePreset.year : null
    ));
    const [browsePage, setBrowsePage] = useState(1);
    const [browseGenreFilters, setBrowseGenreFilters] = useState([]);
    const [browseSeasonFilters, setBrowseSeasonFilters] = useState(() => (
        normalizedBrowsePreset?.seasonKey ? [normalizedBrowsePreset.seasonKey] : []
    ));
    const [browseResults, setBrowseResults] = useState([]);
    const [browsePageInfo, setBrowsePageInfo] = useState({
        total: 0,
        perPage: YEAR_PER_PAGE,
        currentPage: 1,
        lastPage: 1,
        hasNextPage: false
    });
    const [browseLoading, setBrowseLoading] = useState(false);
    const [browseError, setBrowseError] = useState('');
    const [browseReloadToken, setBrowseReloadToken] = useState(0);
    const [browseRetryUntilTs, setBrowseRetryUntilTs] = useState(0);
    const [browseRetryCountdownSec, setBrowseRetryCountdownSec] = useState(0);
    const [browseAutoRetryPlan, setBrowseAutoRetryPlan] = useState(null);
    const [toast, setToast] = useState({ visible: false, message: '', type: 'success' });
    const [browseQuickNavState, setBrowseQuickNavState] = useState({
        visible: false,
        mobile: false,
        nearTop: true,
        nearBottom: false
    });
    const entryScrollPositionsRef = React.useRef({ search: 0, browse: 0 });
    const browseRequestIdRef = React.useRef(0);
    const browseResultsTopRef = React.useRef(null);
    const pendingBrowseScrollPageRef = React.useRef(null);
    const browseAutoRetryCountRef = React.useRef(new Map());
    const browseInFlightRef = React.useRef(0);
    const isDevRuntime = typeof import.meta !== 'undefined' && Boolean(import.meta.env?.DEV);

    const currentYear = new Date().getFullYear();
    const waitWithAbort = (ms, signal) => new Promise((resolve, reject) => {
        const waitMs = Math.max(0, Number(ms) || 0);
        if (waitMs === 0) {
            resolve();
            return;
        }
        if (signal?.aborted) {
            const abortError = new Error('Aborted');
            abortError.name = 'AbortError';
            reject(abortError);
            return;
        }
        const timer = setTimeout(() => {
            cleanup();
            resolve();
        }, waitMs);
        const onAbort = () => {
            clearTimeout(timer);
            cleanup();
            const abortError = new Error('Aborted');
            abortError.name = 'AbortError';
            reject(abortError);
        };
        const cleanup = () => {
            signal?.removeEventListener?.('abort', onAbort);
        };
        signal?.addEventListener?.('abort', onAbort, { once: true });
    });
    const parseBrowseYear = (value) => {
        const raw = String(value ?? '').trim();
        if (!raw) return null;
        const firstYearToken = raw.match(/\d{4}/)?.[0] ?? raw;
        const parsed = Number(firstYearToken);
        if (!Number.isFinite(parsed) || parsed < 1900 || parsed > currentYear + 1) {
            return null;
        }
        return parsed;
    };
    const browseYearOptions = React.useMemo(
        () => Array.from({ length: currentYear - 1960 + 1 }, (_, idx) => currentYear - idx),
        [currentYear]
    );
    const addedAnimeIds = React.useMemo(() => new Set((animeList || []).map(a => a.id)), [animeList]);
    const bookmarkIdSet = React.useMemo(() => new Set((bookmarkList || []).map(a => a.id)), [bookmarkList]);
    const browseGenreOptions = React.useMemo(() => {
        const genreSet = new Set(browseGenreFilters);
        browseResults.forEach((anime) => {
            (anime.genres || []).forEach((g) => genreSet.add(g));
        });
        return Array.from(genreSet).sort((a, b) => a.localeCompare(b));
    }, [browseResults, browseGenreFilters]);
    const browseDataKey = React.useMemo(() => {
        if (!Number.isFinite(Number(selectedBrowseYear))) return '';
        if (!normalizedBrowsePreset) {
            return `year:${selectedBrowseYear}`;
        }
        const statusInKey = Array.isArray(normalizedBrowsePreset.statusIn)
            ? normalizedBrowsePreset.statusIn.join(',')
            : '';
        const statusNotKey = normalizedBrowsePreset.statusNot
            ? String(normalizedBrowsePreset.statusNot)
            : '';
        return `preset:${selectedBrowseYear}:${normalizedBrowsePreset.mediaSeason || ''}:${statusInKey}:${statusNotKey}`;
    }, [selectedBrowseYear, normalizedBrowsePreset]);

    // 1. Autocomplete Search Logic (Debounced)
    useEffect(() => {
        if (entryTab !== 'search' || mode !== 'normal') {
            autocompleteRequestIdRef.current += 1;
            setIsSuggesting(false);
            return;
        }

        const normalizedQuery = query.trim();
        if (normalizedQuery.length < 2 || previewData) {
            autocompleteRequestIdRef.current += 1;
            setSuggestions([]);
            setShowSuggestions(false);
            setIsSuggesting(false);
            return;
        }

        const requestId = autocompleteRequestIdRef.current + 1;
        autocompleteRequestIdRef.current = requestId;

        const timer = setTimeout(async () => {
            setSuggestions([]);
            setShowSuggestions(true);
            setIsSuggesting(true);
            try {
                const results = await searchAnimeList(normalizedQuery, 8);
                if (autocompleteRequestIdRef.current !== requestId) return;
                setSuggestions(results);
                setShowSuggestions(true);
            } catch (_) {
                if (autocompleteRequestIdRef.current !== requestId) return;
                setSuggestions([]);
            } finally {
                if (autocompleteRequestIdRef.current === requestId) {
                    setIsSuggesting(false);
                }
            }
        }, 300);

        return () => {
            clearTimeout(timer);
        };
    }, [query, previewData, mode, entryTab]);

    useEffect(() => {
        const targetY = entryScrollPositionsRef.current[entryTab] || 0;
        const rafId = requestAnimationFrame(() => {
            window.scrollTo(0, targetY);
        });
        return () => cancelAnimationFrame(rafId);
    }, [entryTab]);

    useEffect(() => {
        if (entryTab !== 'browse' || !selectedBrowseYear) {
            setBrowseQuickNavState({
                visible: false,
                mobile: false,
                nearTop: true,
                nearBottom: false
            });
            return;
        }

        let rafId = null;

        const updateBrowseQuickNav = () => {
            const scrollTop = window.scrollY || window.pageYOffset || 0;
            const viewportH = window.innerHeight || 0;
            const docH = Math.max(
                document.body?.scrollHeight || 0,
                document.documentElement?.scrollHeight || 0
            );
            const maxScroll = Math.max(0, docH - viewportH);
            const isMobile = window.matchMedia('(max-width: 768px)').matches;

            const nearTop = scrollTop <= 24;
            const nearBottom = maxScroll - scrollTop <= 24;
            const hasLongContent = maxScroll > 240;
            const visible = hasLongContent && (!isMobile || scrollTop > 180 || nearBottom);

            setBrowseQuickNavState((prev) => {
                if (
                    prev.visible === visible &&
                    prev.mobile === isMobile &&
                    prev.nearTop === nearTop &&
                    prev.nearBottom === nearBottom
                ) {
                    return prev;
                }
                return { visible, mobile: isMobile, nearTop, nearBottom };
            });
        };

        const requestUpdate = () => {
            if (rafId != null) return;
            rafId = requestAnimationFrame(() => {
                rafId = null;
                updateBrowseQuickNav();
            });
        };

        window.addEventListener('scroll', requestUpdate, { passive: true });
        window.addEventListener('resize', requestUpdate);
        updateBrowseQuickNav();

        return () => {
            if (rafId != null) cancelAnimationFrame(rafId);
            window.removeEventListener('scroll', requestUpdate);
            window.removeEventListener('resize', requestUpdate);
        };
    }, [entryTab, selectedBrowseYear, browseLoading, browsePage, browseGenreFilters, browseSeasonFilters, browseResults.length]);

    useEffect(() => {
        if (!toast.visible) return;
        const timer = setTimeout(() => {
            setToast(prev => ({ ...prev, visible: false }));
        }, 2200);
        return () => clearTimeout(timer);
    }, [toast.visible, toast.message]);

    useEffect(() => {
        if (!browseRetryUntilTs || browseRetryUntilTs <= Date.now()) {
            setBrowseRetryCountdownSec(0);
            return;
        }
        const updateCountdown = () => {
            const remainingMs = browseRetryUntilTs - Date.now();
            const remainingSec = Math.max(0, Math.ceil(remainingMs / 1000));
            setBrowseRetryCountdownSec(remainingSec);
        };
        updateCountdown();
        const timer = setInterval(updateCountdown, 250);
        return () => clearInterval(timer);
    }, [browseRetryUntilTs]);

    useEffect(() => {
        if (!browseAutoRetryPlan || !browseAutoRetryPlan.key) return;
        const delayMs = Math.max(0, Number(browseAutoRetryPlan.runAt) - Date.now());
        const timer = setTimeout(() => {
            const key = browseAutoRetryPlan.key;
            const currentCount = Number(browseAutoRetryCountRef.current.get(key) || 0);
            browseAutoRetryCountRef.current.set(key, currentCount + 1);
            setBrowseAutoRetryPlan(null);
            setBrowseReloadToken((prev) => prev + 1);
        }, delayMs);
        return () => clearTimeout(timer);
    }, [browseAutoRetryPlan]);

    useEffect(() => {
        if (normalizedBrowsePreset) {
            setEntryTab('browse');
            setBrowseYearDraft(String(normalizedBrowsePreset.year));
            setSelectedBrowseYear(normalizedBrowsePreset.year);
            setBrowsePage(1);
            setBrowseGenreFilters([]);
            setBrowseSeasonFilters(normalizedBrowsePreset.seasonKey ? [normalizedBrowsePreset.seasonKey] : []);
            return;
        }

        setEntryTab(initialEntryTab === 'browse' ? 'browse' : 'search');
        setBrowseYearDraft('');
        setSelectedBrowseYear(null);
        setBrowsePage(1);
        setBrowseGenreFilters([]);
        setBrowseSeasonFilters([]);
    }, [normalizedBrowsePreset, initialEntryTab]);

    useEffect(() => {
        if (!selectedBrowseYear) return;

        const controller = new AbortController();
        const requestId = browseRequestIdRef.current + 1;
        browseRequestIdRef.current = requestId;
        setBrowseLoading(true);
        setBrowseError('');

        const run = async () => {
            browseInFlightRef.current += 1;
            const inFlightNow = browseInFlightRef.current;
            try {
                if (isDevRuntime) {
                    console.info('[AddAnimeScreen] browse fetch start', {
                        key: browseDataKey,
                        inFlight: inFlightNow,
                        year: selectedBrowseYear,
                        season: normalizedBrowsePreset?.mediaSeason || null
                    });
                }

                const cacheEntry = browseDataKey ? BROWSE_RESULTS_CACHE.get(browseDataKey) : null;
                const cachedItems = Array.isArray(cacheEntry?.items) ? cacheEntry.items : [];
                const cacheAgeMs = Date.now() - Number(cacheEntry?.savedAt || 0);
                const hasFreshCache = cachedItems.length > 0
                    && Number.isFinite(cacheAgeMs)
                    && cacheAgeMs >= 0
                    && cacheAgeMs < BROWSE_RESULTS_CACHE_TTL_MS;
                if (hasFreshCache) {
                    setBrowseResults(cachedItems);
                    setBrowsePage(1);
                    setBrowseError('');
                    if (normalizedBrowsePreset && browseReloadToken === 0) {
                        if (isDevRuntime) {
                            console.info('[AddAnimeScreen] browse cache hit', {
                                key: browseDataKey,
                                itemCount: cachedItems.length,
                                cacheAgeMs
                            });
                        }
                        return;
                    }
                }

                const isPresetMode = Boolean(normalizedBrowsePreset);
                const requestOptions = {
                    perPage: 50,
                    maxPages: isPresetMode ? 36 : 140,
                    formatIn: BROWSE_ALLOWED_MEDIA_FORMATS,
                    timeoutMs: 10000,
                    maxAttempts: isPresetMode ? 4 : 3,
                    baseDelayMs: isPresetMode ? 400 : 250,
                    maxRetryDelayMs: isPresetMode ? 3000 : 1200,
                    interPageDelayMs: isPresetMode ? 140 : 100,
                    firstPage429Retries: isPresetMode ? 3 : 2,
                    firstPage429DelayMs: isPresetMode ? 1800 : 1400,
                    signal: controller.signal,
                    debugLog: isDevRuntime,
                    uiPerPage: YEAR_PER_PAGE,
                    debugKey: normalizedBrowsePreset
                        ? (normalizedBrowsePreset?.title || 'season-preset')
                        : `year-${selectedBrowseYear}`,
                    onRetry: (info) => {
                        if (!isDevRuntime) return;
                        console.info('[AddAnimeScreen] upstream retry', {
                            key: requestOptions.debugKey,
                            ...info
                        });
                    }
                };

                if (normalizedBrowsePreset) {
                    requestOptions.season = normalizedBrowsePreset.mediaSeason;
                    requestOptions.statusIn = normalizedBrowsePreset.statusIn;
                    requestOptions.statusNot = normalizedBrowsePreset.statusNot;
                }

                let items = [];
                let error = null;
                const maxAutoRetry = 3;
                for (let attempt = 1; attempt <= maxAutoRetry; attempt += 1) {
                    const result = await fetchAnimeByYearAllPages(selectedBrowseYear, requestOptions);
                    items = Array.isArray(result?.items) ? result.items : [];
                    error = result?.error || null;
                    if (browseRequestIdRef.current !== requestId || controller.signal.aborted) return;

                    const statusCode = Number(error?.status) || 0;
                    const hasError = Boolean(error);
                    const hasItems = items.length > 0;
                    const isAbort = error?.name === 'AbortError';
                    const shouldRetry =
                        !isAbort
                        && hasError
                        && !hasItems
                        && attempt < maxAutoRetry
                        && (statusCode === 429 || statusCode >= 500 || statusCode === 0);
                    if (!shouldRetry) break;

                    const waitMs = statusCode === 429
                        ? (900 * attempt) + 900
                        : 650 * attempt;
                    if (isDevRuntime) {
                        console.info('[AddAnimeScreen] auto retry', {
                            key: requestOptions.debugKey,
                            attempt,
                            nextAttempt: attempt + 1,
                            waitMs,
                            statusCode: statusCode || null,
                            message: error?.message || '',
                        });
                    }
                    await waitWithAbort(waitMs, controller.signal);
                }

                if (browseRequestIdRef.current !== requestId) return;
                if (controller.signal.aborted) return;

                const safeItems = Array.isArray(items) ? items : [];

                if (error && safeItems.length === 0) {
                    const isAbort = error?.name === 'AbortError';
                    if (isAbort) return;
                    const sourceLabel = normalizedBrowsePreset ? '作品リスト' : '年代リスト';
                    const statusCode = Number(error?.status) || 0;
                    const isRateLimit = statusCode === 429 || String(error?.message || '').includes('429');
                    const retryAfterMsRaw = Number(error?.retryAfterMs);
                    const retryAfterMs = Number.isFinite(retryAfterMsRaw) && retryAfterMsRaw > 0
                        ? retryAfterMsRaw
                        : 0;
                    const retryAfterSec = retryAfterMs > 0 ? Math.ceil(retryAfterMs / 1000) : 0;
                    const baseMessage = isRateLimit
                        ? `${sourceLabel}の取得が混み合っています。少し時間をおいて再試行してください。`
                        : `${sourceLabel}の取得に失敗しました。時間をおいて再試行してください。`;
                    const retryHint = retryAfterSec > 0 ? ` 約${retryAfterSec}秒後に再試行できます。` : '';
                    const debugMessage = (typeof import.meta !== 'undefined' && import.meta.env?.DEV)
                        ? ` (${error.message || 'unknown error'})`
                        : '';
                    const fallbackEntry = browseDataKey ? BROWSE_RESULTS_CACHE.get(browseDataKey) : null;
                    const fallbackItems = Array.isArray(fallbackEntry?.items) ? fallbackEntry.items : [];
                    if (retryAfterMs > 0) {
                        const retryUntil = Date.now() + retryAfterMs;
                        setBrowseRetryUntilTs(retryUntil);
                        const key = browseDataKey || `year:${selectedBrowseYear}`;
                        const autoRetryCount = Number(browseAutoRetryCountRef.current.get(key) || 0);
                        if (autoRetryCount < 2) {
                            setBrowseAutoRetryPlan({ key, runAt: retryUntil });
                        } else {
                            setBrowseAutoRetryPlan(null);
                        }
                    } else {
                        setBrowseRetryUntilTs(0);
                        setBrowseAutoRetryPlan(null);
                    }
                    if (fallbackItems.length > 0) {
                        setBrowseResults(fallbackItems);
                        setBrowsePage(1);
                        setBrowseError(`${baseMessage}${retryHint} 前回取得した一覧を表示しています。${debugMessage}`);
                    } else {
                        setBrowseResults([]);
                        setBrowsePage(1);
                        setBrowseError(`${baseMessage}${retryHint}${debugMessage}`);
                    }
                } else if (!safeItems || safeItems.length === 0) {
                    setBrowseResults([]);
                    setBrowsePage(1);
                    setBrowseError('');
                    setBrowseRetryUntilTs(0);
                    setBrowseAutoRetryPlan(null);
                } else {
                    setBrowseResults(safeItems);
                    setBrowsePage(1);
                    if (browseDataKey) {
                        BROWSE_RESULTS_CACHE.set(browseDataKey, {
                            items: safeItems,
                            savedAt: Date.now()
                        });
                        browseAutoRetryCountRef.current.set(browseDataKey, 0);
                    }
                    setBrowseError('');
                    setBrowseRetryUntilTs(0);
                    setBrowseAutoRetryPlan(null);
                }

                if (isDevRuntime) {
                    const presetLabel = normalizedBrowsePreset?.title || '年代リスト';
                    const visibleCount = safeItems.length > 0
                        ? safeItems.length
                        : (Array.isArray(BROWSE_RESULTS_CACHE.get(browseDataKey)?.items)
                            ? BROWSE_RESULTS_CACHE.get(browseDataKey).items.length
                            : 0);
                    const uiTotalPages = Math.max(1, Math.ceil(visibleCount / YEAR_PER_PAGE));
                    console.info('[AddAnimeScreen] browse summary', {
                        preset: presetLabel,
                        year: selectedBrowseYear,
                        season: normalizedBrowsePreset?.mediaSeason || null,
                        itemCount: visibleCount,
                        uiPerPage: YEAR_PER_PAGE,
                        uiTotalPages,
                        hasError: Boolean(error),
                        retryCountdownSec: browseRetryCountdownSec,
                        inFlight: browseInFlightRef.current,
                    });
                }
            } finally {
                browseInFlightRef.current = Math.max(0, browseInFlightRef.current - 1);
                if (browseRequestIdRef.current === requestId && !controller.signal.aborted) {
                    setBrowseLoading(false);
                }
                if (isDevRuntime) {
                    console.info('[AddAnimeScreen] browse fetch end', {
                        key: browseDataKey,
                        inFlight: browseInFlightRef.current
                    });
                }
            }
        };

        run();
        return () => {
            controller.abort();
        };
    }, [
        selectedBrowseYear,
        normalizedBrowsePreset,
        browseReloadToken,
        browseDataKey
    ]);

    useEffect(() => {
        if (entryTab !== 'browse') return;
        if (pendingBrowseScrollPageRef.current == null) return;
        if (browseLoading) return;

        const currentPage = Math.max(1, Number(browsePageInfo.currentPage) || browsePage);
        const requestedPage = Number(pendingBrowseScrollPageRef.current);

        if (currentPage === requestedPage) {
            requestAnimationFrame(() => {
                scrollToBrowseResultsTop('auto');
            });
            pendingBrowseScrollPageRef.current = null;
        }
    }, [entryTab, browseLoading, browsePageInfo.currentPage, browsePage]);

    const getSeasonKeyByMonth = (month) => {
        if (month >= 1 && month <= 3) return 'winter';
        if (month >= 4 && month <= 6) return 'spring';
        if (month >= 7 && month <= 9) return 'summer';
        if (month >= 10 && month <= 12) return 'autumn';
        return 'other';
    };

    const getSeasonKeyForAnime = (anime) => {
        const seasonRaw = String(anime?.season || '').toUpperCase();
        const seasonKeyBySeasonField = ANILIST_SEASON_TO_FILTER_KEY[seasonRaw];
        if (seasonKeyBySeasonField) {
            return seasonKeyBySeasonField;
        }
        const month = Number(anime?.startDate?.month) || 0;
        return getSeasonKeyByMonth(month);
    };

    const browseSeasonOptions = React.useMemo(() => {
        if (isBrowsePresetLocked && normalizedBrowsePreset?.seasonKey) {
            return SEASON_FILTER_OPTIONS.filter((option) => option.key === normalizedBrowsePreset.seasonKey);
        }
        const seasonSet = new Set(['winter', 'spring', 'summer', 'autumn']);
        browseResults.forEach((anime) => seasonSet.add(getSeasonKeyForAnime(anime)));
        browseSeasonFilters.forEach((seasonKey) => seasonSet.add(seasonKey));
        return SEASON_FILTER_OPTIONS.filter((option) => seasonSet.has(option.key));
    }, [browseResults, browseSeasonFilters, isBrowsePresetLocked, normalizedBrowsePreset]);

    const browseVisibleResults = React.useMemo(() => (
        browseResults.filter((anime) => {
            if (browseGenreFilters.length > 0) {
                const animeGenres = Array.isArray(anime?.genres) ? anime.genres : [];
                const hasGenreMatch = browseGenreFilters.some((genre) => animeGenres.includes(genre));
                if (!hasGenreMatch) return false;
            }
            if (browseSeasonFilters.length === 0) return true;
            const seasonKey = getSeasonKeyForAnime(anime);
            return browseSeasonFilters.includes(seasonKey);
        })
    ), [browseResults, browseGenreFilters, browseSeasonFilters]);

    const browsePagedResults = React.useMemo(() => {
        const current = Math.max(1, Number(browsePage) || 1);
        const startIndex = (current - 1) * YEAR_PER_PAGE;
        return browseVisibleResults.slice(startIndex, startIndex + YEAR_PER_PAGE);
    }, [browseVisibleResults, browsePage, YEAR_PER_PAGE]);

    useEffect(() => {
        const total = browseVisibleResults.length;
        const perPage = YEAR_PER_PAGE;
        const lastPage = Math.max(1, Math.ceil(total / perPage));
        const currentPage = Math.min(Math.max(1, Number(browsePage) || 1), lastPage);
        const hasNextPage = currentPage < lastPage;

        setBrowsePageInfo({
            total,
            perPage,
            currentPage,
            lastPage,
            hasNextPage
        });

        if (currentPage !== browsePage) {
            setBrowsePage(currentPage);
        }
    }, [browseVisibleResults.length, browsePage, YEAR_PER_PAGE]);

    const handleEntryTabChange = (nextTab) => {
        if (isBrowsePresetLocked && nextTab !== 'browse') return;
        if (nextTab === entryTab) return;
        entryScrollPositionsRef.current[entryTab] = window.scrollY || window.pageYOffset || 0;
        setEntryTab(nextTab);
    };

    const handleBrowseYearApply = () => {
        if (isBrowsePresetLocked) return;
        const year = parseBrowseYear(browseYearDraft);
        if (!Number.isFinite(year)) {
            setToast({ visible: true, message: '年を選択してください。', type: 'warning' });
            return;
        }
        setSelectedBrowseYear(year);
        setBrowsePage(1);
        setBrowseReloadToken((prev) => prev + 1);
    };

    const handleBrowseGenreToggle = (genre) => {
        setBrowseGenreFilters((prev) => {
            const exists = prev.includes(genre);
            const next = exists ? prev.filter((g) => g !== genre) : [...prev, genre];
            return next;
        });
        setBrowsePage(1);
    };

    const handleBrowseGenreClear = () => {
        setBrowseGenreFilters([]);
        setBrowsePage(1);
    };

    const handleBrowseSeasonToggle = (seasonKey) => {
        if (isBrowsePresetLocked) return;
        setBrowseSeasonFilters((prev) => {
            const exists = prev.includes(seasonKey);
            return exists ? prev.filter((key) => key !== seasonKey) : [...prev, seasonKey];
        });
        setBrowsePage(1);
    };

    const handleBrowseSeasonClear = () => {
        if (isBrowsePresetLocked) return;
        setBrowseSeasonFilters([]);
        setBrowsePage(1);
    };
    const handleBrowseRetry = () => {
        if (browseLoading) return;
        setBrowseRetryUntilTs(0);
        setBrowseRetryCountdownSec(0);
        setBrowseAutoRetryPlan(null);
        setBrowseReloadToken((prev) => prev + 1);
    };

    const handleBrowseToggle = (anime, isAdded) => {
        const title = anime?.title?.native || anime?.title?.romaji || anime?.title?.english || '作品';

        if (isAdded) {
            if (typeof onRemove === 'function') {
                onRemove(anime.id);
                setToast({ visible: true, message: `「${title}」の追加を取り消しました。`, type: 'warning' });
            } else {
                setToast({ visible: true, message: '削除処理を実行できませんでした。', type: 'warning' });
            }
            return;
        }

        const result = onAdd(anime);
        if (result.success) {
            setToast({ visible: true, message: `「${title}」を追加しました。`, type: 'success' });
        } else {
            setToast({ visible: true, message: result.message || 'すでに追加済みです。', type: 'warning' });
        }
    };

    const handleBrowseBookmarkToggle = (anime) => {
        if (typeof onToggleBookmark !== 'function') return;
        const title = anime?.title?.native || anime?.title?.romaji || anime?.title?.english || '作品';
        const result = onToggleBookmark(anime);
        if (result?.success) {
            if (result.action === 'removed') {
                setToast({ visible: true, message: `「${title}」をブックマークから外しました。`, type: 'warning' });
            } else {
                setToast({ visible: true, message: `「${title}」をブックマークに追加しました。`, type: 'success' });
            }
        } else if (result?.message) {
            setToast({ visible: true, message: result.message, type: 'warning' });
        }
    };

    const scrollToBrowseResultsTop = (behavior = 'smooth') => {
        if (entryTab !== 'browse') return;
        const el = browseResultsTopRef.current;
        if (!el) return;
        const top = el.getBoundingClientRect().top + (window.pageYOffset || window.scrollY || 0) - 8;
        window.scrollTo({
            top: Math.max(0, top),
            behavior
        });
    };

    const handleBrowsePageChange = (nextPage) => {
        const page = Number(nextPage);
        const currentPage = Math.max(1, Number(browsePageInfo.currentPage) || browsePage);
        const lastPage = Math.max(1, Number(browsePageInfo.lastPage) || currentPage);
        if (!Number.isFinite(page) || page < 1) return;
        if (page === currentPage) return;
        if (page > lastPage) return;
        pendingBrowseScrollPageRef.current = page;
        setBrowsePage(page);
        requestAnimationFrame(() => {
            scrollToBrowseResultsTop('auto');
        });
    };

    // 2. Search Logic (Manual Search)
    const handleSearch = async (e) => {
        if (e) e.preventDefault();
        if (!query.trim()) return;

        setIsSearching(true);
        autocompleteRequestIdRef.current += 1;
        setIsSuggesting(false);
        setShowSuggestions(false);
        setPreviewData(null); // Clear previous preview
        setStatus({ type: 'info', message: '検索中...' });

        const data = await fetchAnimeDetails(query);
        setIsSearching(false);

        if (data) {
            setPreviewData(data);
            setStatus({ type: 'info', message: '作品が見つかりました。内容を確認してください。' });
        } else {
            setPreviewData(null);
            setStatus({
                type: 'error',
                message: '作品が見つかりませんでした。タイトルを確認して再検索してください。'
            });
        }
    };

    // 3. Bulk Search Logic
    const handleBulkSearch = async (e) => {
        if (e) e.preventDefault();
        const inputTitles = bulkQuery.split('\n').map(t => t.trim()).filter(t => t.length > 0);
        if (inputTitles.length === 0) return;

        let titles = inputTitles;
        if (inputTitles.length > MAX_BULK_TITLES) {
            const keptTitles = inputTitles.slice(0, MAX_BULK_TITLES);
            const removedTitles = inputTitles.slice(MAX_BULK_TITLES);
            titles = keptTitles;
            setBulkQuery(keptTitles.join('\n'));
            setBulkOverflowInfo({
                removedTitles,
                removedCount: removedTitles.length,
                keptCount: keptTitles.length,
                totalEntered: inputTitles.length,
                cutoffTitle: removedTitles[0] || '',
                rule: '末尾から除外'
            });
            setToast({
                visible: true,
                type: 'warning',
                message: `上限超過のため ${removedTitles.length} 件を自動除外しました（末尾から）。`
            });
            setStatus({
                type: 'info',
                message: `上限 ${MAX_BULK_TITLES} 件を超えたため、末尾の ${removedTitles.length} 件を自動除外しました。`
            });
        } else {
            setBulkOverflowInfo(null);
        }

        setIsSearching(true);
        if (titles.length > RECOMMENDED_BULK_TITLES) {
            setStatus({
                type: 'info',
                message: `件数が多いため、安定性を優先した低速モードで処理します（${titles.length}件）。`
            });
        } else if (inputTitles.length <= MAX_BULK_TITLES) {
            setStatus({ type: '', message: '' });
        }
        setBulkProgress({ current: 0, total: titles.length });
        setBulkLiveStats({
            processed: 0,
            total: titles.length,
            hits: 0,
            notFound: 0,
            alreadyAdded: 0,
            timedOut: 0
        });
        setBulkPhase('firstPass');
        setBulkRetryProgress({ current: 0, total: 0 });
        setBulkCurrentTitle('');
        setBulkResults({ hits: [], notFound: [], alreadyAdded: [] });
        setBulkNotFoundStatus({});
        setBulkExecutionSummary({ added: 0, skipped: 0, target: bulkTarget });

        const hits = [];
        const notFound = [];
        const alreadyAdded = [];

        const isBookmarkTarget = bulkTarget === 'bookmark';
        const existingForTarget = isBookmarkTarget
            ? [...(animeList || []), ...(bookmarkList || [])]
            : [...(animeList || [])];
        const seenIds = new Set(existingForTarget.map((a) => a.id));
        const existingTitleSet = new Set(
            existingForTarget.flatMap(a => [
                normalizeTitleForCompare(a.title?.native || ''),
                normalizeTitleForCompare(a.title?.romaji || ''),
                normalizeTitleForCompare(a.title?.english || '')
            ].filter(Boolean))
        );
        const seenTitles = new Set();
        const toQuery = [];
        const queryToOriginal = [];

        for (let j = 0; j < titles.length; j++) {
            const title = titles[j];
            const normalizedTitle = normalizeTitleForCompare(title);
            if (!normalizedTitle) {
                alreadyAdded.push(title);
                continue;
            }
            if (seenTitles.has(normalizedTitle)) {
                alreadyAdded.push(title);
                continue;
            }
            seenTitles.add(normalizedTitle);

            const isAlreadyAdded = existingTitleSet.has(normalizedTitle);

            if (isAlreadyAdded) {
                alreadyAdded.push(title);
                continue;
            }

            toQuery.push(title);
            queryToOriginal.push(title);
        }

        const preProcessedCount = titles.length - toQuery.length;
        setBulkProgress({ current: preProcessedCount, total: titles.length });
        let liveHits = 0;
        let liveNotFound = 0;
        let liveAlreadyAdded = alreadyAdded.length;
        let liveTimedOut = 0;
        const liveSeenIds = new Set(seenIds);
        setBulkLiveStats({
            processed: preProcessedCount,
            total: titles.length,
            hits: liveHits,
            notFound: liveNotFound,
            alreadyAdded: liveAlreadyAdded,
            timedOut: liveTimedOut
        });

        if (toQuery.length > 0) {
            const concurrency = titles.length >= RECOMMENDED_BULK_TITLES ? 3 : 4;
            const interRequestDelayMs = titles.length >= RECOMMENDED_BULK_TITLES ? 100 : 50;
            const useFastFailMode = titles.length > RECOMMENDED_BULK_TITLES;
            const requestTimeoutMs = useFastFailMode ? BULK_FAST_PER_REQUEST_TIMEOUT_MS : BULK_PER_REQUEST_TIMEOUT_MS;
            const perTitleTimeoutMs = useFastFailMode ? BULK_FAST_PER_TITLE_TIMEOUT_MS : BULK_PER_TITLE_TIMEOUT_MS;
            const retryAttempts = useFastFailMode ? BULK_FAST_MAX_RETRY_ATTEMPTS : BULK_MAX_RETRY_ATTEMPTS;
            const retryBaseDelayMs = useFastFailMode ? BULK_FAST_RETRY_BASE_DELAY_MS : BULK_RETRY_BASE_DELAY_MS;
            const retryDelayCapMs = useFastFailMode ? BULK_FAST_RETRY_DELAY_CAP_MS : BULK_RETRY_DELAY_CAP_MS;

            const bulkData = await fetchAnimeDetailsBulk(toQuery, {
                concurrency,
                interRequestDelayMs,
                cooldownOn429Ms: 1000,
                timeoutMs: requestTimeoutMs,
                perTitleMaxMs: perTitleTimeoutMs,
                maxAttempts: retryAttempts,
                baseDelayMs: retryBaseDelayMs,
                maxRetryDelayMs: retryDelayCapMs,
                onProgress: ({ completed, hit, dataId, timedOut, title }) => {
                    setBulkCurrentTitle(title || '');
                    if (hit) {
                        if (dataId != null && liveSeenIds.has(dataId)) {
                            liveAlreadyAdded += 1;
                        } else {
                            liveHits += 1;
                            if (dataId != null) liveSeenIds.add(dataId);
                        }
                    } else {
                        liveNotFound += 1;
                    }
                    if (timedOut) {
                        liveTimedOut += 1;
                    }

                    setBulkProgress({ current: preProcessedCount + completed, total: titles.length });
                    setBulkLiveStats({
                        processed: preProcessedCount + completed,
                        total: titles.length,
                        hits: liveHits,
                        notFound: liveNotFound,
                        alreadyAdded: liveAlreadyAdded,
                        timedOut: liveTimedOut
                    });
                }
            });

            const unresolvedTitles = [];
            for (let k = 0; k < toQuery.length; k++) {
                const title = queryToOriginal[k];
                const data = Array.isArray(bulkData) ? bulkData[k] : null;
                if (data) {
                    if (seenIds.has(data.id)) {
                        alreadyAdded.push(title);
                    } else {
                        hits.push({ data, originalTitle: title });
                        seenIds.add(data.id);
                    }
                } else {
                    unresolvedTitles.push(title);
                }
            }

            // Second pass: recover false negatives that often succeed in single search.
            if (unresolvedTitles.length > 0) {
                setBulkPhase('retryPass');
                setBulkRetryProgress({ current: 0, total: unresolvedTitles.length });
                setBulkCurrentTitle('');
                const retryData = await fetchAnimeDetailsBulk(unresolvedTitles, {
                    concurrency: 2,
                    interRequestDelayMs: 120,
                    cooldownOn429Ms: 1000,
                    timeoutMs: 9000,
                    perTitleMaxMs: 6000,
                    maxAttempts: 2,
                    baseDelayMs: 300,
                    maxRetryDelayMs: 1200,
                    adaptiveFallback: true,
                    adaptiveSkipPrimary: true,
                    adaptiveMaxTerms: 4,
                    adaptivePerPage: 10,
                    adaptiveMinScore: 0.3,
                    adaptiveTimeoutMs: 2200,
                    adaptiveMaxAttempts: 1,
                    onProgress: ({ completed, hit, dataId, timedOut, title, adaptiveQuery }) => {
                        setBulkRetryProgress({ current: completed, total: unresolvedTitles.length });
                        const displayTitle =
                            adaptiveQuery && adaptiveQuery !== title
                                ? `${title} -> ${adaptiveQuery}`
                                : (title || '');
                        setBulkCurrentTitle(displayTitle);

                        if (hit) {
                            liveNotFound = Math.max(0, liveNotFound - 1);
                            if (dataId != null && liveSeenIds.has(dataId)) {
                                liveAlreadyAdded += 1;
                            } else {
                                liveHits += 1;
                                if (dataId != null) liveSeenIds.add(dataId);
                            }
                        }

                        if (timedOut) {
                            liveTimedOut += 1;
                        }

                        setBulkLiveStats({
                            processed: titles.length,
                            total: titles.length,
                            hits: liveHits,
                            notFound: liveNotFound,
                            alreadyAdded: liveAlreadyAdded,
                            timedOut: liveTimedOut
                        });
                    },
                });

                for (let r = 0; r < unresolvedTitles.length; r++) {
                    const title = unresolvedTitles[r];
                    const data = Array.isArray(retryData) ? retryData[r] : null;
                    if (data) {
                        if (seenIds.has(data.id)) {
                            alreadyAdded.push(title);
                        } else {
                            hits.push({ data, originalTitle: title });
                            seenIds.add(data.id);
                        }
                    } else {
                        notFound.push(title);
                    }
                }
            }
        }

        setBulkLiveStats({
            processed: titles.length,
            total: titles.length,
            hits: hits.length,
            notFound: notFound.length,
            alreadyAdded: alreadyAdded.length,
            timedOut: liveTimedOut
        });
        setBulkResults({ hits, notFound, alreadyAdded });
        setPendingList(prev => [...new Set([...prev, ...notFound])]); // Merge and unique
        setIsSearching(false);
        setBulkPhase('idle');
        setBulkRetryProgress({ current: 0, total: 0 });
        setBulkCurrentTitle('');
        setStatus({
            type: 'info',
            message: notFound.length > 0
                ? `一括検索が完了しました。未ヒット ${notFound.length} 件は「未ヒット（要確認）」から個別再検索できます。`
                : '一括検索が完了しました。'
        });
        setShowReview(true);
    };

    // 4. Selection Logic
    const handleSelectSuggestion = (anime) => {
        setPreviewData(anime);
        setQuery(anime.title.native || anime.title.romaji);
        setSuggestions([]);
        setIsSuggesting(false);
        setShowSuggestions(false);
        setStatus({ type: 'info', message: '作品が選択されました。内容を確認してください。' });
    };

    // 5. Bulk Add Execution
    const handleBulkConfirm = () => {
        const selectedAnimes = bulkResults.hits;
        let addedCount = 0;
        let skippedCount = 0;
        const localMyListIdSet = new Set((animeList || []).map((a) => a.id));
        const localBookmarkIdSet = new Set((bookmarkList || []).map((a) => a.id));

        if (bulkTarget === 'bookmark') {
            selectedAnimes.forEach((hit) => {
                const data = hit?.data;
                if (!data || typeof data.id !== 'number') {
                    skippedCount += 1;
                    return;
                }
                if (localMyListIdSet.has(data.id) || localBookmarkIdSet.has(data.id)) {
                    skippedCount += 1;
                    return;
                }
                if (typeof onToggleBookmark !== 'function') {
                    skippedCount += 1;
                    return;
                }
                const result = onToggleBookmark(data);
                if (result?.success && result.action === 'added') {
                    addedCount += 1;
                    localBookmarkIdSet.add(data.id);
                } else {
                    skippedCount += 1;
                }
            });
            setStatus({
                type: 'info',
                message: skippedCount > 0
                    ? `ブックマークに ${addedCount} 件追加、${skippedCount} 件は登録済みのためスキップしました。`
                    : `ブックマークに ${addedCount} 件追加しました。`
            });
        } else {
            selectedAnimes.forEach((hit) => {
                const data = hit?.data;
                if (!data || typeof data.id !== 'number') {
                    skippedCount += 1;
                    return;
                }
                if (localMyListIdSet.has(data.id)) {
                    skippedCount += 1;
                    return;
                }
                const result = onAdd(data);
                if (result.success) {
                    addedCount += 1;
                    localMyListIdSet.add(data.id);
                    localBookmarkIdSet.delete(data.id);
                } else {
                    skippedCount += 1;
                }
            });
            setStatus({
                type: 'info',
                message: skippedCount > 0
                    ? `マイリストに ${addedCount} 件追加、${skippedCount} 件は登録済みのためスキップしました。`
                    : `マイリストに ${addedCount} 件追加しました。`
            });
        }

        setBulkExecutionSummary({
            added: addedCount,
            skipped: skippedCount,
            target: bulkTarget
        });
        setBulkOverflowInfo(null);
        setIsBulkComplete(true);
    };

    // 6. Exclude Hit Logic
    const handleExcludeHit = (hit) => {
        setBulkResults(prev => ({
            ...prev,
            hits: prev.hits.filter(h => h.data.id !== hit.data.id)
        }));
        setPendingList(prev => [...new Set([...prev, hit.originalTitle])]);
    };

    const mergeRecoveredHit = (originalTitle, animeData) => {
        const data = animeData && typeof animeData.id === 'number' ? animeData : null;
        if (!data) {
            return { ok: false, reason: 'invalid' };
        }

        const isBookmarkTarget = bulkTarget === 'bookmark';
        const existingForTarget = isBookmarkTarget
            ? [...(animeList || []), ...(bookmarkList || [])]
            : [...(animeList || [])];
        const existingIdSet = new Set(existingForTarget.map((a) => a.id));

        if (existingIdSet.has(data.id)) {
            setBulkResults((prev) => ({
                ...prev,
                notFound: prev.notFound.filter((t) => t !== originalTitle),
                alreadyAdded: prev.alreadyAdded.includes(originalTitle)
                    ? prev.alreadyAdded
                    : [...prev.alreadyAdded, originalTitle]
            }));
            setPendingList((prev) => prev.filter((t) => t !== originalTitle));
            return { ok: false, reason: 'already-added' };
        }

        setBulkResults((prev) => {
            const hitExists = prev.hits.some((h) => h?.data?.id === data.id);
            const nextHits = hitExists ? prev.hits : [...prev.hits, { data, originalTitle }];
            return {
                ...prev,
                hits: nextHits,
                notFound: prev.notFound.filter((t) => t !== originalTitle)
            };
        });
        setPendingList((prev) => prev.filter((t) => t !== originalTitle));
        return { ok: true };
    };

    const handleRetryNotFoundTitle = async (title) => {
        const key = normalizeTitleForCompare(title) || title;
        setBulkNotFoundStatus((prev) => ({
            ...prev,
            [key]: { ...(prev[key] || {}), loading: true, error: '' }
        }));

        const recovered = await fetchAnimeDetails(title, {
            timeoutMs: 7000,
            maxAttempts: 2,
            baseDelayMs: 250,
            maxRetryDelayMs: 900,
            adaptiveFallback: true,
            adaptiveSkipPrimary: true,
            adaptiveMaxTerms: 4,
            adaptivePerPage: 10,
            adaptiveMinScore: 0.3,
            adaptiveTimeoutMs: 2400,
            adaptiveMaxAttempts: 1,
        });

        if (recovered) {
            const result = mergeRecoveredHit(title, recovered);
            setBulkNotFoundStatus((prev) => ({
                ...prev,
                [key]: { ...(prev[key] || {}), loading: false, error: '' }
            }));
            if (result.ok) {
                setToast({ visible: true, message: `「${title}」を再検索でヒットしました。`, type: 'success' });
            } else if (result.reason === 'already-added') {
                setToast({ visible: true, message: `「${title}」は登録済みのためスキップしました。`, type: 'warning' });
            }
            return;
        }

        setBulkNotFoundStatus((prev) => ({
            ...prev,
            [key]: {
                ...(prev[key] || {}),
                loading: false,
                error: '再検索でもヒットしませんでした。タイトルを見直して再検索してください。'
            }
        }));
    };

    // 7. Pending List Handlers
    const handleRemoveFromPending = (titleToRemove) => {
        setPendingList(prev => prev.filter(title => title !== titleToRemove));
        setBulkResults(prev => ({
            ...prev,
            notFound: prev.notFound.filter((title) => title !== titleToRemove)
        }));
        const key = normalizeTitleForCompare(titleToRemove) || titleToRemove;
        setBulkNotFoundStatus((prev) => {
            if (!prev[key]) return prev;
            const next = { ...prev };
            delete next[key];
            return next;
        });
    };

    const handleClearPending = () => {
        if (window.confirm('保留リストをすべて削除しますか？')) {
            setPendingList([]);
            setBulkResults((prev) => ({ ...prev, notFound: [] }));
            setBulkNotFoundStatus({});
        }
    };

    const copyTextToClipboard = async (text) => {
        const content = String(text || '').trim();
        if (!content) return false;

        if (navigator?.clipboard?.writeText) {
            try {
                await navigator.clipboard.writeText(content);
                return true;
            } catch (_) {
                // Fallback below.
            }
        }

        try {
            const textarea = document.createElement('textarea');
            textarea.value = content;
            textarea.setAttribute('readonly', '');
            textarea.style.position = 'fixed';
            textarea.style.opacity = '0';
            document.body.appendChild(textarea);
            textarea.focus();
            textarea.select();
            const copied = document.execCommand('copy');
            document.body.removeChild(textarea);
            return copied;
        } catch (_) {
            return false;
        }
    };

    const handleCopyPendingTitle = async (title) => {
        if (!title) return;
        if (!window.confirm(`「${title}」をコピーしますか？`)) return;
        const success = await copyTextToClipboard(title);
        if (success) {
            setToast({ visible: true, type: 'success', message: '作品名をコピーしました。' });
        } else {
            setToast({ visible: true, type: 'warning', message: 'コピーに失敗しました。ブラウザ権限をご確認ください。' });
        }
    };

    const handleCopyAllPending = async () => {
        if (pendingList.length === 0) return;
        if (!window.confirm(`保留リスト ${pendingList.length} 件をコピーしますか？`)) return;
        const success = await copyTextToClipboard(pendingList.join('\n'));
        if (success) {
            setToast({ visible: true, type: 'success', message: `保留リスト ${pendingList.length} 件をコピーしました。` });
        } else {
            setToast({ visible: true, type: 'warning', message: 'コピーに失敗しました。ブラウザ権限をご確認ください。' });
        }
    };

    const handleCopyOverflowTitles = async () => {
        if (!bulkOverflowInfo || !Array.isArray(bulkOverflowInfo.removedTitles) || bulkOverflowInfo.removedTitles.length === 0) return;
        const text = bulkOverflowInfo.removedTitles.join('\n');
        const copied = await copyTextToClipboard(text);
        if (copied) {
            setToast({
                visible: true,
                type: 'success',
                message: `除外された ${bulkOverflowInfo.removedTitles.length} 件をコピーしました。`
            });
        } else {
            setToast({
                visible: true,
                type: 'warning',
                message: 'コピーに失敗しました。ブラウザの権限設定をご確認ください。'
            });
        }
    };

    const handlePreviewMyListToggle = () => {
        if (!previewData) return;
        const title = previewData?.title?.native || previewData?.title?.romaji || previewData?.title?.english || '作品';
        const isAdded = addedAnimeIds.has(previewData.id);

        const resetNormalSearchAfterComplete = (message, type = 'success', clearInput = true) => {
            setPreviewData(null);
            setSuggestions([]);
            setShowSuggestions(false);
            autocompleteRequestIdRef.current += 1;
            setIsSuggesting(false);
            if (clearInput) setQuery('');
            setStatus({ type: '', message: '' });
            setToast({ visible: true, message, type });
        };

        if (isAdded) {
            if (typeof onRemove !== 'function') {
                setStatus({ type: 'error', message: 'マイリスト削除を実行できませんでした。' });
                return;
            }
            onRemove(previewData.id);
            setToast({ visible: true, message: `「${title}」をマイリストから外しました。`, type: 'warning' });
            return;
        }

        const result = onAdd(previewData);
        if (result.success) {
            resetNormalSearchAfterComplete(`「${title}」をマイリストに追加しました。`, 'success', true);
        } else {
            setStatus({ type: 'error', message: result.message || '追加に失敗しました。' });
        }
    };

    const handlePreviewBookmarkToggle = () => {
        if (!previewData || typeof onToggleBookmark !== 'function') return;
        const title = previewData?.title?.native || previewData?.title?.romaji || previewData?.title?.english || '作品';
        const isAdded = addedAnimeIds.has(previewData.id);
        if (isAdded) {
            setStatus({ type: 'info', message: 'マイリスト登録済み作品はブックマークできません。' });
            return;
        }
        const result = onToggleBookmark(previewData);
        if (result?.success) {
            if (result.action === 'removed') {
                setStatus({ type: 'info', message: `「${title}」をブックマークから外しました。` });
            } else {
                setPreviewData(null);
                setSuggestions([]);
                setShowSuggestions(false);
                autocompleteRequestIdRef.current += 1;
                setIsSuggesting(false);
                setQuery('');
                setStatus({ type: '', message: '' });
                setToast({ visible: true, message: `「${title}」をブックマークに追加しました。`, type: 'success' });
            }
        } else if (result?.message) {
            setStatus({ type: 'error', message: result.message });
        }
    };

    // 8. Cancel Logic
    const handleCancel = () => {
        setPreviewData(null);
        setQuery('');
        setStatus({ type: '', message: '' });
        setSuggestions([]);
        setShowSuggestions(false);
        setShowReview(false);
        setIsBulkComplete(false);
        setBulkQuery('');
        autocompleteRequestIdRef.current += 1;
        setIsSuggesting(false);
        setBulkProgress({ current: 0, total: 0 });
        setBulkLiveStats({
            processed: 0,
            total: 0,
            hits: 0,
            notFound: 0,
            alreadyAdded: 0,
            timedOut: 0
        });
        setBulkPhase('idle');
        setBulkRetryProgress({ current: 0, total: 0 });
        setBulkCurrentTitle('');
        setBulkExecutionSummary({ added: 0, skipped: 0, target: bulkTarget });
        setBulkOverflowInfo(null);
        setBulkNotFoundStatus({});
    };

    const guideSummaryText = isBrowsePresetLocked
        ? (normalizedBrowsePreset?.description || '対象シーズンの作品を追加できます。')
        : entryTab === 'search'
            ? (mode === 'bulk'
                ? '複数作品をまとめて追加できます。必要時のみ詳細ガイドを確認してください。'
                : '作品名を直接入力して追加する導線です。')
            : '年とジャンルから思い出しながら探す導線です。';
    const browseGenreSummaryText = browseGenreFilters.length > 0
        ? `選択中: ${browseGenreFilters.map((genre) => translateGenre(genre)).join(' / ')}`
        : 'ジャンル未選択（表示中の作品をすべて表示）';
    const browseSeasonSummaryText = browseSeasonFilters.length > 0
        ? `選択中: ${SEASON_FILTER_OPTIONS
            .filter((season) => browseSeasonFilters.includes(season.key))
            .map((season) => season.label)
            .join(' / ')}`
        : '放送時期未選択（表示中の作品をすべて表示）';
    const browseCurrentPage = Math.max(1, Number(browsePageInfo.currentPage) || browsePage);
    const browseLastPage = Math.max(1, Number(browsePageInfo.lastPage) || browseCurrentPage);
    const browsePerPage = Math.max(1, Number(browsePageInfo.perPage) || YEAR_PER_PAGE);
    const browseRangeStart = browsePagedResults.length > 0
        ? ((browseCurrentPage - 1) * browsePerPage) + 1
        : 0;
    const browseRangeEnd = browseRangeStart > 0
        ? browseRangeStart + browsePagedResults.length - 1
        : 0;
    const bulkTargetLabel = bulkTarget === 'bookmark' ? 'ブックマーク' : 'マイリスト';
    const bulkCompleteTargetLabel = bulkExecutionSummary.target === 'bookmark' ? 'ブックマーク' : 'マイリスト';
    const bulkAlreadyAddedLabel = bulkTarget === 'bookmark'
        ? '登録済み・重複（視聴済み / ブックマーク済み）'
        : '登録済み・重複';
    const browseResultsTitle = normalizedBrowsePreset?.title || `${selectedBrowseYear}年の作品`;
    const browsePaginationLabel = normalizedBrowsePreset?.title || `${selectedBrowseYear}年内のページ`;
    const renderBulkOverflowNotice = () => {
        if (!bulkOverflowInfo) return null;
        const cutoffTitle = bulkOverflowInfo.cutoffTitle || bulkOverflowInfo.removedTitles?.[0] || '';
        return (
            <div className="bulk-overflow-notice">
                <div className="bulk-overflow-header">
                    <strong>{`上限超過を検知: ${bulkOverflowInfo.totalEntered} 件入力 / ${bulkOverflowInfo.keptCount} 件を処理対象に維持`}</strong>
                    <span>{`${bulkOverflowInfo.removedCount} 件を ${bulkOverflowInfo.rule}`}</span>
                </div>
                {cutoffTitle && (
                    <div className="bulk-overflow-cutoff">
                        {`除外開始作品: 「${cutoffTitle}」以降の作品は除外されています。`}
                    </div>
                )}
                <div className="bulk-overflow-actions">
                    <button
                        type="button"
                        className="bulk-mini-button subtle"
                        onClick={handleCopyOverflowTitles}
                        disabled={isSearching}
                    >
                        除外分をコピー
                    </button>
                    <button
                        type="button"
                        className="bulk-mini-button subtle"
                        onClick={() => setBulkOverflowInfo(null)}
                        disabled={isSearching}
                    >
                        表示を閉じる
                    </button>
                </div>
                <details className="bulk-overflow-details">
                    <summary>除外された作品一覧を表示</summary>
                    <ul className="bulk-overflow-list">
                        {bulkOverflowInfo.removedTitles.map((title, idx) => (
                            <li key={`${title}-${idx}`}>{title}</li>
                        ))}
                    </ul>
                </details>
            </div>
        );
    };

    const handleBrowseScrollToTop = () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleBrowseScrollToBottom = () => {
        const docH = Math.max(
            document.body?.scrollHeight || 0,
            document.documentElement?.scrollHeight || 0
        );
        window.scrollTo({ top: docH, behavior: 'smooth' });
    };

    return (
        <div className="add-screen-container page-shell has-bottom-home-nav">
            <div className="add-screen-header">
                <h2 className="page-main-title">{screenTitle}</h2>
                <p className="page-main-subtitle">{screenSubtitle}</p>
                {normalizedBrowsePreset?.title && (
                    <div className="browse-preset-note">{normalizedBrowsePreset.title}</div>
                )}

                {!isBrowsePresetLocked && (
                    <div className="entry-tab-switcher">
                        <button
                            className={`entry-tab-button ${entryTab === 'search' ? 'active' : ''}`}
                            onClick={() => handleEntryTabChange('search')}
                            disabled={isSearching || browseLoading}
                        >
                            検索で追加
                        </button>
                        <button
                            className={`entry-tab-button ${entryTab === 'browse' ? 'active' : ''}`}
                            onClick={() => handleEntryTabChange('browse')}
                            disabled={isSearching || browseLoading}
                        >
                            年代リストから追加
                        </button>
                    </div>
                )}

                <div className="entry-guide-inline">
                    <div className="entry-guide-summary-wrap">
                        <span className="entry-guide-badge">{entryTab === 'search' ? '検索型' : '探索型'}</span>
                        <p className="entry-guide-summary">{guideSummaryText}</p>
                    </div>
                    <button
                        type="button"
                        className="entry-guide-toggle"
                        onClick={() => setShowGuide(prev => !prev)}
                    >
                        {showGuide ? '詳細ガイドを隠す' : '詳細ガイドを表示'}
                    </button>
                </div>

                {showGuide && (
                    <div className="add-info-grid compact">
                        <div className="add-description">
                            <h3>使い方</h3>
                            {entryTab === 'search' ? (
                                <ul>
                                    <li>追加したい作品名を入力してください</li>
                                    {mode === 'normal' ? (
                                        <li>表示される候補から選択するか、検索ボタンを押してください</li>
                                    ) : (
                                        <li>{`複数の作品名を改行区切りで入力（貼り付け）してください（最大 ${MAX_BULK_TITLES}件）`}</li>
                                    )}
                                    <li>内容を確認して「登録する」を押してください</li>
                                </ul>
                            ) : (
                                <ul>
                                    {isBrowsePresetLocked ? (
                                        <>
                                            <li>対象シーズンの作品が自動表示されます</li>
                                            <li>各作品カードからブックマーク/マイリストへ追加できます</li>
                                            <li>登録済み作品はボタン表示で状態を確認できます</li>
                                        </>
                                    ) : (
                                        <>
                                            <li>まず年を選択して「一覧を表示」を押してください</li>
                                            <li>ジャンル・放送時期を複数選択すると OR 条件で絞り込めます</li>
                                            <li>表示された一覧から作品を追加してください</li>
                                        </>
                                    )}
                                </ul>
                            )}
                        </div>

                        <div className="search-spec">
                            <h3>{entryTab === 'search' ? '検索のコツ' : '探索ガイド'}</h3>
                            {entryTab === 'search' ? (
                                <ul>
                                    <li>正式名称（例: STEINS;GATE）での検索を推奨します</li>
                                    <li>英語タイトルの方がヒットしやすい可能性があります</li>
                                    <li>略称よりも正式なタイトルの方がヒットしやすいです</li>
                                </ul>
                            ) : (
                                <ul>
                                    <li>{isBrowsePresetLocked ? '対象シーズンの作品を一覧から選んで追加してください' : 'ピンポイント検索は「検索で追加」をご利用ください'}</li>
                                    <li>年代リストは思い出しながら探す用途に適しています</li>
                                    <li>ページは年全体で切り替わり、季節単位では分割しません</li>
                                </ul>
                            )}
                        </div>
                    </div>
                )}

                {/* Mode Switcher */}
                {entryTab === 'search' && (
                    <div className="mode-switcher-block">
                        <div className="mode-switcher-label">追加モード</div>
                        <div className="mode-switcher">
                            <button
                                className={`mode-button ${mode === 'normal' ? 'active' : ''}`}
                                onClick={() => { setMode('normal'); handleCancel(); }}
                                disabled={isSearching}
                            >
                                通常追加
                            </button>
                            <button
                                className={`mode-button ${mode === 'bulk' ? 'active' : ''}`}
                                onClick={() => { setMode('bulk'); handleCancel(); }}
                                disabled={isSearching}
                            >
                                一括追加
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {entryTab === 'search' && (mode === 'normal' ? (
                !previewData && (
                    <form onSubmit={handleSearch} className="add-form">
                        <div className="search-field-wrapper">
                            <input
                                type="text"
                                value={query}
                                onChange={(e) => {
                                    setQuery(e.target.value);
                                    if (previewData) setPreviewData(null); // Reset preview when typing
                                }}
                                placeholder="作品タイトルを入力（日本語・英語可）"
                                disabled={isSearching}
                                className="search-input"
                                onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                                onFocus={() => {
                                    if (query.trim().length >= 2) setShowSuggestions(true);
                                }}
                            />

                            {showSuggestions && isSuggesting && (
                                <div className="suggestions-loading">候補を検索中...</div>
                            )}

                            {/* Suggestions Dropdown */}
                            {showSuggestions && suggestions.length > 0 && (
                                <div className="suggestions-dropdown">
                                    {suggestions.map((anime) => (
                                        <div
                                            key={anime.id}
                                            className="suggestion-item"
                                            onClick={() => handleSelectSuggestion(anime)}
                                        >
                                            <img
                                                src={anime.coverImage.large}
                                                alt=""
                                                className="suggestion-thumb"
                                            />
                                            <div className="suggestion-info">
                                                <div className="suggestion-title">
                                                    {anime.title.native || anime.title.romaji}
                                                </div>
                                                <div className="suggestion-meta">
                                                    {anime.seasonYear && <span>{anime.seasonYear}年</span>}
                                                    {anime.episodes && <span>{anime.episodes}話</span>}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                        <button type="submit" className="action-button primary-button" disabled={isSearching}>
                            {isSearching ? '検索中...' : '作品を検索する'}
                        </button>
                    </form>
                )
            ) : (
                <div className="bulk-add-section">
                    {!showReview ? (
                        <form onSubmit={handleBulkSearch} className="add-form">
                            <div className="mode-switcher-block bulk-target-switcher">
                                <div className="mode-switcher-label">一括追加先</div>
                                <div className="mode-switcher">
                                    <button
                                        type="button"
                                        className={`mode-button ${bulkTarget === 'mylist' ? 'active' : ''}`}
                                        onClick={() => setBulkTarget('mylist')}
                                        disabled={isSearching}
                                    >
                                        マイリスト
                                    </button>
                                    <button
                                        type="button"
                                        className={`mode-button ${bulkTarget === 'bookmark' ? 'active' : ''}`}
                                        onClick={() => setBulkTarget('bookmark')}
                                        disabled={isSearching}
                                    >
                                        ブックマーク
                                    </button>
                                </div>
                            </div>
                            <textarea
                                value={bulkQuery}
                                onChange={(e) => setBulkQuery(e.target.value)}
                                placeholder="作品タイトルを改行区切りで入力してください&#10;例：&#10;やはり俺の青春ラブコメはまちがっている。&#10;STEINS;GATE&#10;氷菓"
                                disabled={isSearching}
                                className="bulk-textarea"
                                rows={10}
                            />
                            <div className="bulk-limit-note">
                                {`追加先: ${bulkTargetLabel} / 一度に登録できるのは最大 ${MAX_BULK_TITLES} 件までです（推奨 ${RECOMMENDED_BULK_TITLES} 件）。登録済み作品はスキップされます。`}
                            </div>
                            {isSearching && (
                                <div className="bulk-search-progress">
                                    <div className="bulk-progress-header">
                                        <div className="progress-info">
                                            {bulkPhase === 'retryPass' ? '未ヒット作品を再検索中' : '一括検索中'}
                                        </div>
                                        <div className="progress-count-badge">
                                            {bulkPhase === 'retryPass'
                                                ? `${bulkRetryProgress.current} / ${bulkRetryProgress.total}`
                                                : `${bulkLiveStats.processed} / ${bulkLiveStats.total}`}
                                        </div>
                                    </div>
                                    <div className="progress-bar-mini">
                                        <div
                                            className="progress-fill-mini"
                                            style={{
                                                width: `${bulkPhase === 'retryPass'
                                                    ? (bulkRetryProgress.total > 0
                                                        ? (bulkRetryProgress.current / bulkRetryProgress.total) * 100
                                                        : 0)
                                                    : (bulkLiveStats.total > 0
                                                        ? (bulkLiveStats.processed / bulkLiveStats.total) * 100
                                                        : 0)}%`
                                            }}
                                        />
                                    </div>
                                    {bulkCurrentTitle && (
                                        <div className={`progress-current-title ${bulkPhase === 'retryPass' ? 'retry' : ''}`}>
                                            {bulkPhase === 'retryPass'
                                                ? `再検索中: ${bulkCurrentTitle}`
                                                : `処理中: ${bulkCurrentTitle}`}
                                        </div>
                                    )}
                                    <div className="bulk-progress-grid">
                                        <div className="progress-pill neutral">
                                            <span>処理済み</span>
                                            <strong>{bulkLiveStats.processed}</strong>
                                        </div>
                                        <div className="progress-pill hit">
                                            <span>ヒット</span>
                                            <strong>{bulkLiveStats.hits}</strong>
                                        </div>
                                        <div className="progress-pill miss">
                                            <span>未ヒット</span>
                                            <strong>{bulkLiveStats.notFound}</strong>
                                        </div>
                                        <div className="progress-pill dup">
                                            <span>重複</span>
                                            <strong>{bulkLiveStats.alreadyAdded}</strong>
                                        </div>
                                        {bulkLiveStats.timedOut > 0 && (
                                            <div className="progress-pill timeout">
                                                <span>打ち切り</span>
                                                <strong>{bulkLiveStats.timedOut}</strong>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                            <button type="submit" className="action-button primary-button" disabled={isSearching || !bulkQuery.trim()}>
                                {isSearching ? '検索中...' : '一括検索を開始する'}
                            </button>
                        </form>
                    ) : (
                        <div className="bulk-review-container">
                            <div className="bulk-review-header">
                                <h3>{isBulkComplete ? '一括追加が完了しました' : '検索結果の確認'}</h3>
                                {isBulkComplete ? (
                                    <div className="bulk-completion-summary">
                                        <div className="success-badge">
                                            <span className="badge-icon">✓</span>
                                            <span className="badge-text">
                                                {`${bulkExecutionSummary.added}件の作品を${bulkCompleteTargetLabel}に追加しました`}
                                            </span>
                                        </div>
                                        <p>
                                            {bulkExecutionSummary.skipped > 0
                                                ? `${bulkExecutionSummary.skipped}件は登録済みのためスキップされました。`
                                                : 'さらに作品を追加しますか？見つからなかった作品は保留リストで確認できます。'}
                                        </p>
                                    </div>
                                ) : (
                                    <p>検索された作品を確認し、登録を完了してください。</p>
                                )}
                            </div>

                            <div className="bulk-review-lists">
                                {!isBulkComplete && bulkResults.hits.length > 0 && (
                                    <div className="review-section">
                                        <h4>ヒットした作品 ({bulkResults.hits.length})</h4>
                                        <div className="review-hits-grid">
                                            {bulkResults.hits.map(hit => (
                                                <div key={hit.data.id} className="review-hit-item">
                                                    <button
                                                        className="exclude-hit-button"
                                                        onClick={() => handleExcludeHit(hit)}
                                                        title="この作品を除外する"
                                                    >
                                                        ×
                                                    </button>
                                                    <img src={hit.data.coverImage.large} alt="" />
                                                    <div className="hit-info">
                                                        <div className="hit-title">{hit.data.title.native || hit.data.title.romaji}</div>
                                                        <div className="hit-meta">{hit.data.seasonYear}年 / {hit.data.episodes}話</div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {!isBulkComplete && bulkResults.notFound.length > 0 && (
                                    <div className="review-section warning">
                                        <h4>未ヒット（要確認） ({bulkResults.notFound.length})</h4>
                                        <ul className="bulk-notfound-list">
                                            {bulkResults.notFound.map((title, idx) => {
                                                const assistKey = normalizeTitleForCompare(title) || title;
                                                const assist = bulkNotFoundStatus[assistKey] || {};
                                                return (
                                                    <li key={`${title}-${idx}`} className="bulk-notfound-item">
                                                        <div className="bulk-notfound-row">
                                                            <span className="bulk-notfound-title">{title}</span>
                                                            <div className="bulk-notfound-actions">
                                                                <button
                                                                    type="button"
                                                                    className="bulk-mini-button"
                                                                    onClick={() => handleRetryNotFoundTitle(title)}
                                                                    disabled={!!assist.loading}
                                                                >
                                                                    個別再検索
                                                                </button>
                                                            </div>
                                                        </div>
                                                        {assist.loading && (
                                                            <div className="bulk-notfound-hint">個別再検索中...</div>
                                                        )}
                                                        {!assist.loading && assist.error && (
                                                            <div className="bulk-notfound-hint warning">{assist.error}</div>
                                                        )}
                                                    </li>
                                                );
                                            })}
                                        </ul>
                                    </div>
                                )}

                                {!isBulkComplete && bulkResults.alreadyAdded.length > 0 && (
                                    <div className="review-section subtle">
                                        <h4>{bulkAlreadyAddedLabel} ({bulkResults.alreadyAdded.length})</h4>
                                        <ul className="simple-list">
                                            {bulkResults.alreadyAdded.map((t, i) => <li key={i}>{t}</li>)}
                                        </ul>
                                    </div>
                                )}
                            </div>

                            {!isBulkComplete && renderBulkOverflowNotice()}

                            <div className="bulk-actions grouped">
                                {!isBulkComplete ? (
                                    <>
                                        <button className="action-button primary-button" onClick={handleBulkConfirm}>
                                            {`上記をすべて${bulkTargetLabel}に追加する`}
                                        </button>
                                        <button className="action-button dismiss-button" onClick={handleCancel}>
                                            キャンセル
                                        </button>
                                    </>
                                ) : (
                                    <div className="completion-actions">
                                        <button className="action-button primary-button" onClick={handleCancel}>
                                            新しい検索を開始する
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            ))}

            {entryTab === 'browse' && (
                <div className="entry-browse-section">
                    <div className="browse-control-panel">
                        {isBrowsePresetLocked ? (
                            <div className="browse-guide-note">
                                {normalizedBrowsePreset?.description || '対象シーズンの作品を表示しています。'}
                            </div>
                        ) : (
                            <>
                                <div className="browse-year-controls">
                                    <select
                                        className="browse-year-select"
                                        value={browseYearDraft}
                                        onChange={(e) => setBrowseYearDraft(e.target.value)}
                                        disabled={browseLoading}
                                    >
                                        <option value="">年を選択してください</option>
                                        {browseYearOptions.map((year) => (
                                            <option key={year} value={year}>{year}年</option>
                                        ))}
                                    </select>
                                    <button
                                        className="action-button primary-button browse-apply-button"
                                        onClick={handleBrowseYearApply}
                                        disabled={browseLoading}
                                        type="button"
                                    >
                                        一覧を表示
                                    </button>
                                </div>

                                <div className="browse-guide-note">
                                    ピンポイント検索は「検索で追加」をご利用ください。
                                </div>
                            </>
                        )}
                    </div>

                    {!selectedBrowseYear ? (
                        <div className="browse-empty-state">上のプルダウンで年を選び、「一覧を表示」を押してください。</div>
                    ) : (
                        <div className="browse-results-area" ref={browseResultsTopRef}>
                            <div className="browse-results-header">
                                <div className="browse-results-title">{browseResultsTitle}</div>
                                <div className="browse-results-meta">
                                    {browseVisibleResults.length > 0 ? (
                                        <>
                                            条件一致 {browseVisibleResults.length} 件中
                                            {' '}
                                            {browseRangeStart}〜{browseRangeEnd} 件を表示
                                            {' / '}
                                            {browseCurrentPage} / {browseLastPage} ページ
                                        </>
                                    ) : (
                                        <>0 件</>
                                    )}
                                </div>
                            </div>

                            <div className="browse-genre-section">
                                <div className="browse-filter-title">絞り込み条件（複数選択 / OR）</div>
                                <div className="browse-filter-grid">
                                    <div className="browse-filter-group">
                                        <div className="browse-genre-header">
                                            <div className="browse-genre-title">ジャンル</div>
                                            {browseGenreFilters.length > 0 && (
                                                <button
                                                    type="button"
                                                    className="browse-clear-filters-button"
                                                    onClick={handleBrowseGenreClear}
                                                    disabled={browseLoading}
                                                >
                                                    解除
                                                </button>
                                            )}
                                        </div>
                                        <div className="browse-genre-selected">{browseGenreSummaryText}</div>
                                        {browseGenreOptions.length > 0 ? (
                                            <div className="browse-genre-chips">
                                                {browseGenreOptions.map((genre) => {
                                                    const selected = browseGenreFilters.includes(genre);
                                                    return (
                                                        <button
                                                            key={genre}
                                                            type="button"
                                                            className={`browse-genre-chip ${selected ? 'active' : ''}`}
                                                            onClick={() => handleBrowseGenreToggle(genre)}
                                                            disabled={browseLoading}
                                                        >
                                                            {translateGenre(genre)}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        ) : (
                                            <div className="browse-genre-empty">表示中の作品からジャンルを読み込み中です。</div>
                                        )}
                                    </div>

                                    <div className="browse-filter-group">
                                        <div className="browse-genre-header">
                                            <div className="browse-genre-title">放送時期</div>
                                            {browseSeasonFilters.length > 0 && !isBrowsePresetLocked && (
                                                <button
                                                    type="button"
                                                    className="browse-clear-filters-button"
                                                    onClick={handleBrowseSeasonClear}
                                                    disabled={browseLoading}
                                                >
                                                    解除
                                                </button>
                                            )}
                                        </div>
                                        <div className="browse-genre-selected">{browseSeasonSummaryText}</div>
                                        {browseSeasonOptions.length > 0 ? (
                                            <div className="browse-genre-chips">
                                                {browseSeasonOptions.map((season) => {
                                                    const selected = browseSeasonFilters.includes(season.key);
                                                    return (
                                                        <button
                                                            key={season.key}
                                                            type="button"
                                                            className={`browse-genre-chip ${selected ? 'active' : ''}`}
                                                            onClick={() => handleBrowseSeasonToggle(season.key)}
                                                            disabled={browseLoading || isBrowsePresetLocked}
                                                        >
                                                            {season.label}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        ) : (
                                            <div className="browse-genre-empty">表示中の作品から放送時期を読み込み中です。</div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {browseLoading && (
                                <div className="browse-skeleton-grid">
                                    {Array.from({ length: 8 }).map((_, idx) => (
                                        <div key={idx} className="browse-skeleton-card">
                                            <div className="skeleton-thumb" />
                                            <div className="skeleton-line long" />
                                            <div className="skeleton-line short" />
                                            <div className="skeleton-line short" />
                                        </div>
                                    ))}
                                </div>
                            )}

                            {!browseLoading && (
                                <>
                                    <div className="browse-pagination">
                                        <span className="browse-pagination-context">
                                            {browsePaginationLabel}
                                        </span>
                                        <div className="browse-pagination-controls">
                                            <button
                                                type="button"
                                                className="browse-page-button"
                                                onClick={() => handleBrowsePageChange(browseCurrentPage - 1)}
                                                disabled={browseCurrentPage <= 1}
                                            >
                                                前ページ
                                            </button>
                                            <span className="browse-page-info">
                                                {browseCurrentPage} / {browseLastPage} ページ
                                            </span>
                                            <button
                                                type="button"
                                                className="browse-page-button"
                                                onClick={() => handleBrowsePageChange(browseCurrentPage + 1)}
                                                disabled={browseCurrentPage >= browseLastPage}
                                            >
                                                次ページ
                                            </button>
                                        </div>
                                    </div>

                                    {browseError && (
                                        <div className="browse-error-message" role="alert" aria-live="polite">
                                            <div className="browse-error-text">{browseError}</div>
                                            <div className="browse-error-actions">
                                                {browseRetryCountdownSec > 0 && (
                                                    <span className="browse-retry-countdown">
                                                        再試行まで: {browseRetryCountdownSec}秒
                                                    </span>
                                                )}
                                                <button
                                                    type="button"
                                                    className="browse-page-button browse-error-retry-button"
                                                    onClick={handleBrowseRetry}
                                                    disabled={browseLoading || browseRetryCountdownSec > 0}
                                                >
                                                    再試行
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    {browseVisibleResults.length === 0 ? (
                                        <div className="browse-filter-empty">条件に一致する作品はありません。</div>
                                    ) : (
                                        <div className="browse-card-grid">
                                            {browsePagedResults.map((anime) => {
                                                const isAdded = addedAnimeIds.has(anime.id);
                                                const isBookmarked = bookmarkIdSet.has(anime.id);
                                                const displayTitle = anime.title?.native || anime.title?.romaji || anime.title?.english;
                                                return (
                                                    <article key={anime.id} className="browse-anime-card">
                                                        <img src={anime.coverImage?.large} alt="" className="browse-card-thumb" />
                                                        <div className="browse-card-content">
                                                            <h4 className="browse-card-title">{displayTitle}</h4>
                                                            <div className="browse-card-meta">
                                                                <span>{anime.seasonYear || selectedBrowseYear}年</span>
                                                                {anime.format && <span>{anime.format}</span>}
                                                            </div>
                                                            <div className="browse-card-genres">
                                                                {(anime.genres || []).slice(0, 3).map((g) => translateGenre(g)).join(' / ')}
                                                            </div>
                                                            <div className="browse-card-actions">
                                                                <button
                                                                    type="button"
                                                                    className={`browse-add-button ${isAdded ? 'added' : 'not-added'}`}
                                                                    onClick={() => handleBrowseToggle(anime, isAdded)}
                                                                    aria-pressed={isAdded}
                                                                >
                                                                    {isAdded ? '✓ 追加済み（タップで取消）' : '＋ マイリストへ追加'}
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    className={`browse-sub-action-button ${isBookmarked ? 'active' : ''}`}
                                                                    onClick={() => handleBrowseBookmarkToggle(anime)}
                                                                    disabled={isAdded}
                                                                    aria-pressed={isBookmarked}
                                                                >
                                                                    {isAdded
                                                                        ? '視聴済み（ブックマーク不可）'
                                                                        : isBookmarked
                                                                            ? '★ ブックマーク済み（解除）'
                                                                            : '☆ ブックマークへ追加'}
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </article>
                                                );
                                            })}
                                        </div>
                                    )}

                                    <div className="browse-pagination browse-pagination-bottom">
                                        <span className="browse-pagination-context">
                                            {browsePaginationLabel}
                                        </span>
                                        <div className="browse-pagination-controls">
                                            <button
                                                type="button"
                                                className="browse-page-button"
                                                onClick={() => handleBrowsePageChange(browseCurrentPage - 1)}
                                                disabled={browseCurrentPage <= 1}
                                            >
                                                前ページ
                                            </button>
                                            <span className="browse-page-info">
                                                {browseCurrentPage} / {browseLastPage} ページ
                                            </span>
                                            <button
                                                type="button"
                                                className="browse-page-button"
                                                onClick={() => handleBrowsePageChange(browseCurrentPage + 1)}
                                                disabled={browseCurrentPage >= browseLastPage}
                                            >
                                                次ページ
                                            </button>
                                        </div>
                                    </div>

                                </>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* Status Message */}
            {entryTab === 'search' && status.message && !(mode === 'bulk' && isSearching) && !(mode === 'bulk' && showReview) && !(mode === 'normal' && previewData) && (
                <div className={`status-message-container ${status.type}`}>
                    <div className="status-text">{status.message}</div>
                </div>
            )}

            {entryTab === 'search' && mode === 'normal' && previewData && (
                <div className="preview-confirmation-card">
                    <div className="preview-card-header">
                        <h3>この作品で間違いないですか？</h3>
                    </div>
                    <div className="preview-card-body">
                        <img
                            src={previewData.coverImage.large}
                            alt="Preview"
                            className="preview-image"
                        />
                        <div className="preview-info-box">
                            <h4 className="preview-anime-title">
                                {previewData.title.native || previewData.title.romaji}
                            </h4>
                            <div className="preview-tags">
                                <span className="preview-tag">{previewData.seasonYear ? `${previewData.seasonYear}年` : '不明'}</span>
                                <span className="preview-tag">{previewData.episodes || '?'} 話</span>
                            </div>
                            <p className="preview-genres">
                                {previewData.genres?.slice(0, 3).map(g => translateGenre(g)).join(' / ')}
                            </p>
                        </div>
                    </div>
                    <div className="preview-card-actions">
                        <button
                            className="action-button confirm-execution-button"
                            onClick={handlePreviewMyListToggle}
                        >
                            <span className="btn-icon">✓</span>{addedAnimeIds.has(previewData.id) ? ' マイリスト追加済み（取消）' : ' マイリストへ追加'}
                        </button>
                        <button
                            className={`action-button preview-bookmark-button ${bookmarkIdSet.has(previewData.id) ? 'active' : ''}`}
                            onClick={handlePreviewBookmarkToggle}
                            disabled={addedAnimeIds.has(previewData.id)}
                        >
                            {addedAnimeIds.has(previewData.id)
                                ? '視聴済み（ブックマーク不可）'
                                : bookmarkIdSet.has(previewData.id)
                                    ? '★ ブックマーク済み（解除）'
                                    : '☆ ブックマークへ追加'}
                        </button>
                        <button
                            className="action-button dismiss-button"
                            onClick={handleCancel}
                        >
                            キャンセル
                        </button>
                    </div>
                </div>
            )}

            {/* Persistent Pending Checklist */}
            {entryTab === 'search' && pendingList.length > 0 && (
                <div className="pending-list-container">
                    <div className="pending-list-header">
                        <h3>保留リスト({pendingList.length})</h3>
                        <div className="pending-list-actions">
                            <button className="copy-pending-button" onClick={handleCopyAllPending}>
                                リストをコピー
                            </button>
                            <button className="clear-all-button" onClick={handleClearPending}>
                                すべて削除
                            </button>
                        </div>
                    </div>
                    <div className="pending-list-description">
                        一括追加で見つからなかった作品、または除外した作品です。必要に応じて再検索してください。
                    </div>
                    <ul className="pending-checklist">
                        {pendingList.map((title, index) => (
                            <li key={index} className="pending-item">
                                <span className="pending-title">{title}</span>
                                <button
                                    type="button"
                                    className="copy-pending-title-button"
                                    onClick={() => handleCopyPendingTitle(title)}
                                    title="作品名をコピー"
                                >
                                    コピー
                                </button>
                                <button
                                    className="remove-pending-button"
                                    onClick={() => handleRemoveFromPending(title)}
                                    title="削除"
                                >
                                    ×
                                </button>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {toast.visible && (
                <div className={`add-toast ${toast.type}`}>
                    {toast.message}
                </div>
            )}

            <nav className="screen-bottom-home-nav" aria-label="画面移動">
                <button type="button" className="screen-bottom-home-button" onClick={onBack}>
                    {backButtonLabel}
                </button>
            </nav>

            {entryTab === 'browse' && selectedBrowseYear && browseQuickNavState.visible && (
                <aside
                    className={`browse-quick-nav-rail add-screen-quick-nav ${browseQuickNavState.mobile ? 'mobile' : ''}`}
                    aria-label="一覧内ページ移動"
                >
                    <button
                        type="button"
                        className="browse-quick-nav-button"
                        onClick={handleBrowseScrollToTop}
                        disabled={browseQuickNavState.nearTop}
                        aria-label="一覧の最上部へ移動"
                        title="最上部へ"
                    >
                        ↑
                    </button>
                    <button
                        type="button"
                        className="browse-quick-nav-button"
                        onClick={handleBrowseScrollToBottom}
                        disabled={browseQuickNavState.nearBottom}
                        aria-label="一覧の最下部へ移動"
                        title="最下部へ"
                    >
                        ↓
                    </button>
                </aside>
            )}
        </div>
    );
}

export default AddAnimeScreen;



