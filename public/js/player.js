const video = document.getElementById("videoPlayer");
const qualityButton = document.getElementById("qualityButton");
const qualityMenu = document.getElementById("qualityMenu");
const playerTitle = document.getElementById("playerTitle");
const playerInfo = document.getElementById("playerInfo");
const playerStatus = document.getElementById("playerStatus");

const params = new URLSearchParams(window.location.search);
const fileIdFromUrl = params.get("fileId");
const titleFromUrl = params.get("title");

if (fileIdFromUrl) {
  if (qualityButton) qualityButton.style.display = "none";
  if (qualityMenu) qualityMenu.style.display = "none";
  if (titleFromUrl) {
    playerTitle.textContent = decodeURIComponent(titleFromUrl);
  }
  playSingleFile(fileIdFromUrl);
} else {
  const STREAM_KEY = "persian-current-stream";

  function loadStreamData() {
    try {
      const raw = localStorage.getItem(STREAM_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }

  const streamData = loadStreamData();

  if (
    !streamData ||
    !streamData.downloads ||
    streamData.downloads.length === 0
  ) {
    playerStatus.textContent =
      "❌ دادهای برای پخش پیدا نشد. دوباره از صفحه جزئیات وارد شوید.";
  } else {
    initPlayer(streamData);
  }
}

function initPlayer(data) {
  playerTitle.textContent = data.title || "پخش آنلاین";

  if (data.image) {
    playerInfo.innerHTML = `
      <div class="player-meta">
        <div class="player-poster">
          <img src="/api/proxy-image?url=${encodeURIComponent(
            data.image
          )}" alt="${data.title}" />
        </div>
        <div class="player-text">
          <h2>${data.title}</h2>
          <p>کیفیتها را از منوی ⚙️ انتخاب کنید.</p>
        </div>
      </div>
    `;
  } else {
    playerInfo.innerHTML = `
      <div class="player-meta">
        <div class="player-text">
          <h2>${data.title}</h2>
          <p>کیفیتها را از منوی ⚙️ انتخاب کنید.</p>
        </div>
      </div>
    `;
  }

  buildQualityMenu(data.downloads);
  const sorted = [...data.downloads].sort(
    (a, b) => parseInt(b.quality) - parseInt(a.quality)
  );
  if (sorted[0]) {
    selectQuality(sorted[0]);
  }
}

function buildQualityMenu(downloads) {
  qualityMenu.innerHTML = "";

  downloads
    .slice()
    .sort((a, b) => parseInt(b.quality) - parseInt(a.quality))
    .forEach((dl) => {
      const btn = document.createElement("button");
      btn.className = "quality-menu-item";
      btn.textContent = `${dl.quality}p${dl.size ? " • " + dl.size : ""}`;
      btn.onclick = () => {
        selectQuality(dl);
        qualityMenu.classList.remove("open");
      };
      qualityMenu.appendChild(btn);
    });

  qualityButton.addEventListener("click", () => {
    qualityMenu.classList.toggle("open");
  });

  document.addEventListener("click", (e) => {
    if (!qualityMenu.contains(e.target) && e.target !== qualityButton) {
      qualityMenu.classList.remove("open");
    }
  });
}

async function selectQuality(dl) {
  if (!dl || !dl.fileId) return;

  playerStatus.textContent = `⏳ در حال آمادهسازی کیفیت ${dl.quality}p ...`;

  try {
    const res = await fetch(`/api/get-download?fileId=${dl.fileId}`);
    const data = await res.json();

    if (data.success && data.downloadUrl) {
      const currentTime = video.currentTime || 0;
      const isPlaying = !video.paused && !video.ended;

      video.src = data.downloadUrl;
      video.load();
      video.currentTime = currentTime;
      if (isPlaying) video.play();

      playerStatus.textContent = `✅ در حال پخش کیفیت ${dl.quality}p`;
    } else {
      throw new Error(data.error || "خطا در دریافت لینک پخش");
    }
  } catch (error) {
    playerStatus.textContent = "❌ خطا در دریافت لینک پخش";
  }
}

async function playSingleFile(fileId) {
  playerStatus.textContent = "⏳ در حال آمادهسازی پخش آنلاین...";

  try {
    const res = await fetch(
      `/api/get-download?fileId=${encodeURIComponent(fileId)}`
    );
    const data = await res.json();

    if (data.success && data.downloadUrl) {
      video.src = data.downloadUrl;
      video.load();
      video.play();
      playerStatus.textContent = "✅ در حال پخش";
    } else {
      throw new Error(data.error || "خطا در دریافت لینک پخش");
    }
  } catch (error) {
    playerStatus.textContent = "❌ خطا در دریافت لینک پخش";
  }
}
