import React, { useState, useEffect } from 'react';
import { fetchAnimeDetails, searchAnimeList, sleep } from '../../services/animeService';
import { translateGenre } from '../../constants/animeData';

function AddAnimeScreen({ onAdd, onBack, animeList = [] }) {
    const [mode, setMode] = useState('normal'); // 'normal' or 'bulk'
    const [query, setQuery] = useState('');
    const [bulkQuery, setBulkQuery] = useState('');
    const [suggestions, setSuggestions] = useState([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [previewData, setPreviewData] = useState(null);
    const [status, setStatus] = useState({ type: '', message: '' });
    const [isSearching, setIsSearching] = useState(false);

    // Bulk Add States
    const [bulkProgress, setBulkProgress] = useState({ current: 0, total: 0 });
    const [bulkResults, setBulkResults] = useState({
        hits: [],
        notFound: [],
        alreadyAdded: []
    });
    const [showReview, setShowReview] = useState(false);
    const [isBulkComplete, setIsBulkComplete] = useState(false);
    const [pendingList, setPendingList] = useState([]);

    // 1. Autocomplete Search Logic (Debounced)
    useEffect(() => {
        if (mode !== 'normal') return;
        const timer = setTimeout(async () => {
            if (query.trim().length >= 2 && !previewData) {
                const results = await searchAnimeList(query, 8);
                setSuggestions(results);
                setShowSuggestions(true);
            } else {
                setSuggestions([]);
                setShowSuggestions(false);
            }
        }, 300);

        return () => clearTimeout(timer);
    }, [query, previewData, mode]);

    // 2. Search Logic (Manual Search)
    const handleSearch = async (e) => {
        if (e) e.preventDefault();
        if (!query.trim()) return;

        setIsSearching(true);
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
                message: '作品が見つかりませんでした。\n全角や半角、大文字小文字、略称などを確認し、正式な名前で検索してみてください。'
            });
        }
    };

    // 3. Bulk Search Logic
    const handleBulkSearch = async (e) => {
        if (e) e.preventDefault();
        const titles = bulkQuery.split('\n').map(t => t.trim()).filter(t => t.length > 0);
        if (titles.length === 0) return;

        setIsSearching(true);
        setStatus({ type: '', message: '' });
        setBulkProgress({ current: 0, total: titles.length });
        setBulkResults({ hits: [], notFound: [], alreadyAdded: [] });

        const hits = [];
        const notFound = [];
        const alreadyAdded = [];

        for (let i = 0; i < titles.length; i++) {
            const title = titles[i];
            setBulkProgress(prev => ({ ...prev, current: i + 1 }));

            // Check if already in local list
            const isAlreadyAdded = animeList.some(a =>
                (a.title.native || "").toLowerCase() === title.toLowerCase() ||
                (a.title.romaji || "").toLowerCase() === title.toLowerCase() ||
                (a.title.english || "").toLowerCase() === title.toLowerCase()
            );

            if (isAlreadyAdded) {
                alreadyAdded.push(title);
            } else {
                const data = await fetchAnimeDetails(title);
                if (data) {
                    if (animeList.some(a => a.id === data.id)) {
                        alreadyAdded.push(title);
                    } else {
                        hits.push({ data, originalTitle: title });
                    }
                } else {
                    notFound.push(title);
                }
            }

            if (i < titles.length - 1) await sleep(200);
        }

        setBulkResults({ hits, notFound: [], alreadyAdded }); // notFound is now handled via pendingList
        setPendingList(prev => [...new Set([...prev, ...notFound])]); // Merge and unique
        setIsSearching(false);
        setShowReview(true);
    };

    // 4. Selection Logic
    const handleSelectSuggestion = (anime) => {
        setPreviewData(anime);
        setQuery(anime.title.native || anime.title.romaji);
        setSuggestions([]);
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
        if (window.confirm('保留リストをすべて消去しますか？')) {
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
    };

    return (
        <div className="add-screen-container">
            <div className="add-screen-header">
                <h2>作品を追加</h2>

                <div className="add-info-grid">
                    <div className="add-description">
                        <h3>操作方法</h3>
                        <ul>
                            <li>追加したい作品名を入力してください</li>
                            {mode === 'normal' ? (
                                <li>表示される候補から選択するか、検索ボタンを押してください</li>
                            ) : (
                                <li>複数の作品名を改行区切りで入力（貼り付け）してください</li>
                            )}
                            <li>正しい作品が表示されたら「登録する」を押してください</li>
                        </ul>
                    </div>

                    <div className="search-spec">
                        <h3>検索のコツ</h3>
                        <ul>
                            <li>正式名称（例：STEINS;GATE）での検索を推奨</li>
                            <li>英語タイトルの方がヒットしやすい場合があります</li>
                            <li>略称ではなく正確なタイトルで検索してください</li>
                        </ul>
                    </div>
                </div>

                {/* Mode Switcher */}
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

            {mode === 'normal' ? (
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
                                if (suggestions.length > 0) setShowSuggestions(true);
                            }}
                        />

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
                            {isSearching && (
                                <div className="bulk-search-progress">
                                    <div className="progress-info">
                                        検索中... ({bulkProgress.current} / {bulkProgress.total})
                                    </div>
                                    <div className="progress-bar-mini">
                                        <div
                                            className="progress-fill-mini"
                                            style={{ width: `${(bulkProgress.current / bulkProgress.total) * 100}%` }}
                                        />
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
                                        <p>さらに作品を追加しますか？ヒットしなかった作品は保留リストから確認できます。</p>
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
                                        <h4>登録済み・重複 ({bulkResults.alreadyAdded.length})</h4>
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
            )}

            {/* Status Message */}
            {status.message && (
                <div className={`status-message-container ${status.type}`}>
                    <div className="status-text">{status.message}</div>
                </div>
            )}

            {mode === 'normal' && previewData && (
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
                            <span className="btn-icon">✨</span> 登録する
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
            {pendingList.length > 0 && (
                <div className="pending-list-container">
                    <div className="pending-list-header">
                        <h3>保留リスト ({pendingList.length})</h3>
                        <button className="clear-all-button" onClick={handleClearPending}>
                            すべて削除
                        </button>
                    </div>
                    <div className="pending-list-description">
                        一括追加で見つからなかった、または除外された作品です。再検索の手がかりとして利用できます。
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
        </div>
    );
}

export default AddAnimeScreen;
