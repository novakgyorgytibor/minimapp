import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useRef, useState } from 'react';
import { addSearch, parseHistory } from './history';

const STORAGE_KEY = 'minimap.searchHistory';

/** Legutóbbi keresések (a beírt szöveg, amiből helyet választottunk), a telefonon tárolva. */
export function useSearchHistory(): { history: string[]; add: (q: string) => void } {
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
  const add = useCallback((q: string) => {
    const next = addSearch(latest.current, q);
    latest.current = next;
    setHistory(next);
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
  }, []);

  return { history, add };
}
