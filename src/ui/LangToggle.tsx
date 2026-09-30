import { Fragment } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useLang } from '../i18n/LangContext';
import { LANGS } from '../i18n/strings';
import { theme } from '../theme';

/** „HU · EN” – az aktív nyelv fehér, a másik szürke; az elválasztó pötty mindig halvány. */
export function LangToggle() {
  const { lang, setLang } = useLang();
  return (
    <View style={styles.row}>
      {LANGS.map((l, i) => (
        <Fragment key={l}>
          {i > 0 && <Text style={[styles.text, styles.sep]}>·</Text>}
          <Pressable onPress={() => setLang(l)} hitSlop={10}>
            <Text style={[styles.text, l === lang ? styles.on : styles.off]}>{l.toUpperCase()}</Text>
          </Pressable>
        </Fragment>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  text: { fontSize: 14, letterSpacing: 1 },
  on: { color: theme.fg },
  off: { color: theme.faint },
  sep: { color: theme.faint },
});
