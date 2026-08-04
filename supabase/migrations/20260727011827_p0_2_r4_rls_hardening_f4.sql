DROP POLICY IF EXISTS song_requests_allow_authenticated_update ON song_requests;
CREATE POLICY song_requests_staff_update ON song_requests FOR UPDATE TO authenticated
  USING ( is_staff_for_venue('walrus-main') ) WITH CHECK ( is_staff_for_venue('walrus-main') );

DROP POLICY IF EXISTS venue_settings_allow_authenticated_update ON venue_settings;
CREATE POLICY venue_settings_staff_update ON venue_settings FOR UPDATE TO authenticated
  USING ( id='main' AND is_staff_for_venue('walrus-main') )
  WITH CHECK ( id='main' AND is_staff_for_venue('walrus-main') );

DROP POLICY IF EXISTS "playback_state upsert" ON playback_state;
DROP POLICY IF EXISTS "playback_state update" ON playback_state;
CREATE POLICY playback_state_staff_write ON playback_state FOR INSERT TO authenticated
  WITH CHECK ( is_staff_for_venue('walrus-main') );
CREATE POLICY playback_state_staff_update ON playback_state FOR UPDATE TO authenticated
  USING ( is_staff_for_venue('walrus-main') ) WITH CHECK ( is_staff_for_venue('walrus-main') );
;
