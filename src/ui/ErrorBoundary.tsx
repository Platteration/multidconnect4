import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../app/theme';
import { Button, ConfirmPanel } from './Modals';
import { spacing } from './theme';

interface Props {
  children: React.ReactNode;
  /** Throw the game away and start over. The boundary is remounted by the caller. */
  onReset: () => void;
}

/**
 * Last line of defence. A render that throws would otherwise unmount the whole
 * app, and if the value that caused it is the saved game, it would do so on
 * every launch.
 *
 * The way out that costs nothing is offered first: drawing again is free, and
 * a throw that came from something momentary - a state the screen was in, a
 * modal halfway open - does not come back. Clearing the saved game is offered
 * beside it and is confirmed, because it spends the only copy of a game the
 * player may have been playing for an hour, and the boundary cannot tell which
 * of the two kinds of failure it caught.
 */
export class ErrorBoundary extends React.Component<Props, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return <Fallback onRetry={() => this.setState({ failed: false })} onReset={this.props.onReset} />;
  }
}

function Fallback({ onRetry, onReset }: { onRetry: () => void; onReset: () => void }) {
  const colors = useTheme();
  const [confirming, setConfirming] = useState(false);
  if (confirming) {
    return (
      <View style={[styles.wrap, { backgroundColor: colors.background }]}>
        <ConfirmPanel
          title="Clear the saved game?"
          body="The game that was saved is deleted and the app starts a new one. Your record, puzzle progress and settings are not touched. There is no undo."
          confirmLabel="Clear it and start over"
          cancelLabel="Back"
          onConfirm={onReset}
          onCancel={() => setConfirming(false)}
        />
      </View>
    );
  }
  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]}>
      <Text style={[styles.title, { color: colors.text }]}>Something went wrong</Text>
      <Text style={[styles.body, { color: colors.textMuted }]}>
        The game on screen could not be drawn. Try drawing it again first; it may have been a moment rather than the
        game itself.
      </Text>
      <Button label="Try again" tone="primary" onPress={onRetry} />
      <Button label="Start a new game" tone="danger" onPress={() => setConfirming(true)} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg, gap: spacing.md },
  title: { fontSize: 20, fontWeight: '800' },
  body: { fontSize: 14, textAlign: 'center', maxWidth: 320 },
});
