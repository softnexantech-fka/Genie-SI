import React from 'react';

export default class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      message: error?.message || 'Erreur inconnue',
    };
  }

  componentDidCatch(error, errorInfo) {
    // Centralized client-side crash log for diagnostics.
    console.error('[GC][ErrorBoundary] UI crash captured:', error, errorInfo);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#0A1E4A',
            color: '#F1F5F9',
            fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
            padding: '24px',
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: '720px',
              background: '#0F274F',
              border: '1px solid #1F3D73',
              borderRadius: '12px',
              padding: '20px',
              boxSizing: 'border-box',
            }}
          >
            <h2 style={{ margin: '0 0 10px', color: '#EF4444', fontSize: '20px' }}>
              Une erreur est survenue dans l&apos;interface
            </h2>
            <p style={{ margin: 0, color: '#C6D3E6', fontSize: '14px' }}>
              L&apos;application a intercepté le crash pour éviter un écran blanc.
            </p>
            <pre
              style={{
                marginTop: '14px',
                padding: '12px',
                borderRadius: '8px',
                background: '#0A1B39',
                color: '#E2E8F0',
                overflow: 'auto',
                whiteSpace: 'pre-wrap',
                fontSize: '12px',
              }}
            >
              {this.state.message}
            </pre>
            <div style={{ marginTop: '14px', display: 'flex', gap: '10px' }}>
              <button
                type="button"
                onClick={this.handleReload}
                style={{
                  background: '#1D4ED8',
                  border: 'none',
                  color: '#FFFFFF',
                  borderRadius: '8px',
                  padding: '10px 14px',
                  cursor: 'pointer',
                  fontWeight: 700,
                }}
              >
                Recharger l&apos;application
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
