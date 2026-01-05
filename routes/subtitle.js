const express = require("express");
const router = express.Router();
const https = require("https");
const unzipper = require("unzipper");

const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// Helper to fetch HTML using https
function fetchHtml(url) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: "GET",
      headers: {
        "User-Agent": USER_AGENT,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "identity",
      },
    };

    const req = https.request(options, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 303) {
        const location = res.headers.location;
        const redirectUrl = location.startsWith("http") ? location : `https://${urlObj.hostname}${location}`;
        return fetchHtml(redirectUrl).then(resolve).catch(reject);
      }
      
      let data = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => resolve(data));
      res.on("error", reject);
    });

    req.on("error", reject);
    req.setTimeout(15000, () => {
      req.destroy();
      reject(new Error("Request timeout"));
    });
    req.end();
  });
}

// Helper to fetch binary data
function fetchBinary(url) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: "GET",
      headers: { "User-Agent": USER_AGENT },
    };

    const req = https.request(options, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 303) {
        const location = res.headers.location;
        const redirectUrl = location.startsWith("http") ? location : `https://${urlObj.hostname}${location}`;
        return fetchBinary(redirectUrl).then(resolve).catch(reject);
      }
      
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolve(Buffer.concat(chunks)));
      res.on("error", reject);
    });

    req.on("error", reject);
    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error("Request timeout"));
    });
    req.end();
  });
}

// Search subtitles by IMDB ID
router.get("/search", async (req, res) => {
  try {
    const { imdbId, season } = req.query;
    if (!imdbId) return res.status(400).json({ error: "imdbId required" });

    const searchUrl = `https://subf2m.co/subtitles/searchbytitle?query=${imdbId}&l=`;
    console.log(`🔍 Searching subtitles: ${searchUrl}`);
    const html = await fetchHtml(searchUrl);

    // Find all subtitle links
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
    
    // Ordinals for season names
    const ordinals = ['', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth', 
      'eleventh', 'twelfth', 'thirteenth', 'fourteenth', 'fifteenth', 'sixteenth', 'seventeenth', 'eighteenth', 'nineteenth', 'twentieth',
      'twenty-first', 'twenty-second', 'twenty-third', 'twenty-fourth', 'twenty-fifth', 'twenty-sixth', 'twenty-seventh', 'twenty-eighth', 'twenty-ninth', 'thirtieth'];
    
    // Cardinals (some sites use "ten-season" instead of "tenth-season")
    const cardinals = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
      'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty'];
    
    const seasonNum = season ? parseInt(season) : null;
    const targetOrdinal = seasonNum && seasonNum <= 30 ? ordinals[seasonNum] : null;
    
    // Helper: Extract season number from a link
    function getSeasonFromLink(link) {
      const lower = link.toLowerCase();
      
      // Check ordinals (handle double dash like supernatural--first-season)
      for (let i = 1; i <= 30; i++) {
        // Match both -first-season and --first-season
        const regex = new RegExp(`-{1,2}${ordinals[i]}-season`);
        if (regex.test(lower)) return i;
      }
      
      // Check cardinals
      for (let i = 1; i <= 20; i++) {
        if (lower.includes(`-${cardinals[i]}-season`)) return i;
      }
      
      // Check numeric: -season-15
      const numMatch = lower.match(/-season-(\d+)/);
      if (numMatch) return parseInt(numMatch[1]);
      
      return null;
    }
    
    // Helper: Extract show base name from link (handle double dash)
    function getShowBaseName(link) {
      const lower = link.toLowerCase();
      const prefix = '/subtitles/';
      
      // Try ordinals with possible double dash
      for (let i = 1; i <= 30; i++) {
        // Match -first-season or --first-season
        const match = lower.match(new RegExp(`^/subtitles/(.+?)-{1,2}${ordinals[i]}-season`));
        if (match) {
          return match[1];
        }
      }
      
      // Try cardinals
      for (let i = 1; i <= 20; i++) {
        const pattern = `-${cardinals[i]}-season`;
        const idx = lower.indexOf(pattern);
        if (idx !== -1) {
          return link.substring(prefix.length, idx);
        }
      }
      
      // Try numeric
      const numIdx = lower.indexOf('-season-');
      if (numIdx !== -1) {
        return link.substring(prefix.length, numIdx);
      }
      
      return null;
    }
    
    // Analyze all links
    const linkInfo = links.map(link => ({
      link,
      season: getSeasonFromLink(link),
      baseName: getShowBaseName(link)
    }));
    
    console.log('Link analysis:', linkInfo.map(l => `S${l.season}: ${l.link}`).join(', '));
    
    // Get show base name from any link that has season info
    const showBaseName = linkInfo.find(l => l.baseName)?.baseName || null;
    console.log(`📺 Show base name: ${showBaseName || 'unknown'}`);
    
    // Build list of URLs to try (in priority order)
    const urlsToTry = [];
    
    if (seasonNum && targetOrdinal) {
      console.log(`🎯 Looking for season ${seasonNum} (${targetOrdinal})`);
      
      // 1. First check if exact season exists in search results
      const exactMatch = linkInfo.find(l => l.season === seasonNum);
      if (exactMatch) {
        urlsToTry.push(exactMatch.link);
        console.log(`✅ Found in search results: ${exactMatch.link}`);
      }
      
      // 2. Construct URL with show base name (try both double and single dash)
      if (showBaseName) {
        // Double dash version first (Supernatural uses this for early seasons)
        const constructed2 = `/subtitles/${showBaseName}--${targetOrdinal}-season`;
        if (!urlsToTry.includes(constructed2)) {
          urlsToTry.push(constructed2);
        }
        
        // Single dash version
        const constructed1 = `/subtitles/${showBaseName}-${targetOrdinal}-season`;
        if (!urlsToTry.includes(constructed1)) {
          urlsToTry.push(constructed1);
        }
      }
    }
    
    // 3. Add all links from search as fallback
    for (const link of links) {
      if (!urlsToTry.includes(link)) {
        urlsToTry.push(link);
      }
    }
    
    console.log(`📋 URLs to try: ${urlsToTry.length}`);
    
    // Try each URL until one works
    let pageHtml = null;
    let finalUrl = null;
    let actualSeason = null;
    
    for (const link of urlsToTry) {
      const url = `https://subf2m.co${link}`;
      console.log(`📄 Trying: ${link}`);
      
      try {
        const html = await fetchHtml(url);
        
        // Check if page has actual content (languages)
        if (html && html.length > 5000) {
          const hasLanguages = /<span\s+class=["']count["']>\d+<\/span>/i.test(html);
          if (hasLanguages) {
            pageHtml = html;
            finalUrl = url;
            actualSeason = getSeasonFromLink(link);
            console.log(`✅ Success: ${link} (Season ${actualSeason})`);
            
            // If we found the exact season we wanted, stop
            if (!seasonNum || actualSeason === seasonNum) {
              break;
            }
            
            // If this is not the season we want, keep trying but save as fallback
            console.log(`⚠️ Not exact match, continuing search...`);
          }
        }
      } catch (e) {
        console.log(`  ❌ Error: ${e.message}`);
      }
      
      // Small delay between requests
      await new Promise(r => setTimeout(r, 300));
    }
    
    if (!pageHtml) {
      return res.json({ 
        success: false, 
        error: "Could not fetch subtitle page", 
        languages: [],
        linksFound: links.length
      });
    }

    // Extract languages from page
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

// Get subtitles list for a specific language
router.get("/list", async (req, res) => {
  try {
    const { url } = req.query;
    if (!url) return res.status(400).json({ error: "url required" });

    console.log(`📋 Fetching subtitle list: ${url}`);
    const html = await fetchHtml(url);
    
    // Find all download links - support both single and double quotes
    const dlRegex = /class=["']download[^"']*["']\s+href=["']([^"']+)["']/gi;
    const downloads = [];
    let m;
    while ((m = dlRegex.exec(html)) !== null) {
      if (!downloads.includes(m[1])) {
        downloads.push(m[1]);
      }
    }
    
    // Alternative pattern
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
      
      // Language - support both quotes
      const langMatch = itemHtml.match(/<span\s+class=["']language[^"']*["']>([^<]+)<\/span>/i);
      const language = langMatch ? langMatch[1].trim() : "";
      
      // Rating - support both quotes
      const ratingMatch = itemHtml.match(/<span\s+class=["']rate\s+([^"']+)["']/i);
      const rating = ratingMatch ? ratingMatch[1].trim() : "not rated";
      
      // Releases
      const releases = [];
      const scrollMatch = itemHtml.match(/<ul\s+class=["']scrolllist["']>([\s\S]*?)<\/ul>/i);
      if (scrollMatch) {
        const liRegex = /<li>([^<]+)<\/li>/gi;
        let lm;
        while ((lm = liRegex.exec(scrollMatch[1])) !== null) {
          releases.push(lm[1].trim());
        }
      }
      
      // Author - support both quotes
      const authorMatch = itemHtml.match(/<a\s+href=["']\/u\/\d+["']>([^<]+)<\/a>/i);
      const author = authorMatch ? authorMatch[1].trim() : "";
      
      // Comment
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


// Get download page and extract actual download link
router.get("/download-page", async (req, res) => {
  try {
    const { url } = req.query;
    if (!url) return res.status(400).json({ error: "url required" });

    console.log(`📥 Fetching download page: ${url}`);
    const html = await fetchHtml(url);
    
    // Try multiple patterns for download button - support both quotes
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

// Simple in-memory cache for ZIP files - very short TTL
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

// Download and extract ZIP using unzipper
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

// Get specific subtitle file content
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

    // Delete cache after serving file to free memory
    subtitleCache.delete(cacheKey);
    console.log(`🗑️ Deleted cache after serving: ${cacheKey}`);

    res.setHeader("Content-Type", "text/vtt; charset=utf-8");
    res.send(text);
  } catch (error) {
    console.error("File error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Convert SRT to VTT format
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
