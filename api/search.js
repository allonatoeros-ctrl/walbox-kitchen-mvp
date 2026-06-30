export default async function handler(req, res) {
  const { q } = req.query;

  if (!q) {
    return res.status(200).json([]);
  }

  // Supportiamo sia la nuova variabile che l'attuale VITE_SPOTIFY_CLIENT_ID come fallback per il Client ID
  const clientId = process.env.SPOTIFY_CLIENT_ID || process.env.VITE_SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.error('Missing SPOTIFY_CLIENT_ID or SPOTIFY_CLIENT_SECRET environment variables.');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  try {
    // 1. Ottenere l'Access Token tramite Client Credentials Flow
    const authString = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const tokenResponse = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${authString}`
      },
      body: new URLSearchParams({
        grant_type: 'client_credentials'
      })
    });

    if (!tokenResponse.ok) {
      const err = await tokenResponse.text();
      console.error('Spotify token error:', err);
      return res.status(tokenResponse.status).json({ error: 'Failed to get Spotify token' });
    }

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;

    // 2. Chiamare la Search API di Spotify limitata a market=IT e limit=10
    const searchResponse = await fetch(`https://api.spotify.com/v1/search?type=track&limit=10&market=IT&q=${encodeURIComponent(q)}`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });

    if (!searchResponse.ok) {
      const err = await searchResponse.text();
      console.error('Spotify search error:', err);
      return res.status(searchResponse.status).json({ error: 'Failed to search Spotify' });
    }

    const searchData = await searchResponse.json();

    // 3. Restituire l'array nel formato esatto atteso da searchTrack e CustomerJukeboxOldOrange.jsx
    const tracks = searchData.tracks?.items.map(track => ({
      id: track.id,
      name: track.name,
      artists: track.artists.map(a => a.name).join(', '),
      album: track.album.name,
      image: track.album.images?.[0]?.url || null,
      uri: track.uri,
      durationMs: track.duration_ms,
      externalUrl: track.external_urls?.spotify
    })) || [];

    return res.status(200).json(tracks);
  } catch (error) {
    console.error('Server error during Spotify search:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
