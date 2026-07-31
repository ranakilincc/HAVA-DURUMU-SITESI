// ============================================================
// CONFIG — API anahtarı artık backend'de (bkz. /api klasörü + .env).
// Tüm hava durumu istekleri kendi sunucumuzdaki /api uçlarından geçer,
// anahtar tarayıcıya hiç gönderilmez.
// ============================================================
const CONFIG = {
  BASE_URL: '/api',
};

const HISTORY_KEY = 'weatherApp.history';
const HISTORY_MAX = 5;
const FAVORITES_KEY = 'weatherApp.favorites';

// Bilinen büyük şehirler için tarihi/simge yapı fotoğrafı.
// Görseller projeye gömülü (assets/landmarks/) — Wikimedia gibi dış bir CDN'e
// bağımlı kalmamak için (bazı ağlarda/tarayıcı eklentilerinde engellenebiliyor).
// Listede olmayan şehirlerde hava durumuna göre gradyan arka plan kullanılır.
// "blurUrl": aynı fotoğrafın bulanık/kararmış kopyası — dar (mobil) ekranlarda
// fotoğrafın tamamını göstermek için "contain" + bu bulanık dolgu kullanılıyor.
function landmark(city, lat, lon) {
  return { url: `assets/landmarks/${city}.jpg`, blurUrl: `assets/landmarks/${city}-blur.jpg`, lat, lon };
}

const LANDMARKS = {
  'istanbul': landmark('istanbul', 41.0082, 28.9784),
  'ankara': landmark('ankara', 39.9334, 32.8597),
  'izmir': landmark('izmir', 38.4237, 27.1428),
  'bursa': landmark('bursa', 40.1826, 29.0665),
  'antalya': landmark('antalya', 36.8969, 30.7133),
  'konya': landmark('konya', 37.8746, 32.4932),
  'elazig': landmark('elazig', 38.6810, 39.2264),
  'adana': landmark('adana', 37.0000, 35.3213),
  'gaziantep': landmark('gaziantep', 37.0662, 37.3833),
  'kayseri': landmark('kayseri', 38.7312, 35.4787),
  'trabzon': landmark('trabzon', 41.0027, 39.7168),
  'mersin': landmark('mersin', 36.8121, 34.6415),
  'eskisehir': landmark('eskisehir', 39.7767, 30.5206),
  'sanliurfa': landmark('sanliurfa', 37.1591, 38.7969),
  'diyarbakir': landmark('diyarbakir', 37.9144, 40.2306),
};
const LANDMARK_MATCH_RADIUS_KM = 60;

// Haversine mesafesi (km) — konum tabanlı arama semt adı döndürdüğünde
// (örn. "Ankara" yerine "Ulus") en yakın bilinen şehri bulmak için.
function distanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function normalizeCity(name) {
  return (name || '')
    .replace(/İ/g, 'i').replace(/I/g, 'i').replace(/ı/g, 'i')
    .replace(/Ş/g, 's').replace(/ş/g, 's')
    .replace(/Ğ/g, 'g').replace(/ğ/g, 'g')
    .replace(/Ü/g, 'u').replace(/ü/g, 'u')
    .replace(/Ö/g, 'o').replace(/ö/g, 'o')
    .replace(/Ç/g, 'c').replace(/ç/g, 'c')
    .toLowerCase()
    .trim();
}

// ---------- DOM references ----------
const el = {
  cityInput: document.getElementById('cityInput'),
  searchBtn: document.getElementById('searchBtn'),
  locBtn: document.getElementById('locBtn'),
  favoriteBtn: document.getElementById('favoriteBtn'),
  historyList: document.getElementById('historyList'),
  favoritesList: document.getElementById('favoritesList'),
  errorBanner: document.getElementById('errorBanner'),
  spinner: document.getElementById('loadingSpinner'),
  skeleton: document.getElementById('skeleton'),
  content: document.getElementById('content'),

  sidebar: document.getElementById('sidebar'),
  sidebarToggle: document.getElementById('sidebarToggle'),
  drawerOverlay: document.getElementById('drawerOverlay'),
  miniCityName: document.getElementById('miniCityName'),
  miniTemp: document.getElementById('miniTemp'),

  cityName: document.getElementById('cityName'),
  flagImg: document.getElementById('flagImg'),
  dateTime: document.getElementById('dateTime'),
  unitToggle: document.getElementById('unitToggle'),
  weatherIcon: document.getElementById('weatherIcon'),
  tempValue: document.getElementById('tempValue'),
  tempUnit: document.getElementById('tempUnit'),
  weatherDesc: document.getElementById('weatherDesc'),
  sunrise: document.getElementById('sunrise'),
  sunset: document.getElementById('sunset'),
  insightBlurb: document.getElementById('insightBlurb'),

  feelsLike: document.getElementById('feelsLike'),
  humidity: document.getElementById('humidity'),
  windSpeed: document.getElementById('windSpeed'),
  visibility: document.getElementById('visibility'),
  uvIndex: document.getElementById('uvIndex'),
  pressure: document.getElementById('pressure'),

  aqiBadge: document.getElementById('aqiBadge'),
  aqiValue: document.getElementById('aqiValue'),
  aqiLabel: document.getElementById('aqiLabel'),
  pm25: document.getElementById('pm25'),
  pm10: document.getElementById('pm10'),
  no2: document.getElementById('no2'),
  o3: document.getElementById('o3'),

  forecastDays: document.getElementById('forecastDays'),
  hourlyScroll: document.getElementById('hourlyScroll'),
  highlightsList: document.getElementById('highlightsList'),

  moonIcon: document.getElementById('moonIcon'),
  moonName: document.getElementById('moonName'),
  windNeedle: document.getElementById('windNeedle'),
  trendChart: document.getElementById('trendChart'),
  hourlyChart: document.getElementById('hourlyChart'),
  weatherFx: document.getElementById('weatherFx'),
  hiLo: document.getElementById('hiLo'),
};

// ---------- state ----------
const state = {
  unit: 'metric', // 'metric' = C, 'imperial' = F
  current: null, // raw current weather (metric)
  forecastGroups: [], // grouped by day
  selectedDayIndex: 0,
  clockTimer: null,
  uvValue: null,
};

// ============================================================
// Utilities
// ============================================================
function debounce(fn, delay) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

function showError(message) {
  el.errorBanner.textContent = message;
  el.errorBanner.classList.remove('hidden');
  setTimeout(() => el.errorBanner.classList.add('hidden'), 5000);
}

function setLoading(isLoading) {
  if (isLoading) {
    el.spinner.classList.remove('hidden');
    el.skeleton.classList.remove('hidden');
    el.content.classList.add('hidden');
  } else {
    el.spinner.classList.add('hidden');
    el.skeleton.classList.add('hidden');
  }
}

function cToF(c) {
  return (c * 9) / 5 + 32;
}

function fmtTemp(celsius) {
  const val = state.unit === 'metric' ? celsius : cToF(celsius);
  return Math.round(val);
}

function unitSuffix() {
  return state.unit === 'metric' ? '°C' : '°F';
}

// Formats an OWM unix (UTC seconds) timestamp as HH:MM in the CITY's local time
function fmtCityTime(unixSec, tzOffsetSec) {
  const d = new Date((unixSec + tzOffsetSec) * 1000);
  const h = String(d.getUTCHours()).padStart(2, '0');
  const m = String(d.getUTCMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

function cityNowDate(tzOffsetSec) {
  return new Date(Date.now() + tzOffsetSec * 1000);
}

function weatherIconUrl(icon) {
  return `https://openweathermap.org/img/wn/${icon}@2x.png`;
}

function flagUrl(countryCode) {
  return `https://flagcdn.com/48x36/${countryCode.toLowerCase()}.png`;
}

// ============================================================
// Hero background photo (landmark or weather gradient fallback)
// ============================================================
// Eşleşen landmark URL'sini döner, yoksa null — DOM'a burada dokunmaz.
function findLandmarkPhoto(cityName, lat, lon) {
  let match = LANDMARKS[normalizeCity(cityName)];

  // Konum bazlı aramalarda OWM genelde semt adı döndürür (ör. "Ulus"),
  // bu yüzden tam isim eşleşmezse en yakın bilinen şehri koordinattan bul.
  if (!match && typeof lat === 'number' && typeof lon === 'number') {
    let closest = null;
    let closestDist = Infinity;
    Object.values(LANDMARKS).forEach((landmark) => {
      const d = distanceKm(lat, lon, landmark.lat, landmark.lon);
      if (d < closestDist) {
        closestDist = d;
        closest = landmark;
      }
    });
    if (closest && closestDist <= LANDMARK_MATCH_RADIUS_KM) match = closest;
  }

  return match;
}

// ============================================================
// Moon phase
// ============================================================
function getMoonPhaseFraction(date) {
  const synodicMonth = 29.53058867;
  const knownNewMoon = Date.UTC(2000, 0, 6, 18, 14);
  const diffDays = (date.getTime() - knownNewMoon) / 86400000;
  let phase = (diffDays % synodicMonth) / synodicMonth;
  if (phase < 0) phase += 1;
  return phase;
}

function moonPhaseInfo(phase) {
  const phases = [
    { max: 0.03, icon: '🌑', name: 'Yeni Ay' },
    { max: 0.22, icon: '🌒', name: 'Hilal (Büyüyen)' },
    { max: 0.28, icon: '🌓', name: 'İlk Dördün' },
    { max: 0.47, icon: '🌔', name: 'Şişkin (Büyüyen)' },
    { max: 0.53, icon: '🌕', name: 'Dolunay' },
    { max: 0.72, icon: '🌖', name: 'Şişkin (Küçülen)' },
    { max: 0.78, icon: '🌗', name: 'Son Dördün' },
    { max: 0.97, icon: '🌘', name: 'Hilal (Küçülen)' },
  ];
  return phases.find((p) => phase <= p.max) || { icon: '🌑', name: 'Yeni Ay' };
}

function renderMoonPhase() {
  const info = moonPhaseInfo(getMoonPhaseFraction(new Date()));
  el.moonIcon.textContent = info.icon;
  el.moonName.textContent = info.name;
}

// ============================================================
// Weather FX — canvas particle background (rain / snow / clouds / sun / stars)
// ============================================================
const fxCtx = el.weatherFx ? el.weatherFx.getContext('2d') : null;
let fxParticles = [];
let fxMode = 'none';
let fxAnimId = null;
let fxTime = 0;

function resizeFxCanvas() {
  if (!el.weatherFx) return;
  el.weatherFx.width = window.innerWidth;
  el.weatherFx.height = window.innerHeight;
}
window.addEventListener('resize', resizeFxCanvas);
resizeFxCanvas();

// Mobil <-> masaüstü kırılım noktasını geçince (pencere boyutu, ekran döndürme)
// arka planı doğru mod (cover / contain+blur) ile yeniden uygula.
window.addEventListener('resize', debounce(() => {
  if (state.bgWeatherId != null) {
    applyBackground(state.bgWeatherId, state.bgIcon, state.bgPhoto);
  }
}, 250));

function initRain() {
  fxParticles = Array.from({ length: 110 }, () => ({
    x: Math.random() * el.weatherFx.width,
    y: Math.random() * el.weatherFx.height,
    len: 10 + Math.random() * 16,
    speed: 5 + Math.random() * 6,
  }));
}

function initSnow() {
  fxParticles = Array.from({ length: 70 }, () => ({
    x: Math.random() * el.weatherFx.width,
    y: Math.random() * el.weatherFx.height,
    r: 1 + Math.random() * 2.5,
    speed: 0.5 + Math.random() * 1.4,
    drift: Math.random() * 1.2 - 0.6,
  }));
}

function initClouds() {
  fxParticles = Array.from({ length: 5 }, () => ({
    x: Math.random() * el.weatherFx.width,
    y: 30 + Math.random() * (el.weatherFx.height * 0.35),
    scale: 0.6 + Math.random() * 1.1,
    speed: 0.15 + Math.random() * 0.3,
  }));
}

function initStars() {
  fxParticles = Array.from({ length: 60 }, () => ({
    x: Math.random() * el.weatherFx.width,
    y: Math.random() * el.weatherFx.height * 0.6,
    r: 0.5 + Math.random() * 1.4,
    phase: Math.random() * Math.PI * 2,
  }));
}

function drawCloud(x, y, scale) {
  fxCtx.save();
  fxCtx.translate(x, y);
  fxCtx.scale(scale, scale);
  fxCtx.beginPath();
  fxCtx.arc(0, 0, 30, 0, Math.PI * 2);
  fxCtx.arc(28, 10, 22, 0, Math.PI * 2);
  fxCtx.arc(-28, 10, 22, 0, Math.PI * 2);
  fxCtx.arc(0, 18, 26, 0, Math.PI * 2);
  fxCtx.fill();
  fxCtx.restore();
}

function drawSunRays() {
  const cx = el.weatherFx.width * 0.82;
  const cy = el.weatherFx.height * 0.12;
  const grad = fxCtx.createRadialGradient(cx, cy, 0, cx, cy, 260);
  grad.addColorStop(0, 'rgba(255,214,120,0.35)');
  grad.addColorStop(1, 'rgba(255,214,120,0)');
  fxCtx.fillStyle = grad;
  fxCtx.beginPath();
  fxCtx.arc(cx, cy, 260, 0, Math.PI * 2);
  fxCtx.fill();

  fxCtx.save();
  fxCtx.translate(cx, cy);
  fxCtx.rotate(fxTime * 0.05);
  fxCtx.strokeStyle = 'rgba(255,214,120,0.18)';
  fxCtx.lineWidth = 3;
  for (let i = 0; i < 12; i++) {
    const angle = (i / 12) * Math.PI * 2;
    fxCtx.beginPath();
    fxCtx.moveTo(Math.cos(angle) * 40, Math.sin(angle) * 40);
    fxCtx.lineTo(Math.cos(angle) * 220, Math.sin(angle) * 220);
    fxCtx.stroke();
  }
  fxCtx.restore();
}

function animateFx() {
  fxCtx.clearRect(0, 0, el.weatherFx.width, el.weatherFx.height);
  fxTime += 0.016;

  if (fxMode === 'rain') {
    fxCtx.strokeStyle = 'rgba(150,180,220,0.4)';
    fxCtx.lineWidth = 1.4;
    fxParticles.forEach((p) => {
      fxCtx.beginPath();
      fxCtx.moveTo(p.x, p.y);
      fxCtx.lineTo(p.x - 2, p.y + p.len);
      fxCtx.stroke();
      p.y += p.speed * 4;
      if (p.y > el.weatherFx.height) {
        p.y = -p.len;
        p.x = Math.random() * el.weatherFx.width;
      }
    });
  } else if (fxMode === 'snow') {
    fxCtx.fillStyle = 'rgba(255,255,255,0.85)';
    fxParticles.forEach((p) => {
      fxCtx.beginPath();
      fxCtx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      fxCtx.fill();
      p.y += p.speed;
      p.x += p.drift;
      if (p.y > el.weatherFx.height) {
        p.y = -p.r;
        p.x = Math.random() * el.weatherFx.width;
      }
    });
  } else if (fxMode === 'clouds') {
    fxCtx.fillStyle = 'rgba(255,255,255,0.05)';
    fxParticles.forEach((p) => {
      drawCloud(p.x, p.y, p.scale);
      p.x += p.speed;
      if (p.x > el.weatherFx.width + 200) p.x = -200;
    });
  } else if (fxMode === 'stars') {
    fxParticles.forEach((p) => {
      const op = 0.4 + 0.6 * Math.abs(Math.sin(fxTime + p.phase));
      fxCtx.fillStyle = `rgba(255,255,255,${op})`;
      fxCtx.beginPath();
      fxCtx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      fxCtx.fill();
    });
  } else if (fxMode === 'sun') {
    drawSunRays();
  }

  fxAnimId = requestAnimationFrame(animateFx);
}

function setWeatherFx(weatherId, icon) {
  if (!fxCtx) return;
  const isNight = icon.endsWith('n');
  cancelAnimationFrame(fxAnimId);
  fxParticles = [];

  if (weatherId >= 200 && weatherId < 600) {
    fxMode = 'rain';
    initRain();
  } else if (weatherId >= 600 && weatherId < 700) {
    fxMode = 'snow';
    initSnow();
  } else if (weatherId === 800 && !isNight) {
    fxMode = 'sun';
  } else if (weatherId === 800 && isNight) {
    fxMode = 'stars';
    initStars();
  } else {
    fxMode = 'clouds';
    initClouds();
  }
  animateFx();
}

// ============================================================
// LocalStorage: history + favorites
// ============================================================
function getHistory() {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY)) || [];
  } catch {
    return [];
  }
}

function addToHistory(cityLabel) {
  let history = getHistory().filter((c) => c.toLowerCase() !== cityLabel.toLowerCase());
  history.unshift(cityLabel);
  history = history.slice(0, HISTORY_MAX);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  renderHistory();
  pushHistoryToBackend(cityLabel);
}

// Backend (Vercel KV) ile senkron — yoksa/erişilemiyorsa sessizce localStorage'a düşer.
async function syncHistoryFromBackend() {
  try {
    const res = await fetch(`${CONFIG.BASE_URL}/history`);
    if (!res.ok) return;
    const { history } = await res.json();
    if (Array.isArray(history) && history.length) {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
      renderHistory();
    }
  } catch {
    // backend yok/erişilemiyor — localStorage ile devam
  }
}

function pushHistoryToBackend(city) {
  fetch(`${CONFIG.BASE_URL}/history`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ city }),
  }).catch(() => {});
}

function renderHistory() {
  const history = getHistory();
  el.historyList.innerHTML = '';
  history.forEach((city) => {
    const chip = document.createElement('button');
    chip.className = 'history-chip';
    chip.textContent = city;
    chip.addEventListener('click', () => loadByCity(city));
    el.historyList.appendChild(chip);
  });
}

function getFavorites() {
  try {
    return JSON.parse(localStorage.getItem(FAVORITES_KEY)) || [];
  } catch {
    return [];
  }
}

function isFavorite(cityLabel) {
  return getFavorites().some((c) => c.toLowerCase() === cityLabel.toLowerCase());
}

function toggleFavorite(cityLabel) {
  let favs = getFavorites();
  if (isFavorite(cityLabel)) {
    favs = favs.filter((c) => c.toLowerCase() !== cityLabel.toLowerCase());
  } else {
    favs.unshift(cityLabel);
  }
  localStorage.setItem(FAVORITES_KEY, JSON.stringify(favs));
  renderFavorites();
  updateFavoriteButtonState(cityLabel);
  pushFavoriteToggleToBackend(cityLabel);
}

function removeFavorite(cityLabel) {
  const favs = getFavorites().filter((c) => c.toLowerCase() !== cityLabel.toLowerCase());
  localStorage.setItem(FAVORITES_KEY, JSON.stringify(favs));
  renderFavorites();
  if (state.current && state.current.name.toLowerCase() === cityLabel.toLowerCase()) {
    updateFavoriteButtonState(cityLabel);
  }
  pushFavoriteToggleToBackend(cityLabel);
}

// Backend (Vercel KV) ile senkron — yoksa/erişilemiyorsa sessizce localStorage'a düşer.
async function syncFavoritesFromBackend() {
  try {
    const res = await fetch(`${CONFIG.BASE_URL}/favorites`);
    if (!res.ok) return;
    const { favorites } = await res.json();
    if (Array.isArray(favorites) && favorites.length) {
      localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
      renderFavorites();
      if (state.current) updateFavoriteButtonState(state.current.name);
    }
  } catch {
    // backend yok/erişilemiyor — localStorage ile devam
  }
}

// Backend'deki uç toggle (yoksa ekle, varsa çıkar) mantığıyla çalışır —
// hem toggleFavorite hem removeFavorite için doğru sonucu üretir.
function pushFavoriteToggleToBackend(city) {
  fetch(`${CONFIG.BASE_URL}/favorites`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ city }),
  }).catch(() => {});
}

function renderFavorites() {
  const favs = getFavorites();
  el.favoritesList.innerHTML = '';
  favs.forEach((city) => {
    const chip = document.createElement('div');
    chip.className = 'fav-chip';
    chip.innerHTML = `<span>${city}</span>`;
    chip.addEventListener('click', () => loadByCity(city));

    const removeBtn = document.createElement('button');
    removeBtn.className = 'fav-remove icon-btn';
    removeBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      removeFavorite(city);
    });
    chip.appendChild(removeBtn);
    el.favoritesList.appendChild(chip);
  });
}

function updateFavoriteButtonState(cityLabel) {
  el.favoriteBtn.classList.toggle('active', isFavorite(cityLabel));
}

// ============================================================
// API calls
// ============================================================
async function apiGet(url) {
  const res = await fetch(url);
  if (!res.ok) {
    if (res.status === 404) {
      throw new Error('Şehir bulunamadı. Lütfen adı kontrol edip tekrar deneyin.');
    }
    if (res.status === 401) {
      throw new Error('API anahtarı geçersiz. Sunucudaki OWM_API_KEY ortam değişkenini kontrol edin.');
    }
    throw new Error('Veri alınırken bir hata oluştu. Lütfen tekrar deneyin.');
  }
  return res.json();
}

function fetchCurrentByCity(city) {
  const url = `${CONFIG.BASE_URL}/weather?city=${encodeURIComponent(city)}`;
  return apiGet(url);
}

function fetchCurrentByCoords(lat, lon) {
  const url = `${CONFIG.BASE_URL}/weather?lat=${lat}&lon=${lon}`;
  return apiGet(url);
}

function fetchForecastByCity(city) {
  const url = `${CONFIG.BASE_URL}/forecast?city=${encodeURIComponent(city)}`;
  return apiGet(url);
}

function fetchForecastByCoords(lat, lon) {
  const url = `${CONFIG.BASE_URL}/forecast?lat=${lat}&lon=${lon}`;
  return apiGet(url);
}

function fetchAirPollution(lat, lon) {
  const url = `${CONFIG.BASE_URL}/air-pollution?lat=${lat}&lon=${lon}`;
  return apiGet(url);
}

// UV index: eski/deprecated uçlarda bulunur, bazı hesaplarda çalışmayabilir.
async function fetchUvIndex(lat, lon) {
  try {
    const url = `${CONFIG.BASE_URL}/uvi?lat=${lat}&lon=${lon}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data.value === 'number' ? data.value : null;
  } catch {
    return null;
  }
}

// ============================================================
// Sayfa arka planı — doğrudan body.style üzerinden (bkz. style.css notu)
// ============================================================
function weatherGradient(weatherId, icon) {
  const isNight = icon.endsWith('n');
  if (weatherId >= 200 && weatherId < 600) return 'var(--grad-rain)';
  if (weatherId >= 600 && weatherId < 700) return 'var(--grad-snow)';
  if (weatherId >= 700 && weatherId < 800) return 'var(--grad-clouds)';
  if (weatherId === 800) return isNight ? 'var(--grad-night)' : 'var(--grad-clear-day)';
  return isNight ? 'var(--grad-night)' : 'var(--grad-clouds)';
}

// Dar (mobil/dikey) ekranlarda yatay fotoğrafları "cover" ile kırpmak konuyu
// kadraj dışına atıyordu. Masaüstünde (geniş) temiz "cover" kullanılırken,
// dar ekranlarda fotoğrafın TAMAMI ("contain") gösteriliyor, kenarlarda kalan
// boşluk aynı fotoğrafın bulanık kopyasıyla dolduruluyor.
const MOBILE_BREAKPOINT_PX = 700;

function applyBackground(weatherId, icon, photo) {
  const grad = weatherGradient(weatherId, icon);
  const isNarrow = window.innerWidth < MOBILE_BREAKPOINT_PX;

  if (photo) {
    if (isNarrow) {
      const scrim = 'linear-gradient(180deg, rgba(6,9,14,0.1) 0%, rgba(6,9,14,0.3) 55%, rgba(6,9,14,0.75) 100%)';
      document.body.style.backgroundImage = `${scrim}, url("${photo.url}"), url("${photo.blurUrl}")`;
      document.body.style.backgroundSize = '100% 100%, contain, cover';
      document.body.style.backgroundPosition = '0 0, center, center';
    } else {
      const scrim = 'linear-gradient(180deg, rgba(6,9,14,0.15) 0%, rgba(6,9,14,0.4) 60%, rgba(6,9,14,0.82) 100%)';
      document.body.style.backgroundImage = `${scrim}, url("${photo.url}")`;
      document.body.style.backgroundSize = '100% 100%, cover';
      document.body.style.backgroundPosition = '0 0, center';
    }
  } else {
    document.body.style.backgroundImage = grad;
    document.body.style.backgroundSize = 'cover';
    document.body.style.backgroundPosition = 'center';
  }
}

// ============================================================
// Rendering
// ============================================================
function renderCurrent(data) {
  el.cityName.textContent = `${data.name}`;
  el.flagImg.src = flagUrl(data.sys.country);
  el.flagImg.alt = data.sys.country;

  const icon = data.weather[0].icon;
  el.weatherIcon.src = weatherIconUrl(icon);
  el.weatherIcon.alt = data.weather[0].description;
  el.weatherDesc.textContent = data.weather[0].description;
  el.hiLo.textContent = `Y: ${fmtTemp(data.main.temp_max)}°   D: ${fmtTemp(data.main.temp_min)}°`;

  updateTempDisplay();
  el.tempUnit.textContent = unitSuffix();

  el.feelsLike.textContent = `${fmtTemp(data.main.feels_like)}°`;
  el.humidity.textContent = `${data.main.humidity}%`;
  el.pressure.textContent = `${data.main.pressure} hPa`;

  const windKmh = Math.round(data.wind.speed * 3.6);
  el.windSpeed.textContent = `${windKmh} km/s ${degToCompass(data.wind.deg)}`;

  const visKm = (data.visibility / 1000).toFixed(1);
  el.visibility.textContent = `${visKm} km`;

  el.sunrise.textContent = fmtCityTime(data.sys.sunrise, data.timezone);
  el.sunset.textContent = fmtCityTime(data.sys.sunset, data.timezone);

  el.insightBlurb.textContent = `Bugün hava ${data.weather[0].description}, rüzgar ${degToCompass(data.wind.deg)} yönünden ${windKmh} km/s hızla esiyor.`;

  el.miniCityName.textContent = data.name;
  el.miniTemp.textContent = `${fmtTemp(data.main.temp)}°`;

  const photo = findLandmarkPhoto(data.name, data.coord.lat, data.coord.lon);
  state.bgWeatherId = data.weather[0].id;
  state.bgIcon = icon;
  state.bgPhoto = photo;
  applyBackground(data.weather[0].id, icon, photo);
  setWeatherFx(data.weather[0].id, icon);
  startClock(data.timezone);
  renderMoonPhase();
  renderWindCompass(data);
  updateFavoriteButtonState(data.name);

  el.content.classList.remove('hidden');
}

function renderWindCompass(data) {
  const deg = data.wind.deg || 0;
  el.windNeedle.style.transform = `rotate(${deg}deg)`;
}

function updateTempDisplay() {
  if (!state.current) return;
  el.tempValue.classList.remove('updating');
  void el.tempValue.offsetWidth; // restart animation
  el.tempValue.textContent = fmtTemp(state.current.main.temp);
  el.tempUnit.textContent = unitSuffix();
  el.tempValue.classList.add('updating');
  el.miniTemp.textContent = `${fmtTemp(state.current.main.temp)}°`;
}

function degToCompass(deg) {
  const dirs = ['K', 'KKD', 'KD', 'DKD', 'D', 'DGD', 'GD', 'GGD', 'G', 'GGB', 'GB', 'BGB', 'B', 'BKB', 'KB', 'KKB'];
  return dirs[Math.round(deg / 22.5) % 16];
}

function startClock(tzOffsetSec) {
  if (state.clockTimer) clearInterval(state.clockTimer);
  const update = () => {
    const d = cityNowDate(tzOffsetSec);
    const dayName = new Intl.DateTimeFormat('tr-TR', { weekday: 'long', timeZone: 'UTC' }).format(d);
    const dateStr = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(d);
    const h = String(d.getUTCHours()).padStart(2, '0');
    const m = String(d.getUTCMinutes()).padStart(2, '0');
    const s = String(d.getUTCSeconds()).padStart(2, '0');
    el.dateTime.textContent = `${dayName}, ${dateStr} — ${h}:${m}:${s}`;
  };
  update();
  state.clockTimer = setInterval(update, 1000);
}

function renderAQI(data) {
  const item = data.list[0];
  const aqi = item.main.aqi; // 1-5
  const labels = { 1: 'İyi', 2: 'Makul', 3: 'Orta', 4: 'Kötü', 5: 'Çok Kötü' };

  el.aqiBadge.className = `aqi-badge aqi-${aqi}`;
  el.aqiValue.textContent = aqi;
  el.aqiLabel.textContent = labels[aqi] || '--';

  el.pm25.textContent = `${item.components.pm2_5.toFixed(1)} µg/m³`;
  el.pm10.textContent = `${item.components.pm10.toFixed(1)} µg/m³`;
  el.no2.textContent = `${item.components.no2.toFixed(1)} µg/m³`;
  el.o3.textContent = `${item.components.o3.toFixed(1)} µg/m³`;

  renderHighlights();
}

function groupForecastByDay(forecast) {
  const tzOffset = forecast.city.timezone;
  const groups = new Map();

  forecast.list.forEach((item) => {
    const localDate = new Date((item.dt + tzOffset) * 1000);
    const key = `${localDate.getUTCFullYear()}-${localDate.getUTCMonth()}-${localDate.getUTCDate()}`;
    if (!groups.has(key)) {
      groups.set(key, { key, localDate, entries: [], min: Infinity, max: -Infinity });
    }
    const g = groups.get(key);
    g.entries.push(item);
    g.min = Math.min(g.min, item.main.temp_min);
    g.max = Math.max(g.max, item.main.temp_max);
  });

  return Array.from(groups.values()).slice(0, 5);
}

function pickRepresentativeIcon(entries) {
  let best = entries[0];
  let bestDiff = Infinity;
  entries.forEach((item) => {
    const hour = new Date(item.dt * 1000).getUTCHours();
    const diff = Math.abs(hour - 13);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = item;
    }
  });
  return best;
}

function renderForecastDays(groups) {
  el.forecastDays.innerHTML = '';

  groups.forEach((group, idx) => {
    const rep = pickRepresentativeIcon(group.entries);
    const dayName = idx === 0
      ? 'Bugün'
      : new Intl.DateTimeFormat('tr-TR', { weekday: 'short', timeZone: 'UTC' }).format(group.localDate);

    const tile = document.createElement('div');
    tile.className = 'forecast-tile' + (idx === state.selectedDayIndex ? ' active' : '');
    tile.innerHTML = `
      <span class="tile-day">${dayName}</span>
      <img src="${weatherIconUrl(rep.weather[0].icon)}" alt="${rep.weather[0].description}">
      <span class="tile-temps"><b>${fmtTemp(group.max)}°</b> / ${fmtTemp(group.min)}°</span>
    `;
    tile.addEventListener('click', () => {
      state.selectedDayIndex = idx;
      document.querySelectorAll('.forecast-tile').forEach((t) => t.classList.remove('active'));
      tile.classList.add('active');
      renderHourly(groups[idx]);
      renderTrendChart(groups);
    });
    el.forecastDays.appendChild(tile);
  });
}

function renderHourly(group) {
  el.hourlyScroll.innerHTML = '';
  const tzOffset = state.forecastMeta ? state.forecastMeta.timezone : 0;
  group.entries.forEach((item, idx) => {
    const pop = Math.round((item.pop || 0) * 100);
    const isNow = state.selectedDayIndex === 0 && idx === 0;
    const card = document.createElement('div');
    card.className = 'hour-card' + (isNow ? ' now' : '');
    card.innerHTML = `
      <span class="hour-time">${isNow ? 'Şimdi' : fmtCityTime(item.dt, tzOffset)}</span>
      <img src="${weatherIconUrl(item.weather[0].icon)}" alt="${item.weather[0].description}">
      <span class="hour-temp">${fmtTemp(item.main.temp)}°</span>
      <span class="hour-pop">💧 ${pop}%</span>
    `;
    el.hourlyScroll.appendChild(card);
  });
  renderHourlyChart(group);
}

function renderHourlyChart(group) {
  if (!el.hourlyChart || !group.entries.length) return;
  const w = 320, h = 60, padX = 16, padTop = 10, padBottom = 10;
  const temps = group.entries.map((item) => fmtTemp(item.main.temp));
  const lo = Math.min(...temps);
  const hi = Math.max(...temps);
  const range = hi - lo || 1;
  const plotH = h - padTop - padBottom;
  const stepX = temps.length > 1 ? (w - padX * 2) / (temps.length - 1) : 0;

  const points = temps.map((v, i) => [padX + i * stepX, padTop + plotH - ((v - lo) / range) * plotH]);
  const linePath = smoothLinePath(points);
  const areaPath = `${linePath} L${points[points.length - 1][0].toFixed(1)},${(h - padBottom).toFixed(1)} L${points[0][0].toFixed(1)},${(h - padBottom).toFixed(1)} Z`;
  const dots = points.map((p) => `<circle class="hourly-dot" cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="2.5"></circle>`).join('');

  el.hourlyChart.innerHTML = `
    <defs>
      <linearGradient id="hourlyGradient" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#4da3ff" stop-opacity="0.35"/>
        <stop offset="100%" stop-color="#4da3ff" stop-opacity="0"/>
      </linearGradient>
    </defs>
    <path class="hourly-area" d="${areaPath}"></path>
    <path class="hourly-line" d="${linePath}"></path>
    ${dots}
  `;
}

// Smooth curve through points using midpoint cubic-bezier segments (no external chart lib)
function smoothLinePath(points) {
  if (points.length < 2) return '';
  let d = `M${points[0][0].toFixed(1)},${points[0][1].toFixed(1)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const [x0, y0] = points[i];
    const [x1, y1] = points[i + 1];
    const mx = (x0 + x1) / 2;
    d += ` C${mx.toFixed(1)},${y0.toFixed(1)} ${mx.toFixed(1)},${y1.toFixed(1)} ${x1.toFixed(1)},${y1.toFixed(1)}`;
  }
  return d;
}

function renderTrendChart(groups) {
  if (!el.trendChart || !groups.length) return;
  const w = 320, h = 90, padX = 20, padTop = 22, padBottom = 20;
  const toUnit = (c) => (state.unit === 'metric' ? c : cToF(c));

  const maxVals = groups.map((g) => toUnit(g.max));
  const lo = Math.min(...maxVals);
  const hi = Math.max(...maxVals);
  const range = hi - lo || 1;
  const plotH = h - padTop - padBottom;
  const stepX = groups.length > 1 ? (w - padX * 2) / (groups.length - 1) : 0;

  const xAt = (i) => padX + i * stepX;
  const yAt = (v) => padTop + plotH - ((v - lo) / range) * plotH;

  const points = maxVals.map((v, i) => [xAt(i), yAt(v)]);
  const linePath = smoothLinePath(points);
  const areaPath = `${linePath} L${points[points.length - 1][0].toFixed(1)},${(h - padBottom).toFixed(1)} L${points[0][0].toFixed(1)},${(h - padBottom).toFixed(1)} Z`;

  let labels = '';
  let valuesText = '';
  let dots = '';
  groups.forEach((g, i) => {
    const [x, y] = points[i];
    const dayName = i === 0 ? 'Bugün' : new Intl.DateTimeFormat('tr-TR', { weekday: 'short', timeZone: 'UTC' }).format(g.localDate);
    labels += `<text x="${x.toFixed(1)}" y="${h - 4}" class="trend-label" text-anchor="middle">${dayName}</text>`;
    valuesText += `<text x="${x.toFixed(1)}" y="${(y - 9).toFixed(1)}" class="trend-value" text-anchor="middle">${Math.round(maxVals[i])}°</text>`;
    dots += `<circle class="trend-dot${i === state.selectedDayIndex ? ' active' : ''}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.5"></circle>`;
  });

  el.trendChart.innerHTML = `
    <defs>
      <linearGradient id="trendGradient" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#4da3ff" stop-opacity="0.4"/>
        <stop offset="100%" stop-color="#4da3ff" stop-opacity="0"/>
      </linearGradient>
    </defs>
    <path class="trend-area" d="${areaPath}"></path>
    <path class="trend-line" d="${linePath}"></path>
    ${dots}
    ${valuesText}
    ${labels}
  `;
}

// ============================================================
// Highlights — gerçek veriden türetilen kısa uyarı/öneri kartları
// ============================================================
function renderHighlights() {
  if (!el.highlightsList || !state.current || !state.forecastGroups.length) return;
  const groups = state.forecastGroups;
  const toUnit = (c) => (state.unit === 'metric' ? c : cToF(c));
  const items = [];

  const hottest = groups.reduce((a, b) => (b.max > a.max ? b : a), groups[0]);
  const hottestIdx = groups.indexOf(hottest);
  const hottestLabel = hottestIdx === 0
    ? 'bugün'
    : new Intl.DateTimeFormat('tr-TR', { weekday: 'long', timeZone: 'UTC' }).format(hottest.localDate);
  items.push({ icon: '🔥', text: `Haftanın en sıcak günü ${hottestLabel}: ${fmtTemp(hottest.max)}°` });

  if (typeof state.uvValue === 'number' && state.uvValue >= 6) {
    items.push({ icon: '☀️', text: `UV endeksi yüksek (${state.uvValue.toFixed(1)}) — güneş kremi kullanmayı unutma.` });
  }

  const rainySoon = groups[0].entries.find((e) => (e.pop || 0) >= 0.5);
  if (rainySoon) {
    const tzOffset = state.forecastMeta ? state.forecastMeta.timezone : 0;
    items.push({ icon: '🌧️', text: `Bugün ${fmtCityTime(rainySoon.dt, tzOffset)} civarında yağış olasılığı yüksek — şemsiyeni yanına al.` });
  }

  const windKmh = Math.round((state.current.wind?.speed || 0) * 3.6);
  if (windKmh >= 30) {
    items.push({ icon: '🌬️', text: `Rüzgar ${windKmh} km/s hızla esiyor, dışarıda dikkatli ol.` });
  }

  const lowTemp = fmtTemp(groups[0].min);
  if (lowTemp <= (state.unit === 'metric' ? 5 : 41)) {
    items.push({ icon: '🧥', text: `Gece sıcaklık ${lowTemp}° civarına düşecek, kalın giyinmeyi unutma.` });
  }

  el.highlightsList.innerHTML = items.slice(0, 3).map((h) => `
    <div class="highlight-item"><span class="hl-icon">${h.icon}</span><span>${h.text}</span></div>
  `).join('');
}

// ============================================================
// IntersectionObserver — fade-in + aktif nav bölümü
// ============================================================
function setupObserver() {
  const targets = document.querySelectorAll('[data-observe]');
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('in-view');
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.1 }
  );
  targets.forEach((t) => observer.observe(t));
}

function setupNavObserver() {
  const sections = ['heroSection', 'hourlySection', 'forecastSection', 'aqiSection']
    .map((id) => document.getElementById(id))
    .filter(Boolean);

  const setActive = (id) => {
    document.querySelectorAll('.nav-link, .bnav-item').forEach((link) => {
      link.classList.toggle('active', link.dataset.target === id);
    });
  };

  const navObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) setActive(entry.target.id);
      });
    },
    { rootMargin: '-40% 0px -50% 0px', threshold: 0 }
  );
  sections.forEach((s) => navObserver.observe(s));
}

// ============================================================
// Orchestration
// ============================================================
async function loadWeatherData({ city, lat, lon }) {
  setLoading(true);
  try {
    let current, forecast;
    if (city) {
      [current, forecast] = await Promise.all([
        fetchCurrentByCity(city),
        fetchForecastByCity(city),
      ]);
    } else {
      [current, forecast] = await Promise.all([
        fetchCurrentByCoords(lat, lon),
        fetchForecastByCoords(lat, lon),
      ]);
    }

    state.current = current;
    state.forecastMeta = forecast.city;
    state.selectedDayIndex = 0;
    state.uvValue = null;

    renderCurrent(current);
    addToHistory(current.name);

    const groups = groupForecastByDay(forecast);
    state.forecastGroups = groups;
    renderForecastDays(groups);
    if (groups.length) renderHourly(groups[0]);
    renderTrendChart(groups);
    renderHighlights();

    const { lat: clat, lon: clon } = current.coord;
    fetchAirPollution(clat, clon).then(renderAQI).catch(() => {
      el.aqiValue.textContent = '--';
      el.aqiLabel.textContent = 'Kullanılamıyor';
    });
    fetchUvIndex(clat, clon).then((uv) => {
      state.uvValue = uv;
      el.uvIndex.textContent = uv === null ? 'N/A' : uv.toFixed(1);
      renderHighlights();
    });

    setupObserver();
    setupNavObserver();
  } catch (err) {
    showError(err.message || 'Beklenmeyen bir hata oluştu.');
  } finally {
    setLoading(false);
  }
}

function loadByCity(city) {
  el.cityInput.value = city;
  closeDrawer();
  loadWeatherData({ city });
}

function loadByGeolocation() {
  if (!navigator.geolocation) {
    showError('Tarayıcınız konum servisini desteklemiyor.');
    return;
  }
  setLoading(true);
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      loadWeatherData({ lat: pos.coords.latitude, lon: pos.coords.longitude });
    },
    () => {
      setLoading(false);
      showError('Konum bilgisi alınamadı. Lütfen tarayıcı izinlerini kontrol edin.');
    }
  );
}

// ============================================================
// Sidebar drawer (mobile)
// ============================================================
function openDrawer() {
  el.sidebar.classList.add('open');
  el.drawerOverlay.classList.add('open');
}
function closeDrawer() {
  el.sidebar.classList.remove('open');
  el.drawerOverlay.classList.remove('open');
}

el.sidebarToggle.addEventListener('click', () => {
  el.sidebar.classList.contains('open') ? closeDrawer() : openDrawer();
});
el.drawerOverlay.addEventListener('click', closeDrawer);
document.querySelectorAll('.nav-link').forEach((link) => {
  link.addEventListener('click', closeDrawer);
});

// ============================================================
// Event listeners
// ============================================================
const debouncedSearch = debounce((value) => {
  if (value.trim().length >= 2) loadByCity(value.trim());
}, 500);

el.cityInput.addEventListener('input', (e) => debouncedSearch(e.target.value));

el.cityInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const val = e.target.value.trim();
    if (val) loadByCity(val);
  }
});

el.searchBtn.addEventListener('click', () => {
  const val = el.cityInput.value.trim();
  if (val) loadByCity(val);
});

el.locBtn.addEventListener('click', loadByGeolocation);

el.favoriteBtn.addEventListener('click', () => {
  if (state.current) toggleFavorite(state.current.name);
});

el.unitToggle.addEventListener('click', () => {
  state.unit = state.unit === 'metric' ? 'imperial' : 'metric';
  updateTempDisplay();
  if (state.current) {
    el.feelsLike.textContent = `${fmtTemp(state.current.main.feels_like)}°`;
    el.hiLo.textContent = `Y: ${fmtTemp(state.current.main.temp_max)}°   D: ${fmtTemp(state.current.main.temp_min)}°`;
  }
  if (state.forecastGroups.length) {
    renderForecastDays(state.forecastGroups);
    renderHourly(state.forecastGroups[state.selectedDayIndex]);
    renderTrendChart(state.forecastGroups);
    renderHighlights();
  }
});

// ============================================================
// Init
// ============================================================
renderHistory();
renderFavorites();
syncHistoryFromBackend();
syncFavoritesFromBackend();
loadByGeolocation();
