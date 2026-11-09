import { Component, ReactNode } from 'react';
import { useViewStore } from '../../stores/view-store.js';
import { messagesOf, t as translate, dirOf } from '../../i18n/index.js';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

/**
 * Error Boundary — לוכיאת שגיאות React.
 * מונע קריסה מלאה של האפליקציה.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('Application error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="h-screen flex items-center justify-center bg-gray-100" dir={dirOf(useViewStore.getState().locale)}>
          <div className="bg-white p-8 rounded-lg shadow-lg max-w-md text-center">
            <h2 className="text-xl font-bold mb-2 text-red-600">{translate(messagesOf(useViewStore.getState().locale), "errorBoundary.title")}</h2>
            <p className="text-gray-600 mb-4 text-sm">
              {translate(messagesOf(useViewStore.getState().locale), "errorBoundary.body")}
            </p>
            <pre className="text-left text-xs bg-gray-100 p-2 rounded mb-4 overflow-auto max-h-32">
              {this.state.error?.message}
            </pre>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
            >
              {translate(messagesOf(useViewStore.getState().locale), "errorBoundary.reload")}
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
