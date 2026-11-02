import React from "react";
import { AlertTriangle } from "lucide-react";

// Catches render errors inside the Controls panel so a single bad section never
// white-screens the whole studio. Shows a recoverable fallback and logs the error.
export default class PanelErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("[Controls panel] render error:", error, info?.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="p-4 space-y-3">
          <div className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span className="text-sm font-semibold">This panel hit a snag</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Something failed to render. Your layout is safe — try reopening the panel.
          </p>
          <pre className="text-[10px] text-destructive/80 bg-destructive/5 rounded-md p-2 overflow-auto max-h-40 whitespace-pre-wrap break-words">
            {String(this.state.error?.message || this.state.error)}
          </pre>
          <button
            onClick={() => this.setState({ error: null })}
            className="h-9 px-4 rounded-md bg-primary text-primary-foreground text-xs font-semibold active:scale-95 transition-transform"
          >
            Reload panel
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}