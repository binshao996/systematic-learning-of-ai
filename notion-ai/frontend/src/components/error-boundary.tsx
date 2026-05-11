"use client";
import { Component, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";

interface Props { children: ReactNode; }
interface State { hasError: boolean; error?: Error; }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center h-full">
          <div className="text-center">
            <AlertTriangle className="h-8 w-8 text-amber-500 mx-auto mb-2" />
            <p className="text-sm text-zinc-600">Something went wrong</p>
            <button
              className="text-sm text-blue-500 mt-2 hover:underline"
              onClick={() => this.setState({ hasError: false })}
            >
              Try again
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
