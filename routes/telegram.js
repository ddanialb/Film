const express = require("express");
const { TelegramClient, Api } = require("telegram");
const { StringSession } = require("telegram/sessions");
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const crypto = require("crypto");

const router = express.Router();

// Import StreamDB
const { StreamDB, getSeriesSeasonsFromVideos } = require("./streamwide");

const apiId = parseInt(process.env.TELEGRAM_API_ID);
const apiHash = process.env.TELEGRAM_API_HASH;
const phone = process.env.TELEGRAM_PHONE;
const twoFaPassword = process.env.TELEGRAM_2FA_PASSWORD || "";
const proxyIp = process.env.TELEGRAM_PROXY_IP || "";
const proxyPort = parseInt(process.env.TELEGRAM_PROXY_PORT) || 0;
const proxySecret = process.env.TELEGRAM_PROXY_SECRET || "";

const socksProxyHost = process.env.SOCKS_PROXY_HOST || "";
const socksProxyPort = parseInt(process.env.SOCKS_PROXY_PORT) || 0;

const SESSION_FILE = path.join(__dirname, "../data/telegram_session.txt");
const CACHE_FILE = path.join(__dirname, "../data/playlist_cache.json");
const BOT_USERNAME = "StreamWideBot";

let playlistCache = {};
const CACHE_EXPIRY = 7 * 24 * 60 * 60 * 1000; // 7 days

try {
  if (fs.existsSync(CACHE_FILE)) {
    playlistCache = JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));

    const now = Date.now();
    let cleaned = 0;
    for (const key of Object.keys(playlistCache)) {
      if (now - playlistCache[key].cachedAt > CACHE_EXPIRY) {
        delete playlistCache[key];
        cleaned++;
      }
    }
    if (cleaned > 0) {
      saveCache();
      console.log(`🗑️ Cleaned ${cleaned} expired cache entries`);
    }
    console.log(`📦 Loaded ${Object.keys(playlistCache).length} cached playlists`);
  }
} catch(e) {}

function saveCache() {
  try {
    fs.writeFileSync(CACHE_FILE, JSON.stringify(playlistCache, null, 2));
  } catch(e) {}
}

function getCachedPlaylist(imdbId) {
  const cached = playlistCache[imdbId];
  if (!cached) return null;

  if (Date.now() - cached.cachedAt > CACHE_EXPIRY) {
    console.log(`⏰ Cache expired for ${imdbId}`);
    delete playlistCache[imdbId];
    saveCache();
    return null;
  }
  
  return cached;
}

function cachePlaylist(imdbId, playlistId, type = "movie", seasons = null) {

  if (!imdbId || !imdbId.startsWith('tt')) {
    console.log(`⚠️ Invalid IMDB ID, not caching: ${imdbId}`);
    return;
  }

  if (type === "series" && seasons) {
    if (!Array.isArray(seasons) || seasons.length === 0) {
      console.log(`⚠️ Invalid seasons data, not caching: ${imdbId}`);
      return;
    }

    const validSeasons = seasons.every(s => s.seasonId && s.seasonNum);
    if (!validSeasons) {
      console.log(`⚠️ Invalid season entries, not caching: ${imdbId}`);
      return;
    }
  }

  if (type === "movie" && !playlistId) {
    console.log(`⚠️ No playlistId for movie, not caching: ${imdbId}`);
    return;
  }
  
  playlistCache[imdbId] = { playlistId, type, seasons, cachedAt: Date.now() };
  saveCache();
  console.log(`💾 Cached: ${imdbId} -> ${type === "series" ? seasons.length + " seasons" : playlistId}`);
}

function clearCache(imdbId = null) {
  if (imdbId) {
    delete playlistCache[imdbId];
    console.log(`🗑️ Cleared cache for ${imdbId}`);
  } else {
    playlistCache = {};
    console.log(`🗑️ Cleared all cache`);
  }
  saveCache();
}

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

      if (imdbId) {
        const exactMatch = data.results.find(p => p.imdb_id === imdbId);
        if (exactMatch) {
          console.log(`✅ Found exact IMDB match: ${exactMatch.id} - ${exactMatch.title}`);
          return exactMatch;
        }
      }

      console.log(`✅ Found: ${data.results[0].id} - ${data.results[0].title}`);
      return data.results[0];
    }
    
    return null;
  } catch (error) {
    console.error("StreamWide search error:", error.message);
    return null;
  }
}

const STREAMWIDE_API = "https://120e0b2c-b7e9-466f-ba0f-8ca6c6d10dd6.streamwide.tv/api/v1";
let streamwideToken = null;
let streamwideRefreshToken = null;
let tokenExpiry = 0;

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
let isLoggingIn = false; // Prevent concurrent login attempts
let isConnecting = false; // Prevent concurrent connection attempts

function loadSession() {
  try {

    if (process.env.TELEGRAM_SESSION) {
      console.log("📦 Loading session from ENV");
      return process.env.TELEGRAM_SESSION;
    }

    if (fs.existsSync(SESSION_FILE)) {
      console.log("📦 Loading session from file");
      return fs.readFileSync(SESSION_FILE, "utf8").trim();
    }
  } catch (e) {}
  return "";
}

function saveSession(session) {
  try {

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

  if (isConnecting) {
    console.log("⏳ Connection already in progress, waiting...");

    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 1000));
      if (!isConnecting && client && isConnected) {
        return client;
      }
    }
    throw new Error("Connection timeout - another connection attempt is in progress");
  }

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

  isConnecting = true;
  
  try {
    const savedSession = loadSession();
    const stringSession = new StringSession(savedSession);

    let clientOptions = getClientOptions();
    client = new TelegramClient(stringSession, apiId, apiHash, clientOptions);

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
    console.error("Connection error:", e.message);
    client = null;
    isConnected = false;

    if (e.message && (e.message.includes("AUTH_KEY_DUPLICATED") || e.message.includes("AUTH_KEY_UNREGISTERED"))) {
      console.log("⚠️ Session invalid. Clearing session...");
      if (fs.existsSync(SESSION_FILE)) {
        fs.unlinkSync(SESSION_FILE);
        console.log("🗑️ Old session file deleted");
      }
      throw new Error("Session invalid. Please login again with POST /api/telegram/login");
    }

    if (e.message && e.message.includes("ETIMEDOUT")) {
      console.log("⏱️ Connection timeout. Check if your proxy (V2Ray/Clash) is running.");
      throw new Error("Connection timeout. Make sure your proxy is running on " + 
        (socksProxyHost || "127.0.0.1") + ":" + (socksProxyPort || 10808));
    }
    
    throw e;
  } finally {
    isConnecting = false;
  }
}

async function doLogin() {

  if (isLoggingIn) {
    console.log("⏳ Login already in progress...");
    throw new Error("Login already in progress. Please wait.");
  }
  
  isLoggingIn = true;
  
  try {
    await initClient();
    
    if (await client.isUserAuthorized()) {
      console.log("✅ Already logged in");
      isConnected = true;
      return true;
    }

    console.log("🔐 Starting Telegram login...");
    console.log("📱 Phone:", phone);

    await client.start({
      phoneNumber: phone,
      password: async () => {
        console.log("🔑 2FA password required");
        return twoFaPassword;
      },
      phoneCode: async () => {
        console.log("📱 Check your Telegram for the code!");
        console.log("💡 Create file 'data/telegram_code.txt' with the code");
        
        const codeFile = path.join(__dirname, "../data/telegram_code.txt");

        for (let i = 0; i < 60; i++) {
          await new Promise(r => setTimeout(r, 2000));
          if (fs.existsSync(codeFile)) {
            const code = fs.readFileSync(codeFile, "utf8").trim();
            if (code && code.length > 0) {
              fs.unlinkSync(codeFile);
              console.log("✅ Code received:", code);
              return code;
            }
          }
        }
        throw new Error("Timeout waiting for code (2 minutes)");
      },
      onError: (err) => {
        console.error("Login error:", err.message);

      },
    });

    const session = client.session.save();
    saveSession(session);
    isConnected = true;
    console.log("✅ Telegram: Login successful!");
    console.log("💡 Add to .env: TELEGRAM_SESSION=" + session);
    return true;
  } catch (error) {
    console.error("❌ Login failed:", error.message);
    isConnected = false;
    throw error;
  } finally {
    isLoggingIn = false;
  }
}

router.get("/status", async (req, res) => {
  try {

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

router.delete("/cache/:imdbId?", (req, res) => {
  const { imdbId } = req.params;
  clearCache(imdbId || null);
  res.json({ success: true, message: imdbId ? `Cleared cache for ${imdbId}` : "Cleared all cache" });
});

router.get("/cache", (req, res) => {
  const entries = Object.entries(playlistCache).map(([id, data]) => ({
    imdbId: id,
    type: data.type,
    seasons: data.seasons?.length || 0,
    cachedAt: new Date(data.cachedAt).toISOString(),
    age: Math.round((Date.now() - data.cachedAt) / 1000 / 60) + " minutes"
  }));
  res.json({ success: true, count: entries.length, entries });
});

router.post("/login", async (req, res) => {
  try {

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

  const user = {
    id: parseInt(userId),
    first_name: firstName,
    last_name: lastName,
    username: username,
    language_code: "en",
    allows_write_to_pm: true,
  };

  const params = {
    auth_date: authDate.toString(),
    query_id: `AAH${userId}AQAAAA`,
    user: JSON.stringify(user),
  };

  const dataCheckString = Object.keys(params)
    .sort()
    .map(key => `${key}=${params[key]}`)
    .join("\n");





  const initData = Object.keys(params)
    .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
    .join("&");

  console.log(`📱 Generated initData for user ${userId}`);
  return { initData, userId, user };
}

async function authenticateStreamWide(initDataRaw = null) {
  if (streamwideToken && Date.now() < tokenExpiry) {
    return streamwideToken;
  }

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

try {
  const savedRefresh = fs.readFileSync(path.join(__dirname, "../data/streamwide_refresh.txt"), "utf8").trim();
  if (savedRefresh) {
    streamwideRefreshToken = savedRefresh;
    console.log("📦 Loaded saved refresh token");
  }
} catch(e) {}

async function fetchStreamWideVideos(playlistId, token = null) {
  console.log(`📥 Fetching videos for playlist: ${playlistId}`);
  
  try {
    let authToken = token || streamwideToken;

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

        const urlMatch = video.url.match(/\/([^\/]+)$/);
        const fileName = urlMatch ? urlMatch[1] : (video.file_name || "");

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

  const seMatch = fileName.match(/S(\d{1,2})E(\d{1,3})/i);
  if (seMatch) {
    result.season = parseInt(seMatch[1]);
    result.episode = parseInt(seMatch[2]);
  }

  const qualityMatch = fileName.match(/(\d{3,4})p/i);
  if (qualityMatch) {
    result.quality = qualityMatch[1];
  }

  const codecMatch = fileName.match(/(x26[45]|hevc|h\.?26[45])/i);
  if (codecMatch) {
    let codec = codecMatch[1].toUpperCase().replace('H.', 'H');
    if (codec === 'HEVC') codec = 'x265';
    if (codec === 'H265') codec = 'x265';
    if (codec === 'H264') codec = 'x264';
    result.codec = codec;
  }

  if (fileName.toLowerCase().includes('10bit') || fileName.includes('10-bit')) {
    result.codec = result.codec ? `${result.codec} 10bit` : '10bit';
  }

  const sourceMatch = fileName.match(/(bluray|web-?dl|webrip|hdtv|dvdrip|bdrip)/i);
  if (sourceMatch) {
    result.source = sourceMatch[1].toUpperCase().replace('WEBDL', 'WEB-DL');
  }

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

async function searchPlaylistByImdb(imdbId) {
  console.log(`🔍 Searching StreamWide for IMDB: ${imdbId}`);
  
  try {

    if (!streamwideToken || Date.now() >= tokenExpiry) {
      await authenticateStreamWide();
    }

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

      const exactMatch = data.results.find(p => p.imdb_id === imdbId);
      if (exactMatch) {
        console.log(`✅ Found exact match: ${exactMatch.id} - ${exactMatch.title}`);
        return exactMatch;
      }

      console.log(`⚠️ No exact match in page 1, checking more...`);

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

router.get("/get-links", async (req, res) => {
  try {
    const { imdbId, title } = req.query;
    
    if (!imdbId) {
      return res.json({ success: false, error: "IMDB ID required" });
    }

    const cleanId = imdbId.startsWith("tt") ? imdbId : `tt${imdbId}`;

    // 🔥 اول از StreamDB بگیر (بدون نیاز به تلگرام!)
    const streamItem = StreamDB.find(cleanId);
    if (streamItem && streamItem.id) {
      console.log(`✅ Found in StreamDB: ${cleanId} -> ${streamItem.id}`);
      
      const isSeries = streamItem.type === "TVS";
      
      if (isSeries) {
        // سریال - اول کش چک کن
        console.log("📺 Series detected, checking cache...");
        
        const cached = getCachedPlaylist(cleanId);
        if (cached && cached.type === "series" && cached.seasons && cached.seasons.length > 0) {
          if (!streamwideToken || Date.now() >= tokenExpiry) {
            try { await authenticateStreamWide(); } catch(e) {}
          }
          const downloads = await fetchStreamWideVideos(cached.seasons[0].seasonId);
          if (downloads.length > 0) {
            return res.json({
              success: true,
              imdbId: cleanId,
              type: "series",
              title: streamItem.title,
              poster: streamItem.poster,
              seasons: cached.seasons,
              currentSeason: cached.seasons[0].seasonNum,
              downloads,
              fromCache: true,
              fromStreamDB: true,
            });
          }
        }
        
        // کش نداشت - باید از تلگرام فصل‌ها رو بگیریم (فقط یه بار!)
        console.log("📺 No cache, need Telegram for season IDs (one time only)...");
        // ادامه به قسمت تلگرام...
        
      } else {
        // فیلم - مستقیم UUID داریم!
        if (!streamwideToken || Date.now() >= tokenExpiry) {
          try {
            await authenticateStreamWide();
          } catch(e) {
            console.log("Token refresh failed:", e.message);
          }
        }
        
        const downloads = await fetchStreamWideVideos(streamItem.id);
        // حتی اگه downloads خالی باشه، برگردون - نرو تلگرام!
        cachePlaylist(cleanId, streamItem.id, "movie");
        return res.json({
          success: downloads.length > 0,
          imdbId: cleanId,
          type: "movie",
          title: streamItem.title,
          poster: streamItem.poster,
          playlistId: streamItem.id,
          downloads,
          fromStreamDB: true,
        });
      }
    }

    // اگه توی StreamDB نبود یا سریال بود، ادامه بده...
    if (!streamwideToken || Date.now() >= tokenExpiry) {
      console.log("🔄 Refreshing token...");
      try {
        await authenticateStreamWide();
      } catch(e) {
        console.log("Token refresh failed:", e.message);
      }
    }

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

    // اگه سریال بود و کش نداشت، برو تلگرام برای گرفتن فصل‌ها
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
          
          // چک کن که نتیجه واقعاً مربوط به این IMDB هست
          const resultTitle = firstResult.title || '';
          const resultDesc = firstResult.description || '';
          const resultMessage = firstResult.sendMessage?.message || '';
          
          // اگه پیام شامل "جستجو" یا "درخواست" باشه، یعنی پیدا نشده
          if (resultMessage.includes('جستجو') || resultMessage.includes('درخواست') || 
              resultMessage.includes('پیدا نشد') || resultMessage.includes('اضافه')) {
            console.log("❌ Bot says: not found");
            return res.json({ success: false, error: "این فیلم/سریال در دیتابیس موجود نیست" });
          }

          let moviePlaylistId = null;
          let seasons = [];
          
          if (firstResult.sendMessage && firstResult.sendMessage.replyMarkup && firstResult.sendMessage.replyMarkup.rows) {
            console.log("📋 Found buttons in inline result (no message sent!)");
            console.log(`📊 Total rows: ${firstResult.sendMessage.replyMarkup.rows.length}`);
            let totalButtons = 0;
            for (const row of firstResult.sendMessage.replyMarkup.rows) {
              totalButtons += row.buttons?.length || 0;
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
            console.log(`📊 Total buttons: ${totalButtons}, Seasons found: ${seasons.length}`);
          }

          if (seasons.length > 0) {
            // فقط اگه واقعاً فصل پیدا شد کش کن
            cachePlaylist(cleanId, null, "series", seasons);
            const downloads = await fetchStreamWideVideos(seasons[0].seasonId);
            if (downloads.length === 0) {
              // اگه ویدیو نداشت، کش رو پاک کن
              clearCache(cleanId);
              return res.json({ success: false, error: "ویدیویی یافت نشد" });
            }
            return res.json({
              success: true,
              imdbId: cleanId,
              type: "series",
              seasons,
              currentSeason: seasons[0].seasonNum,
              downloads,
            });
          }
          
          if (moviePlaylistId) {
            const downloads = await fetchStreamWideVideos(moviePlaylistId);
            if (downloads.length === 0) {
              return res.json({ success: false, error: "ویدیویی یافت نشد" });
            }
            // فقط اگه ویدیو داشت کش کن
            cachePlaylist(cleanId, moviePlaylistId, "movie");
            return res.json({
              success: true,
              imdbId: cleanId,
              type: "movie",
              playlistId: moviePlaylistId,
              downloads,
            });
          }

          console.log("📨 Sending message to bot...");
          
          // ذخیره ID آخرین پیام قبل از ارسال
          const beforeMessages = await client.getMessages(bot, { limit: 1 });
          const lastMsgIdBefore = beforeMessages[0]?.id || 0;
          
          await client.invoke(
            new Api.messages.SendInlineBotResult({
              peer: bot,
              queryId: inlineResults.queryId,
              id: firstResult.id,
              randomId: BigInt(Math.floor(Math.random() * 1e15)),
            })
          );

          let latestMsg = null;
          for (let attempt = 1; attempt <= 5; attempt++) {
            console.log(`⏳ Waiting for bot response... (attempt ${attempt}/5)`);
            await new Promise(r => setTimeout(r, 3000));
            
            const messages = await client.getMessages(bot, { limit: 5 });

            for (const msg of messages) {
              // فقط پیام‌های جدیدتر از قبل از ارسال رو چک کن
              if (!msg || msg.id <= lastMsgIdBefore) continue;
              if (msg && msg.replyMarkup && msg.replyMarkup.rows && msg.replyMarkup.rows.length > 0) {

                const hasRelevantButtons = msg.replyMarkup.rows.some(row => 
                  row.buttons.some(btn => {
                    const url = btn.url || '';
                    return url.includes("seasonID=") || url.includes("uniqueID=") || url.includes("playlist=");
                  })
                );
                
                if (hasRelevantButtons) {
                  latestMsg = msg;
                  console.log(`✅ Got bot response with buttons on attempt ${attempt}`);
                  break;
                }
              }
            }
            
            if (latestMsg) break;
          }

          if (latestMsg && latestMsg.replyMarkup && latestMsg.replyMarkup.rows) {
            // چک کن پیام بات مربوط به همین فیلم/سریال هست
            const msgText = latestMsg.message || '';
            if (msgText.includes('جستجو') || msgText.includes('درخواست') || 
                msgText.includes('پیدا نشد') || msgText.includes('اضافه')) {
              console.log("❌ Bot response says: not found");
              return res.json({ success: false, error: "این فیلم/سریال در دیتابیس موجود نیست" });
            }
            
            console.log(`📝 Processing bot response`);
            console.log(`📊 Total rows: ${latestMsg.replyMarkup.rows.length}`);
            let totalButtons = 0;
            
            for (const row of latestMsg.replyMarkup.rows) {
              totalButtons += row.buttons?.length || 0;
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
            console.log(`📊 Total buttons: ${totalButtons}, Seasons found: ${seasons.length}`);
          } else {
            console.log("⚠️ No response from bot after 15 seconds");
          }

          if (seasons.length > 0) {
            const downloads = await fetchStreamWideVideos(seasons[0].seasonId);
            if (downloads.length === 0) {
              return res.json({ success: false, error: "ویدیویی یافت نشد" });
            }
            cachePlaylist(cleanId, null, "series", seasons);
            return res.json({
              success: true,
              imdbId: cleanId,
              type: "series",
              seasons,
              currentSeason: seasons[0].seasonNum,
              downloads,
            });
          }

          if (moviePlaylistId) {
            const downloads = await fetchStreamWideVideos(moviePlaylistId);
            if (downloads.length === 0) {
              return res.json({ success: false, error: "ویدیویی یافت نشد" });
            }
            cachePlaylist(cleanId, moviePlaylistId, "movie");
            return res.json({
              success: true,
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

      try {
        const refreshFile = path.join(__dirname, "../data/streamwide_refresh.txt");
        fs.writeFileSync(refreshFile, refresh);
        console.log("💡 Add to .env: STREAMWIDE_REFRESH_TOKEN=" + refresh.substring(0, 50) + "...");
      } catch(e) {}
      console.log("✅ Refresh token set manually");
    }

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

router.get("/fetch-videos", async (req, res) => {
  try {
    const { playlistId, token, raw } = req.query;
    
    if (!playlistId) {
      return res.json({ success: false, error: "Playlist ID required" });
    }

    let authToken = token || streamwideToken;

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

        const urlMatch = video.url.match(/\/([^\/]+)$/);
        const fileName = urlMatch ? decodeURIComponent(urlMatch[1]) : (video.file_name || "");

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
