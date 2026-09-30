import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useLang } from '../i18n/LangContext';
import type { StringKey } from '../i18n/strings';
import { theme } from '../theme';
import { MODES, type Mode } from '../types';

const LABELS: Record<Mode, StringKey> = { auto: 'modeAuto', bicycle: 'modeBicycle', pedestrian: 'modePedestrian' };

export function ModeToggle({ mode, onChange }: { mode: Mode; onChange: (m: Mode) => void }) {
  const { t } = useLang();
  return (
    <View style={styles.row}>
      {MODES.map((m) => (
        <Pressable key={m} onPress={() => onChange(m)} hitSlop={8}>
          <Text style={[styles.text, m === mode ? styles.active : styles.inactive]}>{t(LABELS[m])}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'center', gap: 28, paddingVertical: 10 },
  text: { fontSize: 16, paddingBottom: 2 },
  active: { color: theme.fg, borderBottomWidth: 1, borderBottomColor: theme.fg },
  inactive: { color: theme.dim },
});
