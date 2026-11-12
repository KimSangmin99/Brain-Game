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
export async function readAllAttempts(
  scope = "guest",
): Promise<MemoryAttempt[]> {
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
  const validated = savedAttemptSchema.parse(attempt);
  const db = await database(scope);
  try {
    const tx = db.transaction("attempts", "readwrite");
    const existing = await tx.store.get(attempt.id);
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
export async function readAttempts(
  game:
    | "pattern"
    | "sequence"
    | "rule"
    | "code"
    | "arrangement"
    | "route"
    | "search" = "pattern",
) {
  return (await readAllAttempts()).filter((a) => attemptGame(a) === game);
}

export function sourceProfile(scope = "guest") {
  const key = `brain-source-${scope}`;
  let value = localStorage.getItem(key);
  if (!value) {
    value = crypto.randomUUID();
    localStorage.setItem(key, value);
  }
  return value;
}
