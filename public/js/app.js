const searchInput = document.getElementById("searchInput");
const searchBtn = document.getElementById("searchBtn");
const results = document.getElementById("results");
const loading = document.getElementById("loading");

function showSkeletons(count = 8) {
  let html = "";
  for (let i = 0; i < count; i++) {
    html += `
      <div class="skeleton-card">
        <div class="skeleton-img"></div>
        <div class="skeleton-text">
          <div class="skeleton-line"></div>
          <div class="skeleton-line"></div>
        </div>
      </div>
    `;
  }
  results.innerHTML = html;
}

async function search() {
  const query = searchInput.value.trim();
  if (!query) return;

  searchBtn.disabled = true;
  loading.classList.add("active");
  showSkeletons(8);

  try {
    const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
    const data = await response.json();

    loading.classList.remove("active");
    searchBtn.disabled = false;

    if (data.success && data.results.length > 0) {
      showResults(data.results);
    } else {
      results.innerHTML = '<div class="no-results">❌ نتیجه‌ای یافت نشد</div>';
    }
  } catch (error) {
    loading.classList.remove("active");
    searchBtn.disabled = false;
    results.innerHTML = '<div class="no-results">⚠️ خطا در اتصال</div>';
  }
}

function showResults(items) {
  let html = "";

  items.forEach((item, index) => {
    const hasImage = item.image && item.image.length > 5;

    // لینک به صفحه جزئیات خودمون
    const detailsUrl = `/details.html?url=${encodeURIComponent(item.link)}`;

    html += `
      <a href="${detailsUrl}" class="movie-card" style="animation-delay: ${
      index * 0.05
    }s">
        <div class="img-container">
          ${
            hasImage
              ? `
            <img 
              src="/api/proxy-image?url=${encodeURIComponent(item.image)}" 
              alt="${item.title}"
              loading="lazy"
              onload="this.classList.add('loaded')"
              onerror="this.parentElement.classList.add('no-image')"
            >
          `
              : ""
          }
          <div class="img-placeholder">🎬</div>
        </div>
        <div class="info">
          <h3>${item.title}</h3>
          ${item.year ? `<span>${item.year}</span>` : ""}
        </div>
      </a>
    `;
  });

  results.innerHTML = html;
}

searchBtn.addEventListener("click", search);
searchInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") search();
});

searchInput.focus();
