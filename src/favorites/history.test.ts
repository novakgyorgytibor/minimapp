import { addSearch, MAX_HISTORY, parseHistory } from './history';

test('newest search goes to the front, duplicates move up', () => {
  let l = addSearch([], 'Keleti pályaudvar');
  l = addSearch(l, 'Deák tér');
  expect(l).toEqual(['Deák tér', 'Keleti pályaudvar']);
  l = addSearch(l, '  keleti PÁLYAUDVAR ');
  expect(l).toEqual(['keleti PÁLYAUDVAR', 'Deák tér']);
});

test('blank query is ignored', () => {
  expect(addSearch(['a'], '   ')).toEqual(['a']);
});

test('list is capped', () => {
  let l: string[] = [];
  for (let i = 0; i < MAX_HISTORY + 5; i++) l = addSearch(l, `q${i}`);
  expect(l).toHaveLength(MAX_HISTORY);
  expect(l[0]).toBe(`q${MAX_HISTORY + 4}`);
});

test('parse tolerates garbage', () => {
  expect(parseHistory(null)).toEqual([]);
  expect(parseHistory('{')).toEqual([]);
  expect(parseHistory('{"a":1}')).toEqual([]);
  expect(parseHistory('["x", 3, "", null, "y"]')).toEqual(['x', 'y']);
});
