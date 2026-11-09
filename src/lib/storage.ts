import { openDB, type DBSchema } from "idb";
import { attemptSchema, type Attempt } from "./pattern";
import { sequenceSchema, type SequenceAttempt } from "./sequence";
import { z } from "zod";
import { attemptGame, type MemoryAttempt } from "./memory-types";
const savedAttemptSchema = z.union([attemptSchema, sequenceSchema]);

interface BrainDB extends DBSchema {
  attempts: { key: string; value: MemoryAttempt };
}
const database = () =>
  openDB<BrainDB>("brain-game-guest", 1, {
    upgrade(db) {
      db.createObjectStore("attempts", { keyPath: "id" });
    },
  });
export async function readAllAttempts(): Promise<MemoryAttempt[]> {
  const db = await database();
  try {
    return (await db.getAll("attempts"))
      .map((value) => savedAttemptSchema.parse(value))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  } finally {
    db.close();
  }
}
export async function saveAttempt(attempt: MemoryAttempt): Promise<void> {
  const validated = savedAttemptSchema.parse(attempt);
  const db = await database();
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
export async function readAttempts(game: "pattern" | "sequence" = "pattern") {
  return (await readAllAttempts()).filter((a) => attemptGame(a) === game);
}
