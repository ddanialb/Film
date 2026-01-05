const express = require("express");
const axios = require("axios");
const cheerio = require("cheerio");

const router = express.Router();
const imageCache = new Map();

let AUTH_COOKIES = "";
let isLoggedIn = false;

const credentials = {
  username: process.env.FARSILAND_USERNAME || "",
  password: process.env.FARSILAND_PASSWORD || "",
};

console.log("📧 Username configured:", credentials.username ? "Yes" : "No");

async function doLogin() {
  if (!credentials.username || !credentials.password) {
    console.log("❌ No credentials in environment variables");
    console.log("💡 Set FARSILAND_USERNAME and FARSILAND_PASSWORD");
    return false;
  }

  try {
    console.log("🔐 Logging in as:", credentials.username);

    const userAgent =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36";

    const homeResponse = await axios.get("https://farsiland.com/", {
      headers: {
        "User-Agent": userAgent,
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,**; q=0.01",
          "Accept-Language": "en-US,en;q=0.9,fa;q=0.8",
          "Accept-Encoding": "gzip, deflate, br",
          "X-Requested-With": "XMLHttpRequest",
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

    if (AUTH_COOKIES.includes("wordpress_logged_in")) {
      isLoggedIn = true;
      console.log("✅ Login successful!");
      return true;
    }

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
    return cookies.length > 2;
  } catch (error) {
    console.error("❌ Login error:", error.message);
    if (error.response) {
      console.error("❌ Response status:", error.response.status);
      console.error(
        "❌ Response headers:",
        JSON.stringify(error.response.headers).substring(0, 200)
      );

      if (error.response.status === 403) {
        console.error(
          "⚠️ Upstream returned 403 (probably blocked bot/datacenter IP)."
        );
      }
    }

    isLoggedIn = false;
    AUTH_COOKIES = "";
    return false;
  }
}

setTimeout(async () => {
  await doLogin();
}, 3000);

function getHeaders(referer = "https://farsiland.com/") {
  return {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
    Accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,**;q=0.8",
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

    if (response.status >= 300 && response.status < 400) {
      downloadUrl = response.headers.location;
    }

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

      if (
        !downloadUrl &&
        (response.data.includes("login") || response.data.includes("ورود"))
      ) {
        console.log(" Login page returned, re-logging...");
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
      console.log(" Download URL found!");
      return res.json({ success: true, downloadUrl });
    }

    throw new Error("لینک دانلود یافت نشد");
  } catch (error) {
    console.error(" Download Error:", error.message);

    if (error.response?.headers?.location) {
      const loc = error.response.headers.location;
      if (!loc.includes("login") && !loc.includes("account")) {
        return res.json({ success: true, downloadUrl: loc });
      }
    }

    if (error.response?.status === 403) {
      return res.status(403).json({
        success: false,
        error:
          "دسترسی به سرور دانلود بلوکه شده است (403). احتمالاً IP سرور توسط farsiland یا Cloudflare مسدود شده.",
        needsLogin: !isLoggedIn,
        upstreamBlocked: true,
      });
    }

    res.status(500).json({
      success: false,
      error: error.message,
      needsLogin: !isLoggedIn,
    });
  }
});

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
