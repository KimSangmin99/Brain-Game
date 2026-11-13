import { switchSchema, type SwitchAttempt } from "./switch";
import { openDB, type DBSchema } from "idb";
import { attemptSchema, type Attempt } from "./pattern";
import { sequenceSchema, type SequenceAttempt } from "./sequence";
import { ruleSchema, type RuleAttempt } from "./rule";
import { z } from "zod";
import { attemptGame, type MemoryAttempt } from "./memory-types";
import { codeSchema, type CodeAttempt } from "./code";
import { arrangementSchema, type ArrangementAttempt } from "./arrangement";
import { routeSchema, type RouteAttempt } from "./route";
import { searchSchema, type SearchAttempt } from "./search";
const savedAttemptSchema = z.union([
  attemptSchema,
  sequenceSchema,
  ruleSchema,
  codeSchema,
  arrangementSchema,
  routeSchema,
  searchSchema,
  switchSchema,
]);

interface BrainDB extends DBSchema {
  attempts: { key: string; value: MemoryAttempt };
}
const database = (scope = "guest") =>
  openDB<BrainDB>(
    scope === "guest" ? "brain-game-guest" : `brain-game-user-${scope}`,
    1,
    {
      upgrade(db) {
        db.createObjectStore("attempts", { keyPath: "id" });
      },
    },
  );
const deletedScope = (scope: string) =>
  scope !== "guest" &&
  typeof localStorage !== "undefined" &&
  !!localStorage.getItem(`brain-deleted-${scope}`);
export async function readAllAttempts(
  scope = "guest",
): Promise<MemoryAttempt[]> {
  if (deletedScope(scope)) return [];
  const db = await database(scope);
  try {
    if (scope === "guest" && typeof localStorage !== "undefined") {
      const rows = await db.getAll("attempts");
      for (const a of rows) {
        const receipt = localStorage.getItem(`brain-linked-${a.id}`);
        if (!receipt) continue;
        try {
          const metadata: { at: number } = JSON.parse(receipt);
          if (
            Number.isFinite(metadata.at) &&
            Date.now() - metadata.at > 7 * 86400000
          ) {
            await db.delete("attempts", a.id);
            localStorage.removeItem(`brain-linked-${a.id}`);
          }
        } catch {
          /* Keep the original if a receipt cannot be read. */
        }
      }
    }
    return (await db.getAll("attempts"))
      .filter(
        (a) =>
          !deletedScope(scope) &&
          (typeof localStorage === "undefined" ||
            !localStorage.getItem(`brain-deleted-attempt-${a.id}`)),
      )
      .map((value) => savedAttemptSchema.parse(value))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  } finally {
    db.close();
  }
}
export async function saveAttempt(
  attempt: MemoryAttempt,
  scope = "guest",
): Promise<void> {
  if (
    deletedScope(scope) ||
    (typeof localStorage !== "undefined" &&
      !!localStorage.getItem(`brain-deleted-attempt-${attempt.id}`))
  )
    throw new Error("탈퇴한 계정에는 기록을 저장할 수 없습니다.");
  const validated = savedAttemptSchema.parse(attempt);
  const db = await database(scope);
  try {
    const tx = db.transaction("attempts", "readwrite");
    const existing = await tx.store.get(attempt.id);
    if (
      deletedScope(scope) ||
      (typeof localStorage !== "undefined" &&
        !!localStorage.getItem(`brain-deleted-attempt-${attempt.id}`))
    ) {
      tx.abort();
      await tx.done.catch(() => {});
      throw new Error("탈퇴한 계정에는 기록을 저장할 수 없습니다.");
    }
    // A stale tab cannot overwrite a completed result or newer revision.
    if (
      !existing ||
      (existing.phase !== "result" && existing.revision < validated.revision)
    )
      await tx.store.put(validated);
    await tx.done;
  } finally {
    db.close();
  }
}

export async function eraseAccountData(userId: string) {
  // Block stale tabs/in-flight requests before clearing their account's rows.
  localStorage.setItem(`brain-deleted-${userId}`, "1");
  const account = await database(userId);
  try {
    await account.clear("attempts");
  } finally {
    account.close();
  }
  const keys = Array.from({ length: localStorage.length }, (_, i) =>
    localStorage.key(i),
  ).filter((k): k is string => !!k);
  const linked: string[] = [];
  for (const key of keys) {
    if (key.startsWith("brain-linked-")) {
      try {
        if (JSON.parse(localStorage.getItem(key) ?? "null")?.userId === userId)
          linked.push(key.slice("brain-linked-".length));
      } catch {
        /* Keep unreadable receipts rather than removing another account's data. */
      }
    }
  }
  if (linked.length) {
    for (const id of linked)
      localStorage.setItem(`brain-deleted-attempt-${id}`, "1");
    const guest = await database();
    try {
      const tx = guest.transaction("attempts", "readwrite");
      for (const id of linked) await tx.store.delete(id);
      await tx.done;
    } finally {
      guest.close();
    }
  }
  for (const key of keys)
    if (
      key === `brain-source-${userId}` ||
      key.startsWith(`brain-synced-${userId}-`) ||
      linked.some((id) => key === `brain-linked-${id}`)
    )
      localStorage.removeItem(key);
}

export function readAttempts(): Promise<Attempt[]>;
export function readAttempts(game: "pattern"): Promise<Attempt[]>;
export function readAttempts(game: "sequence"): Promise<SequenceAttempt[]>;
export function readAttempts(game: "rule"): Promise<RuleAttempt[]>;
export function readAttempts(game: "code"): Promise<CodeAttempt[]>;
export function readAttempts(
  game: "arrangement",
): Promise<ArrangementAttempt[]>;
export function readAttempts(game: "route"): Promise<RouteAttempt[]>;
export function readAttempts(game: "search"): Promise<SearchAttempt[]>;
export function readAttempts(game: "switch"): Promise<SwitchAttempt[]>;
export async function readAttempts(
  game:
    | "pattern"
    | "sequence"
    | "rule"
    | "code"
    | "arrangement"
    | "route"
    | "search"
    | "switch" = "pattern",
) {
  return (await readAllAttempts()).filter((a) => attemptGame(a) === game);
}

export function sourceProfile(scope = "guest") {
  if (deletedScope(scope)) throw new Error("탈퇴한 계정입니다.");
  const key = `brain-source-${scope}`;
  let value = localStorage.getItem(key);
  if (!value) {
    value = crypto.randomUUID();
    localStorage.setItem(key, value);
  }
  return value;
}
