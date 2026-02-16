import React, { useEffect, useMemo, useRef, useState } from 'react';
import { fetchAuthConfig, loginWithGoogleCredential } from '../../services/authService';

const GOOGLE_SCRIPT_ID = 'google-identity-services';
const IS_DEV = typeof import.meta !== 'undefined' && Boolean(import.meta.env?.DEV);

const buildConfigErrorMessage = (error) => {
  if (!error) return 'ログイン設定の取得に失敗しました。';
  if (error.code === 'API_UNREACHABLE') {
    return IS_DEV
      ? '認証サーバーに接続できません。`npm run dev` を再起動し、server プロセスのログを確認してください。'
      : 'ログインサーバーに接続できませんでした。時間をおいて再試行してください。';
  }
  if (error.status >= 500) {
    return IS_DEV
      ? 'ログイン設定APIでサーバーエラーが発生しました。server ログを確認してください。'
      : 'ログイン設定の取得でサーバーエラーが発生しました。';
  }
  if (error.status === 404) {
    return IS_DEV
      ? 'ログイン設定APIが見つかりません。Vite の /api プロキシ設定を確認してください。'
      : 'ログイン機能を現在利用できません。';
  }
  return error.message || 'ログイン設定の取得に失敗しました。';
};

const buildLoginErrorMessage = (error) => {
  if (!error) return 'ログインに失敗しました。';
  if (error.code === 'AUTH_NOT_CONFIGURED') {
    return 'Google ログイン設定が未完了です。管理者にお問い合わせください。';
  }
  if (error.code === 'TOKEN_VERIFICATION_FAILED' || error.status === 401) {
    return 'Google 認証情報の検証に失敗しました。再度ログインをお試しください。';
  }
  if (error.status >= 500) {
    return IS_DEV
      ? 'ログイン処理でサーバーエラーが発生しました。server ログを確認してください。'
      : 'ログイン処理でエラーが発生しました。時間をおいて再試行してください。';
  }
  return error.message || 'ログインに失敗しました。';
};

const loadGoogleScript = () => new Promise((resolve, reject) => {
  if (typeof window === 'undefined') {
    reject(new Error('Google script is unavailable.'));
    return;
  }

  if (window.google?.accounts?.id) {
    resolve();
    return;
  }

  const existing = document.getElementById(GOOGLE_SCRIPT_ID);
  if (existing) {
    existing.addEventListener('load', () => resolve(), { once: true });
    existing.addEventListener('error', () => reject(new Error('Failed to load Google script.')), { once: true });
    return;
  }

  const script = document.createElement('script');
  script.id = GOOGLE_SCRIPT_ID;
  script.src = 'https://accounts.google.com/gsi/client';
  script.async = true;
  script.defer = true;
  script.onload = () => resolve();
  script.onerror = () => reject(new Error('Failed to load Google script.'));
  document.head.appendChild(script);
});

function LoginScreen({
  onBackHome,
  onLoginSuccess,
  switchAccountMode = false,
}) {
  const buttonContainerRef = useRef(null);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [debugMessage, setDebugMessage] = useState('');
  const [authConfig, setAuthConfig] = useState({ enabled: false, clientId: '' });

  const instructionText = useMemo(() => (
    switchAccountMode
      ? 'アカウントを切り替えるため、もう一度 Google でログインしてください。'
      : 'ログインすると、ブックマークやマイリストを端末間で同期できます。'
  ), [switchAccountMode]);

  useEffect(() => {
    let mounted = true;

    const setup = async () => {
      setLoadingConfig(true);
      setError('');
      setDebugMessage('');

      try {
        const config = await fetchAuthConfig();
        if (!mounted) return;
        setAuthConfig({
          enabled: Boolean(config?.enabled),
          clientId: String(config?.clientId || ''),
        });
      } catch (configError) {
        if (!mounted) return;
        setError(buildConfigErrorMessage(configError));
        if (IS_DEV) {
          setDebugMessage(configError?.debugDetail || configError?.message || '');
        }
      } finally {
        if (mounted) {
          setLoadingConfig(false);
        }
      }
    };

    setup();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const setupGoogleButton = async () => {
      if (loadingConfig || !authConfig.enabled || !authConfig.clientId) return;
      if (!buttonContainerRef.current) return;

      try {
        await loadGoogleScript();
        if (cancelled) return;

        if (!window.google?.accounts?.id) {
          throw new Error('Google 認証の初期化に失敗しました。');
        }

        window.google.accounts.id.initialize({
          client_id: authConfig.clientId,
          auto_select: false,
          cancel_on_tap_outside: true,
          callback: async (response) => {
            const credential = response?.credential;
            if (!credential) {
              setError('Google 認証に失敗しました。もう一度お試しください。');
              if (IS_DEV) setDebugMessage('');
              return;
            }

            try {
              setSubmitting(true);
              setError('');
              if (IS_DEV) setDebugMessage('');
              const result = await loginWithGoogleCredential(credential);
              onLoginSuccess?.(result?.user || null);
            } catch (loginError) {
              setError(buildLoginErrorMessage(loginError));
              if (IS_DEV) {
                setDebugMessage(loginError?.debugDetail || loginError?.message || '');
              }
            } finally {
              setSubmitting(false);
            }
          },
        });

        buttonContainerRef.current.innerHTML = '';
        window.google.accounts.id.renderButton(buttonContainerRef.current, {
          type: 'standard',
          shape: 'rectangular',
          theme: 'outline',
          text: 'signin_with',
          size: 'large',
          logo_alignment: 'left',
          width: 320,
        });
      } catch (setupError) {
        if (!cancelled) {
          setError(setupError.message || 'Google ログインボタンを表示できませんでした。');
          if (IS_DEV) {
            setDebugMessage(setupError?.message || '');
          }
        }
      }
    };

    setupGoogleButton();
    return () => {
      cancelled = true;
    };
  }, [loadingConfig, authConfig, onLoginSuccess]);

  return (
    <main className="main-content">
      <section className="login-screen page-shell">
        <div className="login-screen-header">
          <h2 className="page-main-title">ログイン</h2>
          <p className="page-main-subtitle">
            Google アカウントで安全にログインできます。
          </p>
        </div>

        <div className="login-screen-panel">
          <p className="login-screen-guide">{instructionText}</p>
          <ul className="login-screen-benefits">
            <li>登録データをクラウドに保存</li>
            <li>複数端末で同じデータを利用</li>
            <li>閲覧のみの利用はログイン不要</li>
          </ul>

          {loadingConfig && <p className="login-screen-status">ログイン設定を読み込み中です...</p>}
          {!loadingConfig && !authConfig.enabled && (
            <p className="login-screen-status error">
              現在この環境では Google ログインを利用できません。
            </p>
          )}
          {error && <p className="login-screen-status error">{error}</p>}
          {IS_DEV && debugMessage && (
            <pre className="login-screen-debug">{debugMessage}</pre>
          )}

          <div
            ref={buttonContainerRef}
            className={`google-login-button-wrap ${submitting ? 'is-submitting' : ''}`}
            aria-hidden={!authConfig.enabled || loadingConfig}
          />

          <button type="button" className="login-screen-back" onClick={onBackHome}>
            ← ホームへ戻る
          </button>
        </div>
      </section>
    </main>
  );
}

export default LoginScreen;
