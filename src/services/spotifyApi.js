// src/services/spotifyApi.js

/**
 * Walbox Spotify Control Mode
 * Isolated scaffold for controlling a local Spotify instance using
 * Authorization Code with PKCE flow.
 */

const CLIENT_ID = import.meta.env.VITE_SPOTIFY_CLIENT_ID;
const REDIRECT_URI = import.meta.env.VITE_SPOTIFY_REDIRECT_URI;
const SCOPES = 'user-read-playback-state user-modify-playback-state user-read-currently-playing';

// --- PKCE Helpers ---

function generateRandomString(length) {
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const values = crypto.getRandomValues(new Uint8Array(length));
  return values.reduce((acc, x) => acc + possible[x % possible.length], "");
}

async function sha256(plain) {
  const encoder = new TextEncoder();
  const data = encoder.encode(plain);
  return window.crypto.subtle.digest('SHA-256', data);
}

function base64encode(input) {
  return btoa(String.fromCharCode(...new Uint8Array(input)))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

export async function generateCodeVerifier() {
  return generateRandomString(64);
}

export async function generateCodeChallenge(codeVerifier) {
  const hashed = await sha256(codeVerifier);
  return base64encode(hashed);
}

// --- Storage Helpers ---

export function getStoredToken() {
  const token = localStorage.getItem('spotify_access_token');
  const expiresAt = localStorage.getItem('spotify_expires_at');

  if (!token || !expiresAt) return null;

  if (Date.now() > parseInt(expiresAt, 10)) {
    clearToken();
    return null; // Token expired
  }

  return token;
}

export function saveToken(data) {
  localStorage.setItem('spotify_access_token', data.access_token);
  if (data.refresh_token) {
    localStorage.setItem('spotify_refresh_token', data.refresh_token);
  }
  const expiresAt = Date.now() + data.expires_in * 1000;
  localStorage.setItem('spotify_expires_at', expiresAt.toString());
}

export function clearToken() {
  localStorage.removeItem('spotify_access_token');
  localStorage.removeItem('spotify_refresh_token');
  localStorage.removeItem('spotify_expires_at');
  localStorage.removeItem('spotify_code_verifier');
}

// Patch A: refresh using stored refresh_token
export async function refreshAccessToken() {
  const refreshToken = localStorage.getItem('spotify_refresh_token');
  if (!refreshToken) throw new Error('No refresh token available');

  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: CLIENT_ID,
    }),
  });

  const data = await response.json();

  if (data.error) {
    clearToken();
    throw new Error(`Token refresh failed: ${data.error_description || data.error}`);
  }

  saveToken(data);
  return data.access_token;
}

// --- API Helpers ---

async function spotifyFetch(url, options = {}) {
  const token = getStoredToken();
  if (!token) throw new Error('No valid Spotify token available');

  const headers = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  const response = await fetch(url, { ...options, headers });

  if (response.status === 204) return null;

  // Patch B: on 401, attempt one token refresh and retry
  if (response.status === 401) {
    let newToken;
    try {
      newToken = await refreshAccessToken();
    } catch (refreshErr) {
      clearToken();
      throw new Error(`Spotify session expired and refresh failed: ${refreshErr.message}`);
    }

    const retryHeaders = {
      'Authorization': `Bearer ${newToken}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    };
    const retryResponse = await fetch(url, { ...options, headers: retryHeaders });

    if (retryResponse.status === 204) return null;

    if (!retryResponse.ok) {
      clearToken();
      throw new Error(`Spotify API error after refresh: ${retryResponse.status}`);
    }

    const retryText = await retryResponse.text();
    if (!retryText || retryText.trim() === '') return null;
    try { return JSON.parse(retryText); } catch (e) { return retryText; }
  }

  const text = await response.text();

  if (!response.ok) {
    let errorMsg = '';
    if (text) {
      try {
        const errorObj = JSON.parse(text);
        errorMsg = errorObj.error?.message || text;
      } catch (e) {
        errorMsg = text;
      }
    }
    if (!errorMsg) {
      errorMsg = `Status ${response.status}`;
    }
    throw new Error(`Spotify API error: ${response.status} ${errorMsg}`);
  }

  if (!text || text.trim() === '') return null;

  try {
    return JSON.parse(text);
  } catch (e) {
    return text;
  }
}

// --- Main Auth Flow ---

export async function spotifyLogin() {
  if (!CLIENT_ID || !REDIRECT_URI) {
    console.error('Missing VITE_SPOTIFY_CLIENT_ID or VITE_SPOTIFY_REDIRECT_URI');
    return;
  }

  const codeVerifier = await generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(codeVerifier);

  localStorage.setItem('spotify_code_verifier', codeVerifier);

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: 'code',
    redirect_uri: REDIRECT_URI,
    scope: SCOPES,
    code_challenge_method: 'S256',
    code_challenge: codeChallenge,
  });

  window.location.href = `https://accounts.spotify.com/authorize?${params.toString()}`;
}

export async function getAccessToken() {
  const existingToken = getStoredToken();
  if (existingToken) return existingToken;

  const urlParams = new URLSearchParams(window.location.search);
  const code = urlParams.get('code');

  if (!code) return null;

  const codeVerifier = localStorage.getItem('spotify_code_verifier');
  if (!codeVerifier) {
    throw new Error('Code verifier not found in localStorage. Try logging in again.');
  }

  try {
    const payload = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        grant_type: 'authorization_code',
        code,
        redirect_uri: REDIRECT_URI,
        code_verifier: codeVerifier,
      }),
    };

    const response = await fetch('https://accounts.spotify.com/api/token', payload);
    const data = await response.json();

    if (data.error) {
      throw new Error(`Token exchange failed: ${data.error_description || data.error}`);
    }

    saveToken(data);

    // Clean up URL
    window.history.replaceState({}, document.title, window.location.pathname);

    return data.access_token;
  } catch (err) {
    console.error('Error exchanging code for token:', err);
    throw err;
  }
}

// --- Spotify Actions ---

export async function searchTrack(query) {
  if (!query) return [];

  try {
    const encodedQuery = encodeURIComponent(query);
    const response = await fetch(`/api/search?q=${encodedQuery}`);

    if (!response.ok) {
      console.error(`Search API error: ${response.status}`);
      return [];
    }

    return await response.json();
  } catch (error) {
    console.error('Error searching track:', error);
    return [];
  }
}

export async function getAvailableDevices() {
  const data = await spotifyFetch('https://api.spotify.com/v1/me/player/devices');
  return data.devices || [];
}

export async function addToQueue(trackUri, deviceId = null) {
  let url = `https://api.spotify.com/v1/me/player/queue?uri=${encodeURIComponent(trackUri)}`;
  if (deviceId) {
    url += `&device_id=${encodeURIComponent(deviceId)}`;
  }
  return spotifyFetch(url, { method: 'POST' });
}

export async function playTrack(trackUri, deviceId = null) {
  let url = 'https://api.spotify.com/v1/me/player/play';
  if (deviceId) {
    url += `?device_id=${encodeURIComponent(deviceId)}`;
  }

  const payload = {
    method: 'PUT',
    body: JSON.stringify({ uris: [trackUri] })
  };

  return spotifyFetch(url, payload);
}

export async function getCurrentPlayback() {
  return spotifyFetch('https://api.spotify.com/v1/me/player');
}

export async function pauseTrack(deviceId = null) {
  let url = 'https://api.spotify.com/v1/me/player/pause';
  if (deviceId) {
    url += `?device_id=${encodeURIComponent(deviceId)}`;
  }
  return spotifyFetch(url, { method: 'PUT' });
}

export async function resumeTrack(deviceId = null) {
  let url = 'https://api.spotify.com/v1/me/player/play';
  if (deviceId) {
    url += `?device_id=${encodeURIComponent(deviceId)}`;
  }
  return spotifyFetch(url, { method: 'PUT' });
}

export async function skipToNext(deviceId = null) {
  let url = 'https://api.spotify.com/v1/me/player/next';
  if (deviceId) {
    url += `?device_id=${encodeURIComponent(deviceId)}`;
  }
  return spotifyFetch(url, { method: 'POST' });
}
