import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { makeAttempt } from "./pattern";
import { saveAttempt, readAllAttempts, sourceProfile } from "./storage";
beforeEach(() => {
  vi.stubGlobal("indexedDB", new IDBFactory());
  const data = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => data.set(k, v),
    removeItem: (k: string) => data.delete(k),
  });
});
afterEach(() => vi.unstubAllGlobals());
it("keeps guest and two account caches separate, with stable source profiles", async () => {
  const guest = makeAttempt(1),
    a = makeAttempt(1),
    b = makeAttempt(1);
  await saveAttempt(guest);
  await saveAttempt(a, "user-a");
  await saveAttempt(b, "user-b");
  expect((await readAllAttempts()).map((a) => a.id)).toEqual([guest.id]);
  expect((await readAllAttempts("user-a")).map((a) => a.id)).toEqual([a.id]);
  expect((await readAllAttempts("user-b")).map((a) => a.id)).toEqual([b.id]);
  expect(sourceProfile()).toBe(sourceProfile());
  expect(sourceProfile("user-a")).not.toBe(sourceProfile("user-b"));
});
it("removes only successfully linked guest originals after seven days and keeps account copies", async () => {
  const raw = makeAttempt(1);
  const linked = {
    ...raw,
    phase: "result" as const,
    round: 4,
    revision: 1,
    answers: raw.targets.map((selected) => ({
      selected,
      correct: true,
      skipped: false,
    })),
  };
  const failed = makeAttempt(1),
    recent = makeAttempt(1);
  await saveAttempt(linked);
  await saveAttempt(linked, "user-a");
  await saveAttempt(failed);
  await saveAttempt(recent);
  localStorage.setItem(
    `brain-linked-${linked.id}`,
    JSON.stringify({ userId: "user-a", at: Date.now() - 8 * 86400000 }),
  );
  localStorage.setItem(
    `brain-linked-${recent.id}`,
    JSON.stringify({ userId: "user-a", at: Date.now() }),
  );
  expect((await readAllAttempts()).map((a) => a.id)).toEqual(
    expect.arrayContaining([failed.id, recent.id]),
  );
  expect((await readAllAttempts()).some((a) => a.id === linked.id)).toBe(false);
  expect(await readAllAttempts("user-a")).toHaveLength(1);
});
