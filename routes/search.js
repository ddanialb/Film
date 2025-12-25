const express = require("express");
const axios = require("axios");
const cheerio = require("cheerio");

const router = express.Router();
const imageCache = new Map();

// کوکی‌های لاگین
let AUTH_COOKIES = "";
let isLoggedIn = false;

// اطلاعات لاگین
let credentials = { username: "", password: "" };
try {
  const config = require("../config");
  credentials.username = config.username || "";
  credentials.password = config.password || "";
} catch (e) {
  console.log("⚠️ No config.js found");
}

// ============ لاگین خودکار ============
async function doLogin() {
  if (!credentials.username || !credentials.password) {
    console.log("❌ No credentials in config.js");
    return false;
  }

  try {
    console.log("🔐 Logging in as:", credentials.username);

    const homeResponse = await axios.get("https://farsiland.com/", {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      timeout: 15000,
    });

    let cookies = [];
    if (homeResponse.headers["set-cookie"]) {
      homeResponse.headers["set-cookie"].forEach((cookie) => {
        const cookiePart = cookie.split(";")[0];
        cookies.push(cookiePart);
      });
    }

    const loginResponse = await axios.post(
      "https://farsiland.com/wp-admin/admin-ajax.php",
      new URLSearchParams({
        action: "dooplay_login",
        log: credentials.username,
        pwd: credentials.password,
        rmb: "forever",
      }).toString(),
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          Accept: "application/json, text/javascript, */*; q=0.01",
          "X-Requested-With": "XMLHttpRequest",
          Origin: "https://farsiland.com",
          Referer: "https://farsiland.com/",
          Cookie: cookies.join("; "),
        },
        timeout: 15000,
        maxRedirects: 0,
        validateStatus: (status) => status < 500,
      }
    );

    console.log("📡 Login response status:", loginResponse.status);

    if (loginResponse.headers["set-cookie"]) {
      loginResponse.headers["set-cookie"].forEach((cookie) => {
        const cookiePart = cookie.split(";")[0];
        if (!cookies.includes(cookiePart)) {
          cookies.push(cookiePart);
        }
      });
    }

    AUTH_COOKIES = cookies.join("; ");

    if (AUTH_COOKIES.includes("wordpress_logged_in")) {
      isLoggedIn = true;
      console.log("✅ Login successful!");
      return true;
    }

    if (loginResponse.data) {
      if (
        loginResponse.data.success ||
        loginResponse.data === "1" ||
        loginResponse.data.includes?.("success")
      ) {
        isLoggedIn = true;
        console.log("✅ Login successful (from response)!");
        return true;
      }
    }

    return false;
  } catch (error) {
    console.error("❌ Login error:", error.message);
    return false;
  }
}

(async () => {
  await doLogin();
})();

function getHeaders(referer = "https://farsiland.com/") {
  return {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
    Referer: referer,
    Cookie: AUTH_COOKIES,
  };
}

router.get("/auth-status", (req, res) => {
  res.json({
    isLoggedIn,
    username: credentials.username || "Not set",
    hasCookies: AUTH_COOKIES.length > 0,
  });
});

router.post("/login", async (req, res) => {
  const { username, password } = req.body;
  if (username && password) {
    credentials.username = username;
    credentials.password = password;
  }
  const success = await doLogin();
  res.json({ success, isLoggedIn });
});

// ============ سرچ ============
router.get("/search", async (req, res) => {
  try {
    const query = req.query.q;
    if (!query || query.length < 1) {
      return res.json({ success: false, results: [] });
    }

    console.log("🔍 Searching for:", query);

    const response = await axios.get("https://farsiland.com/", {
      params: { s: query },
      headers: getHeaders(),
      timeout: 15000,
    });

    const $ = cheerio.load(response.data);
    const results = [];

    $(".is-ajax-search-post").each((i, el) => {
      const $el = $(el);
      let link = $el.find("a").first().attr("href") || "";
      link = link.split("?")[0];
      let title =
        $el.find(".is-title a").text().trim() ||
        $el.find("a").first().text().trim();
      let image = $el.find("img").attr("src") || "";
      let description = $el.find(".is-ajax-result-description").text().trim();
      let year = "";
      const yearMatch = description.match(/(13\d{2}|14\d{2}|19\d{2}|20\d{2})/);
      if (yearMatch) year = yearMatch[1];
      if (title && link) {
        results.push({ title, link, image, year });
      }
    });

    $(".result-item").each((i, el) => {
      const $el = $(el);
      let link = $el.find(".thumbnail a, a").first().attr("href") || "";
      link = link.split("?")[0];
      let title =
        $el.find(".title a").text().trim() ||
        $el.find("a").first().text().trim();
      let image = $el.find("img").attr("src") || "";
      let year = $el.find(".year").text().trim() || "";
      if (title && link && !results.some((r) => r.link === link)) {
        results.push({ title, link, image, year });
      }
    });

    $("article.item, .items article").each((i, el) => {
      const $el = $(el);
      let link = $el.find("a").first().attr("href") || "";
      link = link.split("?")[0];
      let title =
        $el.find(".data h3 a, h3 a").text().trim() ||
        $el.find("a").first().attr("title") ||
        "";
      let image = $el.find("img").attr("src") || "";
      let year = $el.find(".metadata .year").text().trim() || "";
      if (title && link && !results.some((r) => r.link === link)) {
        results.push({ title, link, image, year });
      }
    });

    console.log(`📦 Found ${results.length} results`);
    res.json({
      success: true,
      query,
      count: results.length,
      results: results.slice(0, 30),
    });
  } catch (error) {
    console.error("❌ Search Error:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============ جزئیات (اصلاح شده کامل) ============
router.get("/details", async (req, res) => {
  try {
    const url = req.query.url;
    if (!url) {
      return res.status(400).json({ success: false, error: "URL نامعتبر" });
    }

    console.log("📄 Getting details for:", url);

    const response = await axios.get(url, {
      headers: getHeaders(url),
      timeout: 15000,
    });

    const $ = cheerio.load(response.data);

    // عنوان اصلی
    const title =
      $(".sheader .data h1").text().trim() || $("h1").first().text().trim();

    // عکس پوستر - چند روش مختلف
    let image = "";
    // روش 1: از poster img با data-src (lazy load)
    image = $(".poster img").attr("data-src");
    // روش 2: از poster img با src معمولی
    if (!image) {
      image = $(".poster img").attr("src");
    }
    // روش 3: از sheader poster
    if (!image) {
      image =
        $(".sheader .poster img").attr("data-src") ||
        $(".sheader .poster img").attr("src");
    }
    // روش 4: از noscript داخل poster
    if (!image) {
      const noscriptHtml = $(".poster noscript").html();
      if (noscriptHtml) {
        const match = noscriptHtml.match(/src=["']([^"']+)["']/);
        if (match) image = match[1];
      }
    }
    console.log("🖼️ Poster image:", image);

    // ============ استخراج اطلاعات از #info ============

    // خلاصه داستان (Synopsis)
    let synopsis = "";
    const wpContent = $("#info .wp-content").clone();
    wpContent.find("#dt_galery").remove(); // حذف گالری
    wpContent.find(".galeria").remove();
    synopsis = wpContent.text().trim();
    // تمیز کردن
    synopsis = synopsis.replace(/\s+/g, " ").trim();
    console.log("📝 Synopsis:", synopsis.substring(0, 100));

    // استخراج custom_fields
    let originalTitle = "";
    let firstAirDate = "";
    let seasonsCount = "";
    let episodesCount = "";

    $(".custom_fields").each((i, el) => {
      const label = $(el).find(".variante, b").text().trim().toLowerCase();
      const value = $(el).find(".valor, span").text().trim();

      if (label.includes("original title") || label.includes("عنوان اصلی")) {
        originalTitle = value;
      } else if (label.includes("first air date") || label.includes("تاریخ")) {
        firstAirDate = value;
      } else if (label.includes("seasons") || label.includes("فصل")) {
        seasonsCount = value;
      } else if (label.includes("episodes") || label.includes("قسمت")) {
        episodesCount = value;
      }
    });

    console.log("📋 Original Title:", originalTitle);
    console.log("📅 First Air Date:", firstAirDate);

    // سال - از extra date یا از firstAirDate
    let year = $(".sheader .data .extra .date").text().trim();
    if (!year && firstAirDate) {
      const yearMatch = firstAirDate.match(/(19\d{2}|20\d{2})/);
      if (yearMatch) year = yearMatch[1];
    }

    // ژانر
    const genre = $(".sgeneros a")
      .map((i, el) => $(el).text().trim())
      .get()
      .join("، ");

    // امتیاز IMDB
    const imdb =
      $(".dt_rating_vgs").text().trim() || $(".imdb b").text().trim();

    // مدت زمان
    const duration = $(".runtime").text().trim();

    // نوع (سریال یا فیلم)
    const isSeries =
      url.includes("/tvshows/") ||
      url.includes("/series/") ||
      $("#seasons").length > 0;

    let seasons = [];
    let downloads = [];

    if (isSeries) {
      seasons = extractSeasons($);
    }

    downloads = extractDownloads($);

    console.log(
      `✅ Details: ${title}, Seasons: ${seasons.length}, Downloads: ${downloads.length}`
    );

    res.json({
      success: true,
      title,
      originalTitle,
      image,
      synopsis,
      description: synopsis.substring(0, 500),
      year,
      firstAirDate,
      seasonsCount,
      episodesCount,
      genre,
      imdb,
      duration,
      isSeries,
      seasons,
      downloads,
    });
  } catch (error) {
    console.error("❌ Details Error:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// استخراج فصل‌ها
function extractSeasons($) {
  const seasons = [];

  $("#seasons .se-c, .se-c").each((i, seasonEl) => {
    const $season = $(seasonEl);
    const seasonNum = $season.find(".se-t").text().trim() || `${i + 1}`;
    const episodes = [];

    $season.find(".episodios li").each((j, epEl) => {
      const $ep = $(epEl);
      const epTitle =
        $ep.find(".episodiotitle a").text().trim() || `قسمت ${j + 1}`;
      const epLink = $ep.find(".episodiotitle a, a").first().attr("href") || "";

      if (epLink) {
        episodes.push({
          title: epTitle,
          link: epLink,
          downloads: [],
        });
      }
    });

    if (episodes.length > 0) {
      seasons.push({
        number: seasonNum,
        title: `فصل ${seasonNum}`,
        episodes,
      });
    }
  });

  return seasons;
}

// استخراج لینک‌های دانلود
function extractDownloads($) {
  const downloads = [];

  $("#download tbody tr, .links_table tbody tr, .fix-table tbody tr").each(
    (i, el) => {
      const $row = $(el);
      const rowHtml = $row.html() || "";

      let fileId = null;

      const $fileInput = $row.find('input[name="fileid"]');
      if ($fileInput.length) {
        fileId = $fileInput.val();
      }

      if (!fileId) {
        $row.find('input[type="hidden"]').each((idx, inp) => {
          const val = $(inp).val();
          if (val && val.length >= 6 && /^[a-z0-9]+$/i.test(val)) {
            fileId = val;
            return false;
          }
        });
      }

      if (!fileId) {
        const match = rowHtml.match(/value="([a-z0-9]{6,20})"/i);
        if (match) {
          fileId = match[1];
        }
      }

      if (!fileId) return;

      let quality = $row.find(".quality, strong.quality").text().trim();
      if (!quality) {
        quality = $row.find("strong").first().text().trim() || "نامشخص";
      }
      const qualityMatch = quality.match(/(\d{3,4})/);
      if (qualityMatch) {
        quality = qualityMatch[1];
      }

      const tds = $row.find("td");
      let size = "نامشخص";
      tds.each((idx, td) => {
        const text = $(td).text().trim();
        if (text.match(/\d+\s*(MB|GB|KB)/i)) {
          size = text;
        }
      });

      if (!downloads.some((d) => d.fileId === fileId)) {
        downloads.push({ fileId, quality, size });
      }
    }
  );

  return downloads;
}

// ============ قسمت ============
router.get("/episode", async (req, res) => {
  try {
    const url = req.query.url;
    if (!url) {
      return res.status(400).json({ success: false, error: "URL نامعتبر" });
    }

    console.log("📺 Getting episode:", url);

    const response = await axios.get(url, {
      headers: getHeaders(url),
      timeout: 15000,
    });

    const $ = cheerio.load(response.data);
    const title =
      $(".sheader .data h1").text().trim() || $("h1").first().text().trim();

    // عکس قسمت
    let image =
      $(".poster img").attr("data-src") || $(".poster img").attr("src") || "";

    const downloads = extractDownloads($);

    console.log(`✅ Episode: ${title}, Downloads: ${downloads.length}`);

    res.json({
      success: true,
      title,
      image,
      downloads,
    });
  } catch (error) {
    console.error("❌ Episode Error:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============ دریافت لینک دانلود ============
router.get("/get-download", async (req, res) => {
  try {
    const fileId = req.query.fileId;
    if (!fileId) {
      return res.status(400).json({ success: false, error: "fileId نامعتبر" });
    }

    if (!isLoggedIn) {
      console.log("🔄 Not logged in, trying to login...");
      await doLogin();
    }

    console.log("⬇️ Getting download for:", fileId);

    const response = await axios.post(
      "https://farsiland.com/get/",
      new URLSearchParams({ fileid: fileId }).toString(),
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Content-Type": "application/x-www-form-urlencoded",
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          Referer: "https://farsiland.com/",
          Origin: "https://farsiland.com",
          Cookie: AUTH_COOKIES,
        },
        maxRedirects: 0,
        validateStatus: (status) => status >= 200 && status < 400,
        timeout: 20000,
      }
    );

    let downloadUrl = null;

    if (response.status >= 300 && response.status < 400) {
      downloadUrl = response.headers.location;
    }

    if (!downloadUrl && response.data && typeof response.data === "string") {
      const $ = cheerio.load(response.data);

      // لینک با id="link"
      downloadUrl = $("a#link").attr("href");

      if (!downloadUrl) {
        downloadUrl = $("a[download]").attr("href");
      }

      if (!downloadUrl) {
        downloadUrl = $("a.btn[href*='://']").attr("href");
      }

      if (!downloadUrl) {
        downloadUrl = $('a[href*=".mp4"], a[href*=".mkv"], a[href*=".avi"]')
          .first()
          .attr("href");
      }

      if (!downloadUrl) {
        downloadUrl = $('a[href*="flnd.buzz"], a[href*="flnd."]')
          .first()
          .attr("href");
      }

      if (!downloadUrl) {
        const urlMatch = response.data.match(
          /href=["'](https?:\/\/[^"']*\.(mp4|mkv|avi)[^"']*)["']/i
        );
        if (urlMatch) {
          downloadUrl = urlMatch[1];
        }
      }

      if (!downloadUrl) {
        const dlMatch = response.data.match(
          /href=["'](https?:\/\/d\d+\.[^"']+)["']/i
        );
        if (dlMatch) {
          downloadUrl = dlMatch[1];
        }
      }
    }

    if (downloadUrl) {
      if (downloadUrl.includes("login") || downloadUrl.includes("account")) {
        await doLogin();

        const retryResponse = await axios.post(
          "https://farsiland.com/get/",
          new URLSearchParams({ fileid: fileId }).toString(),
          {
            headers: {
              "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
              "Content-Type": "application/x-www-form-urlencoded",
              Referer: "https://farsiland.com/",
              Cookie: AUTH_COOKIES,
            },
            maxRedirects: 0,
            validateStatus: (status) => status >= 200 && status < 400,
            timeout: 20000,
          }
        );

        if (retryResponse.data) {
          const $retry = cheerio.load(retryResponse.data);
          downloadUrl =
            $retry("a#link").attr("href") ||
            $retry("a[download]").attr("href") ||
            $retry('a[href*=".mp4"], a[href*=".mkv"]').first().attr("href");
        }
      }

      if (
        downloadUrl &&
        !downloadUrl.includes("login") &&
        !downloadUrl.includes("account")
      ) {
        console.log("✅ Download URL:", downloadUrl);
        return res.json({ success: true, downloadUrl });
      }
    }

    throw new Error("لینک دانلود یافت نشد");
  } catch (error) {
    console.error("❌ Download Error:", error.message);

    if (error.response?.headers?.location) {
      const loc = error.response.headers.location;
      if (!loc.includes("login") && !loc.includes("account")) {
        return res.json({ success: true, downloadUrl: loc });
      }
    }

    res.status(500).json({
      success: false,
      error: error.message,
      needsLogin: !isLoggedIn,
    });
  }
});

// ============ پروکسی تصاویر ============
router.get("/proxy-image", async (req, res) => {
  try {
    const imageUrl = req.query.url;
    if (!imageUrl) return res.status(400).send("No URL");

    if (imageCache.has(imageUrl)) {
      const cached = imageCache.get(imageUrl);
      res.set("Content-Type", cached.type);
      res.set("Cache-Control", "public, max-age=604800");
      return res.send(cached.data);
    }

    const response = await axios.get(imageUrl, {
      responseType: "arraybuffer",
      headers: {
        "User-Agent": "Mozilla/5.0",
        Referer: "https://farsiland.com/",
      },
      timeout: 10000,
    });

    const contentType = response.headers["content-type"] || "image/jpeg";

    if (imageCache.size > 200) {
      const firstKey = imageCache.keys().next().value;
      imageCache.delete(firstKey);
    }
    imageCache.set(imageUrl, { data: response.data, type: contentType });

    res.set("Content-Type", contentType);
    res.set("Cache-Control", "public, max-age=604800");
    res.send(response.data);
  } catch (error) {
    res.redirect("https://via.placeholder.com/300x400/2a2a4a/666?text=🎬");
  }
});

module.exports = router;
