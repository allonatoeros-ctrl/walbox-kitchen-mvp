// Mock catalog of high-fidelity songs
export const MOCK_SONGS = [
  {
    id: "song_1",
    title: "Blinding Lights",
    artist: "The Weeknd",
    duration: 200,
    mood: "party",
    cover: "https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?w=300&auto=format&fit=crop&q=80"
  },
  {
    id: "song_2",
    title: "Stairway to Heaven",
    artist: "Led Zeppelin",
    duration: 482,
    mood: "retro",
    cover: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300&auto=format&fit=crop&q=80"
  },
  {
    id: "song_3",
    title: "Weightless",
    artist: "Marconi Union",
    duration: 360,
    mood: "chill",
    cover: "https://images.unsplash.com/photo-1518609878373-06d740f60d8b?w=300&auto=format&fit=crop&q=80"
  },
  {
    id: "song_4",
    title: "Careless Whisper",
    artist: "George Michael",
    duration: 300,
    mood: "romantic",
    cover: "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=300&auto=format&fit=crop&q=80"
  },
  {
    id: "song_5",
    title: "Levitating",
    artist: "Dua Lipa",
    duration: 203,
    mood: "party",
    cover: "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=300&auto=format&fit=crop&q=80"
  },
  {
    id: "song_6",
    title: "Bohemian Rhapsody",
    artist: "Queen",
    duration: 354,
    mood: "retro",
    cover: "https://images.unsplash.com/photo-1506157786151-b8491531f063?w=300&auto=format&fit=crop&q=80"
  },
  {
    id: "song_7",
    title: "Sunrise",
    artist: "Norah Jones",
    duration: 200,
    mood: "chill",
    cover: "https://images.unsplash.com/photo-1459749411175-04bf5292ceea?w=300&auto=format&fit=crop&q=80"
  },
  {
    id: "song_8",
    title: "Perfect",
    artist: "Ed Sheeran",
    duration: 263,
    mood: "romantic",
    cover: "https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=300&auto=format&fit=crop&q=80"
  },
  {
    id: "song_9",
    title: "Don't Start Now",
    artist: "Dua Lipa",
    duration: 183,
    mood: "party",
    cover: "https://images.unsplash.com/photo-1487180142328-054b783fc471?w=300&auto=format&fit=crop&q=80"
  },
  {
    id: "song_10",
    title: "Midnight City",
    artist: "M83",
    duration: 243,
    mood: "energetic",
    cover: "https://images.unsplash.com/photo-1511192336575-5a79af67a629?w=300&auto=format&fit=crop&q=80"
  },
  {
    id: "song_11",
    title: "Intro",
    artist: "The xx",
    duration: 128,
    mood: "chill",
    cover: "https://images.unsplash.com/photo-1501386761578-eac5c94b800a?w=300&auto=format&fit=crop&q=80"
  },
  {
    id: "song_12",
    title: "Electric Feel",
    artist: "MGMT",
    duration: 229,
    mood: "energetic",
    cover: "https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=300&auto=format&fit=crop&q=80"
  },
  {
    id: "song_13",
    title: "Stay With Me",
    artist: "Sam Smith",
    duration: 172,
    mood: "romantic",
    cover: "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=300&auto=format&fit=crop&q=80"
  },
  {
    id: "song_14",
    title: "Pump Up the Jam",
    artist: "Technotronic",
    duration: 215,
    mood: "party",
    cover: "https://images.unsplash.com/photo-1516873240891-4bf014598ab4?w=300&auto=format&fit=crop&q=80"
  },
  {
    id: "song_15",
    title: "Harder, Better, Faster, Stronger",
    artist: "Daft Punk",
    duration: 224,
    mood: "energetic",
    cover: "https://images.unsplash.com/photo-1524368535928-5b5e00ddc76b?w=300&auto=format&fit=crop&q=80"
  }
];

// Emojis mapping for moods
export const MOOD_EMOJIS = {
  energetic: "⚡",
  chill: "🌊",
  romantic: "💖",
  retro: "🎸",
  party: "🎉"
};

// Initial Demo State
const INITIAL_REQUESTS = [
  {
    id: "req_demo_1",
    song: MOCK_SONGS[0], // Blinding Lights
    table: "4",
    mood: "party",
    dedication: "Per festeggiare il compleanno di Giulia! 🎉 Offrite da bere!",
    status: "playing",
    timestamp: new Date(Date.now() - 300000).toISOString()
  },
  {
    id: "req_demo_2",
    song: MOCK_SONGS[10], // Intro
    table: "12",
    mood: "chill",
    dedication: "Sottofondo chill per le nostre chiacchiere.",
    status: "approved",
    timestamp: new Date(Date.now() - 240000).toISOString()
  },
  {
    id: "req_demo_3",
    song: MOCK_SONGS[11], // Electric Feel
    table: "8",
    mood: "energetic",
    dedication: "Dai che stasera carichi! ⚡⚡",
    status: "approved",
    timestamp: new Date(Date.now() - 180000).toISOString()
  },
  {
    id: "req_demo_4",
    song: MOCK_SONGS[3], // Careless Whisper
    table: "2",
    mood: "romantic",
    dedication: "Per la ragazza bionda al tavolo 5... 👀",
    status: "pending",
    timestamp: new Date(Date.now() - 60000).toISOString()
  },
  {
    id: "req_demo_5",
    song: MOCK_SONGS[5], // Bohemian Rhapsody
    table: "9",
    mood: "retro",
    dedication: "Cantiamola tutti insieme! 🎤",
    status: "pending",
    timestamp: new Date(Date.now() - 30000).toISOString()
  }
];

const INITIAL_PLAYBACK = {
  isPlaying: true,
  progress: 45, // starts at 45 seconds elapsed
  duration: 200,
  currentRequestId: "req_demo_1"
};

const INITIAL_SETTINGS = {
  queuePaused: false
};

// LocalStorage Keys
const KEYS = {
  REQUESTS: "walbox_requests",
  PLAYBACK: "walbox_playback",
  SETTINGS: "walbox_settings"
};

// In-Memory subscription system for multi-component syncing within the same tab
let listeners = [];

export const subscribeState = (listener) => {
  listeners.push(listener);
  return () => {
    listeners = listeners.filter((l) => l !== listener);
  };
};

export const notifyStateChange = () => {
  listeners.forEach((listener) => listener());
};

// Initialize localStorage if empty
export const initializeStorage = (force = false) => {
  if (force || !localStorage.getItem(KEYS.REQUESTS)) {
    localStorage.setItem(KEYS.REQUESTS, JSON.stringify(INITIAL_REQUESTS));
    localStorage.setItem(KEYS.PLAYBACK, JSON.stringify(INITIAL_PLAYBACK));
    localStorage.setItem(KEYS.SETTINGS, JSON.stringify(INITIAL_SETTINGS));
    notifyStateChange();
  }
};

// Getter functions
export const getRequests = () => {
  initializeStorage();
  try {
    return JSON.parse(localStorage.getItem(KEYS.REQUESTS)) || [];
  } catch (e) {
    return [];
  }
};

export const getPlaybackState = () => {
  initializeStorage();
  try {
    return JSON.parse(localStorage.getItem(KEYS.PLAYBACK)) || INITIAL_PLAYBACK;
  } catch (e) {
    return INITIAL_PLAYBACK;
  }
};

export const getVenueSettings = () => {
  initializeStorage();
  try {
    return JSON.parse(localStorage.getItem(KEYS.SETTINGS)) || INITIAL_SETTINGS;
  } catch (e) {
    return INITIAL_SETTINGS;
  }
};

// State modifiers
export const saveRequests = (requests) => {
  localStorage.setItem(KEYS.REQUESTS, JSON.stringify(requests));
  notifyStateChange();
};

export const savePlaybackState = (state) => {
  localStorage.setItem(KEYS.PLAYBACK, JSON.stringify(state));
  notifyStateChange();
};

export const saveVenueSettings = (settings) => {
  localStorage.setItem(KEYS.SETTINGS, JSON.stringify(settings));
  notifyStateChange();
};

// Business Logic helpers
export const addRequest = (table, songId, mood, dedication) => {
  const song = MOCK_SONGS.find((s) => s.id === songId);
  if (!song) return null;

  const newRequest = {
    id: `req_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
    song,
    table: table || "Anonimo",
    mood: mood || "chill",
    dedication: dedication || "",
    status: "pending",
    timestamp: new Date().toISOString()
  };

  const requests = getRequests();
  requests.push(newRequest);
  saveRequests(requests);

  // Trigger cross-tab sync by storage writing
  return newRequest;
};

export const approveRequest = (requestId) => {
  const requests = getRequests();
  const index = requests.findIndex((r) => r.id === requestId);
  if (index !== -1) {
    requests[index].status = "approved";
    saveRequests(requests);
  }
};

export const rejectRequest = (requestId) => {
  const requests = getRequests();
  const index = requests.findIndex((r) => r.id === requestId);
  if (index !== -1) {
    requests[index].status = "rejected";
    saveRequests(requests);
  }
};

export const prioritizeRequest = (requestId, direction) => {
  const requests = getRequests();
  // Get only approved queue requests and their original indices
  const approved = requests
    .map((req, index) => ({ req, index }))
    .filter((item) => item.req.status === "approved");

  const idxInApproved = approved.findIndex((item) => item.req.id === requestId);
  if (idxInApproved === -1) return;

  const newIdxInApproved = idxInApproved + direction;
  if (newIdxInApproved < 0 || newIdxInApproved >= approved.length) return;

  // Swap target request with adjacent approved request in requests array
  const targetOrigIdx = approved[idxInApproved].index;
  const swapOrigIdx = approved[newIdxInApproved].index;

  const temp = requests[targetOrigIdx];
  requests[targetOrigIdx] = requests[swapOrigIdx];
  requests[swapOrigIdx] = temp;

  saveRequests(requests);
};

export const skipToNext = () => {
  const requests = getRequests();
  const playback = getPlaybackState();

  // Mark currently playing requests as played
  const updatedRequests = requests.map((r) => {
    if (r.status === "playing") {
      return { ...r, status: "played" };
    }
    return r;
  });

  // Find first approved request in the queue
  const nextRequest = updatedRequests.find((r) => r.status === "approved");

  if (nextRequest) {
    nextRequest.status = "playing";
    playback.currentRequestId = nextRequest.id;
    playback.progress = 0;
    playback.duration = nextRequest.song.duration;
    playback.isPlaying = true;
  } else {
    playback.currentRequestId = null;
    playback.progress = 0;
    playback.duration = 0;
    playback.isPlaying = false;
  }

  saveRequests(updatedRequests);
  savePlaybackState(playback);
};

export const resetToDemoState = () => {
  initializeStorage(true);
};
