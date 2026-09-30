/** Awaits a promise that must reject and returns the rejection value (test helper). */
export async function rejection<E = Error & Record<string, unknown>>(p: Promise<unknown>): Promise<E> {
  try {
    await p;
  } catch (e) {
    return e as E;
  }
  throw new Error('expected the promise to reject');
}
