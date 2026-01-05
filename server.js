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

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const searchRoutes = require("./routes/search");
const imdbRoutes = require("./routes/imdb");
const telegramRoutes = require("./routes/telegram");
const subtitleRoutes = require("./routes/subtitle");
app.use("/api", searchRoutes);
app.use("/imdb", imdbRoutes);
app.use("/telegram", telegramRoutes);
app.use("/subtitle", subtitleRoutes);

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.get("/stream", (req, res) => {
  const url = req.query.url;
  if (!url) return res.status(400).send("URL required");

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

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(
    `📧 Username: ${process.env.FARSILAND_USERNAME ? "Set" : "NOT SET"}`
  );
  console.log(
    `🔑 Password: ${process.env.FARSILAND_PASSWORD ? "Set" : "NOT SET"}`
  );
});
