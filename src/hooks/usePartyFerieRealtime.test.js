import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeRow,
  fetchInitialPartyFerieRequests,
  applyRealtimeEvent,
  subscribeToPartyFerieRequests,
  pickPublicColumns,
  mergeInitialSnapshotWithBuffer,
  insertPartyFerieRequest,
} from './usePartyFerieRealtime.js';

const RAW_ROW = {
  id: 'r1',
  event_id: 'evt1',
  nickname: 'Mario',
  table_number: 5,
  dedication: 'ciao',
  spotify_track_id: 'sp1',
  spotify_track_uri: 'spotify:track:sp1',
  track_name: 'Song',
  artist_name: 'Artist',
  artwork_url: 'https://example.com/art.png',
  duration_ms: 210000,
  status: 'pending',
  queue_position: '2',
  created_at: '2026-07-23T10:00:00Z',
  updated_at: '2026-07-23T10:00:00Z',
  played_at: null,
  submitted_by: 'user-secret-id',
};

function fakeSelectClient(rows, error = null) {
  return {
    from() {
      return {
        select() {
          return {
            order() {
              return Promise.resolve({ data: rows, error });
            },
          };
        },
      };
    },
  };
}

test('normalizeRow maps public fields and never exposes submitted_by', () => {
  const normalized = normalizeRow(RAW_ROW);

  assert.equal(normalized.id, 'r1');
  assert.equal(normalized.eventId, 'evt1');
  assert.equal(normalized.table, 5);
  assert.equal(normalized.spotifyTrackId, 'sp1');
  assert.equal(normalized.queuePosition, 2);
  assert.equal(typeof normalized.queuePosition, 'number');
  assert.ok(!('submitted_by' in normalized));
  assert.ok(!('submittedBy' in normalized));
});

test('fetchInitialPartyFerieRequests returns normalized rows ordered by queue_position', async () => {
  const rows = [
    { ...RAW_ROW, id: 'r-pending', status: 'pending', queue_position: '1' },
    { ...RAW_ROW, id: 'r-ready', status: 'ready', queue_position: '2' },
    { ...RAW_ROW, id: 'r-playing', status: 'playing', queue_position: '3' },
  ];
  const client = fakeSelectClient(rows);

  const result = await fetchInitialPartyFerieRequests(client);

  assert.equal(result.length, 3);
  assert.deepEqual(
    result.map((r) => r.status),
    ['pending', 'ready', 'playing']
  );
  for (const row of result) {
    assert.ok(!('submitted_by' in row));
  }
});

test('fetchInitialPartyFerieRequests returns empty array when select yields no rows', async () => {
  const client = fakeSelectClient([]);

  const result = await fetchInitialPartyFerieRequests(client);

  assert.deepEqual(result, []);
});

test('fetchInitialPartyFerieRequests propagates the error when the client reports one', async () => {
  const client = fakeSelectClient(null, new Error('RLS denied'));

  await assert.rejects(
    () => fetchInitialPartyFerieRequests(client),
    /RLS denied/
  );
});

test('applyRealtimeEvent INSERT adds the normalized row', () => {
  const result = applyRealtimeEvent([], { eventType: 'INSERT', new: RAW_ROW });

  assert.equal(result.length, 1);
  assert.equal(result[0].id, 'r1');
  assert.ok(!('submitted_by' in result[0]));
});

test('applyRealtimeEvent UPDATE replaces the existing row by id, not duplicates', () => {
  const existing = [normalizeRow(RAW_ROW)];
  const updatedRaw = { ...RAW_ROW, status: 'ready' };

  const result = applyRealtimeEvent(existing, { eventType: 'UPDATE', new: updatedRaw });

  assert.equal(result.length, 1);
  assert.equal(result[0].status, 'ready');
});

test('applyRealtimeEvent INSERT keeps the list ordered by queuePosition', () => {
  const existing = [
    { ...normalizeRow(RAW_ROW), id: 'r-low', queuePosition: 1 },
    { ...normalizeRow(RAW_ROW), id: 'r-high', queuePosition: 3 },
  ];
  const insertedRaw = { ...RAW_ROW, id: 'r-mid', queue_position: '2' };

  const result = applyRealtimeEvent(existing, { eventType: 'INSERT', new: insertedRaw });

  assert.deepEqual(
    result.map((r) => r.id),
    ['r-low', 'r-mid', 'r-high']
  );
});

test('applyRealtimeEvent UPDATE re-sorts the list when queuePosition changes', () => {
  const existing = [
    { ...normalizeRow(RAW_ROW), id: 'r-a', queuePosition: 1 },
    { ...normalizeRow(RAW_ROW), id: 'r-b', queuePosition: 2 },
    { ...normalizeRow(RAW_ROW), id: 'r-c', queuePosition: 3 },
  ];
  const updatedRaw = { ...RAW_ROW, id: 'r-a', queue_position: '5' };

  const result = applyRealtimeEvent(existing, { eventType: 'UPDATE', new: updatedRaw });

  assert.deepEqual(
    result.map((r) => r.id),
    ['r-b', 'r-c', 'r-a']
  );
});

test('applyRealtimeEvent DELETE removes the row by id', () => {
  const existing = [normalizeRow(RAW_ROW)];

  const result = applyRealtimeEvent(existing, { eventType: 'DELETE', old: RAW_ROW });

  assert.deepEqual(result, []);
});

test('subscribeToPartyFerieRequests registers the postgres_changes filter and invokes onEvent', () => {
  let registeredEvent;
  let registeredFilter;
  let removedChannel;
  const fakeChannel = {
    on(event, filter, handler) {
      registeredEvent = event;
      registeredFilter = filter;
      this._handler = handler;
      return this;
    },
    subscribe() {
      return this;
    },
  };
  const client = {
    channel() {
      return fakeChannel;
    },
    removeChannel(channel) {
      removedChannel = channel;
    },
  };

  const events = [];
  const cleanup = subscribeToPartyFerieRequests(client, (payload) => events.push(payload));

  assert.equal(registeredEvent, 'postgres_changes');
  assert.deepEqual(registeredFilter, {
    event: '*',
    schema: 'public',
    table: 'party_ferie_requests',
  });

  fakeChannel._handler({ eventType: 'INSERT', new: RAW_ROW });
  assert.equal(events.length, 1);

  cleanup();
  assert.equal(removedChannel, fakeChannel);
});

test('pickPublicColumns keeps only the columns used by the initial fetch, dropping submitted_by', () => {
  const picked = pickPublicColumns(RAW_ROW);

  assert.deepEqual(Object.keys(picked).sort(), [
    'artist_name',
    'artwork_url',
    'created_at',
    'dedication',
    'duration_ms',
    'event_id',
    'id',
    'nickname',
    'played_at',
    'queue_position',
    'spotify_track_id',
    'spotify_track_uri',
    'status',
    'table_number',
    'track_name',
    'updated_at',
  ]);
  assert.equal(picked.id, 'r1');
  assert.ok(!('submitted_by' in picked));
});

test('pickPublicColumns drops columns not present in the raw row', () => {
  const picked = pickPublicColumns({ id: 'r1', submitted_by: 'user-secret-id' });

  assert.equal(picked.id, 'r1');
  assert.equal(picked.nickname, undefined);
  assert.ok(!('submitted_by' in picked));
});

test('subscribeToPartyFerieRequests strips submitted_by from new/old before invoking onEvent', () => {
  const fakeChannel = {
    on(event, filter, handler) {
      this._handler = handler;
      return this;
    },
    subscribe() {
      return this;
    },
  };
  const client = {
    channel() {
      return fakeChannel;
    },
    removeChannel() {},
  };

  const events = [];
  subscribeToPartyFerieRequests(client, (payload) => events.push(payload));

  fakeChannel._handler({ eventType: 'INSERT', new: RAW_ROW, old: null });
  fakeChannel._handler({ eventType: 'DELETE', new: null, old: RAW_ROW });

  assert.ok(!('submitted_by' in events[0].new));
  assert.equal(events[0].new.id, 'r1');
  assert.equal(events[0].old, null);

  assert.ok(!('submitted_by' in events[1].old));
  assert.equal(events[1].old.id, 'r1');
  assert.equal(events[1].new, null);
});

test('applyRealtimeEvent INSERT is idempotent: replaying an INSERT for an existing id updates in place, no duplicate', () => {
  const existing = [normalizeRow(RAW_ROW)];
  const replayedInsert = { ...RAW_ROW, status: 'ready' };

  const result = applyRealtimeEvent(existing, { eventType: 'INSERT', new: replayedInsert });

  assert.equal(result.length, 1);
  assert.equal(result[0].status, 'ready');
});

test('mergeInitialSnapshotWithBuffer applies buffered events on top of the snapshot without duplicates', () => {
  const initial = [
    { ...normalizeRow(RAW_ROW), id: 'r-low', queuePosition: 1 },
    { ...normalizeRow(RAW_ROW), id: 'r-mid', queuePosition: 2 },
  ];

  const buffer = [
    // Row already present in the snapshot: an INSERT delivered during the
    // fetch race window for a row the fetch itself already picked up.
    { eventType: 'INSERT', new: { ...RAW_ROW, id: 'r-mid', queue_position: '2', status: 'ready' } },
    // Row not yet in the snapshot: a genuine new row inserted mid-fetch.
    { eventType: 'INSERT', new: { ...RAW_ROW, id: 'r-new', queue_position: '0' } },
  ];

  const result = mergeInitialSnapshotWithBuffer(initial, buffer);

  assert.equal(result.length, 3);
  assert.deepEqual(
    result.map((r) => r.id),
    ['r-new', 'r-low', 'r-mid']
  );
  assert.equal(result.find((r) => r.id === 'r-mid').status, 'ready');
});

test('mergeInitialSnapshotWithBuffer applies a buffered DELETE for a row present in the snapshot', () => {
  const initial = [
    { ...normalizeRow(RAW_ROW), id: 'r-a', queuePosition: 1 },
    { ...normalizeRow(RAW_ROW), id: 'r-b', queuePosition: 2 },
  ];
  const buffer = [{ eventType: 'DELETE', old: { ...RAW_ROW, id: 'r-a' } }];

  const result = mergeInitialSnapshotWithBuffer(initial, buffer);

  assert.deepEqual(result.map((r) => r.id), ['r-b']);
});

test('mergeInitialSnapshotWithBuffer returns the snapshot unchanged when the buffer is empty', () => {
  const initial = [{ ...normalizeRow(RAW_ROW), id: 'r-a', queuePosition: 1 }];

  const result = mergeInitialSnapshotWithBuffer(initial, []);

  assert.deepEqual(result, initial);
});

function fakeInsertClient({ session = { user: { id: 'anon-1' } }, insertedRow, insertError = null } = {}) {
  let capturedPayload;
  let capturedSelectColumns;
  return {
    auth: {
      async getSession() {
        return { data: { session } };
      },
      async signInAnonymously() {
        return { data: { session: { user: { id: 'anon-new' } } }, error: null };
      },
    },
    from() {
      return {
        insert(payload) {
          capturedPayload = payload;
          return {
            select(columns) {
              capturedSelectColumns = columns;
              return {
                single() {
                  return Promise.resolve({
                    data: insertError ? null : { ...RAW_ROW, ...insertedRow, ...payload },
                    error: insertError,
                  });
                },
              };
            },
          };
        },
      };
    },
    getCapturedPayload: () => capturedPayload,
    getCapturedSelectColumns: () => capturedSelectColumns,
  };
}

test('insertPartyFerieRequest sends only the allowed columns, never status or event_id', async () => {
  const client = fakeInsertClient({ insertedRow: { id: 'r-new' } });
  const request = {
    nickname: 'Luigi',
    table: 7,
    dedication: 'per Mario',
    spotifyTrackId: 'sp2',
    spotifyTrackUri: 'spotify:track:sp2',
    trackName: 'Another Song',
    artistName: 'Another Artist',
    artworkUrl: 'https://example.com/art2.png',
    durationMs: 180000,
  };

  await insertPartyFerieRequest(client, request);
  const payload = client.getCapturedPayload();

  assert.deepEqual(Object.keys(payload).sort(), [
    'artist_name',
    'artwork_url',
    'dedication',
    'duration_ms',
    'nickname',
    'spotify_track_id',
    'spotify_track_uri',
    'table_number',
    'track_name',
  ]);
  assert.ok(!('status' in payload));
  assert.ok(!('event_id' in payload));
  assert.equal(payload.nickname, 'Luigi');
  assert.equal(payload.table_number, 7);
});

test('insertPartyFerieRequest re-selects exactly the public columns after insert, never submitted_by', async () => {
  const client = fakeInsertClient({ insertedRow: { id: 'r-new' } });

  await insertPartyFerieRequest(client, { nickname: 'Luigi', table: 7 });
  const selectColumns = client.getCapturedSelectColumns();
  const selectedCols = selectColumns.split(',').map((col) => col.trim());

  assert.deepEqual(selectedCols.sort(), [
    'artist_name',
    'artwork_url',
    'created_at',
    'dedication',
    'duration_ms',
    'event_id',
    'id',
    'nickname',
    'played_at',
    'queue_position',
    'spotify_track_id',
    'spotify_track_uri',
    'status',
    'table_number',
    'track_name',
    'updated_at',
  ]);
  assert.ok(!selectedCols.includes('submitted_by'));
});

test('insertPartyFerieRequest returns the normalized inserted row', async () => {
  const client = fakeInsertClient({ insertedRow: { id: 'r-new', nickname: 'Luigi' } });
  const request = { nickname: 'Luigi', table: 7 };

  const result = await insertPartyFerieRequest(client, request);

  assert.equal(result.id, 'r-new');
  assert.equal(result.nickname, 'Luigi');
});

test('insertPartyFerieRequest signs in anonymously when there is no existing session', async () => {
  const client = fakeInsertClient({ session: null, insertedRow: { id: 'r-new' } });
  let signInCalled = false;
  client.auth.signInAnonymously = async () => {
    signInCalled = true;
    return { data: { session: { user: { id: 'anon-new' } } }, error: null };
  };

  await insertPartyFerieRequest(client, { nickname: 'Luigi', table: 7 });

  assert.equal(signInCalled, true);
});

test('insertPartyFerieRequest propagates the error when the insert fails', async () => {
  const client = fakeInsertClient({ insertError: new Error('RLS denied') });

  await assert.rejects(
    () => insertPartyFerieRequest(client, { nickname: 'Luigi', table: 7 }),
    /RLS denied/
  );
});

test('subscribeToPartyFerieRequests cleanup calls removeChannel exactly once', () => {
  let removeChannelCalls = 0;
  const fakeChannel = {
    on() {
      return this;
    },
    subscribe() {
      return this;
    },
  };
  const client = {
    channel() {
      return fakeChannel;
    },
    removeChannel() {
      removeChannelCalls += 1;
    },
  };

  const cleanup = subscribeToPartyFerieRequests(client, () => {});
  cleanup();

  assert.equal(removeChannelCalls, 1);
});
