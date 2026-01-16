import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, info: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // ВАЖНО: вместо «белого экрана» показываем понятный экран с деталями.
    // Это помогает быстро найти первопричину регрессий (первая JS-ошибка в рендере).
    // eslint-disable-next-line no-console
    console.error('Unhandled UI error:', error, info);
    this.setState({ info });

    // Авто-релоад при специфических ошибках инициализации (опционально)
    if (error?.message?.includes('initialization') || error?.message?.includes('is not defined')) {
        console.warn('Detected initialization error, suggesting manual refresh or check for TDZ.');
    }
  }

  render() {
    const { error, info } = this.state;
    if (error) {
      const stack = error?.stack || String(error);
      const componentStack = info?.componentStack || '';
      return (
        <div
          style={{
            height: '100vh',
            background: '#121212',
            color: '#fff',
            padding: 24,
            boxSizing: 'border-box',
            fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif',
          }}
        >
          <div style={{ maxWidth: 980, margin: '0 auto' }}>
            <h2 style={{ margin: '0 0 8px 0' }}>Ошибка интерфейса (UI crash)</h2>
            <div style={{ opacity: 0.85, marginBottom: 16 }}>
              Приложение упало из-за JavaScript-ошибки при рендере. Откройте DevTools → Console и
              найдите первую ошибку, либо отправьте детали ниже.
            </div>

            <button
              type="button"
              onClick={() => window.location.reload()}
              style={{
                background: '#2196f3',
                color: '#fff',
                border: 'none',
                borderRadius: 6,
                padding: '10px 14px',
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              Перезагрузить страницу
            </button>

            <details style={{ marginTop: 16 }} open>
              <summary style={{ cursor: 'pointer', marginBottom: 8 }}>Детали ошибки</summary>
              <pre
                style={{
                  whiteSpace: 'pre-wrap',
                  background: '#0b0b0b',
                  border: '1px solid #333',
                  borderRadius: 6,
                  padding: 12,
                  overflowX: 'auto',
                }}
              >
                {stack}
                {componentStack ? `\n\nComponent stack:\n${componentStack}` : ''}
              </pre>
            </details>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
