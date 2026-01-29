const loading = document.getElementById("loading");
const content = document.getElementById("content");
const errorBox = document.getElementById("error");
const movieInfo = document.getElementById("movie-info");
const seasonsContainer = document.getElementById("seasons");
const downloadsContainer = document.getElementById("downloads");

// Subtitle management variables - moved to top to avoid temporal dead zone
let currentSubtitles = [];
let currentVideo = null;
let subtitleInterval = null;
let subtitlePanelExpanded = false;

const urlParams = new URLSearchParams(window.location.search);
const movieUrl = urlParams.get("url");

if (!movieUrl) {
  showError("لینک نامعتبر است!");
} else {
  loadDetails(movieUrl);
}

async function loadDetails(url) {
  // Clear previous subtitles when loading new movie
  clearPreviousSubtitles();
  
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

const STREAM_KEY = "farsiland-current-stream";

function toggleSubtitlePanel() {
  subtitlePanelExpanded = !subtitlePanelExpanded;
  const content = document.getElementById('subtitleContent');
  const indicator = document.getElementById('expandIndicator');
  
  if (subtitlePanelExpanded) {
    content.classList.add('expanded');
    indicator.classList.add('expanded');
  } else {
    content.classList.remove('expanded');
    indicator.classList.remove('expanded');
  }
}

function clearPreviousSubtitles() {
  // Clear any existing subtitle data
  currentSubtitles = [];
  if (subtitleInterval) {
    clearInterval(subtitleInterval);
    subtitleInterval = null;
  }
  // Clear subtitle display
  const subtitleOverlay = document.querySelector('.video-subtitle-overlay');
  if (subtitleOverlay) {
    subtitleOverlay.remove();
  }
  // Clear localStorage - use page-specific keys
  const pageKey = window.location.pathname + window.location.search;
  localStorage.removeItem(`farsi-subtitle-url-${pageKey}`);
  localStorage.removeItem(`farsi-subtitles-${pageKey}`);
  
  // Clear status and input
  setSubtitleStatus('', '');
  const input = document.getElementById('subtitleInput');
  if (input) input.value = '';
}

function setSubtitleStatus(message, type) {
  const statusEl = document.getElementById('subtitleStatus');
  statusEl.textContent = message;
  statusEl.className = `subtitle-status ${type}`;
}

async function loadSubtitle() {
  const input = document.getElementById('subtitleInput');
  const url = input.value.trim();
  
  if (!url) {
    setSubtitleStatus('لطفاً لینک زیرنویس را وارد کنید', 'error');
    return;
  }
  
  setSubtitleStatus('در حال بارگذاری زیرنویس...', 'loading');
  
  try {
    // Clear previous subtitles first
    clearPreviousSubtitles();
    
    const response = await fetch(url);
    if (!response.ok) throw new Error('خطا در دریافت فایل');
    
    const srtText = await response.text();
    currentSubtitles = parseSRT(srtText);
    
    if (currentSubtitles.length === 0) {
      throw new Error('فایل زیرنویس خالی است');
    }
    
    // Save to localStorage with page-specific key
    const pageKey = window.location.pathname + window.location.search;
    localStorage.setItem(`farsi-subtitle-url-${pageKey}`, url);
    localStorage.setItem(`farsi-subtitles-${pageKey}`, JSON.stringify(currentSubtitles));
    
    setSubtitleStatus(`✅ زیرنویس بارگذاری شد (${currentSubtitles.length} خط)`, 'success');
    
    // Apply to current video if exists
    applySubtitleToCurrentVideo();
    
  } catch (error) {
    setSubtitleStatus(`❌ خطا: ${error.message}`, 'error');
  }
}

function parseSRT(srtText) {
  const subtitles = [];
  const blocks = srtText.trim().split(/\n\s*\n/);
  
  blocks.forEach(block => {
    const lines = block.trim().split('\n');
    if (lines.length >= 3) {
      const timeMatch = lines[1].match(/(\d{2}:\d{2}:\d{2},\d{3}) --> (\d{2}:\d{2}:\d{2},\d{3})/);
      if (timeMatch) {
        const startTime = parseTimeToSeconds(timeMatch[1]);
        const endTime = parseTimeToSeconds(timeMatch[2]);
        const text = lines.slice(2).join('\n').replace(/<[^>]*>/g, '');
        
        subtitles.push({
          start: startTime,
          end: endTime,
          text: text
        });
      }
    }
  });
  
  return subtitles;
}

function parseTimeToSeconds(timeStr) {
  const [time, ms] = timeStr.split(',');
  const [hours, minutes, seconds] = time.split(':').map(Number);
  return hours * 3600 + minutes * 60 + seconds + ms / 1000;
}

function applySubtitleToCurrentVideo() {
  // Find video element
  const videos = document.querySelectorAll('video');
  if (videos.length === 0) return;
  
  currentVideo = videos[0];
  
  // Create subtitle overlay if not exists
  let subtitleOverlay = currentVideo.parentElement.querySelector('.video-subtitle-overlay');
  if (!subtitleOverlay) {
    subtitleOverlay = document.createElement('div');
    subtitleOverlay.className = 'video-subtitle-overlay';
    subtitleOverlay.innerHTML = '<div class="video-subtitle-text" id="videoSubtitleText"></div>';
    currentVideo.parentElement.style.position = 'relative';
    currentVideo.parentElement.appendChild(subtitleOverlay);
  }
  
  // Clear existing interval
  if (subtitleInterval) {
    clearInterval(subtitleInterval);
  }
  
  // Start subtitle sync
  subtitleInterval = setInterval(() => {
    if (!currentVideo) return;
    
    const currentTime = currentVideo.currentTime;
    const subtitleText = document.getElementById('videoSubtitleText');
    if (!subtitleText) return;
    
    const currentSubtitle = currentSubtitles.find(sub => 
      currentTime >= sub.start && currentTime <= sub.end
    );
    
    if (currentSubtitle) {
      subtitleText.textContent = currentSubtitle.text;
    } else {
      subtitleText.textContent = '';
    }
  }, 100);
}

// Load saved subtitle on page load
function loadSavedSubtitle() {
  const pageKey = window.location.pathname + window.location.search;
  const savedUrl = localStorage.getItem(`farsi-subtitle-url-${pageKey}`);
  const savedSubtitles = localStorage.getItem(`farsi-subtitles-${pageKey}`);
  
  if (savedUrl && savedSubtitles) {
    try {
      document.getElementById('subtitleInput').value = savedUrl;
      currentSubtitles = JSON.parse(savedSubtitles);
      setSubtitleStatus(`✅ زیرنویس بازیابی شد (${currentSubtitles.length} خط)`, 'success');
    } catch (e) {
      // Clear invalid data
      localStorage.removeItem(`farsi-subtitle-url-${pageKey}`);
      localStorage.removeItem(`farsi-subtitles-${pageKey}`);
    }
  }
}

function openOnlinePlayerWithDownloads(title, downloads) {
  if (!downloads || downloads.length === 0) return;

  try {
    localStorage.setItem(
      STREAM_KEY,
      JSON.stringify({
        title: title || "",
        downloads,
        source: window.location.href,
      })
    );
  } catch (e) {}

  window.location.href = "/player.html";
}

function showDetails(data) {
  content.style.display = "block";

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
  let lastSeasonNumber = null;
  let lastEpisodeNumber = null;

  if (data.isSeries && Array.isArray(data.seasons) && data.seasons.length > 0) {
    let selectedSeason = null;
    let maxSeasonNum = -1;

    data.seasons.forEach((s) => {
      if (!s || !s.number) return;
      const m = String(s.number).match(/(\d+)/);
      const num = m ? parseInt(m[1], 10) : NaN;
      if (!isNaN(num) && num > maxSeasonNum) {
        maxSeasonNum = num;
        selectedSeason = s;
      }
    });

    if (!selectedSeason) {
      selectedSeason = data.seasons[0];
    }

    if (selectedSeason) {
      lastSeasonNumber = selectedSeason.number || String(data.seasons.length);

      if (
        Array.isArray(selectedSeason.episodes) &&
        selectedSeason.episodes.length > 0
      ) {
        let selectedEpisode = null;
        let maxEpNum = -1;

        selectedSeason.episodes.forEach((ep) => {
          if (!ep || !ep.title) return;
          const m = ep.title.match(/(\d+)/);
          const num = m ? parseInt(m[1], 10) : NaN;
          if (!isNaN(num) && num > maxEpNum) {
            maxEpNum = num;
            selectedEpisode = ep;
          }
        });

        if (!selectedEpisode) {
          selectedEpisode =
            selectedSeason.episodes[selectedSeason.episodes.length - 1];
        }

        const epNumMatch = selectedEpisode.title.match(/(\d+)/);
        lastEpisodeNumber = epNumMatch
          ? epNumMatch[1]
          : String(selectedSeason.episodes.length);
      }
    }
  }

  if (data.isSeries && lastSeasonNumber && lastEpisodeNumber) {
    metaHtml += `<span class="meta-item">📺 فصل ${lastSeasonNumber}</span>`;
    metaHtml += `<span class="meta-item">🎬 قسمت ${lastEpisodeNumber}</span>`;
  } else {
    if (data.seasonsCount) {
      metaHtml += `<span class="meta-item">📺 ${data.seasonsCount} فصل</span>`;
    }
    if (data.episodesCount) {
      metaHtml += `<span class="meta-item">🎬 ${data.episodesCount} قسمت</span>`;
    }
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
  if (data.isSeries && data.seasons && data.seasons.length > 0) {
    showSeasons(data.seasons);
  }
  if (data.downloads && data.downloads.length > 0) {
    showDownloads(data.downloads, "لینک‌های دانلود");
    setupOnlinePlayerButton({
      title: data.title,
      image: data.image,
      downloads: data.downloads,
    });
  }
  
  // Load saved subtitle and apply to any video
  loadSavedSubtitle();
  setTimeout(() => {
    applySubtitleToCurrentVideo();
  }, 1000);
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
    const wrapper = linksContainer.previousElementSibling;
    if (wrapper && wrapper.classList.contains("online-play-wrapper")) {
      wrapper.style.display = "none";
    }
    return;
  }

  linksContainer.style.display = "flex";

  const wrapper = linksContainer.previousElementSibling;
  if (wrapper && wrapper.classList.contains("online-play-wrapper")) {
    wrapper.style.display = "block";
  }

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
        const sizeHtml = dl.size ? `<span class="size">${dl.size}</span>` : "";
        const qualityLabel = dl.quality ? `${dl.quality}p` : "کیفیت";
        html += `
          <div class="download-row">
            <a href="#" class="download-btn" onclick="getDownloadLink('${dl.fileId}', this); return false;">
              <span class="quality">${qualityLabel}</span>
              ${sizeHtml}
              <span class="icon">⬇️</span>
            </a>
          </div>
        `;
      });
      linksContainer.innerHTML = html;
      linksContainer.dataset.loaded = "true";
      const onlineWrapper = document.createElement("div");
      onlineWrapper.className = "online-play-wrapper";
      const onlineBtn = document.createElement("a");
      onlineBtn.href = "#";
      onlineBtn.className = "online-play-btn";
      onlineBtn.textContent = "▶️ پخش آنلاین این قسمت";
      onlineBtn.addEventListener("click", (e) => {
        e.preventDefault();
        openOnlinePlayerWithDownloads(data.title, data.downloads);
      });
      onlineWrapper.appendChild(onlineBtn);
      linksContainer.parentElement.insertBefore(onlineWrapper, linksContainer);
      
      // Apply subtitle to any new video elements
      setTimeout(() => {
        applySubtitleToCurrentVideo();
      }, 500);
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
    const sizeHtml = dl.size ? `<span class="size">${dl.size}</span>` : "";
    const qualityLabel = dl.quality ? `${dl.quality}p` : "کیفیت";
    html += `
      <div class="download-row">
        <a href="#" class="download-btn" onclick="getDownloadLink('${dl.fileId}', this); return false;">
          <span class="quality">${qualityLabel}</span>
          ${sizeHtml}
          <span class="icon">⬇️ دانلود</span>
        </a>
      </div>
    `;
  });

  html += "</div>";
  downloadsContainer.innerHTML = html;
}
function setupOnlinePlayerButton(movieData) {
  if (!movieData || !movieData.downloads || movieData.downloads.length === 0)
    return;

  const btn = document.createElement("a");
  btn.href = "#";
  btn.className = "online-play-btn";
  btn.textContent = "▶️ پخش آنلاین";

  btn.addEventListener("click", (e) => {
    e.preventDefault();
    openOnlinePlayerWithDownloads(movieData.title, movieData.downloads);
  });
  if (downloadsContainer) {
    const wrapper = document.createElement("div");
    wrapper.className = "online-play-wrapper";
    wrapper.appendChild(btn);
    downloadsContainer.parentElement.insertBefore(wrapper, downloadsContainer);
  }
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
