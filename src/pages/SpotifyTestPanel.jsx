import React, { useState, useEffect } from 'react';
import {
  spotifyLogin,
  getAccessToken,
  searchTrack,
  getAvailableDevices,
  addToQueue,
  playTrack,
  getCurrentPlayback
} from '../services/spotifyApi';

export default function SpotifyTestPanel() {
  const [status, setStatus] = useState('Idle');
  const [tokenStatus, setTokenStatus] = useState('Not checked');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [selectedTrack, setSelectedTrack] = useState(null);
  const [devices, setDevices] = useState([]);
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [playbackState, setPlaybackState] = useState(null);

  useEffect(() => {
    // If the URL has ?code=..., we should try to complete token exchange
    if (window.location.search.includes('code=')) {
      handleCompleteToken();
    }
  }, []);

  useEffect(() => {
    let isMounted = true;
    
    const fetchPlayback = async () => {
      try {
        const pb = await getCurrentPlayback();
        if (isMounted) {
          setPlaybackState(pb);
        }
      } catch (err) {
        // Silently ignore to avoid UI spam when no token or no playback
      }
    };

    const intervalId = setInterval(fetchPlayback, 3000);
    
    return () => {
      isMounted = false;
      clearInterval(intervalId);
    };
  }, []);

  const handleCompleteToken = async () => {
    setStatus('Exchanging token...');
    try {
      const token = await getAccessToken();
      if (token) {
        setTokenStatus('Valid Token Present');
        setStatus('Token exchanged successfully.');
      } else {
        setTokenStatus('No Token');
        setStatus('Failed to get token.');
      }
    } catch (err) {
      console.error(err);
      setStatus(`Error getting token: ${err.message}`);
    }
  };

  const handleCheckToken = async () => {
    setStatus('Checking token...');
    try {
      // getAccessToken will return existing if valid
      const token = await getAccessToken();
      if (token) {
        setTokenStatus('Valid Token Present');
        setStatus('Token is valid.');
      } else {
        setTokenStatus('No Token');
        setStatus('Token not found or invalid.');
      }
    } catch (err) {
      console.error(err);
      setStatus(`Error checking token: ${err.message}`);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery) {
      setStatus('Please enter a search query');
      return;
    }
    setStatus(`Searching for "${searchQuery}"...`);
    try {
      const results = await searchTrack(searchQuery);
      setSearchResults(results);
      setStatus(`Found ${results.length} results.`);
    } catch (err) {
      console.error(err);
      setStatus(`Search error: ${err.message}`);
    }
  };

  const handleGetDevices = async () => {
    setStatus('Fetching devices...');
    try {
      const devs = await getAvailableDevices();
      setDevices(devs);
      setStatus(`Found ${devs.length} devices.`);
      if (devs.length > 0 && !selectedDevice) {
        setSelectedDevice(devs[0].id);
      }
    } catch (err) {
      console.error(err);
      setStatus(`Device error: ${err.message}`);
    }
  };

  const handleAddToQueue = async () => {
    if (!selectedTrack) {
      setStatus('No track selected');
      return;
    }
    setStatus('Adding to queue...');
    try {
      await addToQueue(selectedTrack.uri, selectedDevice);
      setStatus('Added to queue successfully.');
    } catch (err) {
      console.error(err);
      setStatus(`Add to queue error: ${err.message}`);
    }
  };

  const handlePlayTrack = async () => {
    if (!selectedTrack) {
      setStatus('No track selected');
      return;
    }
    setStatus('Playing track...');
    try {
      await playTrack(selectedTrack.uri, selectedDevice);
      setStatus('Playback started.');
    } catch (err) {
      console.error(err);
      setStatus(`Play track error: ${err.message}`);
    }
  };

  const handleGetPlayback = async () => {
    setStatus('Fetching playback state...');
    try {
      const pb = await getCurrentPlayback();
      setPlaybackState(pb);
      setStatus(pb ? 'Playback fetched.' : 'No active playback found.');
    } catch (err) {
      console.error(err);
      setStatus(`Playback error: ${err.message}`);
    }
  };

  const handleFakeRequest = async () => {
    if (!selectedTrack) {
      setStatus('Select a track first');
      return;
    }
    setStatus('Approving and sending fake request to Spotify queue...');
    try {
      await addToQueue(selectedTrack.uri, selectedDevice);
      setStatus('Fake Walbox request approved and sent to Spotify queue.');
    } catch (err) {
      console.error(err);
      setStatus(`Fake request error: ${err.message}`);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#1a1a1a',
      color: '#fff',
      padding: '20px',
      fontFamily: 'sans-serif'
    }}>
      <div style={{ maxWidth: '800px', margin: '0 auto' }}>
        <h1 style={{ color: '#ff8c00', borderBottom: '1px solid #333', paddingBottom: '10px' }}>
          Walbox Spotify Control Mode - Test Panel
        </h1>
        
        {/* Status Bar */}
        <div style={{
          backgroundColor: '#333',
          padding: '10px',
          borderRadius: '5px',
          marginBottom: '20px',
          marginTop: '20px',
          borderLeft: '4px solid #ff8c00'
        }}>
          <strong>Status: </strong> {status} <br/>
          <strong>Token: </strong> {tokenStatus}
        </div>

        {/* Auth Section */}
        <section style={sectionStyle}>
          <h2 style={h2Style}>1. Authentication</h2>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button style={btnStyle} onClick={spotifyLogin}>Login to Spotify</button>
            <button style={btnStyle} onClick={handleCheckToken}>Complete / Check Token</button>
          </div>
        </section>

        {/* Devices Section */}
        <section style={sectionStyle}>
          <h2 style={h2Style}>2. Devices</h2>
          <button style={btnStyle} onClick={handleGetDevices}>Get Available Devices</button>
          
          {devices.length > 0 && (
            <div style={{ marginTop: '10px' }}>
              <label>Select Device: </label>
              <select 
                style={inputStyle}
                value={selectedDevice || ''} 
                onChange={(e) => setSelectedDevice(e.target.value)}
              >
                <option value="">No specific device</option>
                {devices.map(d => (
                  <option key={d.id} value={d.id}>
                    {d.name} {d.is_active ? '(Active)' : ''}
                  </option>
                ))}
              </select>
            </div>
          )}
        </section>

        {/* Search Section */}
        <section style={sectionStyle}>
          <h2 style={h2Style}>3. Search & Select Track</h2>
          <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
            <input 
              style={inputStyle}
              type="text" 
              placeholder="Search a track..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            />
            <button style={btnStyle} onClick={handleSearch}>Search</button>
          </div>

          {searchResults.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {searchResults.map(track => (
                <div 
                  key={track.id}
                  onClick={() => setSelectedTrack(track)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: '10px',
                    backgroundColor: selectedTrack?.id === track.id ? '#ff8c00' : '#222',
                    color: selectedTrack?.id === track.id ? '#000' : '#fff',
                    borderRadius: '5px',
                    cursor: 'pointer',
                    transition: 'background-color 0.2s'
                  }}
                >
                  {track.image && (
                    <img src={track.image} alt="album" style={{ width: '40px', height: '40px', marginRight: '10px', borderRadius: '4px' }} />
                  )}
                  <div>
                    <div style={{ fontWeight: 'bold' }}>{track.name}</div>
                    <div style={{ fontSize: '0.85em', opacity: 0.8 }}>{track.artists} - {track.album}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Playback Actions */}
        <section style={sectionStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', borderBottom: '1px solid #333', paddingBottom: '10px' }}>
            <h2 style={{ ...h2Style, marginBottom: 0, borderBottom: 'none', paddingBottom: 0 }}>4. Playback Actions</h2>
            <span style={{ fontSize: '12px', color: '#ff8c00', border: '1px solid #ff8c00', padding: '2px 8px', borderRadius: '12px' }}>
              Auto-refresh active (3s)
            </span>
          </div>
          <div style={{ marginBottom: '10px' }}>
            <div><strong>Selected Track:</strong> {selectedTrack ? `${selectedTrack.name} by ${selectedTrack.artists}` : 'None'}</div>
            {selectedTrack && (
              <div style={{ fontSize: '0.9em', color: '#aaa', marginTop: '4px' }}>
                <strong>Spotify URI:</strong> <code>{selectedTrack.uri}</code>
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button style={btnStyle} onClick={handleAddToQueue}>Add to Queue</button>
            <button style={btnStyle} onClick={handlePlayTrack}>Play Track</button>
            <button style={btnStyle} onClick={handleGetPlayback}>Get Current Playback</button>
          </div>

          {playbackState && (
            <div style={{ marginTop: '10px', padding: '10px', backgroundColor: '#222', borderRadius: '5px', fontSize: '0.9em' }}>
              <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordWrap: 'break-word' }}>
                {JSON.stringify({
                  is_playing: playbackState.is_playing,
                  device: playbackState.device?.name,
                  track: playbackState.item?.name,
                  artist: playbackState.item?.artists?.[0]?.name,
                  progress_ms: playbackState.progress_ms
                }, null, 2)}
              </pre>
            </div>
          )}
        </section>

        {/* Fake Walbox Queue Request */}
        <section style={sectionStyle}>
          <h2 style={h2Style}>5. Fake Walbox Queue Request</h2>
          <div style={{
            backgroundColor: '#222',
            padding: '15px',
            borderRadius: '6px',
            marginBottom: '15px',
            fontSize: '0.95em',
            lineHeight: '1.5em',
            borderLeft: '4px solid #ff8c00'
          }}>
            <p style={{ margin: '0 0 10px 0', color: '#ff8c00', fontWeight: 'bold' }}>
              [SIMULAZIONE TECNICA] Questa sezione simula una richiesta cliente inviata a Walbox e approvata per la riproduzione locale.
            </p>
            <div><strong>Tavolo:</strong> 7</div>
            <div><strong>Nickname:</strong> OSCAR</div>
            <div><strong>Traccia Richiesta:</strong> Adam Beyer - Teach Me</div>
            <div><strong>Mood:</strong> Sta salendo male</div>
            <div><strong>Dedica:</strong> Questa va al tavolo dei trichechi</div>
            <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid #333' }}>
              <strong>Traccia Spotify Selezionata (da inviare):</strong>{' '}
              {selectedTrack ? (
                <span style={{ color: '#ff8c00', fontWeight: 'bold' }}>{selectedTrack.name} - {selectedTrack.artists}</span>
              ) : (
                <span style={{ color: '#d9534f' }}>Nessuna traccia selezionata (usa la sezione 3)</span>
              )}
            </div>
          </div>
          
          <button 
            style={{ ...btnStyle, width: '100%' }} 
            onClick={handleFakeRequest}
          >
            Approve Fake Request & Send To Spotify Queue
          </button>
        </section>
      </div>
    </div>
  );
}

// Inline styles for simplicity in this technical panel
const sectionStyle = {
  backgroundColor: '#111',
  padding: '20px',
  borderRadius: '8px',
  marginBottom: '20px',
  border: '1px solid #333'
};

const h2Style = {
  marginTop: 0,
  color: '#aaa',
  fontSize: '1.2rem',
  borderBottom: '1px solid #333',
  paddingBottom: '10px',
  marginBottom: '15px'
};

const btnStyle = {
  padding: '10px 15px',
  backgroundColor: '#ff8c00',
  color: '#000',
  border: 'none',
  borderRadius: '4px',
  cursor: 'pointer',
  fontWeight: 'bold',
  fontSize: '14px'
};

const inputStyle = {
  padding: '10px',
  borderRadius: '4px',
  border: '1px solid #444',
  backgroundColor: '#222',
  color: '#fff',
  flex: 1
};
