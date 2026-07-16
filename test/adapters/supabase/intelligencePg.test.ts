import { describe, expect, it } from "vitest";

import type { SqlClient } from "@/adapters/supabase";
import {
  createPgReflectionSessionRepository,
  createPgPerformanceRepository,
} from "@/adapters/supabase";
import {
  createReflectionMessage,
  createReflectionSession,
} from "@/domain/intelligence/session";
import { createReflectionPerformance } from "@/domain/intelligence/metacognition";

/**
 * A tiny in-memory Postgres stand-in: enough SQL shape to prove the intelligence
 * adapter's serialize (jsonb) → revive (Date reconstruction) round-trip, including
 * NESTED message timestamps, without a real database. Real RLS/DDL behaviour is
 * covered by the gated Postgres suites.
 */
function fakeClient(): SqlClient {
  // table -> array of { cols: Record<string,string>, data: unknown }
  const store = new Map<string, { cols: Record<string, string>; data: unknown }[]>();

  return {
    async query(rawText, params = []) {
      const text = rawText.replace(/\s+/g, " ").trim();
      const insert = /insert into (\S+) \(([^)]+)\) values/i.exec(text);
      if (insert) {
        const table = insert[1];
        const cols = insert[2].split(",").map((c) => c.trim());
        const row: Record<string, string> = {};
        let data: unknown = null;
        cols.forEach((c, i) => {
          const v = params[i];
          if (c === "data") data = JSON.parse(v as string);
          else row[c] = String(v);
        });
        const rows = store.get(table) ?? [];
        // Upsert by the non-data columns that form the key (id, or the pair).
        const keyCols = cols.filter((c) => c !== "data");
        const existing = rows.findIndex((r) =>
          keyCols.every((c) => r.cols[c] === row[c]),
        );
        const entry = { cols: row, data };
        if (existing >= 0) rows[existing] = entry;
        else rows.push(entry);
        store.set(table, rows);
        return { rows: [] };
      }

      const select = /select data from (\S+)(?: where (.+?))?(?: order by| $|$)/i.exec(text);
      if (select) {
        const table = select[1];
        const rows = store.get(table) ?? [];
        const where = select[2];
        const preds = where
          ? [...where.matchAll(/(\w+)=\$(\d+)/g)].map((m) => ({
              col: m[1],
              val: String(params[Number(m[2]) - 1]),
            }))
          : [];
        const matched = rows.filter((r) => preds.every((p) => r.cols[p.col] === p.val));
        return { rows: matched.map((r) => ({ data: r.data })) as never[] };
      }

      // DDL / alter / revoke — ignored by the fake.
      return { rows: [] };
    },
  };
}

const AT = new Date("2026-07-16T10:00:00.000Z");

describe("pg intelligence adapter — serialize/revive round-trip", () => {
  it("round-trips a session with nested message timestamps as real Dates", async () => {
    const repo = createPgReflectionSessionRepository(fakeClient());
    const session = createReflectionSession({
      id: "lesson-x:student-a",
      reflectionId: "lesson-x",
      studentId: "student-a",
      status: "active",
      startedAt: AT,
      messages: [
        createReflectionMessage({
          id: "m0",
          sessionId: "lesson-x:student-a",
          sender: "ai",
          text: "How did it go?",
          createdAt: AT,
        }),
      ],
    });
    await repo.save(session);

    const back = await repo.findByReflectionAndStudent("lesson-x", "student-a");
    expect(back).not.toBeNull();
    expect(back?.startedAt).toBeInstanceOf(Date);
    expect(back?.startedAt.toISOString()).toBe(AT.toISOString());
    expect(back?.messages[0].createdAt).toBeInstanceOf(Date);
    expect(back?.messages[0].text).toBe("How did it go?");

    expect((await repo.listByReflection("lesson-x")).length).toBe(1);
    expect(await repo.findById("lesson-x:student-a")).not.toBeNull();
  });

  it("upserts a performance by (reflection, student) and revives the date", async () => {
    const repo = createPgPerformanceRepository(fakeClient());
    await repo.save(
      createReflectionPerformance({
        reflectionId: "lesson-x",
        studentId: "student-a",
        score: 0.4,
        recordedAt: AT,
      }),
    );
    await repo.save(
      createReflectionPerformance({
        reflectionId: "lesson-x",
        studentId: "student-a",
        score: 0.9,
        recordedAt: AT,
      }),
    );
    const back = await repo.findByReflectionAndStudent("lesson-x", "student-a");
    expect(back?.score).toBe(0.9); // overwrote, not duplicated
    expect(back?.recordedAt).toBeInstanceOf(Date);
    expect((await repo.listByStudent("student-a")).length).toBe(1);
  });
});
