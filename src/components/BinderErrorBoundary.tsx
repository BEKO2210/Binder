import { Component, type ErrorInfo, type ReactNode } from 'react';
import { View } from 'react-native';

import { recordBetaEvent } from '../lib/beta';
import { BinderBrand, BinderButton, BinderText } from './ui';
import { useBinderTheme } from '../theme/ThemeProvider';

type Props = { children: ReactNode };
type State = { failed: boolean };

export default class BinderErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(_error: Error, _info: ErrorInfo) {
    void recordBetaEvent('client_render_error', 'app', { outcome: 'error', value: 1 });
  }

  private retry = () => {
    this.setState({ failed: false });
  };

  render() {
    if (!this.state.failed) return this.props.children;
    return <CrashFallback onRetry={this.retry} />;
  }
}

function CrashFallback({ onRetry }: { onRetry: () => void }) {
  const { theme } = useBinderTheme();
  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.canvas, justifyContent: 'center', padding: theme.spacing.x6 }}>
      <BinderBrand />
      <BinderText variant="micro" tone="accent" style={{ marginTop: theme.spacing.x8 }}>BINDER RECOVERED THE SCREEN</BinderText>
      <BinderText variant="displayL" style={{ marginTop: theme.spacing.x2 }}>Something failed to render.</BinderText>
      <BinderText variant="body" tone="secondary" style={{ marginTop: theme.spacing.x3 }}>Your account data was not included in the diagnostic event. Try the screen again; if it repeats, use Beta Program feedback after Binder opens.</BinderText>
      <BinderButton label="Try Binder again" icon="retry" onPress={onRetry} style={{ marginTop: theme.spacing.x6 }} />
    </View>
  );
}
