const express = require("express");
const axios = require("axios");
const cheerio = require("cheerio");

const router = express.Router();

// IMDB Search - Using IMDB Suggestion API
router.get("/search", async (req, res) => {
  try {
    const query = req.query.q;
    if (!query) {
      return res.json({ success: false, results: [] });
    }

    console.log("🎬 IMDB Search:", query);

    const response = await axios.get(`https://v3.sg.media-imdb.com/suggestion/x/${encodeURIComponent(query)}.json`, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "application/json",
      },
      timeout: 15000,
    });

    const results = [];
    if (response.data && response.data.d) {
      for (const item of response.data.d) {
        if (item.id && item.id.startsWith("tt")) {
          results.push({
            id: item.id,
            title: item.l || "",
            year: item.y || "",
            type: item.qid === "tvSeries" ? "TV Series" : item.qid === "movie" ? "Movie" : item.q || "",
            image: item.i ? item.i.imageUrl : "",
            actors: item.s || "",
          });
        }
      }
    }

    console.log(`📦 IMDB found ${results.length} results`);
    res.json({ success: true, results });
  } catch (error) {
    console.error("❌ IMDB Search Error:", error.message);
    res.json({ success: false, results: [], error: error.message });
  }
});

// IMDB Title Details
router.get("/title/:id", async (req, res) => {
  try {
    const id = req.params.id;
    if (!id) {
      return res.json({ success: false, error: "ID required" });
    }

    console.log("🎬 IMDB Title:", id);

    const response = await axios.get(`https://www.imdb.com/title/${id}/`, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "text/html",
        "Accept-Language": "en-US,en;q=0.9",
      },
      timeout: 15000,
    });

    const $ = cheerio.load(response.data);
    
    let jsonLd = {};
    $('script[type="application/ld+json"]').each((i, el) => {
      try {
        const data = JSON.parse($(el).html());
        if (data["@type"] === "Movie" || data["@type"] === "TVSeries") {
          jsonLd = data;
        }
      } catch (e) {}
    });

    const data = {
      id,
      title: jsonLd.name || $('h1[data-testid="hero__pageTitle"]').text().trim(),
      type: jsonLd["@type"] || "",
      year: jsonLd.datePublished ? jsonLd.datePublished.substring(0, 4) : "",
      image: jsonLd.image || "",
      description: jsonLd.description || "",
      rating: jsonLd.aggregateRating ? jsonLd.aggregateRating.ratingValue : "",
      genres: jsonLd.genre || [],
    };

    res.json({ success: true, data });
  } catch (error) {
    console.error("❌ IMDB Title Error:", error.message);
    res.json({ success: false, error: error.message });
  }
});

module.exports = router;
