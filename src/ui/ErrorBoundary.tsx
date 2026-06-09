import { Component } from "react";
import type { ReactNode } from "react";
import { detectLanguage } from "../i18n/strings";

// Sits above the router and AppProvider, so it cannot use the app context:
// it must still render if context initialisation itself throws. Measurement
// data lives in localStorage, so a reload never loses recorded points.
const COPY = {
  en: {
    title: "Something went wrong",
    body: "The app hit an unexpected error. Your stands and sweeps are stored on this device and are not lost.",
    reload: "Reload app",
  },
  sv: {
    title: "Något gick fel",
    body: "Appen stötte på ett oväntat fel. Dina bestånd och svep sparas på den här enheten och är inte förlorade.",
    reload: "Ladda om appen",
  },
};

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render() {
    if (!this.state.error) return this.props.children;
    const copy = COPY[detectLanguage()] ?? COPY.en;
    return (
      <div className="error-boundary" role="alert">
        <h1>{copy.title}</h1>
        <p>{copy.body}</p>
        <p className="error-boundary-detail">{this.state.error.message}</p>
        <button className="btn primary" onClick={() => window.location.reload()}>
          {copy.reload}
        </button>
      </div>
    );
  }
}
