import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { ensureSession } from './useSongRequests';

export async function setQueuePaused(paused) {
  await ensureSession();
  const { error } = await supabase
    .from('venue_settings')
    .update({ queue_paused: paused, updated_at: new Date().toISOString() })
    .eq('id', 'main');
  if (error) throw error;
}

export function useVenueSettings() {
  const [settings, setSettings] = useState({ queuePaused: false });

  useEffect(() => {
    let channel;
    let cancelled = false;

    async function init() {
      try {
        await ensureSession();
      } catch (err) {
        console.error('[useVenueSettings] ensureSession failed:', err);
        return;
      }

      if (cancelled) return;

      const { data, error } = await supabase
        .from('venue_settings')
        .select('*')
        .eq('id', 'main')
        .single();

      if (error) {
        console.error('[useVenueSettings] SELECT failed:', error);
      } else if (data && !cancelled) {
        setSettings({ queuePaused: data.queue_paused });
      }

      if (cancelled) return;

      channel = supabase
        .channel('realtime:venue_settings')
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'venue_settings' },
          (payload) => setSettings({ queuePaused: payload.new.queue_paused })
        )
        .subscribe((status, err) => {
          if (err) console.error('[useVenueSettings] realtime subscribe error:', err);
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
