import { describe, expect, it, vi } from "vitest";
import { createDraftSaveCoordinator, DraftSaveError } from "../lib/partner/draft-save-coordinator";

type Details = { description: string };
type TestDraft = { id: string; revision: number; details: Details };
const initial: TestDraft = { id: "draft-one", revision: 3, details: { description: "Saved text" } };

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

describe("partner draft save coordination", () => {
  it("serializes requests and saves newer typing against the returned revision", async () => {
    const first = deferred<TestDraft>();
    const persist = vi.fn().mockReturnValueOnce(first.promise).mockImplementationOnce(async (draft: TestDraft, details: Details) => ({ ...draft, details, revision: draft.revision + 1 }));
    const saver = createDraftSaveCoordinator<Details, TestDraft>(initial, persist);
    saver.edit({ description: "First edit" });
    const pending = saver.flush();
    await Promise.resolve();
    saver.edit({ description: "Newer typing during save" });
    expect(saver.flush()).toBe(pending);
    expect(persist).toHaveBeenCalledTimes(1);
    first.resolve({ ...initial, revision: 4, details: { description: "First edit" } });
    expect(await pending).toBe(true);
    expect(persist).toHaveBeenNthCalledWith(2, expect.objectContaining({ revision: 4 }), { description: "Newer typing during save" });
    expect(saver.snapshot()).toMatchObject({ dirty: false, saving: false, details: { description: "Newer typing during save" }, draft: { revision: 5 } });
  });

  it("keeps local text on a revision conflict and refuses automatic or retry overwrite", async () => {
    const persist = vi.fn().mockRejectedValue(new DraftSaveError("Another device saved this draft.", true));
    const saver = createDraftSaveCoordinator<Details, TestDraft>(initial, persist);
    saver.edit({ description: "Unsaved local text" });
    expect(await saver.flush()).toBe(false);
    saver.edit({ description: "Still retained locally" });
    expect(await saver.flush()).toBe(false);
    expect(await saver.retry()).toBe(false);
    expect(persist).toHaveBeenCalledTimes(1);
    expect(saver.snapshot()).toMatchObject({ dirty: true, details: { description: "Still retained locally" }, error: { conflict: true }, draft: { revision: 3 } });
  });

  it("retries a failed save only after an explicit retry and keeps newer edits", async () => {
    const persist = vi.fn().mockRejectedValueOnce(new Error("offline")).mockImplementationOnce(async (draft: TestDraft, details: Details) => ({ ...draft, details, revision: draft.revision + 1 }));
    const saver = createDraftSaveCoordinator<Details, TestDraft>(initial, persist);
    saver.edit({ description: "Before failure" });
    expect(await saver.flush()).toBe(false);
    saver.edit({ description: "After failure" });
    expect(await saver.flush()).toBe(false);
    expect(await saver.retry()).toBe(true);
    expect(saver.snapshot()).toMatchObject({ dirty: false, error: null, details: { description: "After failure" }, draft: { revision: 4 } });
  });

  it.each([{ id: "different", revision: 4 }, { id: "draft-one", revision: 3 }])("does not mark an unconfirmed save as saved: %j", async (receipt) => {
    const saver = createDraftSaveCoordinator<Details, TestDraft>(initial, async (_, details) => ({ ...receipt, details }));
    saver.edit({ description: "Keep this" });
    expect(await saver.flush()).toBe(false);
    expect(saver.snapshot()).toMatchObject({ dirty: true, error: { conflict: true }, details: { description: "Keep this" }, draft: { revision: 3 } });
  });

  it("does not write a clean draft", async () => {
    const persist = vi.fn();
    const saver = createDraftSaveCoordinator<Details, TestDraft>(initial, persist);
    expect(await saver.flush()).toBe(true);
    expect(persist).not.toHaveBeenCalled();
  });
});
