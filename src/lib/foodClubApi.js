// WALRUS FOOD CLUB V1 — chiamate al server (solo RPC SECURITY DEFINER; mai scritture dirette sulle tabelle).
import { supabase } from './supabaseClient';
import { FOOD_CLUB_TERMS_VERSION, FOOD_CLUB_PUSH_TEXT_VERSION } from './foodClubConfig';

const VENUE = 'walrus-main';

async function rpc(name, args) {
  const { data, error } = await supabase.rpc(name, args);
  if (error) {
    const err = new Error(error.message || name);
    err.code = error.code;
    err.details = error.details;
    throw err;
  }
  return data;
}

export async function ensureCustomerSession() {
  let { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    const { data, error } = await supabase.auth.signInAnonymously();
    if (error) throw error;
    session = data.session;
  }
  return session;
}

export const foodClubApi = {
  publicCampaign: () => rpc('food_club_public_campaign', { p_venue_id: VENUE }),
  myState: () => rpc('food_club_my_state'),
  orderStatus: (orderId) => rpc('food_club_order_status', { p_order_id: orderId }),
  join: ({ marketing = false, displayName = null, referralCode = null }) => rpc('food_club_join', {
    p_terms_version: FOOD_CLUB_TERMS_VERSION, p_service_consent: true, p_marketing_consent: !!marketing,
    p_display_name: displayName || null, p_referral_code: referralCode || null,
  }),
  setPreferences: ({ notifClub = null, notifPromo = null, marketing = null }) => rpc('food_club_set_preferences', {
    p_text_version: FOOD_CLUB_TERMS_VERSION, p_notif_club: notifClub, p_notif_promo: notifPromo, p_marketing: marketing,
  }),
  leave: () => rpc('food_club_leave', { p_text_version: FOOD_CLUB_TERMS_VERSION }),
  messages: (limit = 30) => rpc('food_club_my_messages', { p_limit: limit }),
  markMessage: (id, action) => rpc('food_club_message_mark', { p_message_id: id, p_action: action }),
  createMergeTicket: (phone) => rpc('food_club_create_merge_ticket', { p_phone: phone }),
  redeemMergeTicket: (token) => rpc('food_club_redeem_merge_ticket', { p_token: token }),
  pushSubscribe: (row, scope) => rpc('food_club_push_subscribe', {
    p_venue_id: VENUE, p_endpoint: row.endpoint, p_p256dh: row.p256dh, p_auth_key: row.auth_key,
    p_user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
    p_scope: scope ?? null, p_text_version: FOOD_CLUB_PUSH_TEXT_VERSION,
  }),
  // Misura: mai bloccante, errori ignorati. Senza sessione il server scarterebbe comunque l'evento
  // (auth.uid() NULL) e il ruolo anon non ha EXECUTE: niente chiamata, niente 401 in console.
  track: (event, context = null, platform = null) =>
    supabase.auth.getSession()
      .then(({ data }) => (data?.session
        ? supabase.rpc('food_club_track', { p_event: event, p_context: context, p_platform: platform })
        : null))
      .then(() => {}, () => {}),
};

// Staff (permessi verificati dal server con is_staff_for_venue / manager).
export const foodClubStaffApi = {
  overview: (from = null, to = null) => rpc('food_club_staff_overview', { p_venue_id: VENUE, p_from: from, p_to: to }),
  members: (search = null) => rpc('food_club_staff_members', { p_venue_id: VENUE, p_search: search, p_limit: 200 }),
  vouchers: (status = null) => rpc('food_club_staff_vouchers', { p_venue_id: VENUE, p_status: status, p_limit: 300 }),
  referrals: () => rpc('food_club_staff_referrals', { p_venue_id: VENUE, p_limit: 300 }),
  campaigns: () => rpc('food_club_staff_campaigns', { p_venue_id: VENUE }),
  setCampaignActive: (id, active) => rpc('food_club_admin_set_campaign_active', { p_campaign_id: id, p_active: active }),
  orderBadges: (orderIds) => rpc('food_club_staff_order_badges', { p_venue_id: VENUE, p_order_ids: orderIds }),
  unpaidOrders: () => rpc('food_club_staff_unpaid_orders', { p_venue_id: VENUE }),
  heldVouchers: () => rpc('food_club_staff_held_vouchers', { p_venue_id: VENUE }),
  resolveHeldVoucher: (id, note) => rpc('food_club_manager_resolve_held_voucher', { p_voucher_id: id, p_note: note }),
};
