import { StyleSheet, Text, View } from 'react-native';
import { theme } from '../theme';
import { formatSpeedKmh } from './format';

/** Aktuális sebesség (km/h) a tájoló fölött; ismeretlen sebességnél nem jelenik meg. */
export function Speed({ mps }: { mps: number | null }) {
  const value = formatSpeedKmh(mps);
  if (value === null) return null;
  return (
    <View style={styles.wrap} pointerEvents="none">
      <Text style={styles.value}>{value}</Text>
      <Text style={styles.unit}>km/h</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center' },
  value: { color: theme.fg, fontSize: 34, fontWeight: '400', fontVariant: ['tabular-nums'] },
  unit: { color: theme.dim, fontSize: 13, marginTop: -3 },
});
