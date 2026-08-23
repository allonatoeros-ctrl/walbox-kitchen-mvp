import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';

export async function ensureSession() {
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
    id:          row.id,
    table:       row.table_number,
    nickname:    row.nickname,
    dedication:  row.dedication,
    status:      row.status,
    shownAt:     row.shown_at,
    timestamp:   row.created_at,
  };
}

export async function insertSubmission(table, nickname, dedication) {
  await ensureSession();
  const { error } = await supabase.from('live_submissions').insert({
    table_number: table ?? null,
    nickname,
    dedication,
  });
  if (error) throw error;
}

export async function updateSubmissionStatus(id, status) {
  const { error } = await supabase
    .from('live_submissions')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

export async function markSubmissionShown(id) {
  const { error } = await supabase
    .from('live_submissions')
    .update({ status: 'shown', shown_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

export function useRealtimeLiveSubmissions() {
  const [submissions, setSubmissions] = useState([]);

  useEffect(() => {
    let channel;
    let cancelled = false;

    async function init() {
      try {
        await ensureSession();
      } catch (err) {
        console.error('[useLiveSubmissions] ensureSession failed:', err);
        return;
      }

      if (cancelled) return;

      const { data, error } = await supabase
        .from('live_submissions')
        .select('*')
        .order('created_at', { ascending: true });

      if (error) {
        console.error('[useLiveSubmissions] SELECT failed:', error);
      } else if (data && !cancelled) {
        setSubmissions(data.map(normalizeRow));
      }

      if (cancelled) return;

      channel = supabase
        .channel('realtime:live_submissions')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'live_submissions' },
          (payload) => {
            const { eventType, new: newRow, old: oldRow } = payload;
            if (eventType === 'INSERT') {
              setSubmissions((prev) => [...prev, normalizeRow(newRow)]);
            } else if (eventType === 'UPDATE') {
              setSubmissions((prev) =>
                prev.map((s) => (s.id === newRow.id ? normalizeRow(newRow) : s))
              );
            } else if (eventType === 'DELETE') {
              setSubmissions((prev) => prev.filter((s) => s.id !== oldRow.id));
            }
          }
        )
        .subscribe((status, err) => {
          if (err) console.error('[useLiveSubmissions] realtime subscribe error:', err);
        });
    }

    init();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  return submissions;
}
