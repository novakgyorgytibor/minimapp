import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useRef, useState } from 'react';
import { addSearch, parseHistory, removeSearch } from './history';

const STORAGE_KEY = 'minimap.searchHistory';

/** Legutóbbi keresések (a beírt szöveg, amiből helyet választottunk), a telefonon tárolva. */
export function useSearchHistory(): { history: string[]; add: (q: string) => void; remove: (q: string) => void } {
  const [history, setHistory] = useState<string[]>([]);
  const latest = useRef<string[]>([]);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((v) => {
        latest.current = parseHistory(v);
        setHistory(latest.current);
      })
      .catch(() => {});
  }, []);

  // A mentés nem a setState-updaterben van: választáskor a keresés azonnal bezárul, és egy leváló
  // komponens függő updaterét a React már nem futtatja le → az előzmény sosem kerülne mentésre.
  const save = useCallback((next: string[]) => {
    latest.current = next;
    setHistory(next);
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
  }, []);
  const add = useCallback((q: string) => save(addSearch(latest.current, q)), [save]);
  const remove = useCallback((q: string) => save(removeSearch(latest.current, q)), [save]);

  return { history, add, remove };
}
