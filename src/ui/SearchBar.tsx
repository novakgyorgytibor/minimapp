import { useEffect, useState } from 'react';
import { FlatList, Image, Keyboard, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { config } from '../config';
import { useFavorites } from '../favorites/FavoritesContext';
import { useSearchHistory } from '../favorites/useSearchHistory';
import { useLang } from '../i18n/LangContext';
import { isAbortError } from '../services/http';
import { searchPlaces } from '../services/geocode';
import { theme } from '../theme';
import type { LngLat, Place } from '../types';

const HEART = require('../../assets/heart.png');

type Row = { kind: 'place'; place: Place; favorite: boolean } | { kind: 'query'; text: string };

export function SearchBar({ near, onPick, onCancel }: { near: LngLat | null; onPick: (p: Place) => void; onCancel: () => void }) {
  const { lang, t } = useLang();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Place[]>([]);
  const [status, setStatus] = useState<'idle' | 'loading' | 'empty' | 'error'>('idle');
  const { favorites } = useFavorites();
  const { history, add: addToHistory, remove: removeFromHistory } = useSearchHistory();
  // Amíg nem gépel, a kedvencek és alattuk a legutóbbi keresések látszanak (koppintásra újra lefut a keresés)
  const typing = q.trim().length > 0;
  const rows: Row[] = typing
    ? results.map((place) => ({ kind: 'place', place, favorite: false }))
    : [
        ...favorites.map((place): Row => ({ kind: 'place', place, favorite: true })),
        ...history.map((text): Row => ({ kind: 'query', text })),
      ];

  useEffect(() => {
    if (q.trim().length < config.searchMinChars) {
      setResults([]);
      setStatus('idle');
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      setStatus('loading');
      searchPlaces(q, near, ctrl.signal, {}, lang)
        .then((r) => {
          setResults(r);
          setStatus(r.length ? 'idle' : 'empty');
        })
        .catch((e) => {
          if (!isAbortError(e)) setStatus('error');
        });
    }, config.searchDebounceMs);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
    // near szándékosan nincs a függőségek között: a pozíció változása ne indítson új keresést
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  return (
    // Háttérre koppintás: billentyűzet be (a lista elemeire és a gombokra koppintás ettől még működik)
    <Pressable style={styles.wrap} onPress={Keyboard.dismiss} accessible={false}>
      <View style={styles.row}>
        <TextInput
          autoFocus
          value={q}
          onChangeText={setQ}
          placeholder={t('whereTo')}
          placeholderTextColor={theme.dim}
          selectionColor={theme.fg}
          style={styles.input}
          returnKeyType="search"
          autoCorrect={false}
        />
        <Pressable
          onPress={() => {
            Keyboard.dismiss();
            // Volt rá találat, csak nem választott → a keresés így is bekerül az előzmények közé
            if (typing && results.length > 0) addToHistory(q);
            onCancel();
          }}
          hitSlop={12}
        >
          <Text style={styles.cancel}>{t('cancel')}</Text>
        </Pressable>
      </View>
      {status === 'loading' && results.length === 0 && <Text style={styles.note}>{t('searching')}</Text>}
      {status === 'empty' && <Text style={styles.note}>{t('noResults')}</Text>}
      {status === 'error' && <Text style={styles.note}>{t('noConnection')}</Text>}
      <FlatList
        style={styles.list}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        data={rows}
        keyExtractor={(r, i) => (r.kind === 'place' ? `${r.place.coord.join(',')}-${i}` : `q-${r.text}`)}
        renderItem={({ item }) => {
          if (item.kind === 'query') {
            return (
              <View style={styles.queryRow}>
                <Pressable onPress={() => setQ(item.text)} style={[styles.item, styles.queryItem]}>
                  <Text style={styles.query} numberOfLines={1}>
                    {item.text}
                  </Text>
                </Pressable>
                <Pressable onPress={() => removeFromHistory(item.text)} hitSlop={12} style={styles.remove}>
                  <Text style={styles.removeText}>✕</Text>
                </Pressable>
              </View>
            );
          }
          const { place, favorite } = item;
          return (
            <Pressable
              onPress={() => {
                Keyboard.dismiss(); // Androidon a mező eltűnésekor nem mindig záródik be magától
                if (!favorite) addToHistory(q);
                onPick(place);
              }}
              style={styles.item}
            >
              <View style={styles.nameRow}>
                {favorite && <Image source={HEART} style={styles.heart} />}
                <Text style={styles.name} numberOfLines={1}>
                  {place.name}
                </Text>
              </View>
              {place.detail ? <Text style={styles.detail} numberOfLines={1}>{place.detail}</Text> : null}
            </Pressable>
          );
        }}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: theme.bg },
  list: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, gap: 16 },
  input: { flex: 1, color: theme.fg, fontSize: 22, fontWeight: '300', borderBottomWidth: 1, borderBottomColor: theme.fg, paddingVertical: 8 },
  cancel: { color: theme.fg, fontSize: 16 },
  note: { color: theme.dim, fontSize: 15, paddingHorizontal: 20, paddingTop: 16 },
  item: { paddingHorizontal: 20, paddingVertical: 14 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  name: { flexShrink: 1, color: theme.fg, fontSize: 18 },
  detail: { color: theme.dim, fontSize: 14, marginTop: 2 },
  queryRow: { flexDirection: 'row', alignItems: 'center' },
  queryItem: { flex: 1 },
  query: { color: theme.dim, fontSize: 18 },
  remove: { paddingLeft: 8, paddingRight: 20, paddingVertical: 14 },
  removeText: { color: theme.dim, fontSize: 16 },
  heart: { width: 16, height: 16, tintColor: theme.dim },
});
