import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { recordBetaEvent } from '../lib/beta';

type Props = { children: ReactNode };
type State = { failed: boolean };

export default class BinderErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(_error: Error, _info: ErrorInfo) {
    // Deliberately do not send the Error message, component stack or props.
    void recordBetaEvent('client_render_error', 'app', { outcome: 'error', value: 1 });
  }

  private retry = () => {
    this.setState({ failed: false });
  };

  render() {
    if (!this.state.failed) return this.props.children;

    return (
      <View style={styles.screen}>
        <View style={styles.mark}><Text style={styles.markText}>B</Text></View>
        <Text style={styles.eyebrow}>BINDER RECOVERED THE SCREEN</Text>
        <Text style={styles.title}>Something failed to render.</Text>
        <Text style={styles.copy}>Your account data was not included in the diagnostic event. Try the screen again; if it repeats, use Beta Program feedback after Binder opens.</Text>
        <Pressable accessibilityRole="button" onPress={this.retry} style={styles.primary}>
          <Text style={styles.primaryText}>Try Binder again</Text>
        </Pressable>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#090A0F', justifyContent: 'center', padding: 26 },
  mark: { width: 44, height: 44, borderRadius: 15, backgroundColor: '#C7FF4A', alignItems: 'center', justifyContent: 'center', marginBottom: 28 },
  markText: { color: '#10120D', fontWeight: '900', fontSize: 21 },
  eyebrow: { color: '#C7FF4A', fontWeight: '900', fontSize: 10, letterSpacing: 1.8 },
  title: { color: '#F7F8F3', fontSize: 34, lineHeight: 38, fontWeight: '900', letterSpacing: -1.1, marginTop: 9 },
  copy: { color: '#989FAA', fontSize: 14, lineHeight: 21, marginTop: 13 },
  primary: { height: 54, borderRadius: 17, backgroundColor: '#C7FF4A', alignItems: 'center', justifyContent: 'center', marginTop: 24 },
  primaryText: { color: '#10120D', fontWeight: '900', fontSize: 14 },
});
