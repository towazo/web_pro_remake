import React from 'react';

function LoadingOverlay({ loaded, total }) {
    return (
        <div className="loading-bar-container">
            <div className="loading-text">
                作品データを取得中... {loaded} / {total}
            </div>
            <div className="progress-bar">
                <div
                    className="progress-fill"
                    style={{ width: `${(loaded / total) * 100}%` }}
                />
            </div>
        </div>
    );
}

export default LoadingOverlay;
