import React, { useState, useEffect } from 'react';
import { fetchAnimeByYear, fetchAnimeDetails, fetchAnimeDetailsBulk, searchAnimeList } from '../../services/animeService';
import { translateGenre } from '../../constants/animeData';

function AddAnimeScreen({ onAdd, onBack, animeList = [] }) {
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
    const [entryTab, setEntryTab] = useState('search'); // 'search' or 'browse'
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
    const [showReview, setShowReview] = useState(false);
    const [isBulkComplete, setIsBulkComplete] = useState(false);
    const [pendingList, setPendingList] = useState([]);
    const [browseYearDraft, setBrowseYearDraft] = useState('');
    const [selectedBrowseYear, setSelectedBrowseYear] = useState(null);
    const [browsePage, setBrowsePage] = useState(1);
    const [browseGenreFilters, setBrowseGenreFilters] = useState([]);
    const [browseSeasonFilters, setBrowseSeasonFilters] = useState([]);
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
    const [toast, setToast] = useState({ visible: false, message: '', type: 'success' });
    const entryScrollPositionsRef = React.useRef({ search: 0, browse: 0 });
    const browseRequestIdRef = React.useRef(0);
    const browseResultsTopRef = React.useRef(null);

    const currentYear = new Date().getFullYear();
    const browseYearOptions = React.useMemo(
        () => Array.from({ length: currentYear - 1960 + 1 }, (_, idx) => currentYear - idx),
        [currentYear]
    );
    const addedAnimeIds = React.useMemo(() => new Set((animeList || []).map(a => a.id)), [animeList]);
    const browseGenreOptions = React.useMemo(() => {
        const genreSet = new Set(browseGenreFilters);
        browseResults.forEach((anime) => {
            (anime.genres || []).forEach((g) => genreSet.add(g));
        });
        return Array.from(genreSet).sort((a, b) => a.localeCompare(b));
    }, [browseResults, browseGenreFilters]);

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
        if (!toast.visible) return;
        const timer = setTimeout(() => {
            setToast(prev => ({ ...prev, visible: false }));
        }, 2200);
        return () => clearTimeout(timer);
    }, [toast.visible, toast.message]);

    useEffect(() => {
        if (!selectedBrowseYear) return;

        const requestId = browseRequestIdRef.current + 1;
        browseRequestIdRef.current = requestId;
        setBrowseLoading(true);
        setBrowseError('');

        const run = async () => {
            const { items, pageInfo, error } = await fetchAnimeByYear(selectedBrowseYear, {
                page: browsePage,
                perPage: YEAR_PER_PAGE,
                genreIn: browseGenreFilters,
                timeoutMs: 9000,
                maxAttempts: 2,
                baseDelayMs: 250,
                maxRetryDelayMs: 900,
            });

            if (browseRequestIdRef.current !== requestId) return;

            const total = Math.max(0, Number(pageInfo?.total) || 0);
            const perPage = Math.max(1, Number(pageInfo?.perPage) || YEAR_PER_PAGE);
            const currentPage = Math.max(1, Number(pageInfo?.currentPage) || browsePage);
            const lastPageFromApi = Math.max(1, Number(pageInfo?.lastPage) || 1);
            const derivedLastPage = Math.max(1, Math.ceil(total / perPage));
            const lastPage = Math.max(lastPageFromApi, derivedLastPage);
            const safeCurrentPage = Math.min(currentPage, lastPage);
            const safeItems = Array.isArray(items) ? items : [];

            if (total > 0 && safeItems.length === 0 && safeCurrentPage > 1) {
                const fallbackPage = safeCurrentPage - 1;
                if (fallbackPage !== browsePage) {
                    setBrowsePage(fallbackPage);
                    setBrowseLoading(false);
                    return;
                }
            }

            setBrowseResults(safeItems);
            setBrowsePageInfo({
                total,
                perPage,
                currentPage: safeCurrentPage,
                lastPage,
                hasNextPage: safeCurrentPage < lastPage && safeItems.length > 0,
            });

            if (error) {
                setBrowseError('年代リストの取得に失敗しました。時間をおいて再試行してください。');
            } else if (!safeItems || safeItems.length === 0) {
                setBrowseError('');
            }

            setBrowseLoading(false);
        };

        run();
    }, [selectedBrowseYear, browsePage, browseGenreFilters, YEAR_PER_PAGE]);

    const getSeasonKeyByMonth = (month) => {
        if (month >= 1 && month <= 3) return 'winter';
        if (month >= 4 && month <= 6) return 'spring';
        if (month >= 7 && month <= 9) return 'summer';
        if (month >= 10 && month <= 12) return 'autumn';
        return 'other';
    };

    const browseSeasonOptions = React.useMemo(() => {
        const seasonSet = new Set(browseSeasonFilters);
        browseResults.forEach((anime) => {
            const month = Number(anime?.startDate?.month) || 0;
            seasonSet.add(getSeasonKeyByMonth(month));
        });
        return SEASON_FILTER_OPTIONS.filter((option) => seasonSet.has(option.key));
    }, [browseResults, browseSeasonFilters]);

    const browseVisibleResults = React.useMemo(() => (
        browseResults.filter((anime) => {
            if (browseSeasonFilters.length === 0) return true;
            const month = Number(anime?.startDate?.month) || 0;
            const seasonKey = getSeasonKeyByMonth(month);
            return browseSeasonFilters.includes(seasonKey);
        })
    ), [browseResults, browseSeasonFilters]);

    const handleEntryTabChange = (nextTab) => {
        if (nextTab === entryTab) return;
        entryScrollPositionsRef.current[entryTab] = window.scrollY || window.pageYOffset || 0;
        setEntryTab(nextTab);
    };

    const handleBrowseYearApply = () => {
        const year = Number(browseYearDraft);
        if (!Number.isFinite(year)) {
            setToast({ visible: true, message: '年を選択してください。', type: 'warning' });
            return;
        }
        setSelectedBrowseYear(year);
        setBrowsePage(1);
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
        setBrowseSeasonFilters((prev) => {
            const exists = prev.includes(seasonKey);
            return exists ? prev.filter((key) => key !== seasonKey) : [...prev, seasonKey];
        });
        setBrowsePage(1);
    };

    const handleBrowseSeasonClear = () => {
        setBrowseSeasonFilters([]);
        setBrowsePage(1);
    };

    const handleBrowseAdd = (anime) => {
        const result = onAdd(anime);
        if (result.success) {
            const title = anime?.title?.native || anime?.title?.romaji || anime?.title?.english || '作品';
            setToast({ visible: true, message: `「${title}」を追加しました。`, type: 'success' });
        } else {
            setToast({ visible: true, message: result.message || 'すでに追加済みです。', type: 'warning' });
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
        const lastPage = Number(browsePageInfo.lastPage) || 1;
        if (!Number.isFinite(page) || page < 1 || page > lastPage) return;
        setBrowsePage(page);
        requestAnimationFrame(() => {
            scrollToBrowseResultsTop('smooth');
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
        const titles = bulkQuery.split('\n').map(t => t.trim()).filter(t => t.length > 0);
        if (titles.length === 0) return;
        if (titles.length > MAX_BULK_TITLES) {
            setStatus({
                type: 'error',
                message: `一度に追加できるのは最大 ${MAX_BULK_TITLES} 件です（現在 ${titles.length} 件）。`
            });
            return;
        }

        setIsSearching(true);
        if (titles.length > RECOMMENDED_BULK_TITLES) {
            setStatus({
                type: 'info',
                message: `件数が多いため、安定性を優先した低速モードで処理します（${titles.length}件）。`
            });
        } else {
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

        const hits = [];
        const notFound = [];
        const alreadyAdded = [];

        const seenIds = new Set((animeList || []).map(a => a.id));
        const existingTitleSet = new Set(
            (animeList || []).flatMap(a => [
                (a.title?.native || '').toLowerCase(),
                (a.title?.romaji || '').toLowerCase(),
                (a.title?.english || '').toLowerCase()
            ].filter(Boolean))
        );
        const seenTitles = new Set();
        const toQuery = [];
        const queryToOriginal = [];

        for (let j = 0; j < titles.length; j++) {
            const title = titles[j];
            const normalizedTitle = title.toLowerCase();
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
                    adaptiveMaxTerms: 2,
                    adaptivePerPage: 8,
                    adaptiveMinScore: 0.36,
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
        setBulkResults({ hits, notFound: [], alreadyAdded }); // notFound is now handled via pendingList
        setPendingList(prev => [...new Set([...prev, ...notFound])]); // Merge and unique
        setIsSearching(false);
        setBulkPhase('idle');
        setBulkRetryProgress({ current: 0, total: 0 });
        setBulkCurrentTitle('');
        setStatus({ type: '', message: '' });
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
        selectedAnimes.forEach(hit => {
            const result = onAdd(hit.data);
            if (result.success) addedCount++;
        });

        setStatus({ type: '', message: '' }); // Clear general status, message will be in the header
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

    // 7. Pending List Handlers
    const handleRemoveFromPending = (titleToRemove) => {
        setPendingList(prev => prev.filter(title => title !== titleToRemove));
    };

    const handleClearPending = () => {
        if (window.confirm('保留リストをすべて削除しますか？')) {
            setPendingList([]);
        }
    };

    // 8. Confirm & Add Logic
    const handleConfirm = () => {
        if (!previewData) return;

        const result = onAdd(previewData);
        if (result.success) {
            setStatus({ type: 'success', message: '登録が完了しました。' });
            setPreviewData(null); // Hide preview after success
            setQuery('');
        } else {
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
    };

    const guideSummaryText = entryTab === 'search'
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
    const browseLastPage = Math.max(1, Number(browsePageInfo.lastPage) || 1);
    const browsePerPage = Math.max(1, Number(browsePageInfo.perPage) || YEAR_PER_PAGE);
    const browseRangeStart = browsePageInfo.total > 0 && browseResults.length > 0
        ? ((browseCurrentPage - 1) * browsePerPage) + 1
        : 0;
    const browseRangeEnd = browseRangeStart > 0
        ? browseRangeStart + browseResults.length - 1
        : 0;

    return (
        <div className="add-screen-container">
            <div className="add-screen-header">
                <h2>作品を追加</h2>

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
                                    <li>まず年を選択して「一覧を表示」を押してください</li>
                                    <li>ジャンル・放送時期を複数選択すると OR 条件で絞り込めます</li>
                                    <li>表示された一覧から作品を追加してください</li>
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
                                    <li>ピンポイント検索は「検索で追加」をご利用ください</li>
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
                            autoFocus
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
            ) : (
                <div className="bulk-add-section">
                    {!showReview ? (
                        <form onSubmit={handleBulkSearch} className="add-form">
                            <textarea
                                value={bulkQuery}
                                onChange={(e) => setBulkQuery(e.target.value)}
                                placeholder="作品タイトルを改行区切りで入力してください&#10;例：&#10;やはり俺の青春ラブコメはまちがっている。&#10;STEINS;GATE&#10;氷菓"
                                disabled={isSearching}
                                className="bulk-textarea"
                                rows={10}
                            />
                            <div className="bulk-limit-note">
                                {`一度に登録できるのは最大 ${MAX_BULK_TITLES} 件までです（推奨 ${RECOMMENDED_BULK_TITLES} 件）。長時間の再試行は自動で打ち切り、次の作品へ進みます。`}
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
                                            <span className="badge-text">{bulkResults.hits.length}件の作品をリストに追加しました</span>
                                        </div>
                                        <p>さらに作品を追加しますか？見つからなかった作品は保留リストで確認できます。</p>
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

                                {bulkResults.alreadyAdded.length > 0 && (
                                    <div className="review-section subtle">
                                        <h4>登録済み・重複({bulkResults.alreadyAdded.length})</h4>
                                        <ul className="simple-list">
                                            {bulkResults.alreadyAdded.map((t, i) => <li key={i}>{t}</li>)}
                                        </ul>
                                    </div>
                                )}
                            </div>

                            <div className="bulk-actions grouped">
                                {!isBulkComplete ? (
                                    <>
                                        <button className="action-button primary-button" onClick={handleBulkConfirm}>
                                            上記をすべて登録する
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
                                        <button className="back-to-home-button" onClick={onBack}>
                                            ← ホームに戻る
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
                    </div>

                    {!selectedBrowseYear ? (
                        <div className="browse-empty-state">上のプルダウンで年を選び、「一覧を表示」を押してください。</div>
                    ) : (
                        <div className="browse-results-area" ref={browseResultsTopRef}>
                            <div className="browse-results-header">
                                <div className="browse-results-title">{selectedBrowseYear}年の作品</div>
                                <div className="browse-results-meta">
                                    {browsePageInfo.total > 0 ? (
                                        <>
                                            {browsePageInfo.total} 件中 {browseRangeStart}
                                            〜{browseRangeEnd} 件を取得
                                            {' / '}
                                            条件一致 {browseVisibleResults.length} 件を表示
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
                                            {browseSeasonFilters.length > 0 && (
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
                                                            disabled={browseLoading}
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
                                            {selectedBrowseYear}年内のページ
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
                                                disabled={!browsePageInfo.hasNextPage}
                                            >
                                                次ページ
                                            </button>
                                        </div>
                                    </div>

                                    {browseError && (
                                        <div className="browse-error-message">{browseError}</div>
                                    )}

                                    {browseVisibleResults.length === 0 ? (
                                        <div className="browse-filter-empty">条件に一致する作品はありません。</div>
                                    ) : (
                                        <div className="browse-card-grid">
                                            {browseVisibleResults.map((anime) => {
                                                const isAdded = addedAnimeIds.has(anime.id);
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
                                                            <button
                                                                type="button"
                                                                className={`browse-add-button ${isAdded ? 'done' : ''}`}
                                                                onClick={() => handleBrowseAdd(anime)}
                                                                disabled={isAdded}
                                                            >
                                                                {isAdded ? '✓ 追加済み' : '＋ 追加'}
                                                            </button>
                                                        </div>
                                                    </article>
                                                );
                                            })}
                                        </div>
                                    )}

                                    <div className="browse-pagination browse-pagination-bottom">
                                        <span className="browse-pagination-context">
                                            {selectedBrowseYear}年内のページ
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
                                                disabled={!browsePageInfo.hasNextPage}
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
            {entryTab === 'search' && status.message && !(mode === 'bulk' && isSearching) && (
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
                            onClick={handleConfirm}
                        >
                            <span className="btn-icon">✓</span> 登録する
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
                        <button className="clear-all-button" onClick={handleClearPending}>
                            すべて削除
                        </button>
                    </div>
                    <div className="pending-list-description">
                        一括追加で見つからなかった作品、または除外した作品です。必要に応じて再検索してください。
                    </div>
                    <ul className="pending-checklist">
                        {pendingList.map((title, index) => (
                            <li key={index} className="pending-item">
                                <span className="pending-title">{title}</span>
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

            {/* Back Navigation - Only show if NOT in bulk review complete mode */}
            {!isBulkComplete && (
                <div className="add-screen-footer">
                    <button
                        className="back-to-home-link"
                        onClick={onBack}
                    >
                        ← ホームに戻る
                    </button>
                </div>
            )}

            {toast.visible && (
                <div className={`add-toast ${toast.type}`}>
                    {toast.message}
                </div>
            )}
        </div>
    );
}

export default AddAnimeScreen;



