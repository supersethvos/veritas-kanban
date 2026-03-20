import React, { Component, ReactNode } from 'react';
import { AlertCircle, ChevronDown, ChevronUp, RotateCcw } from 'lucide-react';

interface FeatureErrorBoundaryProps {
  children: ReactNode;
  fallbackTitle?: string;
  onReset?: () => void;
}

interface FeatureErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorExpanded: boolean;
}

export class FeatureErrorBoundary extends Component<
  FeatureErrorBoundaryProps,
  FeatureErrorBoundaryState
> {
  constructor(props: FeatureErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorExpanded: false,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<FeatureErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('FeatureErrorBoundary caught error:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorExpanded: false,
    });

    // Call optional reset callback
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  toggleErrorDetails = () => {
    this.setState((prev) => ({ errorExpanded: !prev.errorExpanded }));
  };

  render() {
    if (this.state.hasError) {
      const title = this.props.fallbackTitle || 'Something went wrong';

      return (
        <div className="flex items-center justify-center min-h-[200px] p-6">
          <div className="max-w-md w-full rounded-lg border border-primal-rule bg-primal-card p-6 space-y-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-primal-red flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0 space-y-2">
                <h3 className="text-base font-semibold text-primal-gray-light">{title}</h3>
                <p className="text-sm text-primal-gray-mid">
                  An unexpected error occurred. Try refreshing or contact support if the issue
                  persists.
                </p>

                {this.state.error && (
                  <div className="pt-2">
                    <button
                      onClick={this.toggleErrorDetails}
                      className="flex items-center gap-1.5 text-xs text-primal-gray-mid hover:text-primal-gray-light/80 transition-colors"
                    >
                      {this.state.errorExpanded ? (
                        <ChevronUp className="h-3 w-3" />
                      ) : (
                        <ChevronDown className="h-3 w-3" />
                      )}
                      {this.state.errorExpanded ? 'Hide' : 'Show'} error details
                    </button>

                    {this.state.errorExpanded && (
                      <div className="mt-2 p-3 rounded bg-primal-black border border-primal-rule-light">
                        <code className="text-xs text-primal-red break-all whitespace-pre-wrap">
                          {this.state.error.message}
                          {this.state.error.stack && (
                            <div className="mt-2 text-primal-gray-mid text-[10px] leading-relaxed">
                              {this.state.error.stack}
                            </div>
                          )}
                        </code>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={this.handleReset}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-primal-gray-light bg-primal-rule-light hover:bg-primal-rule border border-primal-rule rounded-md transition-colors"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Try Again
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default FeatureErrorBoundary;
