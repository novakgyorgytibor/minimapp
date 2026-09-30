import { StyleSheet, Text } from 'react-native';
import { theme } from '../theme';
import { formatClock, formatDistance, formatDuration } from './format';

export function TripFooter({ remainingM, remainingS }: { remainingM: number; remainingS: number }) {
  const eta = formatClock(new Date(Date.now() + remainingS * 1000));
  return (
    <Text style={styles.text}>
      {formatDuration(remainingS)} · {formatDistance(remainingM)} · {eta}
    </Text>
  );
}

const styles = StyleSheet.create({
  text: { color: theme.fg, fontSize: 18, fontWeight: '300', textAlign: 'center', fontVariant: ['tabular-nums'] },
});
