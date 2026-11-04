// WALRUS FOOD CLUB V1 — interruttore lato client.
// Il Club compare SOLO se: (1) la build ha VITE_FOOD_CLUB_ENABLED=true (variabile Vercel = gate di Eros) e
// (2) il server risponde con una campagna attiva (food_club_public_campaign). Se le migration non sono ancora
// applicate, le RPC falliscono e il Club resta invisibile: nessuna regressione del checkout Walbox.
export const FOOD_CLUB_ENABLED = import.meta.env?.VITE_FOOD_CLUB_ENABLED === 'true';

// Versione dei testi di consenso mostrati al cliente (salvata con ogni consenso). Da aggiornare a ogni cambio
// dei testi validati dal legale (D-11 aperta: testi attuali = bozza).
export const FOOD_CLUB_TERMS_VERSION = 'club-v1-bozza-2026-11';
export const FOOD_CLUB_PUSH_TEXT_VERSION = 'push-club-v1-bozza-2026-11';

export const FOOD_CLUB_BASE_PATH = '/kitchen/club';
