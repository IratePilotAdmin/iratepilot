export class DraftSaveError extends Error {
  constructor(message: string, readonly conflict = false) { super(message); }
}

type Draft<T> = { id: string; revision: number; details: T };
export type DraftSaveState<T, D extends Draft<T>> = {
  draft: D;
  details: T;
  dirty: boolean;
  saving: boolean;
  error: DraftSaveError | null;
};

/** Serializes saves while retaining edits made after a request starts. */
export function createDraftSaveCoordinator<T, D extends Draft<T>>(
  initial: D,
  persist: (draft: D, details: T) => Promise<D>,
) {
  let draft = initial;
  let details = initial.details;
  let version = 0;
  let savedVersion = 0;
  let running: Promise<boolean> | null = null;
  let saving = false;
  let error: DraftSaveError | null = null;
  const listeners = new Set<() => void>();
  const publish = () => listeners.forEach((listener) => listener());
  const snapshot = (): DraftSaveState<T, D> => ({ draft, details, dirty: version !== savedVersion, saving, error });

  async function saveLoop() {
    saving = true;
    publish();
    try {
      while (version !== savedVersion) {
        const sentVersion = version;
        const result = await persist(draft, details);
        if (result.id !== draft.id || !Number.isSafeInteger(result.revision) || result.revision <= draft.revision) {
          throw new DraftSaveError("The save could not be confirmed. Your changes remain here; reload the saved version before trying again.", true);
        }
        draft = result;
        savedVersion = sentVersion;
        if (version === sentVersion) details = result.details;
        publish();
      }
      return true;
    } catch (reason) {
      error = reason instanceof DraftSaveError ? reason : new DraftSaveError("Saving failed. Your changes remain here. Please retry.");
      return false;
    } finally {
      saving = false;
      running = null;
      publish();
    }
  }

  const flush = () => {
    if (running) return running;
    if (error) return Promise.resolve(false);
    if (version === savedVersion) return Promise.resolve(true);
    // Start in a microtask so a synchronous persistence failure cannot leave a stale running promise.
    running = Promise.resolve().then(saveLoop);
    return running;
  };

  return {
    snapshot,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    edit(next: T) { details = next; version += 1; publish(); },
    flush,
    retry() { if (error?.conflict) return Promise.resolve(false); error = null; publish(); return flush(); },
  };
}
