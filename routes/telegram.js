const express = require("express");
const { TelegramClient, Api } = require("telegram");
const { StringSession } = require("telegram/sessions");
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const crypto = require("crypto");

const router = express.Router();

const apiId = parseInt(process.env.TELEGRAM_API_ID);
const apiHash = process.env.TELEGRAM_API_HASH;
const phone = process.env.TELEGRAM_PHONE;
const twoFaPassword = process.env.TELEGRAM_2FA_PASSWORD || "";
const proxyIp = process.env.TELEGRAM_PROXY_IP || "";
const proxyPort = parseInt(process.env.TELEGRAM_PROXY_PORT) || 0;
const proxySecret = process.env.TELEGRAM_PROXY_SECRET || "";

// System SOCKS proxy (e.g., from V2Ray, Clash, etc.)
const socksProxyHost = process.env.SOCKS_PROXY_HOST || "";
const socksProxyPort = parseInt(process.env.SOCKS_PROXY_PORT) || 0;

const SESSION_FILE = path.join(__dirname, "../data/telegram_session.txt");
const CACHE_FILE = path.join(__dirname, "../data/playlist_cache.json");
const BOT_USERNAME = "StreamWideBot";

// Playlist cache - maps IMDB ID to playlist ID
let playlistCache = {};

// Load cache on startup
try {
  if (fs.existsSync(CACHE_FILE)) {
    playlistCache = JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));
    console.log(`📦 Loaded ${Object.keys(playlistCache).length} cached playlists`);
  }
} catch(e) {}

function saveCache() {
  try {
    fs.writeFileSync(CACHE_FILE, JSON.stringify(playlistCache, null, 2));
  } catch(e) {}
}

function getCachedPlaylist(imdbId) {
  return playlistCache[imdbId] || null;
}

function cachePlaylist(imdbId, playlistId, type = "movie", seasons = null) {
  playlistCache[imdbId] = { playlistId, type, seasons, cachedAt: Date.now() };
  saveCache();
  console.log(`💾 Cached: ${imdbId} -> ${playlistId}`);
}

// Search StreamWide API by title (using q= parameter)
async function searchStreamWideByTitle(title, imdbId = null) {
  console.log(`🔍 Searching StreamWide for: ${title}`);
  
  try {
    if (!streamwideToken || Date.now() >= tokenExpiry) {
      await authenticateStreamWide();
    }
    
    const response = await axios.get(`${STREAMWIDE_API}/playlists/`, {
      params: { q: title },
      headers: {
        "Authorization": `Bearer ${streamwideToken}`,
        "Accept": "application/json",
      },
      timeout: 15000,
    });

    const data = response.data;
    
    if (data.results && data.results.length > 0) {
      // If we have IMDB ID, find exact match
      if (imdbId) {
        const exactMatch = data.results.find(p => p.imdb_id === imdbId);
        if (exactMatch) {
          console.log(`✅ Found exact IMDB match: ${exactMatch.id} - ${exactMatch.title}`);
          return exactMatch;
        }
      }
      
      // Return first result
      console.log(`✅ Found: ${data.results[0].id} - ${data.results[0].title}`);
      return data.results[0];
    }
    
    return null;
  } catch (error) {
    console.error("StreamWide search error:", error.message);
    return null;
  }
}

// StreamWide API
const STREAMWIDE_API = "https://120e0b2c-b7e9-466f-ba0f-8ca6c6d10dd6.streamwide.tv/api/v1";
let streamwideToken = null;
let streamwideRefreshToken = null;
let tokenExpiry = 0;

// Load saved refresh token on startup (from ENV or file)
try {
  if (process.env.STREAMWIDE_REFRESH_TOKEN) {
    streamwideRefreshToken = process.env.STREAMWIDE_REFRESH_TOKEN;
    console.log("📦 Loaded refresh token from ENV");
  } else {
    const refreshFile = path.join(__dirname, "../data/streamwide_refresh.txt");
    if (fs.existsSync(refreshFile)) {
      streamwideRefreshToken = fs.readFileSync(refreshFile, "utf8").trim();
      console.log("📦 Loaded refresh token from file");
      console.log("💡 Add to .env: STREAMWIDE_REFRESH_TOKEN=" + streamwideRefreshToken.substring(0, 50) + "...");
    }
  }
} catch(e) {}

let client = null;
let isConnected = false;

function loadSession() {
  try {
    // First try from ENV
    if (process.env.TELEGRAM_SESSION) {
      console.log("📦 Loading session from ENV");
      return process.env.TELEGRAM_SESSION;
    }
    
    // Then try from file
    if (fs.existsSync(SESSION_FILE)) {
      console.log("📦 Loading session from file");
      return fs.readFileSync(SESSION_FILE, "utf8").trim();
    }
  } catch (e) {}
  return "";
}

function saveSession(session) {
  try {
    // Save to file
    fs.writeFileSync(SESSION_FILE, session);
    console.log("✅ Session saved to file");
    console.log("💡 Add to .env: TELEGRAM_SESSION=" + session.substring(0, 50) + "...");
  } catch (e) {
    console.error("Failed to save session:", e.message);
  }
}

function getClientOptions() {
  const options = {
    connectionRetries: 5,
    timeout: 60000,
    useWSS: false,
    retryDelay: 1000,
    autoReconnect: true,
  };

  // Use system SOCKS5 proxy only if BOTH host and port are configured
  if (socksProxyHost && socksProxyHost.trim() !== "" && socksProxyPort && socksProxyPort > 0) {
    console.log(`🌐 Using SOCKS5 proxy: ${socksProxyHost}:${socksProxyPort}`);
    options.proxy = {
      ip: socksProxyHost,
      port: socksProxyPort,
      socksType: 5,
      timeout: 10,
    };
  } else {
    console.log(`🌐 Direct connection (no proxy configured)`);
  }

  return options;
}

async function initClient() {
  if (client && isConnected) {
    try {
      const authorized = await client.isUserAuthorized();
      if (authorized) {
        return client;
      }
    } catch (e) {
      console.log("Client check failed, reconnecting...");
      isConnected = false;
    }
  }

  const savedSession = loadSession();
  const stringSession = new StringSession(savedSession);

  // Try with proxy first (if configured)
  let clientOptions = getClientOptions();
  client = new TelegramClient(stringSession, apiId, apiHash, clientOptions);

  try {
    await client.connect();
    
    const authorized = await client.isUserAuthorized();
    if (authorized) {
      isConnected = true;
      console.log("✅ Telegram: Logged in from saved session");
      return client;
    }

    console.log("⚠️ Telegram: Not authorized, need to login");
    return client;
  } catch (e) {
    console.error("Connection error with proxy:", e.message);
    
    // If proxy failed, try without proxy
    if (clientOptions.proxy) {
      console.log("🔄 Retrying without proxy...");
      delete clientOptions.proxy;
      client = new TelegramClient(stringSession, apiId, apiHash, clientOptions);
      
      try {
        await client.connect();
        const authorized = await client.isUserAuthorized();
        if (authorized) {
          isConnected = true;
          console.log("✅ Telegram: Connected without proxy");
          return client;
        }
        return client;
      } catch (e2) {
        console.error("Connection error without proxy:", e2.message);
        throw e2;
      }
    }
    
    throw e;
  }
}

async function doLogin() {
  await initClient();
  
  if (await client.isUserAuthorized()) {
    console.log("✅ Already logged in");
    return true;
  }

  console.log("🔐 Starting Telegram login...");
  console.log("📱 Phone:", phone);

  try {
    await client.start({
      phoneNumber: phone,
      password: async () => twoFaPassword,
      phoneCode: async () => {
        console.log("📱 Check your Telegram for the code!");
        console.log("💡 Create file 'data/telegram_code.txt' with the code");
        
        const codeFile = path.join(__dirname, "../data/telegram_code.txt");
        for (let i = 0; i < 60; i++) {
          await new Promise(r => setTimeout(r, 2000));
          if (fs.existsSync(codeFile)) {
            const code = fs.readFileSync(codeFile, "utf8").trim();
            fs.unlinkSync(codeFile);
            console.log("✅ Code received:", code);
            return code;
          }
        }
        throw new Error("Timeout waiting for code");
      },
      onError: (err) => console.error("Login error:", err.message),
    });

    const session = client.session.save();
    saveSession(session);
    isConnected = true;
    console.log("✅ Telegram: Login successful!");
    return true;
  } catch (error) {
    console.error("❌ Login failed:", error.message);
    return false;
  }
}

router.get("/status", async (req, res) => {
  try {
    // Don't try to init if not already connected - just check
    if (client && isConnected) {
      try {
        const authorized = await client.isUserAuthorized();
        res.json({ success: true, connected: authorized });
        return;
      } catch (e) {
        isConnected = false;
      }
    }
    res.json({ success: true, connected: false });
  } catch (error) {
    res.json({ success: false, connected: false, error: error.message });
  }
});

router.post("/login", async (req, res) => {
  try {
    // Prevent multiple simultaneous login attempts
    if (client && isConnected) {
      try {
        if (await client.isUserAuthorized()) {
          return res.json({ success: true, message: "Already logged in" });
        }
      } catch(e) {
        isConnected = false;
      }
    }
    
    const result = await doLogin();
    res.json({ success: result });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

router.post("/code", async (req, res) => {
  try {
    const { code } = req.body;
    const codeFile = path.join(__dirname, "../data/telegram_code.txt");
    fs.writeFileSync(codeFile, code);
    res.json({ success: true, message: "Code submitted" });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

// Generate Telegram WebApp initData
async function generateInitData(botId) {
  if (!client || !(await client.isUserAuthorized())) {
    throw new Error("Not logged in");
  }

  const me = await client.getMe();
  const userId = me.id.toString();
  const firstName = me.firstName || "";
  const lastName = me.lastName || "";
  const username = me.username || "";
  
  const authDate = Math.floor(Date.now() / 1000);
  
  // User data for initData
  const user = {
    id: parseInt(userId),
    first_name: firstName,
    last_name: lastName,
    username: username,
    language_code: "en",
    allows_write_to_pm: true,
  };

  // Build query string (sorted alphabetically)
  const params = {
    auth_date: authDate.toString(),
    query_id: `AAH${userId}AQAAAA`,
    user: JSON.stringify(user),
  };

  // Create data-check-string (sorted params)
  const dataCheckString = Object.keys(params)
    .sort()
    .map(key => `${key}=${params[key]}`)
    .join("\n");

  // Generate hash using bot token (we'll use a workaround)
  // For WebApp auth, we need to create a valid hash
  // The hash is HMAC-SHA256 of data-check-string with secret key
  // Secret key = HMAC-SHA256 of bot_token with "WebAppData"
  
  // Since we don't have bot token, we'll send raw initData and let StreamWide validate via Telegram
  const initData = Object.keys(params)
    .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
    .join("&");

  console.log(`📱 Generated initData for user ${userId}`);
  return { initData, userId, user };
}

// Authenticate with StreamWide API using Telegram initData
async function authenticateStreamWide(initDataRaw = null) {
  if (streamwideToken && Date.now() < tokenExpiry) {
    return streamwideToken;
  }

  // Try refresh token first
  if (streamwideRefreshToken) {
    try {
      console.log("🔄 Refreshing StreamWide token...");
      const refreshResponse = await axios.post(`${STREAMWIDE_API}/accounts/token/refresh/`, {
        refresh: streamwideRefreshToken,
      }, {
        headers: { "Content-Type": "application/json" },
        timeout: 10000,
      });

      if (refreshResponse.data.access) {
        streamwideToken = refreshResponse.data.access;
        tokenExpiry = Date.now() + 600000; // 10 minutes
        console.log("✅ Token refreshed");
        return streamwideToken;
      }
    } catch (e) {
      console.log("⚠️ Refresh failed:", e.response?.data || e.message);
    }
  }

  // Use provided initDataRaw or generate one
  if (!initDataRaw) {
    try {
      const generated = await generateInitData();
      initDataRaw = generated.initData;
    } catch (e) {
      console.log("Cannot generate initData:", e.message);
      throw new Error("No initData available");
    }
  }

  console.log("🔐 Authenticating with StreamWide using initData...");
  
  try {
    // StreamWide expects initDataRaw in the request
    const response = await axios.post(`${STREAMWIDE_API}/accounts/telegram/auth/`, {
      initData: initDataRaw,
    }, {
      headers: {
        "Content-Type": "application/json",
        "Origin": "https://web-app.streamwide.tv",
        "Referer": "https://web-app.streamwide.tv/",
      },
      timeout: 10000,
    });

    if (response.data.access) {
      streamwideToken = response.data.access;
      streamwideRefreshToken = response.data.refresh;
      tokenExpiry = Date.now() + 600000; // 10 minutes
      console.log("✅ StreamWide authenticated!");
      
      // Save refresh token to file for persistence
      try {
        const refreshFile = path.join(__dirname, "../data/streamwide_refresh.txt");
        fs.writeFileSync(refreshFile, streamwideRefreshToken);
        console.log("💡 Add to .env: STREAMWIDE_REFRESH_TOKEN=" + streamwideRefreshToken.substring(0, 50) + "...");
      } catch(e) {}
      
      return streamwideToken;
    }
  } catch (e) {
    console.log(`❌ Auth failed: ${e.response?.status} - ${JSON.stringify(e.response?.data || e.message)}`);
  }

  throw new Error("Could not authenticate with StreamWide");
}

// Load saved refresh token on startup
try {
  const savedRefresh = fs.readFileSync(path.join(__dirname, "../data/streamwide_refresh.txt"), "utf8").trim();
  if (savedRefresh) {
    streamwideRefreshToken = savedRefresh;
    console.log("📦 Loaded saved refresh token");
  }
} catch(e) {}

// Fetch videos from StreamWide API
async function fetchStreamWideVideos(playlistId, token = null) {
  console.log(`📥 Fetching videos for playlist: ${playlistId}`);
  
  try {
    let authToken = token || streamwideToken;
    
    // Try to refresh if no token
    if (!authToken && streamwideRefreshToken) {
      try {
        await authenticateStreamWide();
        authToken = streamwideToken;
      } catch(e) {}
    }
    
    if (!authToken) {
      console.log("⚠️ No token available");
      return [];
    }
    
    const response = await axios.get(`${STREAMWIDE_API}/playlists/videos/source/W/`, {
      params: { playlist: playlistId },
      headers: {
        "Authorization": `Bearer ${authToken}`,
        "Accept": "application/json",
      },
      timeout: 15000,
    });

    const data = response.data;
    const videos = data.videos || [];
    const domains = data.domains || {};
    const downloads = [];

    console.log(`📦 Got ${videos.length} videos`);

    for (const video of videos) {
      if (video.url) {
        const urlParts = video.url.split('/');
        const domainKey = urlParts[2];
        
        let fullUrl;
        const domainValue = domains[domainKey];
        
        if (domainValue) {
          if (typeof domainValue === 'string') {
            fullUrl = domainValue + video.url;
          } else if (domainValue.out_domain) {
            fullUrl = domainValue.out_domain + video.url;
          } else if (domainValue.in_domain) {
            fullUrl = domainValue.in_domain + video.url;
          } else {
            fullUrl = `https://ant.out.p${domainKey}.streamwide.tv${video.url}`;
          }
        } else {
          fullUrl = `https://ant.out.p${domainKey}.streamwide.tv${video.url}`;
        }
        
        // Extract filename from URL
        const urlMatch = video.url.match(/\/([^\/]+)$/);
        const fileName = urlMatch ? urlMatch[1] : (video.file_name || "");
        
        // Parse filename for metadata
        const parsed = parseFileName(fileName);
        
        downloads.push({
          text: fileName,
          url: fullUrl,
          size: formatSize(video.size),
          sizeBytes: video.size || 0,
          ...parsed,
        });
      }
    }

    console.log(`✅ Got ${downloads.length} videos from API`);
    return downloads;
  } catch (error) {
    console.error("StreamWide API error:", error.response?.data || error.message);
    return [];
  }
}

// Parse filename to extract season, episode, quality, codec, subtype
function parseFileName(fileName) {
  const result = {
    season: null,
    episode: null,
    quality: "",
    codec: "",
    subType: "",
    source: "",
  };
  
  if (!fileName) return result;
  
  // Season & Episode: S01E05, S1E5, etc
  const seMatch = fileName.match(/S(\d{1,2})E(\d{1,3})/i);
  if (seMatch) {
    result.season = parseInt(seMatch[1]);
    result.episode = parseInt(seMatch[2]);
  }
  
  // Quality: 1080p, 720p, 480p, 2160p
  const qualityMatch = fileName.match(/(\d{3,4})p/i);
  if (qualityMatch) {
    result.quality = qualityMatch[1];
  }
  
  // Codec: x264, x265, HEVC, H.264, H.265 (prioritize x265/x264 over 10bit)
  const codecMatch = fileName.match(/(x26[45]|hevc|h\.?26[45])/i);
  if (codecMatch) {
    let codec = codecMatch[1].toUpperCase().replace('H.', 'H');
    if (codec === 'HEVC') codec = 'x265';
    if (codec === 'H265') codec = 'x265';
    if (codec === 'H264') codec = 'x264';
    result.codec = codec;
  }
  
  // Check for 10bit separately (add to codec if present)
  if (fileName.toLowerCase().includes('10bit') || fileName.includes('10-bit')) {
    result.codec = result.codec ? `${result.codec} 10bit` : '10bit';
  }
  
  // Source: BluRay, WEB-DL, WEBRip, HDTV
  const sourceMatch = fileName.match(/(bluray|web-?dl|webrip|hdtv|dvdrip|bdrip)/i);
  if (sourceMatch) {
    result.source = sourceMatch[1].toUpperCase().replace('WEBDL', 'WEB-DL');
  }
  
  // SubType: Dubbed, HardSub, SoftSub
  const lower = fileName.toLowerCase();
  if (lower.includes('dubbed') || lower.includes('dub.') || lower.includes('.farsi.') || lower.includes('farsi-')) {
    result.subType = "dubbed";
  } else if (lower.includes('hardsub')) {
    result.subType = "hardsub";
  } else if (lower.includes('softsub')) {
    result.subType = "softsub";
  }
  
  return result;
}

function formatSize(bytes) {
  if (!bytes) return "";
  if (typeof bytes === "string") return bytes;
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) return `${gb.toFixed(2)} GB`;
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(0)} MB`;
}

// Search playlist by IMDB ID directly from StreamWide API (no Telegram needed!)
async function searchPlaylistByImdb(imdbId) {
  console.log(`🔍 Searching StreamWide for IMDB: ${imdbId}`);
  
  try {
    // Ensure we have a valid token
    if (!streamwideToken || Date.now() >= tokenExpiry) {
      await authenticateStreamWide();
    }
    
    // Search with exact IMDB ID filter
    const response = await axios.get(`${STREAMWIDE_API}/playlists/`, {
      params: { imdb_id: imdbId },
      headers: {
        "Authorization": `Bearer ${streamwideToken}`,
        "Accept": "application/json",
      },
      timeout: 15000,
    });

    const data = response.data;
    
    if (data.results && data.results.length > 0) {
      // Find exact match by IMDB ID
      const exactMatch = data.results.find(p => p.imdb_id === imdbId);
      if (exactMatch) {
        console.log(`✅ Found exact match: ${exactMatch.id} - ${exactMatch.title}`);
        return exactMatch;
      }
      
      // No exact match found in first page, try searching more pages
      console.log(`⚠️ No exact match in page 1, checking more...`);
      
      // Check if there are more pages
      let nextUrl = data.next;
      let pageCount = 1;
      const maxPages = 10;
      
      while (nextUrl && pageCount < maxPages) {
        pageCount++;
        try {
          const nextResponse = await axios.get(nextUrl, {
            headers: {
              "Authorization": `Bearer ${streamwideToken}`,
              "Accept": "application/json",
            },
            timeout: 15000,
          });
          
          const nextData = nextResponse.data;
          if (nextData.results) {
            const match = nextData.results.find(p => p.imdb_id === imdbId);
            if (match) {
              console.log(`✅ Found exact match on page ${pageCount}: ${match.id} - ${match.title}`);
              return match;
            }
          }
          nextUrl = nextData.next;
        } catch (e) {
          break;
        }
      }
      
      console.log(`❌ No exact match found for ${imdbId}`);
      return null;
    }
    
    return null;
  } catch (error) {
    console.error("StreamWide search error:", error.response?.data || error.message);
    return null;
  }
}

// Get download links - check cache, then API, then Telegram bot
router.get("/get-links", async (req, res) => {
  try {
    const { imdbId, title } = req.query;
    
    if (!imdbId) {
      return res.json({ success: false, error: "IMDB ID required" });
    }

    const cleanId = imdbId.startsWith("tt") ? imdbId : `tt${imdbId}`;

    // Ensure we have a valid token
    if (!streamwideToken || Date.now() >= tokenExpiry) {
      console.log("🔄 Refreshing token...");
      try {
        await authenticateStreamWide();
      } catch(e) {
        console.log("Token refresh failed:", e.message);
      }
    }

    // 1. CHECK CACHE FIRST - no API/Telegram needed!
    const cached = getCachedPlaylist(cleanId);
    if (cached) {
      console.log(`✅ Cache hit for ${cleanId}`);
      
      if (cached.type === "series" && cached.seasons && cached.seasons.length > 0) {
        const downloads = await fetchStreamWideVideos(cached.seasons[0].seasonId);
        if (downloads.length > 0) {
          return res.json({
            success: true,
            imdbId: cleanId,
            type: "series",
            seasons: cached.seasons,
            currentSeason: cached.seasons[0].seasonNum,
            downloads,
            fromCache: true,
          });
        }
      } else if (cached.playlistId) {
        const downloads = await fetchStreamWideVideos(cached.playlistId);
        if (downloads.length > 0) {
          return res.json({
            success: true,
            imdbId: cleanId,
            type: cached.type || "movie",
            playlistId: cached.playlistId,
            downloads,
            fromCache: true,
          });
        }
      }
      console.log("⚠️ Cache hit but no videos, refreshing...");
    }

    // 2. TRY STREAMWIDE API SEARCH (no Telegram needed!)
    if (title) {
      const playlist = await searchStreamWideByTitle(title, cleanId);
      
      if (playlist && playlist.imdb_id === cleanId) {
        const playlistId = playlist.id;
        const isSeries = playlist.type === "TVS";
        
        if (isSeries) {
          // For series, try to get seasons
          try {
            const seasonsResponse = await axios.get(`${STREAMWIDE_API}/playlists/${playlistId}/seasons/`, {
              headers: { "Authorization": `Bearer ${streamwideToken}` },
              timeout: 15000,
            });
            
            let seasons = [];
            const seasonsData = seasonsResponse.data;
            
            if (Array.isArray(seasonsData)) {
              seasons = seasonsData.map((s, idx) => ({
                text: `فصل ${s.season_number || idx + 1}`,
                seasonNum: s.season_number || idx + 1,
                seasonId: s.id,
              }));
            } else if (seasonsData.results) {
              seasons = seasonsData.results.map((s, idx) => ({
                text: `فصل ${s.season_number || idx + 1}`,
                seasonNum: s.season_number || idx + 1,
                seasonId: s.id,
              }));
            }
            
            if (seasons.length > 0) {
              const downloads = await fetchStreamWideVideos(seasons[0].seasonId);
              if (downloads.length > 0) {
                cachePlaylist(cleanId, null, "series", seasons);
                return res.json({
                  success: true,
                  imdbId: cleanId,
                  type: "series",
                  title: playlist.title,
                  poster: playlist.poster,
                  seasons,
                  currentSeason: seasons[0].seasonNum,
                  downloads,
                });
              }
            }
          } catch(e) {
            console.log("Seasons error:", e.message);
          }
        }
        
        // Movie or series without seasons endpoint
        const downloads = await fetchStreamWideVideos(playlistId);
        if (downloads.length > 0) {
          cachePlaylist(cleanId, playlistId, isSeries ? "series" : "movie");
          return res.json({
            success: true,
            imdbId: cleanId,
            type: isSeries ? "series" : "movie",
            title: playlist.title,
            poster: playlist.poster,
            playlistId,
            downloads,
          });
        }
      }
    }

    // 3. FALLBACK TO TELEGRAM BOT
    if (!client || !isConnected) {
      console.log("⚠️ Telegram not connected, trying to connect...");
      try {
        await initClient();
        if (!client || !isConnected) {
          return res.json({ 
            success: false, 
            error: "Unable to connect to Telegram. Check your TELEGRAM_SESSION or remove proxy settings if outside Iran.",
            needLogin: true 
          });
        }
      } catch (e) {
        console.error("Failed to init Telegram client:", e.message);
        return res.json({ 
          success: false, 
          error: "Telegram connection failed: " + e.message,
          needLogin: true 
        });
      }
    }

    try {
      if (await client.isUserAuthorized()) {
        const bot = await client.getEntity(BOT_USERNAME);
        
        const inlineResults = await client.invoke(
          new Api.messages.GetInlineBotResults({
            bot: bot,
            peer: new Api.InputPeerSelf(),
            query: cleanId,
            offset: "",
          })
        );

        if (inlineResults.results && inlineResults.results.length > 0) {
          const firstResult = inlineResults.results[0];
          
          // Check if inline result has buttons (no message needed!)
          let moviePlaylistId = null;
          let seasons = [];
          
          if (firstResult.sendMessage && firstResult.sendMessage.replyMarkup && firstResult.sendMessage.replyMarkup.rows) {
            console.log("📋 Found buttons in inline result (no message sent!)");
            for (const row of firstResult.sendMessage.replyMarkup.rows) {
              for (const button of row.buttons) {
                const btnUrl = button.url || '';
                const btnText = button.text || '';
                
                if (btnUrl.includes("uniqueID=") || btnUrl.includes("playlist=")) {
                  const match = btnUrl.match(/(?:uniqueID|playlist)=([a-f0-9-]+)/i);
                  if (match) moviePlaylistId = match[1];
                }
                if (btnUrl.includes("seasonID=")) {
                  const match = btnUrl.match(/seasonID=([a-f0-9-]+)/i);
                  const seasonMatch = btnText.match(/فصل\s*(\d+)/);
                  if (match) {
                    seasons.push({
                      text: btnText,
                      seasonNum: seasonMatch ? parseInt(seasonMatch[1]) : seasons.length + 1,
                      seasonId: match[1],
                    });
                  }
                }
              }
            }
          }
          
          // If found from inline result buttons
          if (seasons.length > 0) {
            cachePlaylist(cleanId, null, "series", seasons);
            const downloads = await fetchStreamWideVideos(seasons[0].seasonId);
            return res.json({
              success: downloads.length > 0,
              imdbId: cleanId,
              type: "series",
              seasons,
              currentSeason: seasons[0].seasonNum,
              downloads,
            });
          }
          
          if (moviePlaylistId) {
            cachePlaylist(cleanId, moviePlaylistId, "movie");
            const downloads = await fetchStreamWideVideos(moviePlaylistId);
            return res.json({
              success: downloads.length > 0,
              imdbId: cleanId,
              type: "movie",
              playlistId: moviePlaylistId,
              downloads,
            });
          }
          
          // Last resort: send message to bot
          console.log("📨 Sending message to bot...");
          await client.invoke(
            new Api.messages.SendInlineBotResult({
              peer: bot,
              queryId: inlineResults.queryId,
              id: firstResult.id,
              randomId: BigInt(Math.floor(Math.random() * 1e15)),
            })
          );

          await new Promise(r => setTimeout(r, 3000));
          const messages = await client.getMessages(bot, { limit: 5 });

          // Only use the FIRST message (most recent) to avoid mixing seasons from different series
          const latestMsg = messages[0];
          if (latestMsg && latestMsg.replyMarkup && latestMsg.replyMarkup.rows) {
            console.log(`📝 Processing latest message only`);
            
            for (const row of latestMsg.replyMarkup.rows) {
              for (const button of row.buttons) {
                const btnUrl = button.url || '';
                const btnText = button.text || '';
                
                if (btnUrl.includes("seasonID=")) {
                  const match = btnUrl.match(/seasonID=([a-f0-9-]+)/i);
                  const seasonMatch = btnText.match(/فصل\s*(\d+)/);
                  if (match) {
                    seasons.push({
                      text: btnText,
                      seasonNum: seasonMatch ? parseInt(seasonMatch[1]) : seasons.length + 1,
                      seasonId: match[1],
                    });
                  }
                }
                
                if ((btnUrl.includes("uniqueID=") || btnUrl.includes("playlist=")) && !moviePlaylistId) {
                  const match = btnUrl.match(/(?:uniqueID|playlist)=([a-f0-9-]+)/i);
                  if (match) moviePlaylistId = match[1];
                }
              }
            }
          }

          if (seasons.length > 0) {
            cachePlaylist(cleanId, null, "series", seasons);
            const downloads = await fetchStreamWideVideos(seasons[0].seasonId);
            return res.json({
              success: downloads.length > 0,
              imdbId: cleanId,
              type: "series",
              seasons,
              currentSeason: seasons[0].seasonNum,
              downloads,
            });
          }

          if (moviePlaylistId) {
            cachePlaylist(cleanId, moviePlaylistId, "movie");
            const downloads = await fetchStreamWideVideos(moviePlaylistId);
            return res.json({
              success: downloads.length > 0,
              imdbId: cleanId,
              type: "movie",
              playlistId: moviePlaylistId,
              downloads,
            });
          }
        }
      }
    } catch (telegramError) {
      console.log("Telegram error:", telegramError.message);
    }

    return res.json({ success: false, error: "فیلم/سریال یافت نشد" });

  } catch (error) {
    console.error("❌ Get links error:", error);
    res.json({ success: false, error: error.message });
  }
});

// Get links for specific season by seasonId
router.get("/get-season", async (req, res) => {
  try {
    const { seasonId } = req.query;
    
    if (!seasonId) {
      return res.json({ success: false, error: "Season ID required" });
    }

    const downloads = await fetchStreamWideVideos(seasonId);
    
    res.json({
      success: downloads.length > 0,
      downloads,
    });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

// Manual token endpoint - user can provide token from browser
router.post("/set-token", async (req, res) => {
  try {
    const { access, refresh, initData } = req.body;
    
    if (access) {
      streamwideToken = access;
      tokenExpiry = Date.now() + 600000; // 10 min
      console.log("✅ Access token set manually");
    }
    
    if (refresh) {
      streamwideRefreshToken = refresh;
      // Save for persistence
      try {
        const refreshFile = path.join(__dirname, "../data/streamwide_refresh.txt");
        fs.writeFileSync(refreshFile, refresh);
        console.log("💡 Add to .env: STREAMWIDE_REFRESH_TOKEN=" + refresh.substring(0, 50) + "...");
      } catch(e) {}
      console.log("✅ Refresh token set manually");
    }
    
    // If initData provided, try to authenticate
    if (initData && !access) {
      try {
        const token = await authenticateStreamWide(initData);
        res.json({ success: true, message: "Authenticated with initData", hasToken: !!token });
        return;
      } catch(e) {
        res.json({ success: false, error: "Auth failed: " + e.message });
        return;
      }
    }
    
    res.json({ success: true, message: "Token(s) saved" });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

// Refresh token endpoint
router.post("/refresh-token", async (req, res) => {
  try {
    if (!streamwideRefreshToken) {
      return res.json({ success: false, error: "No refresh token available" });
    }
    
    const response = await axios.post(`${STREAMWIDE_API}/accounts/token/refresh/`, {
      refresh: streamwideRefreshToken,
    }, {
      headers: { "Content-Type": "application/json" },
      timeout: 10000,
    });

    if (response.data.access) {
      streamwideToken = response.data.access;
      tokenExpiry = Date.now() + 600000;
      console.log("✅ Token refreshed via endpoint");
      res.json({ success: true, access: streamwideToken });
    } else {
      res.json({ success: false, error: "No access token in response" });
    }
  } catch (error) {
    console.error("Refresh error:", error.response?.data || error.message);
    res.json({ success: false, error: error.response?.data?.detail || error.message });
  }
});

// Direct API fetch with provided token
router.get("/fetch-videos", async (req, res) => {
  try {
    const { playlistId, token, raw } = req.query;
    
    if (!playlistId) {
      return res.json({ success: false, error: "Playlist ID required" });
    }

    let authToken = token || streamwideToken;
    
    // Try to refresh if no token
    if (!authToken && streamwideRefreshToken) {
      try {
        await authenticateStreamWide();
        authToken = streamwideToken;
      } catch(e) {}
    }
    
    if (!authToken) {
      return res.json({ success: false, error: "No token available. Set token first.", needToken: true });
    }

    console.log(`📥 Fetching videos for playlist: ${playlistId}`);
    
    const response = await axios.get(`${STREAMWIDE_API}/playlists/videos/source/W/`, {
      params: { playlist: playlistId },
      headers: {
        "Authorization": `Bearer ${authToken}`,
        "Accept": "application/json",
      },
      timeout: 15000,
    });

    const data = response.data;
    
    // Return raw data if requested
    if (raw === 'true') {
      return res.json({ success: true, data });
    }
    
    const videos = data.videos || [];
    const domains = data.domains || {};
    const downloads = [];

    for (const video of videos) {
      if (video.url) {
        const urlParts = video.url.split('/');
        const domainKey = urlParts[2];
        let fullUrl;
        
        const domainValue = domains[domainKey];
        if (domainValue) {
          // Domain can be string or object with in_domain/out_domain
          if (typeof domainValue === 'string') {
            fullUrl = domainValue + video.url;
          } else if (domainValue.out_domain) {
            fullUrl = domainValue.out_domain + video.url;
          } else if (domainValue.in_domain) {
            fullUrl = domainValue.in_domain + video.url;
          } else {
            fullUrl = `https://ant.out.p${domainKey}.streamwide.tv${video.url}`;
          }
        } else {
          fullUrl = `https://ant.out.p${domainKey}.streamwide.tv${video.url}`;
        }
        
        // Extract filename from URL (file_name from API is often empty)
        const urlMatch = video.url.match(/\/([^\/]+)$/);
        const fileName = urlMatch ? decodeURIComponent(urlMatch[1]) : (video.file_name || "");
        
        // Parse filename for metadata
        const parsed = parseFileName(fileName);
        
        downloads.push({
          text: fileName,
          url: fullUrl,
          size: formatSize(video.size),
          sizeBytes: video.size || 0,
          ...parsed,
        });
      }
    }

    res.json({
      success: downloads.length > 0,
      downloads,
    });
  } catch (error) {
    console.error("Fetch videos error:", error.response?.data || error.message);
    const errorMsg = error.response?.data?.detail || error.message;
    const needToken = errorMsg.includes("token") || error.response?.status === 401;
    res.json({ success: false, error: errorMsg, needToken });
  }
});

function extractQuality(text) {
  if (!text) return "";
  const match = text.match(/(\d{3,4})p/i);
  return match ? match[1] : "";
}

// Initialize on startup
setTimeout(async () => {
  try {
    const savedSession = loadSession();
    if (savedSession) {
      console.log("📦 Found saved Telegram session, connecting...");
      
      try {
        await initClient();
        if (isConnected) {
          console.log("🤖 Telegram ready (from saved session)");
        } else {
          console.log("⚠️ Telegram: Session expired, need to login. Call POST /telegram/login");
        }
      } catch (e) {
        console.error("Telegram connection error:", e.message);
        console.log("💡 Tip: If outside Iran, remove SOCKS_PROXY_HOST and SOCKS_PROXY_PORT from ENV");
      }
    } else {
      console.log("⚠️ Telegram: No saved session. Add TELEGRAM_SESSION to ENV or call POST /telegram/login");
    }
  } catch (e) {
    console.error("Telegram init error:", e.message);
  }
}, 3000);

module.exports = router;
