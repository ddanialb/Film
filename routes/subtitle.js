const express = require("express");
const router = express.Router();
const axios = require("axios");
const { SocksClient } = require("socks");
const https = require("https");
const tls = require("tls");
const unzipper = require("unzipper");

const PROXY_HOST = process.env.SOCKS_PROXY_HOST || "";
const PROXY_PORT = parseInt(process.env.SOCKS_PROXY_PORT || "0");
const USE_PROXY = PROXY_HOST && PROXY_PORT > 0;

const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

let httpsAgent = null;

if (USE_PROXY) {
  console.log(`🔌 Using SOCKS proxy: ${PROXY_HOST}:${PROXY_PORT}`);
  const socksOptions = {
    host: PROXY_HOST,
    port: PROXY_PORT,
    type: 5,
  };

  httpsAgent = new https.Agent({
    keepAlive: true,
  });

  httpsAgent.createConnection = function(options, callback) {
    SocksClient.createConnection({
      proxy: socksOptions,
      command: "connect",
      destination: {
        host: options.host,
        port: options.port || 443,
      },
    }).then(({ socket }) => {
      const tlsSocket = tls.connect({
        socket: socket,
        servername: options.host,
        ...options,
      });
      callback(null, tlsSocket);
    }).catch(callback);
  };
} else {
  console.log(`🌐 No proxy configured, using direct connection`);
}

async function fetchHtml(url, throwOnError = false) {
  try {
    const config = {
      timeout: 15000,
      headers: {
        "User-Agent": USER_AGENT,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
      validateStatus: (status) => status < 500,
    };
    if (httpsAgent) {
      config.httpsAgent = httpsAgent;
    }
    const res = await axios.get(url, config);
    if (res.status >= 400) {
      console.log(`⚠️ HTTP ${res.status} for ${url}`);
      return null;
    }
    return res.data;
  } catch (e) {
    console.log(`⚠️ Fetch error for ${url}: ${e.message}`);
    if (throwOnError) throw e;
    return null;
  }
}

async function fetchBinary(url) {
  const config = {
    timeout: 30000,
    responseType: "arraybuffer",
    headers: { "User-Agent": USER_AGENT },
  };
  if (httpsAgent) {
    config.httpsAgent = httpsAgent;
  }
  const res = await axios.get(url, config);
  return Buffer.from(res.data);
}

router.get("/search", async (req, res) => {
  try {
    const { imdbId, season, title } = req.query;
    if (!imdbId) return res.status(400).json({ error: "imdbId required" });

    const seasonNum = season ? parseInt(season) : null;

    const ordinals = ['', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth', 
      'eleventh', 'twelfth', 'thirteenth', 'fourteenth', 'fifteenth', 'sixteenth', 'seventeenth', 'eighteenth', 'nineteenth', 'twentieth',
      'twenty-first', 'twenty-second', 'twenty-third', 'twenty-fourth', 'twenty-fifth', 'twenty-sixth', 'twenty-seventh', 'twenty-eighth', 'twenty-ninth', 'thirtieth'];
    
    const targetOrdinal = seasonNum && seasonNum <= 30 ? ordinals[seasonNum] : null;


    let searchQuery = imdbId;
    const isTvShow = seasonNum && seasonNum >= 1 && title && targetOrdinal;
    
    if (isTvShow) {

      const cleanTitle = title.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
      searchQuery = `${cleanTitle} ${targetOrdinal} season`;
      console.log(`🔍 Searching TV show: "${searchQuery}"`);
    } else {
      console.log(`🔍 Searching movie by IMDB: ${imdbId}`);
    }

    const searchUrl = `https://subf2m.co/subtitles/searchbytitle?query=${encodeURIComponent(searchQuery)}&l=`;
    console.log(`🌐 Search URL: ${searchUrl}`);
    let html = await fetchHtml(searchUrl);

    if (!html && isTvShow) {
      console.log(`⚠️ Title search failed, trying IMDB ID...`);
      const fallbackUrl = `https://subf2m.co/subtitles/searchbytitle?query=${imdbId}&l=`;
      html = await fetchHtml(fallbackUrl);
    }
    
    if (!html) {
      return res.json({ success: false, error: "Search failed", languages: [] });
    }

    const linkRegex = /href=["'](\/subtitles\/[a-z0-9-]+)["']/gi;
    const links = [];
    let m;
    while ((m = linkRegex.exec(html)) !== null) {
      if (!m[1].includes("searchbytitle") && !links.includes(m[1])) {
        links.push(m[1]);
      }
    }
    
    console.log(`📋 Found ${links.length} subtitle links`);
    
    if (links.length === 0) {
      return res.json({ success: false, error: "No results found", languages: [] });
    }

    const cardinals = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
      'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty'];

    function getSeasonFromLink(link) {
      const lower = link.toLowerCase();

      for (let i = 1; i <= 30; i++) {

        const regex = new RegExp(`-{1,2}${ordinals[i]}-season($|[^a-z])`);
        if (regex.test(lower)) return i;
      }

      for (let i = 1; i <= 20; i++) {
        const regex = new RegExp(`-${cardinals[i]}-season($|[^a-z])`);
        if (regex.test(lower)) return i;
      }

      const numMatch = lower.match(/-season-(\d+)/);
      if (numMatch) return parseInt(numMatch[1]);
      
      return null;
    }

    function getShowBaseName(link) {
      const lower = link.toLowerCase();
      const prefix = '/subtitles/';

      for (let i = 1; i <= 30; i++) {

        const match = lower.match(new RegExp(`^/subtitles/(.+?)-{1,2}${ordinals[i]}-season`));
        if (match) {
          return match[1];
        }
      }

      for (let i = 1; i <= 20; i++) {
        const pattern = `-${cardinals[i]}-season`;
        const idx = lower.indexOf(pattern);
        if (idx !== -1) {
          return link.substring(prefix.length, idx);
        }
      }

      const numIdx = lower.indexOf('-season-');
      if (numIdx !== -1) {
        return link.substring(prefix.length, numIdx);
      }
      
      return null;
    }

    const linkInfo = links.map(link => ({
      link,
      season: getSeasonFromLink(link),
      baseName: getShowBaseName(link)
    }));
    
    console.log('Link analysis:', linkInfo.map(l => `S${l.season}: ${l.link}`).join(', '));

    const showBaseName = linkInfo.find(l => l.baseName)?.baseName || null;
    console.log(`📺 Show base name: ${showBaseName || 'unknown'}`);

    const urlsToTry = [];
    
    if (seasonNum && targetOrdinal) {
      console.log(`🎯 Looking for season ${seasonNum} (${targetOrdinal})`);

      const exactMatch = linkInfo.find(l => l.season === seasonNum);
      if (exactMatch) {
        urlsToTry.push(exactMatch.link);
        console.log(`✅ Found in search results: ${exactMatch.link}`);
      }

      if (showBaseName) {

        const constructed1 = `/subtitles/${showBaseName}-${targetOrdinal}-season`;
        if (!urlsToTry.includes(constructed1)) {
          urlsToTry.push(constructed1);
        }

        const constructed2 = `/subtitles/${showBaseName}--${targetOrdinal}-season`;
        if (!urlsToTry.includes(constructed2)) {
          urlsToTry.push(constructed2);
        }
      }


    } else {

      for (const link of links) {
        if (!urlsToTry.includes(link)) {
          urlsToTry.push(link);
        }
      }
    }
    
    console.log(`📋 URLs to try: ${urlsToTry.length}`);

    let pageHtml = null;
    let finalUrl = null;
    let actualSeason = null;

    const priorityUrls = urlsToTry.slice(0, 3);
    const fallbackUrls = urlsToTry.slice(3);

    const tryUrl = async (link) => {
      const url = `https://subf2m.co${link}`;
      const html = await fetchHtml(url); // Returns null on error
      if (!html) {
        console.log(`❌ No HTML returned for ${link}`);
        return null;
      }
      console.log(`📄 Got ${html.length} bytes for ${link}`);
      if (html.length > 5000) {
        const hasLanguages = /<span\s+class=["']count["']>\d+<\/span>/i.test(html);
        if (hasLanguages) {
          return { link, url, html, season: getSeasonFromLink(link) };
        } else {
          console.log(`⚠️ No languages found in ${link}`);
        }
      }
      return null;
    };

    if (priorityUrls.length > 0) {
      console.log(`📄 Trying priority URLs: ${priorityUrls.join(', ')}`);
      const results = await Promise.all(priorityUrls.map(tryUrl));
      const success = results.find(r => r !== null);
      if (success) {

        if (!seasonNum || success.season === seasonNum) {
          pageHtml = success.html;
          finalUrl = success.url;
          actualSeason = success.season;
          console.log(`✅ Found exact match: ${success.link}`);
        } else {

          if (!pageHtml) {
            pageHtml = success.html;
            finalUrl = success.url;
            actualSeason = success.season;
            console.log(`⚠️ Found fallback: ${success.link} (Season ${success.season})`);
          }
        }
      }
    }

    if (!pageHtml && fallbackUrls.length > 0) {

      const limitedFallbacks = fallbackUrls.slice(0, 6);
      console.log(`📄 Trying ${limitedFallbacks.length} fallback URLs`);
      const results = await Promise.all(limitedFallbacks.map(tryUrl));
      const success = results.find(r => r !== null);
      if (success) {
        pageHtml = success.html;
        finalUrl = success.url;
        actualSeason = success.season;
        console.log(`✅ Found from fallback: ${success.link}`);
      }
    }
    
    if (!pageHtml) {
      return res.json({ 
        success: false, 
        error: "Could not fetch subtitle page", 
        languages: [],
        linksFound: links.length
      });
    }

    const langRegex = /<a\s+href=["']([^"']+)["'][^>]*>([^<]+)<span\s+class=["']count["']>(\d+)<\/span>/gi;
    const languages = [];
    while ((m = langRegex.exec(pageHtml)) !== null) {
      const url = m[1];
      const code = url.split("/").pop();
      if (!languages.find(l => l.code === code)) {
        languages.push({
          url: `https://subf2m.co${url}`,
          code: code,
          name: m[2].trim(),
          count: parseInt(m[3]),
        });
      }
    }
    
    console.log(`🌐 Found ${languages.length} languages`);

    res.json({ 
      success: true, 
      pageUrl: finalUrl, 
      languages, 
      selectedSeason: season || null,
      actualSeason: actualSeason,
      linksFound: links.length 
    });
  } catch (error) {
    console.error("Subtitle search error:", error);
    res.status(500).json({ error: error.message });
  }
});

router.get("/list", async (req, res) => {
  try {
    const { url } = req.query;
    if (!url) return res.status(400).json({ error: "url required" });

    console.log(`📋 Fetching subtitle list: ${url}`);
    const html = await fetchHtml(url);

    const dlRegex = /class=["']download[^"']*["']\s+href=["']([^"']+)["']/gi;
    const downloads = [];
    let m;
    while ((m = dlRegex.exec(html)) !== null) {
      if (!downloads.includes(m[1])) {
        downloads.push(m[1]);
      }
    }

    if (downloads.length === 0) {
      const altDlRegex = /href=["']([^"']+)["'][^>]*class=["']download/gi;
      while ((m = altDlRegex.exec(html)) !== null) {
        if (!downloads.includes(m[1])) {
          downloads.push(m[1]);
        }
      }
    }
    
    console.log(`📥 Found ${downloads.length} download links`);
    
    const subtitles = [];
    
    for (const dlUrl of downloads) {
      const dlIndex = html.indexOf(dlUrl);
      if (dlIndex === -1) continue;
      
      let startIndex = html.lastIndexOf("<li class", dlIndex);
      if (startIndex === -1) startIndex = html.lastIndexOf("<li", dlIndex);
      if (startIndex === -1) continue;
      
      let endIndex = html.indexOf("</li>", dlIndex);
      if (endIndex === -1) continue;
      
      const itemHtml = html.substring(startIndex, endIndex + 5);

      const langMatch = itemHtml.match(/<span\s+class=["']language[^"']*["']>([^<]+)<\/span>/i);
      const language = langMatch ? langMatch[1].trim() : "";

      const ratingMatch = itemHtml.match(/<span\s+class=["']rate\s+([^"']+)["']/i);
      const rating = ratingMatch ? ratingMatch[1].trim() : "not rated";

      const releases = [];
      const scrollMatch = itemHtml.match(/<ul\s+class=["']scrolllist["']>([\s\S]*?)<\/ul>/i);
      if (scrollMatch) {
        const liRegex = /<li>([^<]+)<\/li>/gi;
        let lm;
        while ((lm = liRegex.exec(scrollMatch[1])) !== null) {
          releases.push(lm[1].trim());
        }
      }

      const authorMatch = itemHtml.match(/<a\s+href=["']\/u\/\d+["']>([^<]+)<\/a>/i);
      const author = authorMatch ? authorMatch[1].trim() : "";

      const commentMatch = itemHtml.match(/<p>([^<]*)<\/p>/i);
      const comment = commentMatch ? commentMatch[1].trim() : "";
      
      subtitles.push({
        language,
        rating,
        releases,
        author,
        comment,
        downloadUrl: dlUrl.startsWith('http') ? dlUrl : 'https://subf2m.co' + dlUrl
      });
    }
    
    console.log(`✅ Parsed ${subtitles.length} subtitles`);

    res.json({ success: true, subtitles });
  } catch (error) {
    console.error("Subtitle list error:", error);
    res.status(500).json({ error: error.message });
  }
});

router.get("/download-page", async (req, res) => {
  try {
    const { url } = req.query;
    if (!url) return res.status(400).json({ error: "url required" });

    console.log(`📥 Fetching download page: ${url}`);
    const html = await fetchHtml(url);

    const patterns = [
      /id=["']downloadButton["'][^>]*href=["']([^"']+)["']/i,
      /href=["']([^"']+)["'][^>]*id=["']downloadButton["']/i,
      /href=["'](\/subtitles\/[^"']+\/download)["']/i,
      /class=["']download[^"']*["'][^>]*href=["']([^"']+)["']/i,
      /href=["']([^"']+)["'][^>]*class=["']download/i,
      /<a[^>]+download[^>]+href=["']([^"']+)["']/i,
    ];
    
    let downloadMatch = null;
    for (const pattern of patterns) {
      downloadMatch = html.match(pattern);
      if (downloadMatch) {
        console.log(`✅ Found download link with pattern: ${pattern}`);
        break;
      }
    }
    
    if (!downloadMatch) {
      console.log(`⚠️ No download link found in page`);
      return res.json({ success: false, error: "Download link not found" });
    }

    const downloadLink = downloadMatch[1].startsWith("http") 
      ? downloadMatch[1] 
      : `https://subf2m.co${downloadMatch[1]}`;

    console.log(`✅ Download link: ${downloadLink}`);
    res.json({ success: true, downloadLink });
  } catch (error) {
    console.error("Download page error:", error);
    res.status(500).json({ error: error.message });
  }
});

const subtitleCache = new Map();
const CACHE_TTL = 60 * 1000; // 1 minute only

function cleanCache() {
  const now = Date.now();
  for (const [key, value] of subtitleCache.entries()) {
    if (now - value.timestamp > CACHE_TTL) {
      subtitleCache.delete(key);
      console.log(`🗑️ Cleaned cache: ${key}`);
    }
  }
}

router.get("/extract", async (req, res) => {
  try {
    const { url } = req.query;
    if (!url) return res.status(400).json({ error: "url required" });

    const zipBuffer = await fetchBinary(url);
    
    if (zipBuffer[0] !== 0x50 || zipBuffer[1] !== 0x4B) {
      return res.status(400).json({ error: "Not a valid ZIP file" });
    }

    const directory = await unzipper.Open.buffer(zipBuffer);
    const subtitleFiles = [];
    const validExtensions = [".srt", ".ass", ".ssa", ".vtt", ".sub"];
    
    directory.files.forEach((file, index) => {
      if (file.type === "File") {
        const ext = file.path.toLowerCase().slice(file.path.lastIndexOf("."));
        if (validExtensions.includes(ext)) {
          subtitleFiles.push({
            index,
            name: file.path,
            size: file.uncompressedSize,
            extension: ext,
          });
        }
      }
    });

    const cacheKey = Buffer.from(url).toString("base64").slice(0, 32);
    subtitleCache.set(cacheKey, { buffer: zipBuffer, timestamp: Date.now() });
    cleanCache();

    res.json({ success: true, cacheKey, files: subtitleFiles });
  } catch (error) {
    console.error("Extract error:", error);
    res.status(500).json({ error: error.message });
  }
});

router.get("/file", async (req, res) => {
  try {
    const { cacheKey, index } = req.query;
    if (!cacheKey || index === undefined) {
      return res.status(400).json({ error: "cacheKey and index required" });
    }

    const cached = subtitleCache.get(cacheKey);
    if (!cached) {
      return res.status(404).json({ error: "Cache expired, please re-download" });
    }

    const directory = await unzipper.Open.buffer(cached.buffer);
    const file = directory.files[parseInt(index)];
    
    if (!file) {
      return res.status(404).json({ error: "File not found" });
    }

    const content = await file.buffer();
    let text = content.toString("utf-8");
    const ext = file.path.toLowerCase().slice(file.path.lastIndexOf("."));
    
    if (ext === ".srt") {
      text = srtToVtt(text);
    }

    subtitleCache.delete(cacheKey);
    console.log(`🗑️ Deleted cache after serving: ${cacheKey}`);

    res.setHeader("Content-Type", "text/vtt; charset=utf-8");
    res.send(text);
  } catch (error) {
    console.error("File error:", error);
    res.status(500).json({ error: error.message });
  }
});

function srtToVtt(srt) {
  let vtt = "WEBVTT\n\n";
  srt = srt.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const blocks = srt.trim().split(/\n\n+/);
  
  blocks.forEach((block) => {
    const lines = block.split("\n");
    if (lines.length >= 2) {
      let timestampIndex = 0;
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes("-->")) {
          timestampIndex = i;
          break;
        }
      }
      const timestamp = lines[timestampIndex].replace(/,/g, ".");
      const text = lines.slice(timestampIndex + 1).join("\n");
      if (timestamp && text) {
        vtt += `${timestamp}\n${text}\n\n`;
      }
    }
  });
  return vtt;
}

module.exports = router;
