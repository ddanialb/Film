const express = require("express");
const axios = require("axios");
const cheerio = require("cheerio");

const router = express.Router();
const imageCache = new Map();

// کوکی‌های لاگین
let AUTH_COOKIES = "";
let isLoggedIn = false;

// اطلاعات لاگین از Environment Variables
const credentials = {
  username: process.env.FARSILAND_USERNAME || "",
  password: process.env.FARSILAND_PASSWORD || "",
};

console.log("📧 Username configured:", credentials.username ? "Yes" : "No");

// ============ لاگین خودکار ============
async function doLogin() {
  if (!credentials.username || !credentials.password) {
    console.log("❌ No credentials in environment variables");
    console.log("💡 Set FARSILAND_USERNAME and FARSILAND_PASSWORD");
    return false;
  }

  try {
    console.log("🔐 Logging in as:", credentials.username);

    // User Agent واقعی‌تر
    const userAgent =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36";

    // مرحله 1: گرفتن صفحه اصلی برای کوکی
    const homeResponse = await axios.get("https://farsiland.com/", {
      headers: {
        "User-Agent": userAgent,
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9,fa;q=0.8",
        "Accept-Encoding": "gzip, deflate, br",
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
        "Sec-Ch-Ua":
          '"Not A(Brand";v="99", "Google Chrome";v="121", "Chromium";v="121"',
        "Sec-Ch-Ua-Mobile": "?0",
        "Sec-Ch-Ua-Platform": '"Windows"',
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
        "Sec-Fetch-User": "?1",
        "Upgrade-Insecure-Requests": "1",
      },
      timeout: 20000,
    });

    console.log("📡 Home page status:", homeResponse.status);

    // گرفتن کوکی‌های اولیه
    let cookies = [];
    if (homeResponse.headers["set-cookie"]) {
      homeResponse.headers["set-cookie"].forEach((cookie) => {
        const cookiePart = cookie.split(";")[0];
        cookies.push(cookiePart);
      });
    }
    console.log("🍪 Initial cookies:", cookies.length);

    // کمی صبر کن
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // مرحله 2: ارسال درخواست لاگین
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
          "User-Agent": userAgent,
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          Accept: "application/json, text/javascript, */*; q=0.01",
          "Accept-Language": "en-US,en;q=0.9,fa;q=0.8",
          "Accept-Encoding": "gzip, deflate, br",
          "X-Requested-With": "XMLHttpRequest",
          Origin: "https://farsiland.com",
          Referer: "https://farsiland.com/",
          "Sec-Ch-Ua":
            '"Not A(Brand";v="99", "Google Chrome";v="121", "Chromium";v="121"',
          "Sec-Ch-Ua-Mobile": "?0",
          "Sec-Ch-Ua-Platform": '"Windows"',
          "Sec-Fetch-Dest": "empty",
          "Sec-Fetch-Mode": "cors",
          "Sec-Fetch-Site": "same-origin",
          Cookie: cookies.join("; "),
        },
        timeout: 20000,
        maxRedirects: 0,
        validateStatus: (status) => status < 500,
      }
    );

    console.log("📡 Login response status:", loginResponse.status);

    // گرفتن کوکی‌های لاگین
    if (loginResponse.headers["set-cookie"]) {
      loginResponse.headers["set-cookie"].forEach((cookie) => {
        const cookiePart = cookie.split(";")[0];
        if (!cookies.some((c) => c.startsWith(cookiePart.split("=")[0]))) {
          cookies.push(cookiePart);
        }
      });
    }

    AUTH_COOKIES = cookies.join("; ");
    console.log("🍪 Total cookies:", cookies.length);

    // چک کردن موفقیت لاگین
    if (AUTH_COOKIES.includes("wordpress_logged_in")) {
      isLoggedIn = true;
      console.log("✅ Login successful!");
      return true;
    }

    // بررسی پاسخ
    if (loginResponse.data) {
      const dataStr =
        typeof loginResponse.data === "string"
          ? loginResponse.data
          : JSON.stringify(loginResponse.data);

      console.log("📄 Login response:", dataStr.substring(0, 200));

      if (
        loginResponse.data.success === true ||
        loginResponse.data === "1" ||
        dataStr.includes("success") ||
        dataStr.includes("redirect")
      ) {
        isLoggedIn = true;
        console.log("✅ Login successful (from response)!");
        return true;
      }
    }

    console.log("⚠️ Login status unclear, will try to use cookies anyway");
    // حتی اگه مطمئن نیستیم، کوکی‌ها رو نگه میداریم
    return cookies.length > 2;
  } catch (error) {
    console.error("❌ Login error:", error.message);
    if (error.response) {
      console.error("❌ Response status:", error.response.status);
      console.error(
        "❌ Response headers:",
        JSON.stringify(error.response.headers).substring(0, 200)
      );
    }
    return false;
  }
}

// لاگین با تاخیر بعد از استارت سرور
setTimeout(async () => {
  await doLogin();
}, 3000);

// هدرهای مشترک
function getHeaders(referer = "https://farsiland.com/") {
  return {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
    Accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9,fa;q=0.8",
    "Accept-Encoding": "gzip, deflate, br",
    Referer: referer,
    Cookie: AUTH_COOKIES,
    "Sec-Ch-Ua": '"Not A(Brand";v="99", "Google Chrome";v="121"',
    "Sec-Ch-Ua-Mobile": "?0",
    "Sec-Ch-Ua-Platform": '"Windows"',
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "same-origin",
  };
}

// ============ چک کردن وضعیت لاگین ============
router.get("/auth-status", (req, res) => {
  res.json({
    isLoggedIn,
    username: credentials.username
      ? credentials.username.substring(0, 3) + "***"
      : "Not set",
    hasCookies: AUTH_COOKIES.length > 0,
    cookieCount: AUTH_COOKIES.split(";").length,
  });
});

// ============ لاگین دستی ============
router.post("/login", async (req, res) => {
  const success = await doLogin();
  res.json({ success, isLoggedIn });
});

// ============ تست اتصال ============
router.get("/test", async (req, res) => {
  try {
    const response = await axios.get("https://farsiland.com/", {
      headers: getHeaders(),
      timeout: 15000,
    });
    res.json({
      success: true,
      status: response.status,
      isLoggedIn,
      hasCookies: AUTH_COOKIES.length > 0,
    });
  } catch (error) {
    res.json({
      success: false,
      error: error.message,
      status: error.response?.status,
    });
  }
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
      timeout: 20000,
    });

    const $ = cheerio.load(response.data);
    const results = [];

    // روش 1: نتایج Ajax
    $(".is-ajax-search-post").each((i, el) => {
      const $el = $(el);
      let link = $el.find("a").first().attr("href") || "";
      link = link.split("?")[0];
      let title =
        $el.find(".is-title a").text().trim() ||
        $el.find("a").first().text().trim();
      let image =
        $el.find("img").attr("src") || $el.find("img").attr("data-src") || "";
      let description = $el.find(".is-ajax-result-description").text().trim();
      let year = "";
      const yearMatch = description.match(/(13\d{2}|14\d{2}|19\d{2}|20\d{2})/);
      if (yearMatch) year = yearMatch[1];
      if (title && link) {
        results.push({ title, link, image, year });
      }
    });

    // روش 2: result-item
    $(".result-item").each((i, el) => {
      const $el = $(el);
      let link = $el.find(".thumbnail a, a").first().attr("href") || "";
      link = link.split("?")[0];
      let title =
        $el.find(".title a").text().trim() ||
        $el.find("a").first().text().trim();
      let image =
        $el.find("img").attr("src") || $el.find("img").attr("data-src") || "";
      let year = $el.find(".year").text().trim() || "";
      if (title && link && !results.some((r) => r.link === link)) {
        results.push({ title, link, image, year });
      }
    });

    // روش 3: articles
    $("article.item, .items article").each((i, el) => {
      const $el = $(el);
      let link = $el.find("a").first().attr("href") || "";
      link = link.split("?")[0];
      let title =
        $el.find(".data h3 a, h3 a").text().trim() ||
        $el.find("a").first().attr("title") ||
        "";
      let image =
        $el.find("img").attr("src") || $el.find("img").attr("data-src") || "";
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

// ============ جزئیات ============
router.get("/details", async (req, res) => {
  try {
    const url = req.query.url;
    if (!url) {
      return res.status(400).json({ success: false, error: "URL نامعتبر" });
    }

    console.log("📄 Getting details for:", url);

    const response = await axios.get(url, {
      headers: getHeaders(url),
      timeout: 20000,
    });

    const $ = cheerio.load(response.data);

    // عنوان
    const title =
      $(".sheader .data h1").text().trim() || $("h1").first().text().trim();

    // عکس پوستر
    let image = "";
    image = $(".poster img").attr("data-src");
    if (!image) image = $(".poster img").attr("src");
    if (!image)
      image =
        $(".sheader .poster img").attr("data-src") ||
        $(".sheader .poster img").attr("src");
    if (!image) {
      const noscriptHtml = $(".poster noscript").html();
      if (noscriptHtml) {
        const match = noscriptHtml.match(/src=["']([^"']+)["']/);
        if (match) image = match[1];
      }
    }

    // خلاصه داستان
    let synopsis = "";
    const wpContent = $("#info .wp-content").clone();
    wpContent.find("#dt_galery, .galeria").remove();
    synopsis = wpContent.text().trim().replace(/\s+/g, " ");

    // اطلاعات اضافی
    let originalTitle = "";
    let firstAirDate = "";
    let seasonsCount = "";
    let episodesCount = "";

    $(".custom_fields").each((i, el) => {
      const label = $(el).find(".variante, b").text().trim().toLowerCase();
      const value = $(el).find(".valor, span").text().trim();
      if (label.includes("original title")) originalTitle = value;
      else if (label.includes("first air date")) firstAirDate = value;
      else if (label.includes("seasons")) seasonsCount = value;
      else if (label.includes("episodes")) episodesCount = value;
    });

    let year = $(".sheader .data .extra .date").text().trim();
    if (!year && firstAirDate) {
      const yearMatch = firstAirDate.match(/(19\d{2}|20\d{2})/);
      if (yearMatch) year = yearMatch[1];
    }

    const genre = $(".sgeneros a")
      .map((i, el) => $(el).text().trim())
      .get()
      .join("، ");
    const imdb =
      $(".dt_rating_vgs").text().trim() || $(".imdb b").text().trim();
    const duration = $(".runtime").text().trim();

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
        episodes.push({ title: epTitle, link: epLink, downloads: [] });
      }
    });

    if (episodes.length > 0) {
      seasons.push({ number: seasonNum, title: `فصل ${seasonNum}`, episodes });
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
      if ($fileInput.length) fileId = $fileInput.val();

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
        if (match) fileId = match[1];
      }

      if (!fileId) return;

      let quality = $row.find(".quality, strong.quality").text().trim();
      if (!quality)
        quality = $row.find("strong").first().text().trim() || "نامشخص";
      const qualityMatch = quality.match(/(\d{3,4})/);
      if (qualityMatch) quality = qualityMatch[1];

      let size = "نامشخص";
      $row.find("td").each((idx, td) => {
        const text = $(td).text().trim();
        if (text.match(/\d+\s*(MB|GB|KB)/i)) size = text;
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
    if (!url)
      return res.status(400).json({ success: false, error: "URL نامعتبر" });

    console.log("📺 Getting episode:", url);

    const response = await axios.get(url, {
      headers: getHeaders(url),
      timeout: 20000,
    });

    const $ = cheerio.load(response.data);
    const title =
      $(".sheader .data h1").text().trim() || $("h1").first().text().trim();
    let image =
      $(".poster img").attr("data-src") || $(".poster img").attr("src") || "";
    const downloads = extractDownloads($);

    console.log(`✅ Episode: ${title}, Downloads: ${downloads.length}`);
    res.json({ success: true, title, image, downloads });
  } catch (error) {
    console.error("❌ Episode Error:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============ دریافت لینک دانلود ============
router.get("/get-download", async (req, res) => {
  try {
    const fileId = req.query.fileId;
    if (!fileId)
      return res.status(400).json({ success: false, error: "fileId نامعتبر" });

    // اگه لاگین نیستیم، دوباره تلاش کن
    if (!isLoggedIn && AUTH_COOKIES.length < 50) {
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
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
          "Content-Type": "application/x-www-form-urlencoded",
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
          Referer: "https://farsiland.com/",
          Origin: "https://farsiland.com",
          Cookie: AUTH_COOKIES,
          "Sec-Fetch-Dest": "document",
          "Sec-Fetch-Mode": "navigate",
          "Sec-Fetch-Site": "same-origin",
        },
        maxRedirects: 0,
        validateStatus: (status) => status >= 200 && status < 400,
        timeout: 25000,
      }
    );

    let downloadUrl = null;

    // چک ریدایرکت
    if (response.status >= 300 && response.status < 400) {
      downloadUrl = response.headers.location;
    }

    // Parse HTML
    if (!downloadUrl && response.data && typeof response.data === "string") {
      const $ = cheerio.load(response.data);

      downloadUrl =
        $("a#link").attr("href") ||
        $("a[download]").attr("href") ||
        $("a.btn[href*='://']").attr("href") ||
        $('a[href*=".mp4"], a[href*=".mkv"]').first().attr("href") ||
        $('a[href*="flnd.buzz"], a[href*="flnd."]').first().attr("href");

      if (!downloadUrl) {
        const urlMatch = response.data.match(
          /href=["'](https?:\/\/[^"']*\.(mp4|mkv)[^"']*)["']/i
        );
        if (urlMatch) downloadUrl = urlMatch[1];
      }

      if (!downloadUrl) {
        const dlMatch = response.data.match(
          /href=["'](https?:\/\/d\d+\.[^"']+)["']/i
        );
        if (dlMatch) downloadUrl = dlMatch[1];
      }

      // اگه صفحه لاگین اومد
      if (
        !downloadUrl &&
        (response.data.includes("login") || response.data.includes("ورود"))
      ) {
        console.log("⚠️ Login page returned, re-logging...");
        await doLogin();

        // Retry
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
            timeout: 25000,
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
    }

    if (
      downloadUrl &&
      !downloadUrl.includes("login") &&
      !downloadUrl.includes("account")
    ) {
      console.log("✅ Download URL found!");
      return res.json({ success: true, downloadUrl });
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

    res
      .status(500)
      .json({ success: false, error: error.message, needsLogin: !isLoggedIn });
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
      timeout: 15000,
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
