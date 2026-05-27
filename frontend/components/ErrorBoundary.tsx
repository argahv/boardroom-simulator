"use client";

import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("ErrorBoundary caught:", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[50vh] px-8 py-16 text-center">
          <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mb-5">
            <span className="text-2xl text-primary">!</span>
          </div>
          <h2 className="font-display text-2xl font-semibold text-ink mb-2">
            Something went wrong
          </h2>
          <p className="text-sm text-muted max-w-md mb-6 leading-relaxed">
            {this.state.error?.message || "An unexpected error occurred."}
          </p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="rounded-xl bg-ink text-on-dark px-6 py-3 text-xs font-bold uppercase tracking-wider hover:bg-surface-dark-elevated transition shadow-sm"
          >
            Try Again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
