import React, { useState, useEffect, useCallback } from 'react';
import { fetchAnimeDetails, searchAnimeList } from '../../services/animeService';
import { translateGenre } from '../../constants/animeData';

function AddAnimeScreen({ onAdd, onBack }) {
    const [query, setQuery] = useState('');
    const [suggestions, setSuggestions] = useState([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [previewData, setPreviewData] = useState(null);
    const [status, setStatus] = useState({ type: '', message: '' });
    const [isSearching, setIsSearching] = useState(false);

    // 1. Autocomplete Search Logic (Debounced)
    useEffect(() => {
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
    }, [query, previewData]);

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

    // 3. Selection Logic
    const handleSelectSuggestion = (anime) => {
        setPreviewData(anime);
        setQuery(anime.title.native || anime.title.romaji);
        setSuggestions([]);
        setShowSuggestions(false);
        setStatus({ type: 'info', message: '作品が選択されました。内容を確認してください。' });
    };

    // 4. Confirm & Add Logic
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

    // 5. Cancel Logic
    const handleCancel = () => {
        setPreviewData(null);
        setQuery('');
        setStatus({ type: '', message: '' });
        setSuggestions([]);
        setShowSuggestions(false);
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
                            <li>表示される候補から選択するか、検索ボタンを押してください</li>
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
            </div>

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

            {/* Status Message */}
            {status.message && (
                <div className={`status-message-container ${status.type}`}>
                    <div className="status-text">{status.message}</div>
                </div>
            )}

            {previewData && (
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

            {/* Back Navigation */}
            <div className="add-screen-footer">
                <button
                    className="back-to-home-link"
                    onClick={onBack}
                >
                    ← ホームに戻る
                </button>
            </div>
        </div>
    );
}

export default AddAnimeScreen;
