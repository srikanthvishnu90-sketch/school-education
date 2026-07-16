/**
 * A per-key async mutex. Reflection turns are a read-modify-write on one session
 * (findById → append → save); two near-simultaneous submits would otherwise both
 * read the same base and the second save would clobber the first's message (and
 * collide on the length-derived message id). Serializing by session id closes that
 * race within an instance. A multi-instance deploy still needs DB-level optimistic
 * concurrency; this is the in-process floor that fixes the common rapid-submit case.
 */

// key → the tail of that key's serialized chain (a promise that never rejects,
// so a failed turn doesn't wedge the next one). One entry per active key.
const chains = new Map<string, Promise<unknown>>();

/** Run `fn` so that all calls with the same `key` execute strictly one at a time. */
export async function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prior = chains.get(key) ?? Promise.resolve();
  const result = prior.then(() => fn());
  chains.set(
    key,
    result.then(
      () => undefined,
      () => undefined,
    ),
  );
  return result;
}
