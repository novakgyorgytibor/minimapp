import type { Place } from '../types';
import { findFavorite, MAX_FAVORITES, parseFavorites, toggleFavorite } from './favorites';

const home: Place = { name: 'Otthon', detail: 'Budapest', coord: [19.04, 47.5] };
const work: Place = { name: 'Munka', detail: '', coord: [19.1, 47.52] };
const M_PER_DEG_LAT = 111_320;

test('toggle adds to the front, and removes it again', () => {
  let l = toggleFavorite([], home);
  l = toggleFavorite(l, work);
  expect(l.map((p) => p.name)).toEqual(['Munka', 'Otthon']);
  l = toggleFavorite(l, home);
  expect(l.map((p) => p.name)).toEqual(['Munka']);
});

test('a point a few metres away counts as the same place', () => {
  const near: [number, number] = [home.coord[0], home.coord[1] + 10 / M_PER_DEG_LAT];
  const far: [number, number] = [home.coord[0], home.coord[1] + 40 / M_PER_DEG_LAT];
  expect(findFavorite([home], near)).toBe(home);
  expect(findFavorite([home], far)).toBeUndefined();
  expect(toggleFavorite([home], { ...home, coord: near })).toEqual([]);
});

test('list is capped', () => {
  let l: Place[] = [];
  for (let i = 0; i < MAX_FAVORITES + 5; i++) l = toggleFavorite(l, { name: `p${i}`, detail: '', coord: [19 + i * 0.01, 47.5] });
  expect(l).toHaveLength(MAX_FAVORITES);
  expect(l[0].name).toBe(`p${MAX_FAVORITES + 4}`);
});

test('parseFavorites drops broken data', () => {
  expect(parseFavorites(null)).toEqual([]);
  expect(parseFavorites('nem json')).toEqual([]);
  expect(parseFavorites('{"a":1}')).toEqual([]);
  expect(parseFavorites(JSON.stringify([home, { name: 'x' }, { ...work, coord: [1, 'a'] }]))).toEqual([home]);
});
