import { Component, ErrorInfo, ReactNode } from 'react';

interface PlayerErrorBoundaryProps {
  onRecoverableError: (error: Error) => void;
  children: ReactNode;
}

interface PlayerErrorBoundaryState {
  hasError: boolean;
  attemptedRecovery: boolean;
}

export class PlayerErrorBoundary extends Component<PlayerErrorBoundaryProps, PlayerErrorBoundaryState> {
  state: PlayerErrorBoundaryState = { hasError: false, attemptedRecovery: false };

  static getDerivedStateFromError(): Partial<PlayerErrorBoundaryState> {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[player] Playback UI crashed; resetting cached playback state.', error, info);
    this.props.onRecoverableError(error);
    if (!this.state.attemptedRecovery) {
      this.setState({ hasError: false, attemptedRecovery: true });
    }
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return null;
    }
    return this.props.children;
  }
}