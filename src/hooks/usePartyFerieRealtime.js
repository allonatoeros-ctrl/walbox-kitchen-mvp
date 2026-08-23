import { useState, useEffect } from 'react';

const TABLE = 'party_ferie_requests';
const CHANNEL_NAME = 'realtime:party_ferie_requests';
const SELECT_COLUMNS =
  'id, event_id, nickname, table_number, dedication, spotify_track_id, ' +
  'spotify_track_uri, track_name, artist_name, artwork_url, duration_ms, ' +
  'status, queue_position, created_at, updated_at, played_at';

const PUBLIC_COLUMNS = SELECT_COLUMNS.split(',').map((col) => col.trim());

export function pickPublicColumns(row) {
  const picked = {};
  for (const col of PUBLIC_COLUMNS) {
    picked[col] = row[col];
  }
  return picked;
}

export function normalizeRow(row) {
  return {
    id: row.id,
    eventId: row.event_id,
    nickname: row.nickname,
    table: row.table_number,
    dedication: row.dedication,
    spotifyTrackId: row.spotify_track_id,
    spotifyTrackUri: row.spotify_track_uri,
    trackName: row.track_name,
    artistName: row.artist_name,
    artworkUrl: row.artwork_url,
    durationMs: row.duration_ms,
    status: row.status,
    queuePosition: Number(row.queue_position),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    playedAt: row.played_at,
  };
}

export async function fetchInitialPartyFerieRequests(client) {
  const { data, error } = await client
    .from(TABLE)
    .select(SELECT_COLUMNS)
    .order('queue_position', { ascending: true });

  if (error) throw error;
  return (data || []).map(normalizeRow);
}

function byQueuePosition(a, b) {
  return a.queuePosition - b.queuePosition;
}

export function applyRealtimeEvent(currentList, payload) {
  const { eventType, new: newRow, old: oldRow } = payload;

  if (eventType === 'INSERT') {
    const normalized = normalizeRow(newRow);
    const exists = currentList.some((row) => row.id === normalized.id);
    const nextList = exists
      ? currentList.map((row) => (row.id === normalized.id ? normalized : row))
      : [...currentList, normalized];
    return nextList.sort(byQueuePosition);
  }
  if (eventType === 'UPDATE') {
    return currentList
      .map((row) => (row.id === newRow.id ? normalizeRow(newRow) : row))
      .sort(byQueuePosition);
  }
  if (eventType === 'DELETE') {
    return currentList.filter((row) => row.id !== oldRow.id);
  }
  return currentList;
}

export function mergeInitialSnapshotWithBuffer(initialList, bufferedEvents) {
  return bufferedEvents.reduce(
    (list, payload) => applyRealtimeEvent(list, payload),
    initialList
  );
}

export function subscribeToPartyFerieRequests(client, onEvent) {
  const channel = client
    .channel(CHANNEL_NAME)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: TABLE },
      (payload) => {
        onEvent({
          ...payload,
          new: payload.new ? pickPublicColumns(payload.new) : payload.new,
          old: payload.old ? pickPublicColumns(payload.old) : payload.old,
        });
      }
    )
    .subscribe((status, err) => {
      if (err) console.error('[usePartyFerieRealtime] realtime subscribe error:', err);
    });

  return () => client.removeChannel(channel);
}

async function ensureSession(client) {
  let { data: { session } } = await client.auth.getSession();
  if (!session) {
    const { data, error } = await client.auth.signInAnonymously();
    if (error) throw error;
    session = data.session;
  }
  if (!session) throw new Error('No session after signInAnonymously');
  return session;
}

export async function insertPartyFerieRequest(client, request) {
  await ensureSession(client);

  const payload = {
    nickname: request.nickname,
    table_number: request.table,
    dedication: request.dedication,
    spotify_track_id: request.spotifyTrackId,
    spotify_track_uri: request.spotifyTrackUri,
    track_name: request.trackName,
    artist_name: request.artistName,
    artwork_url: request.artworkUrl,
    duration_ms: request.durationMs,
  };

  const { data, error } = await client.from(TABLE).insert(payload).select(SELECT_COLUMNS).single();
  if (error) throw error;
  return normalizeRow(data);
}

export function useRealtimePartyFerieRequests() {
  const [requests, setRequests] = useState([]);

  useEffect(() => {
    let cancelled = false;
    let cleanupChannel;
    let buffering = true;
    const buffer = [];

    async function init() {
      const { supabase } = await import('../lib/supabaseClient');

      try {
        await ensureSession(supabase);
      } catch (err) {
        console.error('[usePartyFerieRealtime] ensureSession failed:', err);
        return;
      }

      if (cancelled) return;

      cleanupChannel = subscribeToPartyFerieRequests(supabase, (payload) => {
        if (buffering) {
          buffer.push(payload);
          return;
        }
        setRequests((prev) => applyRealtimeEvent(prev, payload));
      });

      if (cancelled) return;

      try {
        const initial = await fetchInitialPartyFerieRequests(supabase);
        if (!cancelled) {
          setRequests(mergeInitialSnapshotWithBuffer(initial, buffer));
        }
      } catch (err) {
        console.error('[usePartyFerieRealtime] initial fetch failed:', err);
      } finally {
        buffering = false;
        buffer.length = 0;
      }
    }

    init();

    return () => {
      cancelled = true;
      if (cleanupChannel) cleanupChannel();
    };
  }, []);

  return requests;
}
