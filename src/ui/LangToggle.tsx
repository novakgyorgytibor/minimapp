import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useLang } from '../i18n/LangContext';
import { LANGS } from '../i18n/strings';
import { theme } from '../theme';

/** „HU · EN” – az aktív nyelv fehér, a másik szürke. */
export function LangToggle() {
  const { lang, setLang } = useLang();
  return (
    <View style={styles.row}>
      {LANGS.map((l, i) => (
        <Pressable key={l} onPress={() => setLang(l)} hitSlop={10}>
          <Text style={[styles.text, l === lang ? styles.on : styles.off]}>
            {i > 0 ? '· ' : ''}
            {l.toUpperCase()}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  text: { fontSize: 14, letterSpacing: 1 },
  on: { color: theme.fg },
  off: { color: theme.faint },
});
