const searchInput = document.getElementById("searchInput");
const searchBtn = document.getElementById("searchBtn");
const results = document.getElementById("results");
const loading = document.getElementById("loading");
const selectedMovie = document.getElementById("selectedMovie");
const movieDetails = document.getElementById("movieDetails");
const imdbCode = document.getElementById("imdbCode");
const copyBtn = document.getElementById("copyBtn");
const getLinksBtn = document.getElementById("getLinksBtn");
const linksContainer = document.getElementById("linksContainer");

let currentImdbId = "";
let currentType = "movie";
let currentTitle = "";
let currentImage = "";
let currentSeasons = [];
let currentSeasonNum = 1;
let currentDownloads = [];

let selectedSubType = null;
let selectedQuality = null;
let selectedQualityDetail = null;

// Server management
let cachedActiveServer = null;
let lastServerFetch = 0;
const SERVER_CACHE_TIME = 5 * 60 * 1000; // 5 minutes

async function getActiveServer() {
  const now = Date.now();
  if (cachedActiveServer && (now - lastServerFetch < SERVER_CACHE_TIME)) {
    return cachedActiveServer;
  }
  
  try {
    const response = await fetch('/active-server');
    const data = await response.json();
    cachedActiveServer = data.activeServer;
    lastServerFetch = now;
    return cachedActiveServer;
  } catch (error) {
    // Don't use p1 as fallback, return null if no server is working
    return null;
  }
}

function updateLinksWithActiveServer(downloads) {
  if (!cachedActiveServer) {
    // If no active server, remove external links entirely
    return downloads.filter(dl => !dl.url || !dl.url.includes('external-server.tv'));
  }
  
  return downloads.map(dl => {
    if (dl.url && dl.url.includes('external-server.tv')) {
      // Replace any existing external server with active one
      dl.url = dl.url.replace(/https:\/\/ant\.out\.p\d+\.external-server\.tv\//, cachedActiveServer);
    }
    return dl;
  });
}

function showSkeletons(count = 6) {
  let html = "";
  for (let i = 0; i < count; i++) {
    html += `<div class="skeleton-card"><div class="skeleton-img"></div><div class="skeleton-text"><div class="skeleton-line"></div><div class="skeleton-line"></div></div></div>`;
  }
  results.innerHTML = html;
}

async function search() {
  const query = searchInput.value.trim();
  if (!query) return;

  searchBtn.disabled = true;
  loading.classList.add("active");
  selectedMovie.style.display = "none";
  showSkeletons(6);

  try {
    const response = await fetch(`/imdb/search?q=${encodeURIComponent(query)}`);
    const data = await response.json();
    loading.classList.remove("active");
    searchBtn.disabled = false;

    if (data.success && data.results && data.results.length > 0) {
      showResults(data.results);
    } else {
      results.innerHTML = '<div class="no-results">❌ No results found</div>';
    }
  } catch (error) {
    loading.classList.remove("active");
    searchBtn.disabled = false;
    results.innerHTML = '<div class="no-results">⚠️ Connection error</div>';
  }
}

function showResults(items) {
  let html = "";
  items.forEach((item, index) => {
    const hasImage = item.image && item.image.length > 5;
    const imdbId = item.id || "";
    const isSeries = item.type && (item.type.toLowerCase().includes("series") || item.type.toLowerCase().includes("tv"));
    const typeIcon = isSeries ? "📺" : "🎬";
    const typeLabel = isSeries ? "Series" : "Movie";

    let subtitle = "";
    if (item.year) subtitle += item.year;
    if (item.actors) {
      if (subtitle) subtitle += " • ";
      subtitle += item.actors;
    }

    html += `
      <div class="movie-card" style="animation-delay: ${index * 0.05}s; cursor: pointer;" 
           data-imdb="${escapeHtml(imdbId)}"
           data-title="${escapeHtml(item.title)}"
           data-image="${escapeHtml(item.image || '')}"
           data-year="${item.year || ''}"
           data-series="${isSeries}"
           onclick="handleMovieClick(this)">
        <div class="img-container">
          ${hasImage ? `<img src="${item.image}" alt="${escapeHtml(item.title)}" loading="lazy" onload="this.classList.add('loaded')" onerror="this.style.display='none'">` : ""}
          <div class="img-placeholder">${typeIcon}</div>
          <span class="type-badge">${typeLabel}</span>
        </div>
        <div class="info">
          <h3>${escapeHtml(item.title)}</h3>
          ${subtitle ? `<span class="subtitle">${escapeHtml(subtitle)}</span>` : ""}
        </div>
      </div>
    `;
  });
  results.innerHTML = html;
}

function handleMovieClick(el) {
  const imdbId = el.dataset.imdb;
  const title = el.dataset.title;
  const image = el.dataset.image;
  const year = el.dataset.year;
  const isSeries = el.dataset.series === 'true';
  selectMovie(imdbId, title, image, year, isSeries);
}

function escapeHtml(text) {
  if (!text) return "";
  return text.replace(/[&<>"']/g, m => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
}

function selectMovie(imdbId, title, image, year, isSeries) {
  currentImdbId = imdbId;
  currentTitle = title;
  currentImage = image;
  currentType = isSeries === true || isSeries === 'true' ? "series" : "movie";
  currentSeasons = [];
  currentSeasonNum = 1;
  currentDownloads = [];
  selectedSubType = null;
  selectedQuality = null;
  selectedQualityDetail = null;

  const typeIcon = currentType === "series" ? "📺" : "🎬";
  const typeLabel = currentType === "series" ? "سریال" : "فیلم";

  movieDetails.innerHTML = `
    <div class="movie-header">
      <div class="movie-poster">
        ${image ? `<img src="${image}" alt="${escapeHtml(title)}" onerror="this.parentElement.innerHTML='<div class=\\'no-poster\\'>${typeIcon}</div>'">` : `<div class="no-poster">${typeIcon}</div>`}
      </div>
      <div class="movie-details">
        <h1>${escapeHtml(title)}</h1>
        <div class="meta-info">
          ${year ? `<span class="meta-item">📅 ${year}</span>` : ""}
          <span class="meta-item imdb">IMDB: ${imdbId}</span>
          <span class="meta-item type-tag">${typeIcon} ${typeLabel}</span>
        </div>
      </div>
    </div>
  `;

  imdbCode.textContent = imdbId.replace("tt", "");
  linksContainer.innerHTML = "";
  selectedMovie.style.display = "block";
  results.innerHTML = "";
  selectedMovie.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function getDownloadLinks() {
  if (!currentImdbId) return;

  getLinksBtn.disabled = true;
  getLinksBtn.innerHTML = '<span class="loading-text">⏳ Loading...</span>';
  linksContainer.innerHTML = '<div class="loading active"><div class="loading-spinner"></div><p>Searching External Database...</p></div>';

  try {
    const params = new URLSearchParams({ imdbId: currentImdbId, title: currentTitle || '' });

    const loadingTimeout = setTimeout(() => {
      const loadingEl = linksContainer.querySelector('.loading p');
      if (loadingEl) loadingEl.textContent = 'Waiting for Telegram bot response...';
    }, 5000);

    const loadingTimeout2 = setTimeout(() => {
      const loadingEl = linksContainer.querySelector('.loading p');
      if (loadingEl) loadingEl.textContent = 'Still waiting... (this may take up to 15 seconds)';
    }, 10000);
    
    const response = await fetch(`/telegram/get-links?${params}`);
    const data = await response.json();
    
    clearTimeout(loadingTimeout);
    clearTimeout(loadingTimeout2);

    if (data.needLogin) { showNeedLogin(); return; }
    if (!data.success && !data.seasons) {
      linksContainer.innerHTML = `<div class="no-results">❌ ${data.error || 'Not found'}</div>`;
      return;
    }

    if (data.seasons && data.seasons.length > 0) {
      currentType = "series";
      currentSeasons = data.seasons;
      if (data.downloads && data.downloads.length > 0) {
        currentSeasonNum = data.currentSeason || 1;
        currentDownloads = data.downloads;
        
        // Update downloads with active server
        getActiveServer().then(() => {
          if (cachedActiveServer) {
            currentDownloads = updateLinksWithActiveServer(currentDownloads);
          }
          renderUI();
        });
      } else {
        await loadSeason(data.seasons[0].seasonId, data.seasons[0].seasonNum);
      }
    } else if (data.downloads && data.downloads.length > 0) {
      currentType = "movie";
      currentDownloads = data.downloads;
      
      // Update downloads with active server
      getActiveServer().then(() => {
        if (cachedActiveServer) {
          currentDownloads = updateLinksWithActiveServer(currentDownloads);
        }
        renderUI();
      });
    } else {
      linksContainer.innerHTML = '<div class="no-results">❌ No links found</div>';
    }
  } catch (error) {
    linksContainer.innerHTML = '<div class="no-results">⚠️ Error</div>';
  } finally {
    getLinksBtn.disabled = false;
    getLinksBtn.innerHTML = '🔗 Get Download Links';
  }
}

async function loadSeason(seasonId, seasonNum) {
  currentSeasonNum = seasonNum;
  selectedSubType = null;
  selectedQuality = null;
  selectedQualityDetail = null;
  linksContainer.innerHTML = `<div class="loading active"><div class="loading-spinner"></div><p>Loading Season ${seasonNum}...</p></div>`;
  
  try {
    const response = await fetch(`/telegram/fetch-videos?playlistId=${seasonId}`);
    const data = await response.json();
    
    if (data.success && data.downloads && data.downloads.length > 0) {
      currentDownloads = data.downloads;
      
      // Update downloads with active server
      getActiveServer().then(() => {
        if (cachedActiveServer) {
          currentDownloads = updateLinksWithActiveServer(currentDownloads);
        }
        renderUI();
      });
    } else {
      linksContainer.innerHTML = `<div class="no-results">❌ ${data.error || 'No links'}</div>`;
    }
  } catch (error) {
    linksContainer.innerHTML = '<div class="no-results">⚠️ Error</div>';
  }
}

function groupBySubType(downloads) {
  const groups = {
    dubbed: { label: '🎙️ Dubbed', icon: '🎙️', items: [] },
    softsub: { label: '💬 Soft Subtitle', icon: '💬', items: [] },
    hardsub: { label: '📝 Hard Subtitle', icon: '📝', items: [] },
    other: { label: '📦 Raw', icon: '📦', items: [] }
  };
  
  downloads.forEach(dl => {
    if (dl.subType === 'dubbed') groups.dubbed.items.push(dl);
    else if (dl.subType === 'softsub') groups.softsub.items.push(dl);
    else if (dl.subType === 'hardsub') groups.hardsub.items.push(dl);
    else groups.other.items.push(dl);
  });
  
  return groups;
}

function getQualityKey(dl) {
  // Extract quality number (1080, 720, 480, etc.)
  const quality = dl.quality ? `${dl.quality}` : '0';
  return quality;
}

function getQualityDetails(dl) {
  // Extract additional details from URL, codec, source, or text
  let details = [];
  
  // Check URL for quality indicators
  const url = (dl.url || '').toLowerCase();
  const text = (dl.text || '').toLowerCase();
  const combined = `${url} ${text}`.toLowerCase();
  
  // Quality indicators to look for
  const qualityIndicators = [
    'web-dl', 'webdl', 'web.dl',
    'hdts', 'hd-ts', 'hd.ts',
    'hdcam', 'hd-cam', 'hd.cam',
    'brrip', 'br-rip', 'br.rip',
    'bluray', 'blu-ray', 'blu.ray',
    'dvdrip', 'dvd-rip', 'dvd.rip',
    'webrip', 'web-rip', 'web.rip',
    'hdtv', 'hd-tv', 'hd.tv',
    'x264', 'x265', 'h264', 'h265',
    'hevc', 'avc'
  ];
  
  // Find quality indicators in URL or text
  for (const indicator of qualityIndicators) {
    if (combined.includes(indicator)) {
      // Format the indicator nicely
      let formatted = indicator.toUpperCase();
      if (formatted.includes('.')) formatted = formatted.replace(/\./g, '-');
      if (!details.includes(formatted)) {
        details.push(formatted);
      }
    }
  }
  
  // Also check codec and source properties if available
  if (dl.codec) {
    const codec = dl.codec.toUpperCase();
    if (!details.includes(codec)) details.push(codec);
  }
  if (dl.source) {
    const source = dl.source.toUpperCase();
    if (!details.includes(source)) details.push(source);
  }
  
  // Return details or "Standard" if none found
  return details.length > 0 ? details.join(' - ') : 'Standard';
}

function groupByQualityProfile(items) {
  const groups = {};
  
  items.forEach(dl => {
    const key = getQualityKey(dl);
    if (!groups[key]) groups[key] = [];
    groups[key].push(dl);
  });
  
  // Sort by quality number (1080, 720, 480, etc.) - high to low
  const sorted = {};
  Object.keys(groups)
    .sort((a, b) => {
      const qa = parseInt(a) || 0;
      const qb = parseInt(b) || 0;
      return qb - qa; // Descending order (1080 -> 720 -> 480)
    })
    .forEach(k => sorted[k] = groups[k]);
  
  return sorted;
}

function groupByQualityDetails(items) {
  // Group by quality + details for the final step
  const groups = {};
  
  items.forEach(dl => {
    const quality = getQualityKey(dl);
    const details = getQualityDetails(dl);
    const key = `${quality}p ${details}`;
    
    if (!groups[key]) groups[key] = [];
    groups[key].push(dl);
  });
  
  // Sort by quality details - Standard first, then alphabetically
  const sorted = {};
  Object.keys(groups)
    .sort((a, b) => {
      if (a.includes('Standard') && !b.includes('Standard')) return -1;
      if (!a.includes('Standard') && b.includes('Standard')) return 1;
      return a.localeCompare(b);
    })
    .forEach(k => sorted[k] = groups[k]);
  
  return sorted;
}

function selectSubType(subType) {
  selectedSubType = subType;
  selectedQuality = null;
  selectedQualityDetail = null;
  renderUI();
}

function selectQualityProfile(quality) {
  selectedQuality = quality;
  selectedQualityDetail = null;
  renderUI();
}

function selectQualityDetail(qualityDetail) {
  selectedQualityDetail = qualityDetail;
  renderUI();
}

function goBack(level) {
  if (level === 'subtype') {
    selectedSubType = null;
    selectedQuality = null;
    selectedQualityDetail = null;
  } else if (level === 'quality') {
    selectedQuality = null;
    selectedQualityDetail = null;
  } else if (level === 'detail') {
    selectedQualityDetail = null;
  }
  renderUI();
}

function renderUI() {
  let html = '';

  if (currentDownloads && currentDownloads.length > 0) {
    html += `<div class="play-section-top"><button onclick="openPlayer()" class="online-play-btn">▶️ Play Online</button></div>`;
  }

  if (currentSeasons.length > 0) {
    html += '<div class="seasons-section">';
    html += '<h3>📺 Season</h3>';
    html += '<div class="season-buttons">';
    currentSeasons.forEach(s => {
      const isActive = s.seasonNum === currentSeasonNum ? 'active' : '';
      html += `<button class="season-btn ${isActive}" onclick="loadSeason('${s.seasonId}', ${s.seasonNum})">S${s.seasonNum}</button>`;
    });
    html += '</div></div>';
  }
  
  if (!currentDownloads || currentDownloads.length === 0) {
    html += '<div class="no-results">❌ No links</div>';
    linksContainer.innerHTML = html;
    return;
  }
  
  const subTypeGroups = groupBySubType(currentDownloads);
  const isSeries = currentType === "series" || currentDownloads.some(d => d.episode);
  
  html += '<div class="downloads-section">';

  if (!selectedSubType) {
    html += '<h3 class="step-title">1️⃣ Select Type</h3>';
    html += '<div class="type-selector">';
    
    for (const [subType, group] of Object.entries(subTypeGroups)) {
      if (group.items.length === 0) continue;
      
      const qualityGroups = groupByQualityProfile(group.items);
      const qualityCount = Object.keys(qualityGroups).length;
      const episodeCount = new Set(group.items.map(d => d.episode)).size;
      
      html += `
        <button class="type-btn" onclick="selectSubType('${subType}')">
          <span class="type-icon">${group.icon}</span>
          <span class="type-label">${group.label}</span>
          <span class="type-info">${isSeries ? episodeCount + ' Episodes' : group.items.length + ' Files'} • ${qualityCount} Qualities</span>
        </button>
      `;
    }
    
    html += '</div>';
  }

  else if (!selectedQuality) {
    const group = subTypeGroups[selectedSubType];
    const qualityGroups = groupByQualityProfile(group.items);
    
    html += `<div class="current-sel"><span class="sel-tag">${group.icon} ${group.label}</span></div>`;
    html += `<button class="back-btn-small" onclick="goBack('subtype')">← Back</button>`;
    html += '<h3 class="step-title">2️⃣ Select Quality</h3>';
    html += '<div class="quality-selector-grid">';
    
    for (const [qualityKey, items] of Object.entries(qualityGroups)) {
      const episodeCount = new Set(items.map(d => d.episode)).size;
      const totalSize = items.reduce((sum, d) => sum + (d.sizeBytes || 0), 0);
      const avgSize = items.length > 0 ? formatSizeJS(totalSize / items.length) : '';
      
      html += `
        <button class="quality-btn-card" onclick="selectQualityProfile('${escapeHtml(qualityKey)}')">
          <span class="quality-name">${qualityKey}p</span>
          <span class="quality-info">${isSeries ? episodeCount + ' Episodes' : items.length + ' Files'}</span>
          ${avgSize ? `<span class="quality-size">~${avgSize}/file</span>` : ''}
        </button>
      `;
    }
    
    html += '</div>';
  }

  else if (!selectedQualityDetail) {
    const group = subTypeGroups[selectedSubType];
    const qualityGroups = groupByQualityProfile(group.items);
    const items = qualityGroups[selectedQuality] || [];
    const detailGroups = groupByQualityDetails(items);
    
    html += `<div class="current-sel"><span class="sel-tag">${group.icon} ${group.label}</span><span class="sel-tag">📀 ${selectedQuality}p</span></div>`;
    html += `<button class="back-btn-small" onclick="goBack('quality')">← Back</button>`;
    html += '<h3 class="step-title">3️⃣ Select Quality Type</h3>';
    html += '<div class="quality-selector-grid">';
    
    for (const [detailKey, detailItems] of Object.entries(detailGroups)) {
      const episodeCount = new Set(detailItems.map(d => d.episode)).size;
      const totalSize = detailItems.reduce((sum, d) => sum + (d.sizeBytes || 0), 0);
      const avgSize = detailItems.length > 0 ? formatSizeJS(totalSize / detailItems.length) : '';
      
      html += `
        <button class="quality-btn-card" onclick="selectQualityDetail('${escapeHtml(detailKey)}')">
          <span class="quality-name">${detailKey}</span>
          <span class="quality-info">${isSeries ? episodeCount + ' Episodes' : detailItems.length + ' Files'}</span>
          ${avgSize ? `<span class="quality-size">~${avgSize}/file</span>` : ''}
        </button>
      `;
    }
    
    html += '</div>';
  }

  else {
    const group = subTypeGroups[selectedSubType];
    const qualityGroups = groupByQualityProfile(group.items);
    const qualityItems = qualityGroups[selectedQuality] || [];
    const detailGroups = groupByQualityDetails(qualityItems);
    const items = detailGroups[selectedQualityDetail] || [];
    
    html += `<div class="current-sel"><span class="sel-tag">${group.icon} ${group.label}</span><span class="sel-tag">📀 ${selectedQuality}p</span><span class="sel-tag">🎯 ${selectedQualityDetail}</span></div>`;
    html += `<button class="back-btn-small" onclick="goBack('detail')">← Back</button>`;
    
    if (isSeries) {
      html += '<h3 class="step-title">4️⃣ Select Episode</h3>';
      html += '<div class="episodes-grid">';
      items.sort((a, b) => (a.episode || 999) - (b.episode || 999));
      
      items.forEach(dl => {
        const ep = dl.episode ? `E${String(dl.episode).padStart(2, '0')}` : 'DL';
        html += `<a href="${dl.url}" target="_blank" class="ep-btn" title="${escapeHtml(dl.text || '')}"><span class="ep-num">${ep}</span><span class="ep-size">${dl.size || ''}</span></a>`;
      });
      html += '</div>';
    } else {
      html += '<h3 class="step-title">4️⃣ Download</h3>';
      html += '<div class="quality-selector-grid">';
      items.forEach(dl => {
        html += `
          <a href="${dl.url}" target="_blank" class="quality-btn-card" style="text-decoration: none;">
            <span class="quality-name">Download</span>
            <span class="quality-info">${dl.size || 'File'}</span>
            <span class="quality-size">⬇️ Click to Download</span>
          </a>
        `;
      });
      html += '</div>';
    }
  }
  
  html += '</div>';
  
  saveForPlayer();
  
  linksContainer.innerHTML = html;
}

function formatSizeJS(bytes) {
  if (!bytes) return "";
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(0)} MB`;
}

function saveForPlayer() {
  localStorage.setItem("telegram-downloads", JSON.stringify({
    title: currentTitle, image: currentImage, imdbId: currentImdbId,
    type: currentType, season: currentSeasonNum, downloads: currentDownloads,
  }));
}

function openPlayer() { window.location.href = "/player.html?source=telegram"; }

function showNeedLogin() {
  linksContainer.innerHTML = `<div class="error-box"><p>⚠️ Telegram login required</p><button onclick="loginTelegram()" class="get-links-btn" style="margin-top: 15px;">🔐 Login</button></div>`;
  getLinksBtn.disabled = false;
  getLinksBtn.innerHTML = '🔗 Get Download Links';
}

async function loginTelegram() {
  linksContainer.innerHTML = '<div class="loading active"><div class="loading-spinner"></div><p>Logging in...</p></div>';
  try {
    const response = await fetch("/telegram/login", { method: "POST" });
    const data = await response.json();
    if (data.success) {
      linksContainer.innerHTML = '<div class="success-msg">✅ Success!</div>';
      setTimeout(() => getDownloadLinks(), 1500);
    } else {
      linksContainer.innerHTML = `<div class="code-input-box"><p>📱 Enter code from Telegram</p><input type="text" id="telegramCode" placeholder="Code" maxlength="6"><button onclick="submitCode()" class="get-links-btn">Submit</button></div>`;
    }
  } catch (error) {
    linksContainer.innerHTML = `<div class="error-box"><p>❌ Error</p><button onclick="loginTelegram()" class="get-links-btn" style="margin-top: 15px;">🔄 Retry</button></div>`;
  }
}

async function submitCode() {
  const code = document.getElementById("telegramCode")?.value.trim();
  if (!code) return;
  try {
    await fetch("/telegram/code", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }) });
    linksContainer.innerHTML = '<div class="loading active"><div class="loading-spinner"></div><p>Verifying...</p></div>';
    setTimeout(() => getDownloadLinks(), 3000);
  } catch (error) { alert("Error: " + error.message); }
}

searchBtn.addEventListener("click", search);
searchInput.addEventListener("keypress", e => { if (e.key === "Enter") search(); });
copyBtn?.addEventListener("click", () => {
  navigator.clipboard.writeText(imdbCode.textContent).then(() => {
    copyBtn.textContent = "✅";
    setTimeout(() => copyBtn.textContent = "📋", 1500);
  });
});
getLinksBtn?.addEventListener("click", getDownloadLinks);
searchInput.focus();
fetch("/telegram/status").then(r => r.json()).then(d => { if (d.connected) console.log("✅ Telegram ready"); }).catch(() => {});

(function checkRestore() {
  const params = new URLSearchParams(window.location.search);
  const restoreImdb = params.get("restore");
  if (restoreImdb) {

    try {
      const saved = JSON.parse(localStorage.getItem("telegram-downloads") || "{}");
      if (saved.imdbId === restoreImdb && saved.title) {

        selectMovie(saved.imdbId, saved.title, saved.image || "", saved.year || "", saved.type === "series");

        window.history.replaceState({}, "", "/telegram.html");
      }
    } catch (e) {
      console.error("Restore failed:", e);
    }
  }
})();
