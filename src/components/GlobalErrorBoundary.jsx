import React from 'react';
import { AlertCircle, RefreshCw, Copy, Check } from 'lucide-react';

export default class GlobalErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, copied: false };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary] Caught crash:', error, info);
  }

  copyError = () => {
    const text = this.state.error?.stack || this.state.error?.toString();
    navigator.clipboard.writeText(text).then(() => {
      this.setState({ copied: true });
      setTimeout(() => this.setState({ copied: false }), 2000);
    });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="fixed inset-0 flex items-center justify-center p-6 bg-[#0d0f12] text-white">
          <div className="max-w-md w-full p-8 rounded-3xl bg-[#13161b] border border-[#252d3a] shadow-2xl">
            <div className="flex flex-col items-center text-center mb-6">
              <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center mb-4">
                <AlertCircle className="text-red-500" size={32} />
              </div>
              <h1 className="text-xl font-bold mb-2">Something went wrong</h1>
              <p className="text-gray-400 text-sm">The application encountered an unexpected error and crashed.</p>
            </div>

            <div className="bg-black/40 rounded-xl p-4 mb-6 max-h-48 overflow-auto">
              <code className="text-xs text-red-400 block whitespace-pre-wrap font-mono">
                {this.state.error?.toString()}
                {this.state.error?.stack && `\n\n${this.state.error.stack}`}
              </code>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => window.location.reload()}
                className="flex-1 py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 font-bold text-sm transition-all flex items-center justify-center gap-2"
              >
                <RefreshCw size={16} /> Restart App
              </button>
              <button
                onClick={this.copyError}
                className="py-3 px-6 rounded-xl bg-gray-800 hover:bg-gray-700 font-bold text-sm transition-all flex items-center justify-center gap-2"
              >
                {this.state.copied ? <Check size={16} className="text-green-500" /> : <Copy size={16} />}
                {this.state.copied ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
