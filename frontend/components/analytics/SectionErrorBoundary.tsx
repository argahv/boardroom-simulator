"use client";
import { Component } from "react";
import type { ReactNode } from "react";

type Props = { children: ReactNode; title: string };
type State = { hasError: boolean };

export class SectionErrorBoundary extends Component<Props, State> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="analytics-card analytics-empty">
          <p>This section failed to load.</p>
          <button
            onClick={() => this.setState({ hasError: false })}
            className="mt-2 text-xs text-primary hover:underline"
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
