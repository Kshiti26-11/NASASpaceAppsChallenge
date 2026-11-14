import React, { Component, ErrorInfo, ReactNode } from 'react'

interface Props {
  children: ReactNode
  fallbackTitle?: string
}

interface State {
  hasError: boolean
  error: Error | null
}

export default class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo)
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="panel" style={{ margin: '16px', padding: '24px', border: '1px solid #F5C6C2', background: '#FDF3F2' }}>
          <h3 style={{ color: '#C0392B', marginBottom: '8px' }}>
            {this.props.fallbackTitle || 'Component Error'}
          </h3>
          <p style={{ fontSize: '13px', color: '#5B6169', marginBottom: '12px' }}>
            {this.state.error?.message || 'An error occurred while rendering this component.'}
          </p>
          <pre style={{ fontSize: '11px', whiteSpace: 'pre-wrap', color: '#900', background: '#FFF', padding: '8px', border: '1px solid #FCC', maxHeight: '150px', overflow: 'auto' }}>
            {this.state.error ? (this.state.error.stack || String(this.state.error)) : 'Unknown error'}
          </pre>
          <button
            type="button"
            className="btn-primary"
            style={{ width: 'auto', padding: '4px 16px', fontSize: '12px' }}
            onClick={() => this.setState({ hasError: false, error: null })}
          >
            Retry
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
