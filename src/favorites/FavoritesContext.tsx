import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Place } from '../types';
import { parseFavorites, toggleFavorite } from './favorites';

const STORAGE_KEY = 'minimap.favorites';

interface FavoritesValue {
  favorites: Place[];
  toggle: (p: Place) => void;
}

const FavoritesContext = createContext<FavoritesValue | null>(null);

/** Kedvenc helyek, a telefonon tárolva. */
export function FavoritesProvider({ children }: { children: ReactNode }) {
  const [favorites, setFavorites] = useState<Place[]>([]);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((v) => setFavorites(parseFavorites(v)))
      .catch(() => {});
  }, []);

  const toggle = useCallback((p: Place) => {
    setFavorites((list) => {
      const next = toggleFavorite(list, p);
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const value = useMemo(() => ({ favorites, toggle }), [favorites, toggle]);
  return <FavoritesContext.Provider value={value}>{children}</FavoritesContext.Provider>;
}

export function useFavorites(): FavoritesValue {
  const v = useContext(FavoritesContext);
  if (!v) throw new Error('useFavorites must be used inside FavoritesProvider');
  return v;
}
