import { Pressable, StyleSheet, Text } from 'react-native';
import type { RouteErrorKind } from '../services/route';
import { theme } from '../theme';

const MESSAGES: Record<RouteErrorKind, string> = {
  network: 'Nincs kapcsolat · újra',
  'rate-limited': 'A szerver túlterhelt · újra',
  'no-route': 'Nem található útvonal',
  'no-position': 'Nincs GPS jel · újra',
};

export function StatusLine({ error, loading, onRetry }: { error: RouteErrorKind | null; loading: boolean; onRetry: () => void }) {
  if (loading) return <Text style={styles.text}>Útvonaltervezés…</Text>;
  if (!error) return null;
  const retryable = error !== 'no-route';
  return (
    <Pressable onPress={retryable ? onRetry : undefined} hitSlop={12}>
      <Text style={styles.text}>{MESSAGES[error]}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  text: { color: theme.fg, fontSize: 15, textAlign: 'center', paddingVertical: 8 },
});
