const loading = document.getElementById("loading");
const content = document.getElementById("content");
const errorBox = document.getElementById("error");
const movieInfo = document.getElementById("movie-info");
const seasonsContainer = document.getElementById("seasons");
const downloadsContainer = document.getElementById("downloads");

const urlParams = new URLSearchParams(window.location.search);
const movieUrl = urlParams.get("url");

if (!movieUrl) {
  showError("لینک نامعتبر است!");
} else {
  loadDetails(movieUrl);
}

async function loadDetails(url) {
  try {
    const response = await fetch(`/api/details?url=${encodeURIComponent(url)}`);
    const data = await response.json();

    loading.style.display = "none";

    if (data.success) {
      showDetails(data);
    } else {
      showError(data.error || "خطا در دریافت اطلاعات");
    }
  } catch (error) {
    loading.style.display = "none";
    showError("خطا در اتصال به سرور");
  }
}

function showDetails(data) {
  content.style.display = "block";

  // ساخت HTML اطلاعات
  let metaHtml = "";

  if (data.year) {
    metaHtml += `<span class="meta-item">📅 ${data.year}</span>`;
  }
  if (data.firstAirDate && data.firstAirDate !== data.year) {
    metaHtml += `<span class="meta-item">🗓️ ${data.firstAirDate}</span>`;
  }
  if (data.genre) {
    metaHtml += `<span class="meta-item">🎭 ${data.genre}</span>`;
  }
  if (data.duration) {
    metaHtml += `<span class="meta-item">⏱️ ${data.duration}</span>`;
  }
  if (data.imdb) {
    metaHtml += `<span class="meta-item imdb">⭐ ${data.imdb}</span>`;
  }
  if (data.seasonsCount) {
    metaHtml += `<span class="meta-item">📺 ${data.seasonsCount} فصل</span>`;
  }
  if (data.episodesCount) {
    metaHtml += `<span class="meta-item">🎬 ${data.episodesCount} قسمت</span>`;
  }

  movieInfo.innerHTML = `
    <div class="movie-header">
      <div class="movie-poster">
        ${
          data.image
            ? `<img src="/api/proxy-image?url=${encodeURIComponent(
                data.image
              )}" alt="${
                data.title
              }" onerror="this.parentElement.innerHTML='<div class=\\'no-poster\\'>🎬</div>'">`
            : '<div class="no-poster">🎬</div>'
        }
      </div>
      <div class="movie-details">
        <h1>${data.title}</h1>
        ${
          data.originalTitle
            ? `<h2 class="original-title">${data.originalTitle}</h2>`
            : ""
        }
        <div class="meta-info">
          ${metaHtml}
        </div>
        ${
          data.synopsis
            ? `
          <div class="synopsis-box">
            <h3>📝 خلاصه داستان</h3>
            <p class="description">${data.synopsis}</p>
          </div>
        `
            : ""
        }
      </div>
    </div>
  `;

  // فصل‌ها و قسمت‌ها
  if (data.isSeries && data.seasons && data.seasons.length > 0) {
    showSeasons(data.seasons);
  }

  // لینک‌های دانلود
  if (data.downloads && data.downloads.length > 0) {
    showDownloads(data.downloads, "لینک‌های دانلود");
  }
}

function showSeasons(seasons) {
  let html = '<h2 class="section-title">📺 فصل‌ها و قسمت‌ها</h2>';

  seasons.forEach((season, index) => {
    const episodeCount = season.episodes ? season.episodes.length : 0;

    html += `
      <div class="season-box">
        <div class="season-header" onclick="toggleSeason(${index})">
          <h3>🎬 ${season.title}</h3>
          <span class="episode-count">${episodeCount} قسمت</span>
          <span class="toggle-icon" id="season-icon-${index}">▼</span>
        </div>
        <div class="episodes-list" id="season-${index}" style="display: none;">
    `;

    if (season.episodes && season.episodes.length > 0) {
      season.episodes.forEach((episode, epIndex) => {
        html += `
          <div class="episode-item" id="episode-item-${index}-${epIndex}">
            <div class="episode-header" onclick="loadEpisode(${index}, ${epIndex}, '${encodeURIComponent(
          episode.link
        )}')">
              <span class="episode-title">📹 ${episode.title}</span>
              <span class="episode-arrow">←</span>
            </div>
            <div class="episode-links" id="episode-${index}-${epIndex}" style="display: none;">
              <div class="episode-loading">⏳ در حال دریافت لینک‌ها...</div>
            </div>
          </div>
        `;
      });
    }

    html += `
        </div>
      </div>
    `;
  });

  seasonsContainer.innerHTML = html;
}

async function loadEpisode(seasonIndex, episodeIndex, encodedUrl) {
  const linksContainer = document.getElementById(
    `episode-${seasonIndex}-${episodeIndex}`
  );

  if (linksContainer.style.display === "flex") {
    linksContainer.style.display = "none";
    return;
  }

  linksContainer.style.display = "flex";

  if (linksContainer.dataset.loaded === "true") {
    return;
  }

  const episodeUrl = decodeURIComponent(encodedUrl);

  try {
    const response = await fetch(
      `/api/episode?url=${encodeURIComponent(episodeUrl)}`
    );
    const data = await response.json();

    if (data.success && data.downloads && data.downloads.length > 0) {
      let html = "";
      data.downloads.forEach((dl) => {
        html += `
          <a href="#" class="download-btn" onclick="getDownloadLink('${dl.fileId}', this); return false;">
            <span class="quality">${dl.quality}p</span>
            <span class="size">${dl.size}</span>
            <span class="icon">⬇️</span>
          </a>
        `;
      });
      linksContainer.innerHTML = html;
      linksContainer.dataset.loaded = "true";
    } else {
      linksContainer.innerHTML =
        '<p class="no-links">❌ لینک دانلود یافت نشد</p>';
    }
  } catch (error) {
    linksContainer.innerHTML =
      '<p class="no-links">⚠️ خطا در دریافت لینک‌ها</p>';
  }
}

function showDownloads(downloads, title) {
  let html = `<h2 class="section-title">⬇️ ${title}</h2>`;
  html += '<div class="downloads-grid">';

  downloads.forEach((dl) => {
    html += `
      <a href="#" class="download-btn" onclick="getDownloadLink('${dl.fileId}', this); return false;">
        <span class="quality">${dl.quality}p</span>
        <span class="size">${dl.size}</span>
        <span class="icon">⬇️ دانلود</span>
      </a>
    `;
  });

  html += "</div>";
  downloadsContainer.innerHTML = html;
}

async function getDownloadLink(fileId, element) {
  const originalText = element.innerHTML;
  element.innerHTML =
    '<span class="loading-text">⏳ در حال دریافت لینک...</span>';
  element.style.pointerEvents = "none";

  try {
    const response = await fetch(`/api/get-download?fileId=${fileId}`);
    const data = await response.json();

    if (data.success && data.downloadUrl) {
      window.open(data.downloadUrl, "_blank");
      element.innerHTML = '<span class="success-text">✅ لینک باز شد</span>';

      setTimeout(() => {
        element.innerHTML = originalText;
        element.style.pointerEvents = "auto";
      }, 2000);
    } else {
      throw new Error(data.error || "خطا");
    }
  } catch (error) {
    element.innerHTML = '<span class="error-text">❌ خطا در دریافت</span>';
    setTimeout(() => {
      element.innerHTML = originalText;
      element.style.pointerEvents = "auto";
    }, 2000);
  }
}

function toggleSeason(index) {
  const el = document.getElementById(`season-${index}`);
  const icon = document.getElementById(`season-icon-${index}`);

  if (el.style.display === "none") {
    el.style.display = "block";
    icon.textContent = "▲";
  } else {
    el.style.display = "none";
    icon.textContent = "▼";
  }
}

function showError(message) {
  loading.style.display = "none";
  errorBox.style.display = "block";
  errorBox.innerHTML = `
    <p>❌ ${message}</p>
    <a href="/" class="back-btn">بازگشت به جستجو</a>
  `;
}
