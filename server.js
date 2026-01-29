require("dotenv").config();

if (typeof global.File === "undefined") {
  global.File = class File {};
}

const express = require("express");
const cors = require("cors");
const path = require("path");
const http = require("http");
const https = require("https");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 3000;

let activeServers = [];
let lastServerCheck = 0;
let currentServerIndex = 0;
const SERVER_CHECK_INTERVAL = 3 * 60 * 1000;

async function testServer(serverNum) {
  try {
    const serverUrl = `https://ant.out.p${serverNum}.streamwide.tv/`;
    console.log(`🔍 Testing server ${serverNum}...`);
    
    const response = await axios.get(serverUrl, {
      timeout: 2000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    
    console.log(`✅ Server ${serverNum} responded with status ${response.status}`);
    return true;
    
  } catch (error) {
    if (error.response && error.response.status) {
      console.log(`✅ Server ${serverNum} responded with HTTP ${error.response.status} - SERVER IS WORKING`);
      return true;
    }
    
    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND' || error.code === 'ETIMEDOUT') {
      console.log(`❌ Server ${serverNum} network error: ${error.code}`);
      return false;
    }
    
    console.log(`❌ Server ${serverNum} unknown error:`, error.message);
    return false;
  }
}

async function findActiveServers() {
  console.log('🔍 Testing servers 1-15 for availability...');
  
  const serverNumbers = Array.from({length: 15}, (_, i) => i + 1);
  
  const testPromises = serverNumbers.map(async (serverNum) => {
    const isActive = await testServer(serverNum);
    if (isActive) {
      console.log(`✅ Server ${serverNum} is active`);
    } else {
      console.log(`❌ Server ${serverNum} is down`);
    }
    return { serverNum, isActive };
  });
  
  try {
    const results = await Promise.all(testPromises);
    
    const workingServers = results
      .filter(r => r.isActive)
      .map(r => r.serverNum);
    
    activeServers = workingServers;
    console.log(`🎯 Active servers: [${workingServers.join(', ')}]`);
    
    return workingServers;
    
  } catch (error) {
    console.error('❌ Error testing servers:', error.message);
    activeServers = [];
    return [];
  }
}

function getRandomActiveServer() {
  if (activeServers.length === 0) {
    return null;
  }
  
  const serverNum = activeServers[currentServerIndex % activeServers.length];
  currentServerIndex = (currentServerIndex + 1) % activeServers.length;
  
  const serverUrl = `https://ant.out.p${serverNum}.streamwide.tv/`;
  
  return serverUrl;
}

async function checkServerIfNeeded() {
  const now = Date.now();
  
  const checkInterval = activeServers.length === 0 ? 30 * 1000 : SERVER_CHECK_INTERVAL;
  
  if (now - lastServerCheck > checkInterval) {
    lastServerCheck = now;
    await findActiveServers();
  }
  
  return getRandomActiveServer();
}

findActiveServers();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const searchRoutes = require("./routes/search");
const imdbRoutes = require("./routes/imdb");
const telegramRoutes = require("./routes/telegram");
const subtitleRoutes = require("./routes/subtitle");
const streamwideRoutes = require("./routes/streamwide");
app.use("/api", searchRoutes);
app.use("/imdb", imdbRoutes);
app.use("/telegram", telegramRoutes);
app.use("/subtitle", subtitleRoutes);
app.use("/streamwide", streamwideRoutes);

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.get("/stream", async (req, res) => {
  const url = req.query.url;
  if (!url) return res.status(400).send("URL required");

  await checkServerIfNeeded();

  const protocol = url.startsWith("https") ? https : http;
  const options = {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    },
  };

  if (req.headers.range) options.headers.Range = req.headers.range;

  const request = protocol
    .get(url, options, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        return res.redirect(
          "/stream?url=" + encodeURIComponent(response.headers.location)
        );
      }

      const headers = {
        "Content-Type": response.headers["content-type"] || "video/mp4",
        "Accept-Ranges": "bytes",
      };

      if (response.headers["content-length"])
        headers["Content-Length"] = response.headers["content-length"];
      if (response.headers["content-range"])
        headers["Content-Range"] = response.headers["content-range"];

      res.writeHead(response.statusCode, headers);
      response.pipe(res);
      req.on("close", () => response.destroy());
    })
    .on("error", (err) => {
      console.error("Stream error:", err.message);
      if (!res.headersSent) res.status(500).send("Error");
    });

  request.setTimeout(30000, () => {
    request.destroy();
    if (!res.headersSent) res.status(504).send("Timeout");
  });
});

app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.get("/active-server", async (req, res) => {
  const server = await checkServerIfNeeded();
  res.json({ 
    activeServer: server, 
    activeServers: activeServers,
    lastCheck: new Date(lastServerCheck).toISOString()
  });
});

app.get("/set-servers", async (req, res) => {
  console.log("� Manua lly setting active servers to [1,2,3,4]...");
  activeServers = [1, 2, 3, 4];
  lastServerCheck = Date.now();
  const server = getRandomActiveServer();
  res.json({ 
    activeServer: server, 
    activeServers: activeServers,
    lastCheck: new Date(lastServerCheck).toISOString()
  });
});

app.get("/test-servers", async (req, res) => {
  console.log("🔄 Force testing servers...");
  await findActiveServers();
  const server = getRandomActiveServer();
  res.json({ 
    activeServer: server, 
    activeServers: activeServers,
    lastCheck: new Date(lastServerCheck).toISOString()
  });
});

app.get("/set-servers", async (req, res) => {
  console.log("🔧 Manually setting active servers to [1,2,3,4]...");
  activeServers = [1, 2, 3, 4];
  lastServerCheck = Date.now();
  const server = getRandomActiveServer();
  res.json({ 
    activeServer: server, 
    activeServers: activeServers,
    lastCheck: new Date(lastServerCheck).toISOString()
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(
    `📧 Username: ${process.env.FARSILAND_USERNAME ? "Set" : "NOT SET"}`
  );
  console.log(
    `🔑 Password: ${process.env.FARSILAND_PASSWORD ? "Set" : "NOT SET"}`
  );
});
