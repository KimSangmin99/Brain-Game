import type { Database } from "./database";
import { importSchema, completedSchema } from "./contracts";
import { attemptGame } from "../lib/memory-types";
import { outcome } from "../lib/memory-common";
import { AppError } from "./errors";
export async function importRecords(
  db: Database,
  userId: string,
  input: unknown,
) {
  const { guestProfileId, records } = importSchema.parse(input);
  return db.transaction(async (tx) => {
    for (const a of records) {
      const game = attemptGame(a),
        r = outcome(a);
      await tx.query(
        `INSERT INTO app_private.attempts(id,user_id,game_id,mode,stage,rules_version,state,score,assisted,interrupted,imported,payload,revision,created_at,updated_at)
        VALUES($1,$2,$3,$4,$5,$6,'result',$7,$8,$9,true,$10::jsonb,$11,$12,$13) ON CONFLICT(id) DO NOTHING`,
        [
          a.id,
          userId,
          game,
          a.mode,
          a.stage,
          a.version,
          r.score,
          a.assisted,
          a.interrupted,
          JSON.stringify(a),
          a.revision,
          new Date(a.createdAt),
          new Date(a.updatedAt),
        ],
      );
      const [existing] = await tx.query<{ user_id: string; payload: unknown }>(
        "SELECT user_id,payload FROM app_private.attempts WHERE id=$1",
        [a.id],
      );
      if (existing.user_id !== userId)
        throw new AppError(
          409,
          "RECORD_OWNED",
          "이미 다른 계정에 연결된 기록입니다.",
        );
      if (
        JSON.stringify(completedSchema.parse(existing.payload)) !==
        JSON.stringify(a)
      )
        throw new AppError(
          409,
          "IMMUTABLE_RECORD",
          "완료 기록은 덮어쓸 수 없습니다.",
        );
      const [receipt] = await tx.query<{ user_id: string }>(
        `INSERT INTO app_private.merge_receipts(guest_profile_id,source_attempt_id,user_id,attempt_id) VALUES($1,$2,$3,$2)
        ON CONFLICT(guest_profile_id,source_attempt_id) DO UPDATE SET guest_profile_id=excluded.guest_profile_id RETURNING user_id`,
        [guestProfileId, a.id, userId],
      );
      if (receipt.user_id !== userId)
        throw new AppError(
          409,
          "RECORD_OWNED",
          "이미 다른 계정에 연결된 기록입니다.",
        );
      if (a.mode === "stage" && r.passed) {
        await tx.query(
          `INSERT INTO app_private.progress(user_id,game_id,completed_stages) VALUES($1,$2,$3::jsonb)
          ON CONFLICT(user_id,game_id) DO UPDATE SET completed_stages=(SELECT jsonb_agg(v ORDER BY v) FROM (SELECT DISTINCT value::int AS v FROM jsonb_array_elements_text(progress.completed_stages || excluded.completed_stages)) s),revision=progress.revision+1,updated_at=now()`,
          [userId, game, JSON.stringify([a.stage])],
        );
      }
    }
    return { ids: records.map((a) => a.id) };
  });
}
export async function listRecords(
  db: Database,
  userId: string,
  cursor?: string,
) {
  if (cursor && !/^[0-9a-f-]{36}$/i.test(cursor))
    throw new AppError(422, "INVALID_CURSOR", "잘못된 페이지입니다.");
  const rows = await db.query<{ id: string; payload: unknown }>(
    `SELECT id,payload FROM app_private.attempts WHERE user_id=$1 AND state='result' AND imported=true AND ($2::uuid IS NULL OR id<$2::uuid) ORDER BY id DESC LIMIT 51`,
    [userId, cursor ?? null],
  );
  return {
    records: rows.slice(0, 50).map((r) => completedSchema.parse(r.payload)),
    nextCursor: rows.length > 50 ? rows[49].id : null,
  };
}
