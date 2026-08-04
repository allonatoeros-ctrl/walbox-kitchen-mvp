import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizzaId, resolveSnapshotUUID } from "./playerSnapshotAdapter.js";

// Mock minimale del client Supabase: replica solo la catena .from().select().eq().maybeSingle()
// usata da resolveSnapshotUUID. Nessuna rete, nessuna scrittura.
function makeMockSupabase({ data = null, error = null, expectedTable, expectedColumn, expectedValue } = {}) {
  const calls = { from: [], select: [], eq: [] };
  return {
    calls,
    from(table) {
      calls.from.push(table);
      if (expectedTable) assert.equal(table, expectedTable);
      return {
        select(columns) {
          calls.select.push(columns);
          return {
            eq(column, value) {
              calls.eq.push([column, value]);
              if (expectedColumn) assert.equal(column, expectedColumn);
              if (expectedValue) assert.equal(value, expectedValue);
              return {
                async maybeSingle() {
                  return { data, error };
                },
              };
            },
          };
        },
      };
    },
  };
}

test("normalizzaId: id valido -> external_player_id", () => {
  assert.equal(normalizzaId("p_001"), "001");
  assert.equal(normalizzaId("p_26644"), "26644");
});

test("normalizzaId: id invalido (senza prefisso p_) -> throw ID_INVALIDO", () => {
  assert.throws(() => normalizzaId("001"), /ID_INVALIDO/);
});

test("normalizzaId: id invalido (prefisso sbagliato) -> throw ID_INVALIDO", () => {
  assert.throws(() => normalizzaId("player_001"), /ID_INVALIDO/);
});

test("normalizzaId: id invalido (vuoto) -> throw ID_INVALIDO", () => {
  assert.throws(() => normalizzaId("p_"), /ID_INVALIDO/);
});

test("normalizzaId: id non-string -> throw ID_INVALIDO", () => {
  assert.throws(() => normalizzaId(undefined), /ID_INVALIDO/);
  assert.throws(() => normalizzaId(123), /ID_INVALIDO/);
});

test("resolveSnapshotUUID: lookup riuscita -> snapshotId popolato", async () => {
  const supabase = makeMockSupabase({
    data: { id: "11111111-1111-1111-1111-111111111111" },
    error: null,
    expectedTable: "fanta_player_snapshots",
    expectedColumn: "external_player_id",
    expectedValue: "001",
  });

  const result = await resolveSnapshotUUID(supabase, "p_001");

  assert.equal(result.snapshotId, "11111111-1111-1111-1111-111111111111");
  assert.equal(result.error, null);
});

test("resolveSnapshotUUID: snapshot mancante -> error SNAPSHOT_NON_TROVATO, snapshotId null", async () => {
  const supabase = makeMockSupabase({ data: null, error: null });

  const result = await resolveSnapshotUUID(supabase, "p_999");

  assert.equal(result.snapshotId, null);
  assert.match(result.error, /SNAPSHOT_NON_TROVATO/);
  assert.match(result.error, /999/);
});

test("resolveSnapshotUUID: errore Supabase -> error SUPABASE_ERROR, snapshotId null", async () => {
  const supabase = makeMockSupabase({ data: null, error: { message: "connection reset" } });

  const result = await resolveSnapshotUUID(supabase, "p_001");

  assert.equal(result.snapshotId, null);
  assert.match(result.error, /SUPABASE_ERROR/);
  assert.match(result.error, /connection reset/);
});

test("resolveSnapshotUUID: id frontend invalido -> error ID_INVALIDO, nessuna query eseguita", async () => {
  const supabase = makeMockSupabase({});

  const result = await resolveSnapshotUUID(supabase, "invalid-id");

  assert.equal(result.snapshotId, null);
  assert.match(result.error, /ID_INVALIDO/);
  assert.equal(supabase.calls.from.length, 0);
});
