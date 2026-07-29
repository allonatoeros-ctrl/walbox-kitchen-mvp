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
    mode:               row.mode,
    currentSubmissionId: row.current_submission_id,
  };
}

export async function setLiveMode(mode) {
  await ensureSession();
  const { error } = await supabase
    .from('live_settings')
    .update({ mode, updated_at: new Date().toISOString() })
    .eq('id', 'main');
  if (error) throw error;
}

export async function setCurrentSubmission(submissionId) {
  await ensureSession();
  const { error } = await supabase
    .from('live_settings')
    .update({ current_submission_id: submissionId, updated_at: new Date().toISOString() })
    .eq('id', 'main');
  if (error) throw error;
}

// CAS: riporta mode a 'webcam' SOLO se la riga è ancora nello stato che il
// timer di takeover si aspettava (mode='takeover' e stessa submission). Se
// nel frattempo lo staff ha avviato un nuovo takeover (mode cambiato o
// current_submission_id diverso), la RPC non tocca righe e ritorna false:
// non è un errore, è il caso atteso di "il mio timer è scaduto ma non sono
// più autorevole". Passa dalla RPC public.reset_takeover_to_webcam
// (SECURITY DEFINER, vedi ai-ops/supabase/2026-07-17_live_night_v0_reset_takeover_rpc_migration.sql)
// invece di un UPDATE diretto: la sessione del TV è anonima
// (signInAnonymously) e la policy live_settings_staff_update richiede
// is_anonymous=false, quindi un UPDATE diretto verrebbe sempre filtrato
// dalla RLS. La RPC è l'unico varco di scrittura pubblica su
// live_settings.mode, con lo stesso check CAS applicato server-side.
export async function resetTakeoverToWebcam(expectedSubmissionId) {
  await ensureSession();
  const { data, error } = await supabase.rpc('reset_takeover_to_webcam', {
    expected_submission_id: expectedSubmissionId,
  });
  if (error) throw error;
  return data === true;
}

export function useLiveSettings() {
  const [settings, setSettings] = useState({ mode: 'webcam', currentSubmissionId: null });

  useEffect(() => {
    let channel;
    let cancelled = false;

    async function init() {
      try {
        await ensureSession();
      } catch (err) {
        console.error('[useLiveSettings] ensureSession failed:', err);
        return;
      }

      if (cancelled) return;

      const { data, error } = await supabase
        .from('live_settings')
        .select('*')
        .eq('id', 'main')
        .single();

      if (error) {
        console.error('[useLiveSettings] SELECT failed:', error);
      } else if (data && !cancelled) {
        setSettings(normalizeRow(data));
      }

      if (cancelled) return;

      channel = supabase
        .channel('realtime:live_settings')
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'live_settings' },
          (payload) => setSettings(normalizeRow(payload.new))
        )
        .subscribe((status, err) => {
          if (err) console.error('[useLiveSettings] realtime subscribe error:', err);
        });
    }

    init();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  return settings;
}
