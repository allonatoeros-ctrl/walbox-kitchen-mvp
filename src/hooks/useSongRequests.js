import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';

async function ensureSession() {
  let { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    const { data, error } = await supabase.auth.signInAnonymously();
    if (error) throw error;
    session = data.session;
  }
  if (!session) throw new Error('No session after signInAnonymously');
  return session;
}

function normalizeRow(row) {
  return {
    id:         row.id,
    table:      row.table_number,
    nickname:   row.nickname,
    song:       row.song,
    mood:       row.mood,
    dedication: row.dedication,
    reaction:   row.reaction,
    status:     row.status,
    timestamp:  row.created_at,
  };
}

export async function insertRequest(table, nickname, song, mood, dedication) {
  await ensureSession();
  const { error } = await supabase.from('song_requests').insert({
    table_number: table,
    nickname,
    song,
    mood,
    reaction:    null,
    dedication:  dedication ?? null,
    status:      'pending',
  });
  if (error) throw error;
}

export async function updateStatus(id, status) {
  const { error } = await supabase
    .from('song_requests')
    .update({ status })
    .eq('id', id);
  if (error) throw error;
}

export async function setPlaying(id) {
  await supabase.from('song_requests').update({ status: 'played' }).eq('status', 'playing');
  const { error } = await supabase.from('song_requests').update({ status: 'playing' }).eq('id', id);
  if (error) throw error;
}

export async function closeAllActiveRequests() {
  const { error } = await supabase
    .from('song_requests')
    .update({ status: 'closed' })
    .in('status', ['pending', 'approved', 'playing']);
  if (error) throw error;
}

export function useRealtimeRequests() {
  const [requests, setRequests] = useState([]);

  useEffect(() => {
    let channel;
    let cancelled = false;

    async function init() {
      try {
        await ensureSession();
      } catch (err) {
        console.error('[useSongRequests] ensureSession failed:', err);
        return;
      }

      if (cancelled) return;

      const { data, error } = await supabase
        .from('song_requests')
        .select('*')
        .order('created_at', { ascending: true });

      if (error) {
        console.error('[useSongRequests] SELECT failed:', error);
      } else if (data && !cancelled) {
        setRequests(data.map(normalizeRow));
      }

      if (cancelled) return;

      channel = supabase
        .channel('realtime:song_requests')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'song_requests' },
          (payload) => {
            const { eventType, new: newRow, old: oldRow } = payload;
            if (eventType === 'INSERT') {
              setRequests((prev) => [...prev, normalizeRow(newRow)]);
            } else if (eventType === 'UPDATE') {
              setRequests((prev) =>
                prev.map((r) => (r.id === newRow.id ? normalizeRow(newRow) : r))
              );
            } else if (eventType === 'DELETE') {
              setRequests((prev) => prev.filter((r) => r.id !== oldRow.id));
            }
          }
        )
        .subscribe((status, err) => {
          if (err) console.error('[useSongRequests] realtime subscribe error:', err);
        });
    }

    init();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  return requests;
}
