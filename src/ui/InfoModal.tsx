import { useState } from 'react';
import { Linking, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { config } from '../config';
import { useLang } from '../i18n/LangContext';
import { theme } from '../theme';
import { APP_VERSION } from './Attribution';

/** Apró „i” jobbra a kereső alatt: adatvédelem, kapcsolat, weboldal és Support me (Revolut). */
export function InfoButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable onPress={() => setOpen(true)} hitSlop={14} style={styles.button}>
        <Text style={styles.buttonText}>i</Text>
      </Pressable>
      <InfoModal visible={open} onClose={() => setOpen(false)} />
    </>
  );
}

function InfoModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { t } = useLang();
  const open = (url: string) => Linking.openURL(url).catch(() => {});
  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      {/* Háttérre koppintás: bezár */}
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.card} onPress={() => {}}>
          <View style={styles.header}>
            <Text style={styles.title}>MinimApp</Text>
            <Pressable onPress={onClose} hitSlop={16} accessibilityLabel={t('close')}>
              <Text style={styles.close}>✕</Text>
            </Pressable>
          </View>

          <View style={styles.links}>
            <Link label={t('infoPrivacy')} onPress={() => open(`${config.websiteUrl}/privacy`)} />
            <Link label={t('infoContact')} onPress={() => open(`mailto:${config.contactEmail}`)} />
            <Link label={t('infoWebsite')} onPress={() => open(config.websiteUrl)} />
          </View>

          <View style={styles.coffee}>
            <Text style={styles.meta}>{t('infoCoffee')}</Text>
            <Text style={styles.text}>{t('infoCoffeeText')}</Text>
            <Pressable onPress={() => open(`https://revolut.me/${config.revolutTag}`)} style={styles.tag}>
              <Text style={styles.tagMeta}>Revolut</Text>
              <Text style={styles.tagText}>@{config.revolutTag}</Text>
            </Pressable>
          </View>

          <Text style={styles.version}>v{APP_VERSION}</Text>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function Link({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.link}>
      <Text style={styles.linkText}>{label}</Text>
      <Text style={styles.arrow}>→</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: theme.dim,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-end',
    marginRight: 20,
    marginTop: 16,
  },
  buttonText: { color: theme.dim, fontSize: 13, fontStyle: 'italic', fontWeight: '600' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', padding: 24 },
  card: { backgroundColor: theme.bg, paddingHorizontal: 20, paddingBottom: 20, width: '100%', maxWidth: 400, alignSelf: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14 },
  title: { color: theme.fg, fontSize: 22, fontWeight: '300' },
  close: { color: theme.fg, fontSize: 22 },
  links: { marginTop: 4, borderTopWidth: 1, borderTopColor: theme.faint },
  link: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: theme.faint },
  linkText: { color: theme.fg, fontSize: 18 },
  arrow: { color: theme.dim, fontSize: 18 },
  coffee: { marginTop: 24, gap: 10 },
  meta: { color: theme.dim, fontSize: 13, letterSpacing: 1, textTransform: 'uppercase' },
  text: { color: theme.fg, fontSize: 16, lineHeight: 22 },
  tag: { alignSelf: 'flex-start', borderWidth: 1, borderColor: theme.fg, paddingHorizontal: 20, paddingVertical: 12, marginTop: 4 },
  tagMeta: { color: theme.dim, fontSize: 12 },
  tagText: { color: theme.fg, fontSize: 20 },
  version: { color: theme.faint, fontSize: 12, marginTop: 20 },
});
