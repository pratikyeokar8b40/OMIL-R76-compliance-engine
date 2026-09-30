import React, { Component } from 'react';

function toError(value) {
  if (value instanceof Error) return value;
  if (typeof value === 'string') return new Error(value);
  try {
    return new Error(JSON.stringify(value));
  } catch {
    return new Error(String(value));
  }
}

function DefaultFallback({ error, resetError }) {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[#f4f7f3] p-6 text-[#17333c]">
      <div className="panel max-w-lg w-full p-8 text-center">
        <div className="eyebrow mb-2">Application Notice</div>
        <h1 className="text-xl font-semibold">Something went wrong</h1>
        <p className="mt-2 text-sm text-[#58746f]">
          This part of the workspace encountered an error. Working records remain protected in local storage.
        </p>
        {import.meta.env?.DEV ? (
          <pre className="mt-4 overflow-x-auto rounded bg-gray-100 p-3 text-left font-mono text-xs text-red-700">
            {error?.message || String(error)}
          </pre>
        ) : null}
        <button
          type="button"
          onClick={resetError}
          className="button-primary mt-6 rounded-md px-5 py-2.5 text-xs font-semibold"
        >
          Try again
        </button>
      </div>
    </div>
  );
}

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error: toError(error) };
  }

  componentDidCatch(error, info) {
    console.error('ErrorBoundary caught an error:', toError(error), info?.componentStack);
  }

  componentDidUpdate(prevProps) {
    if (this.state.error !== null && prevProps.resetKey !== this.props.resetKey) {
      this.resetError();
    }
  }

  resetError = () => {
    this.setState({ error: null });
  };

  render() {
    const { error } = this.state;
    if (error === null) {
      return this.props.children;
    }
    const Fallback = this.props.FallbackComponent || DefaultFallback;
    return <Fallback error={error} resetError={this.resetError} />;
  }
}

export default ErrorBoundary;
