import React, { Component, type ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/** Catches any uncaught render error anywhere below it — without this, React just unmounts the
 * whole tree on a crash, which looks like the page going blank. Shows a recoverable message with a
 * reload button instead, and logs the error so it's still visible in the console for debugging. */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error('[ErrorBoundary] caught a render error', error, info.componentStack);
  }

  reload = () => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.location.reload();
    } else {
      // No reliable full-restart on native — clearing the error at least lets a re-render try again.
      this.setState({ error: null });
    }
  };

  render() {
    if (this.state.error) {
      return (
        <View style={styles.wrap}>
          <Text style={styles.title}>Oups, un problème est survenu</Text>
          <Text style={styles.message}>{this.state.error.message}</Text>
          <Pressable style={styles.button} onPress={this.reload}>
            <Text style={styles.buttonText}>Recharger</Text>
          </Pressable>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: '#0c0f16',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  title: { color: '#fff', fontSize: 20, fontWeight: '800', textAlign: 'center' },
  message: { color: 'rgba(255,255,255,0.65)', fontSize: 13, textAlign: 'center', maxWidth: 420 },
  button: {
    marginTop: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#e5484d',
  },
  buttonText: { color: '#fff', fontWeight: '800', fontSize: 14 },
});
