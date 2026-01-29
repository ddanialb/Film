require("dotenv").config();

if (typeof global.File === "undefined") {
  global.File = class File {};
}

const express = require("express");
const cors = require("cors");
const path = require("path");
const http = require("http");
const https = require("https");

const app = express();
const PORT = process.env.PORT || 3000;

// Server testing system
let activeServer = null; // Start with null, no default
let lastServerCheck = 0;
const SERVER_CHECK_INTERVAL = 5 * 60 * 1000; // 5 minutes

async function testServer(serverUrl) {
  try {
    const response = await fetch(serverUrl);
    const data = await response.json();
    return data.detail === "Go away";
  } catch (error) {
    return false;
  }
}

async function findActiveServer() {
  console.log("🔍 Testing servers...");
  
  for (let i = 1; i <= 15; i++) {
    const serverUrl = `https://ant.out.p${i}.streamwide.tv/`;
    const isActive = await testServer(serverUrl);
    
    if (isActive) {
      activeServer = serverUrl;
      console.log(`✅ Active server found: ${serverUrl}`);
      return serverUrl;
    }
  }
  
  console.log("❌ No active server found");
  activeServer = null;
  return null;
}

async function checkServerIfNeeded() {
  const now = Date.now();
  if (now - lastServerCheck > SERVER_CHECK_INTERVAL) {
    lastServerCheck = now;
    await findActiveServer();
  }
  return activeServer;
}

// Initial server check
findActiveServer();

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

  // Check server if needed
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
  res.json({ activeServer: server, lastCheck: new Date(lastServerCheck).toISOString() });
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
