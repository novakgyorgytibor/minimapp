import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useLang } from '../i18n/LangContext';
import { theme } from '../theme';

export function PermissionScreen({ onRequest }: { onRequest: () => void }) {
  const { t } = useLang();
  return (
    <View style={styles.wrap}>
      <Text style={styles.text}>{t('permText')}</Text>
      <Pressable onPress={onRequest} style={styles.button}>
        <Text style={styles.text}>{t('permAllow')}</Text>
      </Pressable>
      <Text style={styles.link} onPress={() => Linking.openSettings()}>{t('permSettings')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: theme.bg, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 24 },
  text: { color: theme.fg, fontSize: 18, textAlign: 'center' },
  button: { borderWidth: 1, borderColor: theme.fg, paddingHorizontal: 24, paddingVertical: 10 },
  link: { color: theme.dim, fontSize: 14 },
});
