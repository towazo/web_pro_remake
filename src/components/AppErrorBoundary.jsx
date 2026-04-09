import React from 'react';

class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      error: null,
    };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Unhandled app render error:', error, errorInfo);
  }

  handleReload = () => {
    if (typeof window === 'undefined') return;
    window.location.reload();
  };

  render() {
    const { error } = this.state;
    if (error) {
      const message = String(error?.message || '不明なエラーが発生しました。');
      return (
        <div className="app-error-boundary">
          <div className="app-error-boundary-panel">
            <h1 className="app-error-boundary-title">アプリの表示中にエラーが発生しました</h1>
            <p className="app-error-boundary-message">{message}</p>
            <button
              type="button"
              className="app-error-boundary-reload"
              onClick={this.handleReload}
            >
              再読み込み
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default AppErrorBoundary;
