import { useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { config } from '../config';
import { isAbortError } from '../services/http';
import { searchPlaces } from '../services/geocode';
import { theme } from '../theme';
import type { LngLat, Place } from '../types';

export function SearchBar({ near, onPick, onCancel }: { near: LngLat | null; onPick: (p: Place) => void; onCancel: () => void }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Place[]>([]);
  const [status, setStatus] = useState<'idle' | 'loading' | 'empty' | 'error'>('idle');

  useEffect(() => {
    if (q.trim().length < config.searchMinChars) {
      setResults([]);
      setStatus('idle');
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      setStatus('loading');
      searchPlaces(q, near, ctrl.signal)
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
    <View style={styles.wrap}>
      <View style={styles.row}>
        <TextInput
          autoFocus
          value={q}
          onChangeText={setQ}
          placeholder="Hová?"
          placeholderTextColor={theme.dim}
          selectionColor={theme.fg}
          style={styles.input}
          returnKeyType="search"
          autoCorrect={false}
        />
        <Pressable onPress={onCancel} hitSlop={12}>
          <Text style={styles.cancel}>Mégse</Text>
        </Pressable>
      </View>
      {status === 'empty' && <Text style={styles.note}>Nincs találat</Text>}
      {status === 'error' && <Text style={styles.note}>Nincs kapcsolat</Text>}
      <FlatList
        keyboardShouldPersistTaps="handled"
        data={results}
        keyExtractor={(p, i) => `${p.coord.join(',')}-${i}`}
        renderItem={({ item }) => (
          <Pressable onPress={() => onPick(item)} style={styles.item}>
            <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
            {item.detail ? <Text style={styles.detail} numberOfLines={1}>{item.detail}</Text> : null}
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: theme.bg },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, gap: 16 },
  input: { flex: 1, color: theme.fg, fontSize: 22, fontWeight: '300', borderBottomWidth: 1, borderBottomColor: theme.fg, paddingVertical: 8 },
  cancel: { color: theme.fg, fontSize: 16 },
  note: { color: theme.dim, fontSize: 15, paddingHorizontal: 20, paddingTop: 16 },
  item: { paddingHorizontal: 20, paddingVertical: 14 },
  name: { color: theme.fg, fontSize: 18 },
  detail: { color: theme.dim, fontSize: 14, marginTop: 2 },
});
