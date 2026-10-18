export const MAX_HISTORY = 5;

/** A keresés a lista elejére kerül; ugyanaz (kis-/nagybetűtől függetlenül) csak egyszer szerepel. */
export function addSearch(list: string[], query: string): string[] {
  const q = query.trim();
  if (!q) return list;
  const key = q.toLocaleLowerCase();
  return [q, ...list.filter((s) => s.toLocaleLowerCase() !== key)].slice(0, MAX_HISTORY);
}

/** A tárolt JSON ellenőrzése (sérült vagy régi adat ne törje el az appot). */
export function parseHistory(json: string | null): string[] {
  if (!json) return [];
  try {
    const v: unknown = JSON.parse(json);
    if (!Array.isArray(v)) return [];
    return v.filter((s): s is string => typeof s === 'string' && s.trim().length > 0).slice(0, MAX_HISTORY);
  } catch {
    return [];
  }
}
