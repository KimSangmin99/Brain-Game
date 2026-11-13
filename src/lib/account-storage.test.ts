import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { makeAttempt } from "./pattern";
import {
  saveAttempt,
  readAllAttempts,
  sourceProfile,
  eraseAccountData,
} from "./storage";
beforeEach(() => {
  vi.stubGlobal("indexedDB", new IDBFactory());
  const data = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    get length() {
      return data.size;
    },
    key: (i: number) => Array.from(data.keys())[i] ?? null,
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

it("erases only the deleted account and its linked guest originals, preserving unrelated records and settings", async () => {
  const linked = makeAttempt(1),
    guest = makeAttempt(1),
    other = makeAttempt(1);
  await saveAttempt(linked);
  await saveAttempt(guest);
  await saveAttempt(linked, "user-a");
  await saveAttempt(other, "user-b");
  localStorage.setItem(
    `brain-linked-${linked.id}`,
    JSON.stringify({ userId: "user-a", at: Date.now() }),
  );
  localStorage.setItem(
    `brain-linked-${other.id}`,
    JSON.stringify({ userId: "user-b", at: Date.now() }),
  );
  localStorage.setItem(`brain-synced-user-a-${linked.id}`, "1");
  localStorage.setItem("brain-source-user-a", "fixture");
  localStorage.setItem("brain-large-type", "true");
  await eraseAccountData("user-a");
  expect(await readAllAttempts("user-a")).toEqual([]);
  expect((await readAllAttempts()).map((a) => a.id)).toEqual([guest.id]);
  expect((await readAllAttempts("user-b")).map((a) => a.id)).toEqual([
    other.id,
  ]);
  expect(localStorage.getItem("brain-source-user-a")).toBeNull();
  expect(localStorage.getItem(`brain-synced-user-a-${linked.id}`)).toBeNull();
  expect(localStorage.getItem(`brain-linked-${linked.id}`)).toBeNull();
  expect(localStorage.getItem(`brain-linked-${other.id}`)).not.toBeNull();
  expect(localStorage.getItem("brain-large-type")).toBe("true");
  await expect(saveAttempt(makeAttempt(1), "user-a")).rejects.toThrow("탈퇴");
  await expect(saveAttempt(linked)).rejects.toThrow("탈퇴");
  expect(() => sourceProfile("user-a")).toThrow("탈퇴");
  await eraseAccountData("user-a");
  expect(await readAllAttempts("user-b")).toHaveLength(1);
});
it("hides deleted account records even when an old browser writer bypasses the app guard", async () => {
  const a = makeAttempt(1);
  await saveAttempt(a, "user-a");
  await eraseAccountData("user-a");
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open("brain-game-user-user-a", 1);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction("attempts", "readwrite");
    tx.objectStore("attempts").put(a);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
  expect(await readAllAttempts("user-a")).toEqual([]);
});
