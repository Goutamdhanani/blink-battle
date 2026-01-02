import { Component, ErrorInfo, ReactNode } from 'react';
import './ErrorBoundary.css';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

/**
 * Error Boundary component to catch and display React errors
 * Prevents the entire app from crashing and showing only a blue screen
 */
class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(_error: Error): Partial<State> {
    // Update state so the next render will show the fallback UI
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // Log error details to console
    console.error('❌ [ErrorBoundary] Caught error:', error);
    console.error('❌ [ErrorBoundary] Error info:', errorInfo);
    console.error('❌ [ErrorBoundary] Component stack:', errorInfo.componentStack);

    // Store error in window for debugging
    (window as any).__appError = {
      error: error.toString(),
      message: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
      timestamp: new Date().toISOString(),
    };

    // Update state with error details
    this.setState({
      error,
      errorInfo,
    });
  }

  handleReload = () => {
    // Clear any stored state that might be causing issues
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch (e) {
      console.error('Failed to clear storage:', e);
    }
    window.location.reload();
  };

  handleReloadKeepAuth = () => {
    // Keep authentication but clear other state
    try {
      const token = localStorage.getItem('token');
      const user = localStorage.getItem('user');
      localStorage.clear();
      sessionStorage.clear();
      if (token) localStorage.setItem('token', token);
      if (user) localStorage.setItem('user', user);
    } catch (e) {
      console.error('Failed to clear storage:', e);
    }
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary">
          <div className="error-boundary-content">
            <h1 className="error-boundary-title">⚠️ Something went wrong</h1>
            <div className="error-boundary-message">
              <p>The app encountered an unexpected error.</p>
              {this.state.error && (
                <div className="error-details">
                  <p className="error-name">{this.state.error.name}</p>
                  <p className="error-text">{this.state.error.message}</p>
                </div>
              )}
            </div>
            
            <div className="error-boundary-actions">
              <button className="error-btn error-btn-primary" onClick={this.handleReloadKeepAuth}>
                Reload App (Keep Login)
              </button>
              <button className="error-btn error-btn-secondary" onClick={this.handleReload}>
                Clear & Reload
              </button>
            </div>

            {/* Show detailed error in development or debug mode */}
            {(import.meta.env.DEV || new URLSearchParams(window.location.search).get('debug') === '1') && (
              <details className="error-boundary-details">
                <summary>Technical Details (for developers)</summary>
                {this.state.error && (
                  <div className="error-technical">
                    <h3>Error Stack:</h3>
                    <pre>{this.state.error.stack}</pre>
                    
                    {this.state.errorInfo && (
                      <>
                        <h3>Component Stack:</h3>
                        <pre>{this.state.errorInfo.componentStack}</pre>
                      </>
                    )}
                  </div>
                )}
              </details>
            )}

            <p className="error-boundary-help">
              If this problem persists, try opening the app in World App or contact support.
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
