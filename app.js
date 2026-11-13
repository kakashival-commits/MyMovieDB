const STORAGE_KEY = 'my_cinema_catalog_v1';
const SKIPPED_KEY = 'my_cinema_skipped_v1';
const CFG_KEY = 'my_cinema_cfg_v1';
const GIST_FILENAME = 'my_watched_cinema.json';
const GIST_SKIPPED_FILENAME = 'my_skipped_cinema.json';
const NO_POSTER = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="300" height="450" fill="%23111622"><rect width="300" height="450"/><text x="50%" y="50%" fill="%2364748b" font-family="sans-serif" font-size="20" text-anchor="middle">Без постера</text></svg>';

const GENRE_MAP = {
  28: 'Бойовик', 12: 'Пригоди', 16: 'Мультфільм', 35: 'Комедія', 80: 'Кримінал',
  99: 'Документальний', 18: 'Драма', 10751: 'Сімейний', 14: 'Фентезі', 36: 'Історія',
  27: 'Жахи', 10402: 'Музика', 9648: 'Детектив', 10749: 'Мелодрама', 878: 'Фантастика',
  10770: 'Телефільм', 53: 'Трилер', 10752: 'Військовий', 37: 'Вестерн',
  10759: 'Екшн і Пригоди', 10762: 'Дитячий', 10763: 'Новини', 10764: 'Реаліті',
  10765: 'Фантастика та Фентезі', 10766: 'Мильна опера', 10767: 'Ток-шоу', 10768: 'Війна та Політика'
};

const REGION_NAMES_UK = typeof Intl !== 'undefined' && Intl.DisplayNames
  ? new Intl.DisplayNames(['uk'], { type: 'region' })
  : null;

function formatCountry(code) {
  if (!code) return '';
  if (code === 'US') return 'США';
  if (code === 'GB') return 'Велика Британія';
  if (REGION_NAMES_UK) {
    try { return REGION_NAMES_UK.of(code); } catch (e) {}
  }
  return code;
}

let catalog = [];
let skippedIds = new Set();
let config = { tmdbKey: '', ghToken: '', gistId: '', sound: true, favEffect: 'heart' };
let currentCategory = 'all';
let activeItem = null;
let selectedRating = null;
let modalFavorite = false;

// Tinder 5.0 State
let tinderMode = 'movie';
let tinderDecade = 'all';
let tinderQueue = [];
let tinderHistory = [];
let tinderSessionSwiped = 0;
let tinderPage = 1;
let currentTinderItem = null;
let isFetchingTinder = false;
let topCardEl = null;
let activeSwipeCleanup = null;
const tinderDetailsCache = new Map();
const tinderCollectionCache = new Map();

// Roulette State
let isRouletteSpinning = false;

/* ================= PROCEDURAL WEB AUDIO ENGINE ================= */
let audioCtx = null;
function getAudioCtx() {
  if (!audioCtx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (Ctx) audioCtx = new Ctx();
  }
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

function playSound(type) {
  if (!config.sound) return;
  const ctx = getAudioCtx();
  if (!ctx) return;
  const now = ctx.currentTime;

  if (type === 'tick') {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(620, now);
    osc.frequency.exponentialRampToValueAtTime(180, now + 0.035);
    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.035);
    osc.connect(gain); gain.connect(ctx.destination);
    osc.start(now); osc.stop(now + 0.04);
  } else if (type === 'swipe') {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(240, now);
    osc.frequency.exponentialRampToValueAtTime(520, now + 0.14);
    gain.gain.setValueAtTime(0.1, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
    osc.connect(gain); gain.connect(ctx.destination);
    osc.start(now); osc.stop(now + 0.16);
  } else if (type === 'skip') {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(300, now);
    osc.frequency.exponentialRampToValueAtTime(140, now + 0.12);
    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
    osc.connect(gain); gain.connect(ctx.destination);
    osc.start(now); osc.stop(now + 0.14);
  } else if (type === 'super' || type === 'win') {
    const notes = type === 'super' ? [523.25, 659.25, 783.99, 1046.5, 1318.5] : [440, 554.37, 659.25, 880];
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + idx * 0.06);
      gain.gain.setValueAtTime(0.11, now + idx * 0.06);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.06 + 0.38);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(now + idx * 0.06);
      osc.stop(now + idx * 0.06 + 0.4);
    });
  }
}

function toggleSound() {
  config.sound = !config.sound;
  localStorage.setItem(CFG_KEY, JSON.stringify(config));
  updateSoundIcon();
  if (config.sound) playSound('tick');
  showToast(config.sound ? 'Звук увімкнено 🔊' : 'Звук вимкнено 🔇');
}

function updateSoundIcon() {
  document.getElementById('soundToggleBtn').textContent = config.sound ? '🔊' : '🔇';
}

function vibe(pattern) {
  if (navigator.vibrate) {
    try { navigator.vibrate(pattern); } catch (e) {}
  }
}

/* ================= PLATINUM / GOLD BOKEH & CONFETTI ENGINE ================= */
const fxCanvas = document.getElementById('fxCanvas');
const fxCtx = fxCanvas.getContext('2d');
let particles = [];
let fxAnimRunning = false;

function resizeFxCanvas() {
  fxCanvas.width = window.innerWidth;
  fxCanvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeFxCanvas);
resizeFxCanvas();

function spawnParticles(mode = 'confetti', originX = window.innerWidth / 2, originY = window.innerHeight / 2) {
  if (mode === 'goldDust' || mode === 'platinumDust') {
    const palette = mode === 'platinumDust'
      ? ['#ecfeff', '#67e8f9', '#e879f9', '#c084fc', '#ffffff']
      : ['#fef08a', '#fbbf24', '#f59e0b', '#fde68a', '#ffffff'];
    for (let i = 0; i < 72; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1.5 + Math.random() * 6.5;
      particles.push({
        type: 'bokeh',
        isPlatinum: mode === 'platinumDust',
        x: originX + (Math.random() - 0.5) * 180,
        y: originY + (Math.random() - 0.5) * 240,
        vx: Math.cos(angle) * speed * 0.7,
        vy: Math.sin(angle) * speed * 0.7 - (1.2 + Math.random() * 2.2),
        radius: 2 + Math.random() * 6.5,
        color: palette[Math.floor(Math.random() * palette.length)],
        alpha: 0.95,
        decay: 0.012 + Math.random() * 0.01,
        twinkle: Math.random() * Math.PI * 2
      });
    }
  } else {
    const colors = ['#f59e0b', '#3b82f6', '#10b981', '#fbbf24', '#a855f7'];
    for (let i = 0; i < 65; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 4 + Math.random() * 10;
      particles.push({
        type: 'confetti',
        x: originX,
        y: originY,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 4,
        size: 6 + Math.random() * 6,
        color: colors[Math.floor(Math.random() * colors.length)],
        alpha: 1,
        rot: Math.random() * 360,
        vRot: (Math.random() - 0.5) * 12
      });
    }
  }
  if (!fxAnimRunning) renderParticles();
}

function renderParticles() {
  fxAnimRunning = true;
  fxCtx.clearRect(0, 0, fxCanvas.width, fxCanvas.height);
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    if (p.type === 'bokeh') {
      p.x += p.vx;
      p.y += p.vy;
      p.vx *= 0.985;
      p.vy *= 0.985;
      p.twinkle += 0.14;
      p.alpha -= p.decay;

      if (p.alpha <= 0) {
        particles.splice(i, 1);
        continue;
      }

      const pulseAlpha = Math.max(0, p.alpha * (0.65 + 0.35 * Math.sin(p.twinkle)));
      fxCtx.save();
      fxCtx.globalCompositeOperation = 'lighter';
      const grad = fxCtx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.radius * 2.2);
      if (p.isPlatinum) {
        grad.addColorStop(0, `rgba(236, 254, 255, ${pulseAlpha})`);
        grad.addColorStop(0.45, `rgba(103, 232, 249, ${pulseAlpha * 0.72})`);
        grad.addColorStop(1, 'rgba(192, 132, 252, 0)');
      } else {
        grad.addColorStop(0, `rgba(254, 240, 138, ${pulseAlpha})`);
        grad.addColorStop(0.45, `rgba(251, 191, 36, ${pulseAlpha * 0.7})`);
        grad.addColorStop(1, 'rgba(245, 158, 11, 0)');
      }
      fxCtx.fillStyle = grad;
      fxCtx.beginPath();
      fxCtx.arc(p.x, p.y, p.radius * 2.2, 0, Math.PI * 2);
      fxCtx.fill();
      fxCtx.restore();
    } else {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.28;
      p.vx *= 0.98;
      p.rot += p.vRot;
      p.alpha -= 0.016;

      if (p.alpha <= 0) {
        particles.splice(i, 1);
        continue;
      }

      fxCtx.save();
      fxCtx.globalAlpha = p.alpha;
      fxCtx.translate(p.x, p.y);
      fxCtx.rotate((p.rot * Math.PI) / 180);
      fxCtx.fillStyle = p.color;
      fxCtx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.65);
      fxCtx.restore();
    }
  }

  if (particles.length > 0) {
    requestAnimationFrame(renderParticles);
  } else {
    fxAnimRunning = false;
    fxCtx.clearRect(0, 0, fxCanvas.width, fxCanvas.height);
  }
}

/* ================= INITIALIZATION ================= */
window.addEventListener('DOMContentLoaded', async () => {
  loadConfig();
  updateSoundIcon();
  updateFavTabIcon();
  loadLocalCatalog();
  loadSkippedIds();
  buildRatingButtons();
  renderCatalog();

  if (config.ghToken && config.gistId) {
    await syncFromGist(true);
  } else if (!config.tmdbKey) {
    showToast('Вкажіть TMDb API Key у Налаштуваннях ⚙️');
  }
});

function loadConfig() {
  try {
    const s = JSON.parse(localStorage.getItem(CFG_KEY));
    if (s) config = { ...config, ...s };
  } catch (e) {}
}

function normalizeCatalogItem(item) {
  if (typeof item.favorite !== 'boolean') {
    const hasLegacyFav = item.note && (item.note.includes('Улюблене') || item.note.includes('Платина'));
    item.favorite = Boolean(hasLegacyFav);
  }
  return item;
}

function loadLocalCatalog() {
  try {
    const s = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (Array.isArray(s)) catalog = s.map(normalizeCatalogItem);
  } catch (e) {}
}
function saveLocalCatalog() { localStorage.setItem(STORAGE_KEY, JSON.stringify(catalog)); }

function loadSkippedIds() {
  try {
    const s = JSON.parse(localStorage.getItem(SKIPPED_KEY));
    if (Array.isArray(s)) skippedIds = new Set(s);
  } catch (e) {}
}
function saveSkippedIds() {
  localStorage.setItem(SKIPPED_KEY, JSON.stringify(Array.from(skippedIds)));
}

function updateFavTabIcon() {
  const iconEl = document.getElementById('favTabIcon');
  if (iconEl) iconEl.textContent = config.favEffect === 'lightning' ? '⚡' : '❤️';
}

function clearSkippedList() {
  if (skippedIds.size === 0) return showToast('Список пропущених уже порожній');
  if (!confirm(`Повернути всі ${skippedIds.size} пропущених карток назад у Tinder-потік?`)) return;
  skippedIds.clear();
  saveSkippedIds();
  tinderPage = 1;
  tinderQueue = [];
  document.getElementById('skippedCountLabel').textContent = '0';
  vibe([15, 25]);
  playSound('tick');
  showToast('Список пропущених очищено');
  backgroundGistSync();
}

/* Rank System: 10 + Favorite = Platinum, 10 = Gold, 9 = Silver, 8 = Bronze */
function getCardRankInfo(item) {
  if (item.status === 'plan') return { cardClass: '', badgeClass: '', icon: '' };
  const r = Number(item.rating);
  const isFav = Boolean(item.favorite);
  if (r === 10 && isFav) return { cardClass: 'rank-platinum', badgeClass: 'platinum', icon: '💎' };
  if (r === 10) return { cardClass: 'rank-gold', badgeClass: 'gold', icon: '🏆' };
  if (r === 9) return { cardClass: 'rank-silver', badgeClass: 'silver', icon: '🥈' };
  if (r === 8) return { cardClass: 'rank-bronze', badgeClass: 'bronze', icon: '🥉' };
  return { cardClass: '', badgeClass: '', icon: '★' };
}

function toggleFavorite(e, itemId) {
  if (e) e.stopPropagation();
  const idx = catalog.findIndex(c => c.id === itemId);
  if (idx < 0) return;

  catalog[idx].favorite = !catalog[idx].favorite;
  catalog[idx].updatedAt = Date.now();
  saveLocalCatalog();

  const isNowFav = catalog[idx].favorite;
  const isPlatinum = isNowFav && Number(catalog[idx].rating) === 10;

  vibe(isPlatinum ? [40, 30, 80] : 18);
  playSound(isPlatinum ? 'super' : 'tick');
  if (isPlatinum) spawnParticles('platinumDust');

  showToast(isPlatinum
    ? `💎 Платинова картка: «${catalog[idx].title}»!`
    : (isNowFav ? `Додано в улюблені: «${catalog[idx].title}»` : 'Прибрано з улюблених'));

  renderCatalog();
  backgroundGistSync();
}

function buildRatingButtons() {
  const wrap = document.getElementById('ratingSelector');
  wrap.innerHTML = '';
  for (let i = 1; i <= 10; i++) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'rate-btn' + (i === selectedRating ? ' selected' : '');
    btn.textContent = i;
    btn.onclick = () => {
      vibe(10);
      playSound('tick');
      selectedRating = i;
      document.querySelectorAll('.rate-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
    };
    wrap.appendChild(btn);
  }
}

function setUnrated() {
  selectedRating = null;
  document.querySelectorAll('.rate-btn').forEach(b => b.classList.remove('selected'));
}

function toggleRatingVisibility() {
  document.getElementById('ratingGroup').style.display = (document.getElementById('itemStatus').value === 'plan') ? 'none' : 'block';
}

/* ================= QUICK INLINE RATING + FAVORITE POPOVER ================= */
const quickPopover = document.getElementById('quickRatePopover');

function openQuickRate(e, itemId) {
  e.stopPropagation();
  const item = catalog.find(c => c.id === itemId);
  if (!item) return;

  quickPopover.innerHTML = '';

  const favIcon = config.favEffect === 'lightning' ? '⚡' : '❤️';
  const favBanner = document.createElement('button');
  favBanner.type = 'button';
  favBanner.className = 'qr-fav-banner' + (item.favorite ? ' active' : '');
  favBanner.textContent = item.favorite ? `${favIcon} В улюблених (натисніть, щоб зняти)` : `${favIcon} Додати в улюблені`;
  favBanner.onclick = (ev) => {
    ev.stopPropagation();
    closeQuickRate();
    toggleFavorite(null, itemId);
  };
  quickPopover.appendChild(favBanner);

  for (let i = 1; i <= 10; i++) {
    const btn = document.createElement('button');
    btn.type = 'button';
    const tierClass = i === 10 ? ' r-10' : i === 9 ? ' r-9' : i === 8 ? ' r-8' : '';
    btn.className = 'qr-btn' + tierClass + (item.rating === i ? ' active' : '');
    btn.textContent = i;
    btn.onclick = (ev) => {
      ev.stopPropagation();
      applyQuickRating(itemId, i);
    };
    quickPopover.appendChild(btn);
  }

  const clearBtn = document.createElement('button');
  clearBtn.type = 'button';
  clearBtn.className = 'qr-btn' + (item.rating === null ? ' active' : '');
  clearBtn.style.gridColumn = 'span 2';
  clearBtn.textContent = 'Без оцінки';
  clearBtn.onclick = (ev) => {
    ev.stopPropagation();
    applyQuickRating(itemId, null);
  };
  quickPopover.appendChild(clearBtn);

  const rect = e.currentTarget.getBoundingClientRect();
  quickPopover.classList.add('open');

  const popW = 242;
  const popH = 126;
  let left = rect.right - popW;
  let top = rect.bottom + 6;
  if (left < 10) left = 10;
  if (top + popH > window.innerHeight - 10) top = rect.top - popH - 6;

  quickPopover.style.left = `${left}px`;
  quickPopover.style.top = `${top}px`;
  vibe(10);
}

function applyQuickRating(itemId, newRating) {
  const idx = catalog.findIndex(c => c.id === itemId);
  if (idx < 0) return;

  catalog[idx].rating = newRating;
  catalog[idx].updatedAt = Date.now();
  saveLocalCatalog();
  closeQuickRate();

  const isPlatinum = newRating === 10 && catalog[idx].favorite;
  playSound(newRating === 10 ? 'super' : 'tick');
  vibe(newRating === 10 ? [40, 30, 80] : 18);
  if (isPlatinum) {
    spawnParticles('platinumDust');
    showToast(`💎 Платинова картка: «${catalog[idx].title}»!`);
  } else if (newRating === 10) {
    spawnParticles('goldDust');
  }

  renderCatalog();
  backgroundGistSync();
}

function closeQuickRate() {
  quickPopover.classList.remove('open');
}

document.addEventListener('click', (e) => {
  if (quickPopover.classList.contains('open') && !quickPopover.contains(e.target)) {
    closeQuickRate();
  }
  if (!e.target.closest('.card')) {
    document.querySelectorAll('.card.actions-open').forEach(c => c.classList.remove('actions-open'));
  }
});

/* ================= TMDb SEARCH ================= */
async function searchTMDb(e) {
  if (e) e.preventDefault();
  const query = document.getElementById('tmdbQuery').value.trim();
  if (!query) return;
  if (!config.tmdbKey) { openSettings(); return showToast('Введіть TMDb API Key'); }

  const resultsEl = document.getElementById('tmdbResults');
  resultsEl.innerHTML = '<div style="color:var(--text-muted);">Пошук у базі TMDb...</div>';
  try {
    const url = `https://api.themoviedb.org/3/search/multi?api_key=${config.tmdbKey}&language=uk-UA&query=${encodeURIComponent(query)}&include_adult=false`;
    const res = await fetch(url);
    const data = await res.json();
    const items = (data.results || []).filter(r => r.media_type === 'movie' || r.media_type === 'tv').slice(0, 8);

    if (!items.length) { resultsEl.innerHTML = '<div>Нічого не знайдено.</div>'; return; }
    resultsEl.innerHTML = '';

    items.forEach(item => {
      const isTv = item.media_type === 'tv';
      const isDoc = Array.isArray(item.genre_ids) && item.genre_ids.includes(99);
      const title = isTv ? item.name : item.title;
      const year = (isTv ? item.first_air_date : item.release_date)?.slice(0, 4) || '—';
      const poster = item.poster_path ? `https://image.tmdb.org/t/p/w342${item.poster_path}` : NO_POSTER;
      const id = `${item.media_type}_${item.id}`;
      const existing = catalog.find(c => c.id === id);

      const div = document.createElement('div');
      div.className = 'tmdb-item';
      div.innerHTML = `
        <img src="${poster}" alt="" />
        <div class="tmdb-info">
          <h4 title="${escapeHtml(title)}">${escapeHtml(title)}</h4>
          <div class="tmdb-meta">${year} • ${isDoc ? 'Документальний' : isTv ? 'Серіал' : 'Фільм'}</div>
          <button class="${existing ? '' : 'primary'}" style="padding:5px 10px; font-size:0.8rem;">
            ${existing ? '✎ У списку' : '+ Додати'}
          </button>
        </div>
      `;
      div.querySelector('button').onclick = () => {
        vibe(10);
        openItemModal({
          id, tmdbId: item.id, title, year, poster,
          category: existing ? existing.category : (isDoc ? 'doc' : isTv ? 'tv' : 'movie'),
          status: existing ? (existing.status || 'watched') : 'watched',
          rating: existing ? existing.rating : null,
          favorite: existing ? Boolean(existing.favorite) : false,
          watchedDate: existing ? existing.watchedDate : new Date().toISOString().slice(0, 10),
          note: existing ? existing.note : ''
        });
      };
      resultsEl.appendChild(div);
    });
  } catch (err) {
    resultsEl.innerHTML = `<div style="color:var(--danger);">${err.message}</div>`;
  }
}

/* ================= ITEM MODAL ================= */
function updateModalFavButton() {
  const btn = document.getElementById('modalFavBtn');
  const icon = config.favEffect === 'lightning' ? '⚡' : '❤️';
  btn.classList.toggle('active', modalFavorite);
  btn.textContent = modalFavorite ? `${icon} В улюблених` : `${icon} Додати в улюблені`;
}

function toggleModalFavorite() {
  vibe(12);
  playSound('tick');
  modalFavorite = !modalFavorite;
  updateModalFavButton();
}

function openItemModal(item) {
  activeItem = item;
  document.getElementById('modalTitle').textContent = catalog.some(c => c.id === item.id) ? 'Редагувати запис' : 'Додати у список';
  document.getElementById('modalPoster').src = item.poster || NO_POSTER;
  document.getElementById('modalMovieName').textContent = item.title;
  document.getElementById('modalMovieYear').textContent = item.year;
  document.getElementById('itemCategory').value = item.category;
  document.getElementById('itemStatus').value = item.status || 'watched';
  document.getElementById('itemDate').value = item.watchedDate || new Date().toISOString().slice(0, 10);
  document.getElementById('itemNote').value = item.note || '';

  selectedRating = item.rating;
  modalFavorite = Boolean(item.favorite);
  updateModalFavButton();
  buildRatingButtons();
  toggleRatingVisibility();
  document.getElementById('itemModal').classList.add('open');
}

async function saveItem() {
  if (!activeItem) return;
  const status = document.getElementById('itemStatus').value;
  const entry = {
    ...activeItem,
    category: document.getElementById('itemCategory').value,
    status: status,
    rating: status === 'plan' ? null : selectedRating,
    favorite: status === 'plan' ? false : modalFavorite,
    watchedDate: document.getElementById('itemDate').value,
    note: document.getElementById('itemNote').value.trim(),
    updatedAt: Date.now()
  };

  const idx = catalog.findIndex(c => c.id === entry.id);
  if (idx >= 0) catalog[idx] = entry; else catalog.unshift(entry);

  if (skippedIds.has(entry.id)) {
    skippedIds.delete(entry.id);
    saveSkippedIds();
  }

  saveLocalCatalog();
  closeModal('itemModal');
  document.getElementById('tmdbResults').innerHTML = '';
  document.getElementById('tmdbQuery').value = '';

  const isPlatinum = entry.rating === 10 && entry.favorite;
  vibe([20, 30, 20]);
  playSound(entry.rating === 10 ? 'super' : 'swipe');
  if (isPlatinum) spawnParticles('platinumDust');
  else if (entry.rating === 10) spawnParticles('goldDust');

  renderCatalog();
  showToast('Збережено!');
  backgroundGistSync();
}

async function deleteItem(id) {
  vibe([40, 40]);
  if (!confirm('Видалити цей запис?')) return;
  catalog = catalog.filter(c => c.id !== id);
  saveLocalCatalog();
  playSound('skip');
  renderCatalog();
  backgroundGistSync();
}

function copyTitleForSearch(e, title) {
  e.stopPropagation();
  vibe(12);
  playSound('tick');
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(title).then(() => showToast(`Скопійовано: «${title}»`));
  } else {
    showToast(`Назва: ${title}`);
  }
}

/* ================= FULL-BLEED OBSIDIAN CATALOG RENDER ================= */
function setCategory(cat) {
  vibe(10);
  playSound('tick');
  currentCategory = cat;
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.cat === cat));
  document.getElementById('btnRoulette').style.display = (cat === 'plan') ? 'inline-flex' : 'none';
  renderCatalog();
}

function renderCatalog() {
  closeQuickRate();
  updateFavTabIcon();
  const watched = catalog.filter(c => c.status !== 'plan');
  const favs = watched.filter(c => Boolean(c.favorite));
  const plans = catalog.filter(c => c.status === 'plan');

  document.getElementById('cnt-all').textContent = watched.length;
  document.getElementById('cnt-fav').textContent = favs.length;
  document.getElementById('cnt-movie').textContent = watched.filter(c => c.category === 'movie').length;
  document.getElementById('cnt-tv').textContent = watched.filter(c => c.category === 'tv').length;
  document.getElementById('cnt-doc').textContent = watched.filter(c => c.category === 'doc').length;
  document.getElementById('cnt-plan').textContent = plans.length;

  const query = document.getElementById('localSearch').value.trim().toLowerCase();
  const sort = document.getElementById('sortSelect').value;

  let list = catalog.filter(item => {
    const isPlanCat = currentCategory === 'plan';
    if (isPlanCat && item.status !== 'plan') return false;
    if (!isPlanCat && item.status === 'plan') return false;
    if (currentCategory === 'fav' && !item.favorite) return false;
    if (currentCategory !== 'all' && currentCategory !== 'plan' && currentCategory !== 'fav' && item.category !== currentCategory) return false;
    if (query && !item.title.toLowerCase().includes(query) && !(item.note || '').toLowerCase().includes(query)) return false;
    return true;
  });

  list.sort((a, b) => {
    if (sort === 'rating_desc') return (b.rating || 0) - (a.rating || 0);
    if (sort === 'rating_asc') return (a.rating || 0) - (b.rating || 0);
    if (sort === 'year_desc') return (parseInt(b.year) || 0) - (parseInt(a.year) || 0);
    if (sort === 'title_asc') return a.title.localeCompare(b.title, 'uk');
    return (b.updatedAt || 0) - (a.updatedAt || 0);
  });

  const grid = document.getElementById('catalogGrid');
  if (!list.length) {
    grid.innerHTML = `<div class="empty-state" style="grid-column: 1 / -1;">У цій вкладці поки порожньо.</div>`;
    return;
  }

  const catNames = { movie: 'Фільм', tv: 'Серіал', doc: 'Док.' };
  const isLightning = config.favEffect === 'lightning';
  const favEmoji = isLightning ? '⚡' : '❤️';
  grid.innerHTML = '';

  list.forEach((item, index) => {
    const isUnrated = item.rating === null || item.rating === undefined;
    const isFav = Boolean(item.favorite) && item.status !== 'plan';
    const rank = getCardRankInfo(item);

    const badge = item.status === 'plan'
      ? `<span class="badge-plan">Планую</span>`
      : `<span class="badge-rating ${rank.badgeClass} ${isUnrated ? 'unrated' : ''}" onclick='openQuickRate(event, "${item.id}")' title="Оцінити або додати в улюблені">${!isUnrated ? `${rank.icon} ${item.rating}` : '★ —'}</span>`;

    const favEnergyHtml = isFav
      ? `<div class="fav-energy-layer ${isLightning ? 'lightning-mode' : 'heart-mode'}"></div>`
      : '';

    const favLiveBadgeHtml = isFav
      ? `<span class="badge-fav-live ${isLightning ? 'lightning-anim' : 'heart-anim'}" title="Улюблене"><span>${favEmoji}</span></span>`
      : '';

    const favDockBtnHtml = item.status !== 'plan'
      ? `<button type="button" class="dock-btn ${isFav ? 'fav-active' : ''}" onclick='toggleFavorite(event, "${item.id}")' title="${isFav ? 'Прибрати з улюблених' : 'Додати в улюблені'}">${favEmoji}</button>`
      : '';

    const card = document.createElement('div');
    card.className = `card ${rank.cardClass}`;
    card.style.animationDelay = `${Math.min(index * 26, 420)}ms`;
    card.innerHTML = `
      <img class="card-poster" src="${item.poster || NO_POSTER}" alt="" loading="lazy" />
      <div class="card-vignette"></div>
      ${favEnergyHtml}
      <div class="card-glare"></div>
      <div class="top-left-badges">
        <span class="badge-type">${catNames[item.category] || 'Кіно'}</span>
        ${favLiveBadgeHtml}
      </div>
      ${badge}
      <div class="card-overlay-info">
        <div class="card-title">${escapeHtml(item.title)}</div>
        <div class="card-meta-line"><span>${item.year}</span></div>
        ${item.note ? `<div class="card-note-pill">${escapeHtml(item.note)}</div>` : ''}
      </div>
      <div class="card-glass-dock">
        ${favDockBtnHtml}
        <button type="button" class="dock-btn" onclick='copyTitleForSearch(event, ${JSON.stringify(item.title)})' title="Скопіювати назву для пошуку">📋</button>
        <button type="button" class="dock-btn" onclick='event.stopPropagation(); editById("${item.id}")' title="Редагувати">✏️</button>
        <button type="button" class="dock-btn del" onclick='event.stopPropagation(); deleteItem("${item.id}")' title="Видалити">🗑️</button>
      </div>
    `;

    card.addEventListener('click', () => {
      const wasOpen = card.classList.contains('actions-open');
      document.querySelectorAll('.card.actions-open').forEach(c => c.classList.remove('actions-open'));
      if (!wasOpen) card.classList.add('actions-open');
    });

    const glare = card.querySelector('.card-glare');
    card.addEventListener('mousemove', (e) => {
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const rx = ((y / rect.height) - 0.5) * -9;
      const ry = ((x / rect.width) - 0.5) * 9;
      card.style.transform = `perspective(750px) rotateX(${rx}deg) rotateY(${ry}deg) translateY(-4px)`;
      glare.style.background = `radial-gradient(circle at ${(x / rect.width) * 100}% ${(y / rect.height) * 100}%, rgba(255,255,255,0.26), transparent 65%)`;
    });
    card.addEventListener('mouseleave', () => {
      card.style.transform = '';
    });

    grid.appendChild(card);
  });
}

function editById(id) {
  vibe(10);
  const item = catalog.find(c => c.id === id);
  if (item) openItemModal(item);
}

/* ================= HORIZONTAL CASE-STYLE ROULETTE ================= */
function buildNoAdjacentDuplicatesList(plans, length) {
  const result = [];
  let lastId = null;
  for (let i = 0; i < length; i++) {
    let pool = plans.filter(p => p.id !== lastId);
    if (pool.length === 0) pool = plans;
    const chosen = pool[Math.floor(Math.random() * pool.length)];
    result.push(chosen);
    lastId = chosen.id;
  }
  return result;
}

function openRoulette() {
  const plans = catalog.filter(c => c.status === 'plan');
  if (plans.length < 2) return showToast('Додайте хоча б 2 фільми у «Буду дивитись»!');
  vibe(15);
  isRouletteSpinning = false;
  document.getElementById('rouletteResultBox').innerHTML = `<span style="color:var(--text-muted); font-size:0.88rem;">Натисніть кнопку нижче, щоб запустити стрічку</span>`;
  document.getElementById('spinBtn').disabled = false;
  document.getElementById('spinBtn').textContent = '🎰 Крутити стрічку!';

  const track = document.getElementById('rouletteTrack');
  track.style.transition = 'none';
  track.style.transform = 'translateX(-477px)';
  track.innerHTML = '';

  const previewItems = buildNoAdjacentDuplicatesList(plans, 14);
  previewItems.forEach(p => track.appendChild(createRouletteSlot(p)));

  document.getElementById('rouletteModal').classList.add('open');
}

function createRouletteSlot(item) {
  const div = document.createElement('div');
  div.className = 'roulette-slot';
  div.innerHTML = `
    <img src="${item.poster || NO_POSTER}" alt="" />
    <div class="slot-title">${escapeHtml(item.title)}</div>
  `;
  return div;
}

function spinRoulette() {
  if (isRouletteSpinning) return;
  const plans = catalog.filter(c => c.status === 'plan');
  if (plans.length < 2) return;

  isRouletteSpinning = true;
  const spinBtn = document.getElementById('spinBtn');
  spinBtn.disabled = true;
  spinBtn.textContent = 'Крутиться...';
  document.getElementById('rouletteResultBox').innerHTML = `<span style="color:var(--text-muted); font-size:0.88rem;">Обираємо фільм на вечір...</span>`;

  const track = document.getElementById('rouletteTrack');
  track.style.transition = 'none';
  track.style.transform = 'translateX(-477px)';
  track.innerHTML = '';

  const totalSlots = 48;
  const winnerIndex = 39;
  const itemsList = buildNoAdjacentDuplicatesList(plans, totalSlots);
  const winnerItem = itemsList[winnerIndex];

  const slotElements = [];
  itemsList.forEach(item => {
    const el = createRouletteSlot(item);
    track.appendChild(el);
    slotElements.push(el);
  });

  const slotStep = 138;
  const randomOffset = Math.floor((Math.random() - 0.5) * 56);
  const targetTranslate = -(winnerIndex * slotStep + 63 + randomOffset);

  let lastPassedSlot = -1;
  const startTime = performance.now();
  const duration = 4200;

  function trackTicks(now) {
    if (!isRouletteSpinning) return;
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3.6);
    const currentPos = Math.abs(-477 + (targetTranslate + 477) * eased);
    const currentSlot = Math.floor(currentPos / slotStep);

    if (currentSlot !== lastPassedSlot) {
      lastPassedSlot = currentSlot;
      playSound('tick');
      vibe(8);
    }
    if (progress < 1) requestAnimationFrame(trackTicks);
  }

  requestAnimationFrame(() => {
    track.style.transition = `transform ${duration}ms cubic-bezier(0.12, 0.85, 0.18, 1)`;
    track.style.transform = `translateX(${targetTranslate}px)`;
    requestAnimationFrame(trackTicks);
  });

  setTimeout(() => {
    isRouletteSpinning = false;
    slotElements[winnerIndex].classList.add('winner');
    playSound('win');
    vibe([80, 40, 160]);
    spawnParticles('confetti');

    spinBtn.disabled = false;
    spinBtn.textContent = '🔄 Крутити ще раз';

    document.getElementById('rouletteResultBox').innerHTML = `
      <div style="color:var(--accent); font-weight:800; font-size:1.05rem; margin-bottom:8px;">🎉 Сьогодні дивимось: ${escapeHtml(winnerItem.title)} (${winnerItem.year})</div>
      <button class="primary" style="padding:6px 14px; font-size:0.84rem;" onclick="editById('${winnerItem.id}'); closeModal('rouletteModal');">✅ Відмітити як переглянуто</button>
    `;
  }, duration + 80);
}

/* ================= TINDER 5.0 ================= */
async function openTinderMode() {
  if (!config.tmdbKey) { showToast('Введіть TMDb API Key для Tinder-режиму!'); return openSettings(); }
  vibe([15, 25]);
  document.getElementById('tinderOverlay').style.display = 'flex';
  document.body.style.overflow = 'hidden';

  tinderQueue = tinderQueue.filter(q => {
    const id = `${q._mediaType}_${q.id}`;
    return !catalog.some(c => c.id === id) && !skippedIds.has(id);
  });

  if (tinderQueue.length < 6) await fetchTinderBatch();
  renderTinderStack();
}

function closeTinderMode() {
  if (activeSwipeCleanup) {
    activeSwipeCleanup();
    activeSwipeCleanup = null;
  }
  document.getElementById('tinderArea').classList.remove('elevated');
  document.getElementById('tinderOverlay').style.display = 'none';
  document.body.style.overflow = '';
  renderCatalog();
}

async function switchTinderMode(mode) {
  if (tinderMode === mode) return;
  vibe(12);
  playSound('tick');
  tinderMode = mode;
  tinderPage = 1;
  tinderQueue = [];
  document.querySelectorAll('.tmode-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
  document.getElementById('tinderStack').innerHTML = '';
  await fetchTinderBatch();
  renderTinderStack();
}

async function changeTinderDecade() {
  tinderDecade = document.getElementById('tinderDecade').value;
  vibe(12);
  playSound('tick');
  tinderPage = 1;
  tinderQueue = [];
  document.getElementById('tinderStack').innerHTML = '';
  await fetchTinderBatch();
  renderTinderStack();
}

function getDecadeQueryParams(isTv) {
  const today = new Date().toISOString().slice(0, 10);
  const field = isTv ? 'first_air_date' : 'primary_release_date';
  if (tinderDecade === '2020') return `&${field}.gte=2020-01-01&${field}.lte=${today}`;
  if (tinderDecade === '2010') return `&${field}.gte=2010-01-01&${field}.lte=2019-12-31`;
  if (tinderDecade === '2000') return `&${field}.gte=2000-01-01&${field}.lte=2009-12-31`;
  if (tinderDecade === '1990') return `&${field}.gte=1990-01-01&${field}.lte=1999-12-31`;
  if (tinderDecade === '1980') return `&${field}.lte=1989-12-31`;
  return `&${field}.lte=${today}`;
}

async function fetchTinderBatch() {
  if (isFetchingTinder) return;
  isFetchingTinder = true;
  if (tinderQueue.length === 0) document.getElementById('tinderLoading').style.display = 'flex';

  let pagesChecked = 0;
  const maxPagesToScan = 15;

  try {
    while (tinderQueue.length < 12 && pagesChecked < maxPagesToScan) {
      pagesChecked++;
      let url = '';
      let mediaType = 'movie';

      if (tinderMode === 'movie') {
        const dateFilter = getDecadeQueryParams(false);
        url = `https://api.themoviedb.org/3/discover/movie?api_key=${config.tmdbKey}&language=uk-UA&sort_by=popularity.desc&vote_count.gte=500${dateFilter}&page=${tinderPage}`;
        mediaType = 'movie';
      } else if (tinderMode === 'tv') {
        const dateFilter = getDecadeQueryParams(true);
        url = `https://api.themoviedb.org/3/discover/tv?api_key=${config.tmdbKey}&language=uk-UA&sort_by=popularity.desc&vote_count.gte=300${dateFilter}&page=${tinderPage}`;
        mediaType = 'tv';
      } else {
        const dateFilter = getDecadeQueryParams(false);
        url = `https://api.themoviedb.org/3/discover/movie?api_key=${config.tmdbKey}&language=uk-UA&sort_by=vote_average.desc&vote_count.gte=2500${dateFilter}&page=${tinderPage}`;
        mediaType = 'movie';
      }

      const res = await fetch(url);
      const data = await res.json();
      const totalPages = Math.min(data.total_pages || 30, 40);

      (data.results || []).forEach(raw => {
        const item = { ...raw, _mediaType: mediaType };
        const id = `${mediaType}_${item.id}`;
        const alreadyInCatalog = catalog.some(c => c.id === id);
        const alreadySkipped = skippedIds.has(id);
        const alreadyInQueue = tinderQueue.some(q => `${q._mediaType}_${q.id}` === id);

        if (!alreadyInCatalog && !alreadySkipped && !alreadyInQueue) {
          if (item.poster_path) {
            const img = new Image();
            img.src = `https://image.tmdb.org/t/p/w500${item.poster_path}`;
          }
          tinderQueue.push(item);
        }
      });

      tinderPage = tinderPage >= totalPages ? 1 : tinderPage + 1;
      if (totalPages <= 1) break;
    }
  } catch (err) {
    console.error(err);
  }

  isFetchingTinder = false;
  document.getElementById('tinderLoading').style.display = 'none';
}

function updateTinderCaptionAndBars(item) {
  const captionArea = document.getElementById('tinderCaptionArea');
  if (!item) {
    captionArea.style.opacity = '0';
    return;
  }
  captionArea.style.opacity = '1';

  const isTv = item._mediaType === 'tv';
  const isDoc = Array.isArray(item.genre_ids) && item.genre_ids.includes(99);
  const title = isTv ? item.name : item.title;
  const year = (isTv ? item.first_air_date : item.release_date)?.slice(0, 4) || '—';
  const typeName = isDoc ? 'Документальний' : (isTv ? 'Серіал' : 'Фільм');
  const modeLabel = tinderMode === 'top' ? 'ТОП РЕЙТИНГУ' : (tinderMode === 'tv' ? 'ПОПУЛЯРНИЙ СЕРІАЛ' : 'ЗАРАЗ У ТРЕНДІ');
  const score = item.vote_average ? ` • ★ ${item.vote_average.toFixed(1)}` : '';

  document.getElementById('tinderCaptionTag').textContent = modeLabel;
  document.getElementById('tinderCaptionTitle').textContent = title;
  document.getElementById('tinderCaptionSub').textContent = `${typeName} • ${year}${score}`;

  const bars = document.querySelectorAll('#tinderProgressBars .t-bar');
  const activeIdx = tinderSessionSwiped % bars.length;
  bars.forEach((bar, i) => bar.classList.toggle('active', i === activeIdx));
}

function updateTinderHeaderControls() {
  document.getElementById('tinderSessionCount').textContent = `Сесія: ${tinderSessionSwiped}`;
  document.getElementById('btnUndoSwipe').disabled = tinderHistory.length === 0;
}

function renderTinderStack() {
  if (activeSwipeCleanup) {
    activeSwipeCleanup();
    activeSwipeCleanup = null;
  }

  updateTinderHeaderControls();
  const area = document.getElementById('tinderArea');
  area.classList.remove('elevated');

  const stack = document.getElementById('tinderStack');
  stack.classList.remove('is-flipped');
  stack.innerHTML = '';

  if (tinderQueue.length === 0) {
    updateTinderCaptionAndBars(null);
    fetchTinderBatch().then(() => {
      if (tinderQueue.length > 0) {
        renderTinderStack();
      } else {
        stack.innerHTML = `<div style="text-align:center; color:var(--text-muted); padding:24px;">Усі картки в цій категорії вже переглянуто або пропущено.<br><br><button onclick="clearSkippedList(); switchTinderMode(tinderMode);">Скинути пропущені</button></div>`;
      }
    });
    return;
  }

  if (tinderQueue.length < 8) fetchTinderBatch();

  currentTinderItem = tinderQueue[0];
  updateTinderCaptionAndBars(currentTinderItem);

  const ambilight = document.getElementById('tinderAmbilight');
  if (currentTinderItem.poster_path) {
    ambilight.style.backgroundImage = `url(https://image.tmdb.org/t/p/w342${currentTinderItem.poster_path})`;
  } else {
    ambilight.style.backgroundImage = 'none';
  }

  const visibleItems = tinderQueue.slice(0, 3).reverse();
  visibleItems.forEach((item, revIdx) => {
    const stackPos = visibleItems.length - 1 - revIdx;
    const card = buildTinderCardElement(item, stackPos);
    stack.appendChild(card);
    if (stackPos === 0) {
      topCardEl = card;
      initSwipe(card);
      setupSynopsisScroll(card);
    }
  });
}

function buildTinderCardElement(item, stackPos) {
  const isTv = item._mediaType === 'tv';
  const isDoc = Array.isArray(item.genre_ids) && item.genre_ids.includes(99);
  const title = isTv ? item.name : item.title;
  const year = (isTv ? item.first_air_date : item.release_date)?.slice(0, 4) || '';
  const poster = item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : NO_POSTER;
  const typeTag = isDoc ? 'Документальний' : (isTv ? 'Серіал' : 'Фільм');

  const initialGenres = (item.genre_ids || []).map(id => GENRE_MAP[id]).filter(Boolean).slice(0, 3);
  const initialCountries = (item.origin_country || []).map(formatCountry).filter(Boolean);

  let chipsHtml = '';
  if (initialGenres.length) chipsHtml += `<span class="meta-chip">${escapeHtml(initialGenres.join(', '))}</span>`;
  if (initialCountries.length) chipsHtml += `<span class="meta-chip country">${escapeHtml(initialCountries.join(', '))}</span>`;
  if (!chipsHtml) chipsHtml = `<span class="meta-chip">${typeTag}</span>`;

  const card = document.createElement('div');
  card.className = 'tinder-card ' + (stackPos === 0 ? 'top-card' : stackPos === 1 ? 'second-card' : 'third-card');

  card.innerHTML = `
    <div class="tinder-card-face tinder-card-front">
      <div class="card-stamp" id="cardStamp"></div>
      <img src="${poster}" alt="" draggable="false" />
      <button type="button" class="tinder-flip-btn" onclick="flipTinderCard(event)" title="Сюжет, франшиза, жанр і країна">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
      </button>
    </div>
    <div class="tinder-card-face tinder-card-back">
      <div class="back-header">
        <button type="button" class="tinder-flip-btn" onclick="flipTinderCard(event)" title="Назад до постера">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>
        </button>
        <h3>${escapeHtml(title)}</h3>
        <div class="back-meta-chips" id="backMetaChips">${chipsHtml}</div>
      </div>
      <div class="overview-scroll-wrap">
        <p class="overview custom-scroll" id="backOverview">${escapeHtml(item.overview) || 'Завантаження опису...'}</p>
      </div>
      <div class="franchise-box" id="franchiseBox" style="display:none;">
        <div class="franchise-header" id="franchiseHeader"></div>
        <div class="franchise-strip custom-scroll" id="franchiseStrip"></div>
      </div>
      <div class="back-footer">
        <span class="rating">TMDb: ★ ${item.vote_average ? item.vote_average.toFixed(1) : '—'}</span>
        <span class="runtime" id="backRuntime">${year}</span>
      </div>
    </div>
  `;
  return card;
}

function setupSynopsisScroll(card) {
  const overviewEl = card.querySelector('.overview');
  if (overviewEl) {
    overviewEl.addEventListener('wheel', (e) => {
      e.stopPropagation();
      if (overviewEl.scrollHeight > overviewEl.clientHeight) {
        e.preventDefault();
        overviewEl.scrollTop += e.deltaY;
      }
    }, { passive: false });

    let isGrabbing = false;
    let startY = 0;
    let startScrollTop = 0;

    overviewEl.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      isGrabbing = true;
      startY = e.clientY;
      startScrollTop = overviewEl.scrollTop;
      overviewEl.classList.add('grabbing');
      e.stopPropagation();
    });

    window.addEventListener('mousemove', (e) => {
      if (!isGrabbing) return;
      const dy = e.clientY - startY;
      overviewEl.scrollTop = startScrollTop - dy;
    });

    window.addEventListener('mouseup', () => {
      if (!isGrabbing) return;
      isGrabbing = false;
      overviewEl.classList.remove('grabbing');
    });
  }

  const stripEl = card.querySelector('.franchise-strip');
  if (stripEl) {
    stripEl.addEventListener('wheel', (e) => {
      e.stopPropagation();
      if (stripEl.scrollWidth > stripEl.clientWidth) {
        e.preventDefault();
        stripEl.scrollLeft += (e.deltaY || e.deltaX);
      }
    }, { passive: false });
  }
}

function renderFranchiseParts(card, collection, currentMovieId) {
  const box = card.querySelector('#franchiseBox');
  const header = card.querySelector('#franchiseHeader');
  const strip = card.querySelector('#franchiseStrip');
  if (!box || !header || !strip || !collection || !Array.isArray(collection.parts)) return;

  const parts = [...collection.parts].sort((a, b) => {
    const da = a.release_date || '9999-12-31';
    const db = b.release_date || '9999-12-31';
    return da.localeCompare(db);
  });

  if (parts.length <= 1) {
    box.style.display = 'none';
    return;
  }

  const cleanName = String(collection.name || 'Серія фільмів').replace(/\s*\(коллекция\)|\s*\(колекція\)/gi, '');
  header.innerHTML = `<span>🎞️ ${escapeHtml(cleanName)}</span><span>${parts.length} част.</span>`;
  strip.innerHTML = '';

  parts.forEach(part => {
    const partFullId = `movie_${part.id}`;
    const isCurrent = part.id === currentMovieId;
    const inCatalog = catalog.find(c => c.id === partFullId);
    const year = part.release_date ? part.release_date.slice(0, 4) : 'Скоро';
    const poster = part.poster_path ? `https://image.tmdb.org/t/p/w185${part.poster_path}` : NO_POSTER;

    let stateClass = '';
    let badgeHtml = `<span class="f-badge add">+</span>`;
    let actionTitle = `${part.title} (${year}) — натисніть, щоб додати у «Буду дивитись»`;

    if (isCurrent) {
      stateClass = 'is-current';
      badgeHtml = `<span class="f-badge cur">Тут</span>`;
      actionTitle = `${part.title} (${year}) — поточна картка`;
    } else if (inCatalog) {
      if (inCatalog.status === 'plan') {
        stateClass = 'is-plan';
        badgeHtml = `<span class="f-badge plan">↑</span>`;
        actionTitle = `${part.title} (${year}) — вже у «Буду дивитись»`;
      } else {
        stateClass = 'is-watched';
        const score = inCatalog.rating ? inCatalog.rating : '✓';
        badgeHtml = `<span class="f-badge ok">${score}</span>`;
        actionTitle = `${part.title} (${year}) — вже переглянуто`;
      }
    }

    const el = document.createElement('div');
    el.className = `f-part ${stateClass}`;
    el.title = actionTitle;
    el.innerHTML = `
      <div class="f-poster-wrap">
        <img src="${poster}" alt="" loading="lazy" />
        ${badgeHtml}
      </div>
      <div class="f-year">${year}</div>
    `;

    el.onclick = (ev) => {
      ev.stopPropagation();
      if (isCurrent) return;
      if (inCatalog) {
        vibe(10);
        showToast(inCatalog.status === 'plan'
          ? `«${part.title}» вже у списку «Буду дивитись»`
          : `«${part.title}» вже у переглянутих`);
        return;
      }
      addFranchisePartToPlan(part, card, collection, currentMovieId);
    };

    strip.appendChild(el);
  });

  box.style.display = 'block';

  requestAnimationFrame(() => {
    const curEl = strip.querySelector('.is-current');
    if (curEl) {
      strip.scrollLeft = Math.max(0, curEl.offsetLeft - strip.clientWidth / 2 + curEl.clientWidth / 2);
    }
  });
}

function addFranchisePartToPlan(part, card, collection, currentMovieId) {
  const partFullId = `movie_${part.id}`;
  if (catalog.some(c => c.id === partFullId)) return;

  const isDoc = Array.isArray(part.genre_ids) && part.genre_ids.includes(99);
  const newEntry = {
    id: partFullId,
    tmdbId: part.id,
    title: part.title,
    year: part.release_date ? part.release_date.slice(0, 4) : '',
    poster: part.poster_path ? `https://image.tmdb.org/t/p/w342${part.poster_path}` : '',
    category: isDoc ? 'doc' : 'movie',
    status: 'plan',
    rating: null,
    favorite: false,
    watchedDate: new Date().toISOString().slice(0, 10),
    note: '',
    updatedAt: Date.now()
  };

  catalog.unshift(newEntry);
  if (skippedIds.has(partFullId)) {
    skippedIds.delete(partFullId);
    saveSkippedIds();
  }
  saveLocalCatalog();
  backgroundGistSync();

  vibe(25);
  playSound('swipe');
  showToast(`Додано у «Буду дивитись»: ${part.title}`);
  renderFranchiseParts(card, collection, currentMovieId);
}

async function enrichTinderCardDetails(card, item) {
  if (!card || !item || !config.tmdbKey) return;
  const cacheKey = `${item._mediaType}_${item.id}`;
  let details = tinderDetailsCache.get(cacheKey);

  if (!details) {
    try {
      const res = await fetch(`https://api.themoviedb.org/3/${item._mediaType}/${item.id}?api_key=${config.tmdbKey}&language=uk-UA`);
      if (res.ok) {
        details = await res.json();
        if (!details.overview) {
          const enRes = await fetch(`https://api.themoviedb.org/3/${item._mediaType}/${item.id}?api_key=${config.tmdbKey}&language=en-US`);
          if (enRes.ok) {
            const enData = await enRes.json();
            if (enData.overview) details.overview = enData.overview;
          }
        }
        tinderDetailsCache.set(cacheKey, details);
      }
    } catch (e) {}
  }

  const overviewEl = card.querySelector('#backOverview');
  if (overviewEl) {
    const finalOverview = (details && details.overview) || item.overview || 'Опис для цієї стрічки поки відсутній у базі TMDb.';
    overviewEl.textContent = finalOverview;
  }

  if (!details) return;

  const genres = (details.genres || []).map(g => g.name).filter(Boolean);
  const countries = (details.production_countries || []).map(c => formatCountry(c.iso_3166_1) || c.name).filter(Boolean);

  const chipsEl = card.querySelector('#backMetaChips');
  if (chipsEl) {
    let html = '';
    if (genres.length) html += `<span class="meta-chip">${escapeHtml(genres.join(', '))}</span>`;
    if (countries.length) html += `<span class="meta-chip country">${escapeHtml(countries.join(', '))}</span>`;
    if (html) chipsEl.innerHTML = html;
  }

  const runtimeEl = card.querySelector('#backRuntime');
  if (runtimeEl) {
    if (item._mediaType === 'movie' && details.runtime) {
      const h = Math.floor(details.runtime / 60);
      const m = details.runtime % 60;
      runtimeEl.textContent = h > 0 ? `${h} год ${m} хв` : `${m} хв`;
    } else if (item._mediaType === 'tv' && details.number_of_seasons) {
      runtimeEl.textContent = `Сезонів: ${details.number_of_seasons}`;
    }
  }

  if (item._mediaType === 'movie' && details.belongs_to_collection && details.belongs_to_collection.id) {
    const colId = details.belongs_to_collection.id;
    let colData = tinderCollectionCache.get(colId);
    if (!colData) {
      try {
        const cRes = await fetch(`https://api.themoviedb.org/3/collection/${colId}?api_key=${config.tmdbKey}&language=uk-UA`);
        if (cRes.ok) {
          colData = await cRes.json();
          tinderCollectionCache.set(colId, colData);
        }
      } catch (e) {}
    }
    if (colData) {
      renderFranchiseParts(card, colData, item.id);
    }
  }
}

function flipTinderCard(e) {
  e.stopPropagation();
  if (!topCardEl) return;
  vibe(15);
  playSound('tick');
  topCardEl.classList.remove('moving', 'glow-right', 'glow-left', 'glow-up', 'glow-down');
  topCardEl.style.transform = '';
  const willShowBack = !topCardEl.classList.contains('flipped');
  topCardEl.classList.toggle('flipped');
  document.getElementById('tinderStack').classList.toggle('is-flipped', willShowBack);
  if (willShowBack && currentTinderItem) {
    enrichTinderCardDetails(topCardEl, currentTinderItem);
  }
}

function initSwipe(el) {
  let isDown = false;
  let startX = 0, startY = 0, currentX = 0, currentY = 0;
  let thresholdHit = false;
  let detectedDirection = null;
  const stamp = el.querySelector('#cardStamp');
  const area = document.getElementById('tinderArea');

  function detectSwipeDirection(dx, dy) {
    const threshold = 85;
    if (Math.abs(dx) < threshold && Math.abs(dy) < threshold) return null;
    if (Math.abs(dx) >= Math.abs(dy)) {
      return dx > 0 ? 'right' : 'left';
    } else {
      return dy < 0 ? 'up' : 'down';
    }
  }

  const handleStart = (e) => {
    if (e.target.closest('.tinder-flip-btn') || el.classList.contains('flipped')) return;
    isDown = true;
    thresholdHit = false;
    detectedDirection = null;
    el.classList.add('moving');
    area.classList.add('elevated');
    startX = e.type.includes('mouse') ? e.clientX : e.touches[0].clientX;
    startY = e.type.includes('mouse') ? e.clientY : e.touches[0].clientY;
    currentX = startX;
    currentY = startY;
  };

  const handleMove = (e) => {
    if (!isDown) return;
    currentX = e.type.includes('mouse') ? e.clientX : e.touches[0].clientX;
    currentY = e.type.includes('mouse') ? e.clientY : e.touches[0].clientY;

    const dx = currentX - startX;
    const dy = currentY - startY;
    const rotate = -2.5 + dx * 0.055;
    const scale = dy < -20 ? Math.max(0.86, 1 + (dy + 20) * 0.0005) : 1;

    el.style.transform = `translate3d(${dx}px, ${dy}px, 0px) rotate(${rotate}deg) scale(${scale})`;
    el.classList.remove('glow-right', 'glow-left', 'glow-up', 'glow-down');
    stamp.classList.remove('platinum-stamp', 'bottom-stamp');

    detectedDirection = detectSwipeDirection(dx, dy);

    if (detectedDirection === 'right') {
      el.classList.add('glow-right');
      stamp.textContent = '✓ Вже бачив';
      stamp.style.color = 'var(--success)';
      stamp.style.borderColor = 'var(--success)';
      stamp.classList.add('visible');
    } else if (detectedDirection === 'left') {
      el.classList.add('glow-left');
      stamp.textContent = '✕ Не бачив';
      stamp.style.color = 'var(--danger)';
      stamp.style.borderColor = 'var(--danger)';
      stamp.classList.add('visible');
    } else if (detectedDirection === 'down') {
      el.classList.add('glow-down');
      stamp.innerHTML = `💎 ПЛАТИНА • 10 + УЛЮБЛЕНЕ`;
      stamp.style.color = '#ecfeff';
      stamp.style.borderColor = '#67e8f9';
      stamp.classList.add('visible', 'platinum-stamp');
    } else if (detectedDirection === 'up') {
      el.classList.add('glow-up');
      stamp.textContent = '↑ Буду дивитись';
      stamp.style.color = '#e9d5ff';
      stamp.style.borderColor = 'var(--plan)';
      stamp.classList.add('visible', 'bottom-stamp');
    } else {
      stamp.classList.remove('visible');
    }

    if (detectedDirection && !thresholdHit) {
      vibe(18);
      thresholdHit = true;
    } else if (!detectedDirection && thresholdHit) {
      thresholdHit = false;
    }
  };

  const handleEnd = () => {
    if (!isDown) return;
    isDown = false;
    el.classList.remove('moving', 'glow-right', 'glow-left', 'glow-up', 'glow-down');
    stamp.classList.remove('visible', 'platinum-stamp', 'bottom-stamp');

    const finalDir = detectedDirection;

    if (finalDir) {
      cleanupListeners();
      triggerSwipe(finalDir);
    } else {
      area.classList.remove('elevated');
      el.style.transform = '';
    }
  };

  function cleanupListeners() {
    el.removeEventListener('mousedown', handleStart);
    el.removeEventListener('touchstart', handleStart);
    window.removeEventListener('mousemove', handleMove);
    window.removeEventListener('touchmove', handleMove);
    window.removeEventListener('mouseup', handleEnd);
    window.removeEventListener('touchend', handleEnd);
  }

  activeSwipeCleanup = cleanupListeners;

  el.addEventListener('mousedown', handleStart);
  el.addEventListener('touchstart', handleStart, { passive: true });
  window.addEventListener('mousemove', handleMove);
  window.addEventListener('touchmove', handleMove, { passive: true });
  window.addEventListener('mouseup', handleEnd);
  window.addEventListener('touchend', handleEnd);
}

function triggerSwipe(direction) {
  if (!topCardEl || !currentTinderItem) return;

  if (activeSwipeCleanup) {
    activeSwipeCleanup();
    activeSwipeCleanup = null;
  }

  const area = document.getElementById('tinderArea');
  area.classList.add('elevated');

  const swipedEl = topCardEl;
  const item = tinderQueue.shift();
  topCardEl = null;

  swipedEl.classList.remove('flipped');
  document.getElementById('tinderStack').classList.remove('is-flipped');

  const x = direction === 'right' ? window.innerWidth * 1.2 : (direction === 'left' ? -window.innerWidth * 1.2 : 0);
  const y = direction === 'down' ? window.innerHeight * 1.2 : 0;

  swipedEl.classList.add(`glow-${direction}`);

  if (direction === 'down') {
    const stamp = swipedEl.querySelector('#cardStamp');
    if (stamp) {
      stamp.classList.remove('bottom-stamp');
      stamp.innerHTML = `💎 ПЛАТИНА • 10 + УЛЮБЛЕНЕ`;
      stamp.classList.add('visible', 'platinum-stamp');
    }
    vibe([50, 40, 110]);
    playSound('super');
    spawnParticles('platinumDust');

    setTimeout(() => {
      swipedEl.style.transition = 'transform 0.38s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.32s ease';
      swipedEl.style.transform = `translate3d(0px, ${y}px, 0px) scale(0.95)`;
      swipedEl.style.opacity = '0';
    }, 160);
  } else if (direction === 'up') {
    const stamp = swipedEl.querySelector('#cardStamp');
    if (stamp) {
      stamp.classList.remove('platinum-stamp');
      stamp.textContent = '↑ Буду дивитись';
      stamp.style.color = '#e9d5ff';
      stamp.style.borderColor = 'var(--plan)';
      stamp.classList.add('visible', 'bottom-stamp');
    }
    vibe(30);
    playSound('swipe');

    swipedEl.style.transition = 'transform 0.42s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.36s ease';
    swipedEl.style.transform = 'translate3d(0px, -135px, -220px) rotate(0deg) scale(0.42)';
    swipedEl.style.opacity = '0';
  } else {
    swipedEl.style.transition = 'transform 0.36s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.32s ease';
    swipedEl.style.transform = `translate3d(${x}px, 0px, 0px) rotate(${x * 0.04}deg)`;
    swipedEl.style.opacity = '0';

    if (direction === 'right') {
      vibe(35);
      playSound('swipe');
    } else if (direction === 'left') {
      vibe([12, 25, 12]);
      playSound('skip');
    }
  }

  const promoteDelay = direction === 'down' ? 160 : 0;
  setTimeout(() => {
    const stackCards = document.querySelectorAll('#tinderStack .tinder-card');
    stackCards.forEach(c => {
      if (c === swipedEl) return;
      if (c.classList.contains('second-card')) {
        c.classList.remove('second-card');
        c.classList.add('top-card');
      } else if (c.classList.contains('third-card')) {
        c.classList.remove('third-card');
        c.classList.add('second-card');
      }
    });
    if (tinderQueue[0]) updateTinderCaptionAndBars(tinderQueue[0]);
  }, promoteDelay);

  const itemFullId = `${item._mediaType}_${item.id}`;
  let addedCatalogId = null;
  let addedSkippedId = null;

  if (direction === 'left') {
    skippedIds.add(itemFullId);
    addedSkippedId = itemFullId;
    saveSkippedIds();
    backgroundGistSync();
  } else if (direction === 'right' || direction === 'up' || direction === 'down') {
    const isTv = item._mediaType === 'tv';
    const isDoc = Array.isArray(item.genre_ids) && item.genre_ids.includes(99);
    const isPlan = direction === 'up';
    const isSuper = direction === 'down';

    const newEntry = {
      id: itemFullId,
      tmdbId: item.id,
      title: isTv ? item.name : item.title,
      year: (isTv ? item.first_air_date : item.release_date)?.slice(0, 4) || '',
      poster: item.poster_path ? `https://image.tmdb.org/t/p/w342${item.poster_path}` : '',
      category: isDoc ? 'doc' : (isTv ? 'tv' : 'movie'),
      status: isPlan ? 'plan' : 'watched',
      rating: isSuper ? 10 : null,
      favorite: isSuper ? true : false,
      watchedDate: new Date().toISOString().slice(0, 10),
      note: '',
      updatedAt: Date.now()
    };

    if (!catalog.some(c => c.id === newEntry.id)) {
      catalog.unshift(newEntry);
      addedCatalogId = newEntry.id;
      saveLocalCatalog();
      backgroundGistSync();
    }
  }

  tinderHistory.push({ item, addedCatalogId, addedSkippedId });
  tinderSessionSwiped++;

  setTimeout(() => renderTinderStack(), direction === 'down' ? 420 : (direction === 'up' ? 320 : 260));
}

function undoLastSwipe() {
  if (tinderHistory.length === 0) return;
  const last = tinderHistory.pop();
  if (tinderSessionSwiped > 0) tinderSessionSwiped--;

  let changed = false;
  if (last.addedCatalogId) {
    catalog = catalog.filter(c => c.id !== last.addedCatalogId);
    saveLocalCatalog();
    changed = true;
  }
  if (last.addedSkippedId) {
    skippedIds.delete(last.addedSkippedId);
    saveSkippedIds();
    changed = true;
  }
  if (changed) backgroundGistSync();

  tinderQueue.unshift(last.item);
  vibe([15, 20]);
  playSound('tick');
  renderTinderStack();
  showToast('Попередню картку повернуто');
}

/* ================= GITHUB GIST SYNC & BACKUP ================= */
function setSyncState(state, text) {
  document.getElementById('syncDot').className = 'dot ' + state;
  document.getElementById('syncText').textContent = text;
}

async function createNewGist() {
  vibe(10);
  const t = document.getElementById('cfgGhToken').value.trim();
  if (!t) return showToast('Введіть GitHub Token');
  try {
    const res = await fetch('https://api.github.com/gists', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${t}`, 'Accept': 'application/vnd.github+json' },
      body: JSON.stringify({
        public: false,
        files: {
          [GIST_FILENAME]: { content: JSON.stringify(catalog, null, 2) },
          [GIST_SKIPPED_FILENAME]: { content: JSON.stringify(Array.from(skippedIds)) }
        }
      })
    });
    if (!res.ok) throw new Error('Помилка створення Gist');
    const data = await res.json();
    document.getElementById('cfgGistId').value = data.id;
    showToast('Приватний Gist створено!');
  } catch (e) { showToast(e.message); }
}

let syncTimeout;
function backgroundGistSync() {
  if (!config.ghToken || !config.gistId) return;
  clearTimeout(syncTimeout);
  setSyncState('loading', 'Очікування...');
  syncTimeout = setTimeout(pushToGist, 1800);
}

async function pushToGist() {
  if (!config.ghToken || !config.gistId) return;
  setSyncState('loading', 'Збереження...');
  try {
    await fetch(`https://api.github.com/gists/${config.gistId}`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${config.ghToken}`, 'Accept': 'application/vnd.github+json' },
      body: JSON.stringify({
        files: {
          [GIST_FILENAME]: { content: JSON.stringify(catalog, null, 2) },
          [GIST_SKIPPED_FILENAME]: { content: JSON.stringify(Array.from(skippedIds)) }
        }
      })
    });
    setSyncState('ok', 'Синхронізовано');
  } catch (e) { setSyncState('err', 'Помилка'); }
}

async function syncFromGist(silent = false) {
  if (!config.ghToken || !config.gistId) return;
  setSyncState('loading', 'Оновлення...');
  try {
    const res = await fetch(`https://api.github.com/gists/${config.gistId}?t=${Date.now()}`, {
      headers: { 'Authorization': `Bearer ${config.ghToken}` }
    });
    const data = await res.json();
    const content = data.files?.[GIST_FILENAME]?.content;
    if (content) {
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed)) {
        catalog = parsed.map(normalizeCatalogItem);
        saveLocalCatalog();
        renderCatalog();
      }
    }
    const skippedContent = data.files?.[GIST_SKIPPED_FILENAME]?.content;
    if (skippedContent) {
      const parsedSkipped = JSON.parse(skippedContent);
      if (Array.isArray(parsedSkipped)) {
        skippedIds = new Set(parsedSkipped);
        saveSkippedIds();
      }
    }
    setSyncState('ok', 'Синхронізовано');
    if (!silent) showToast('Дані оновлено з хмари');
  } catch (e) { setSyncState('err', 'Помилка'); }
}

function exportJSON() {
  const payload = { catalog, skipped: Array.from(skippedIds) };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `cinema_backup_${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
}

function importJSON(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async (ev) => {
    try {
      const data = JSON.parse(ev.target.result);
      if (Array.isArray(data)) {
        catalog = data.map(normalizeCatalogItem);
      } else if (data && Array.isArray(data.catalog)) {
        catalog = data.catalog.map(normalizeCatalogItem);
        if (Array.isArray(data.skipped)) {
          skippedIds = new Set(data.skipped);
          saveSkippedIds();
        }
      } else {
        throw new Error('Invalid');
      }
      saveLocalCatalog();
      renderCatalog();
      document.getElementById('skippedCountLabel').textContent = skippedIds.size;
      showToast(`Імпортовано: ${catalog.length}`);
      if (config.ghToken && config.gistId) await pushToGist();
    } catch (err) { showToast('Невірний формат JSON'); }
  };
  reader.readAsText(file);
}

/* ================= UTILS ================= */
function openSettings() {
  vibe(10);
  document.getElementById('cfgTmdbKey').value = config.tmdbKey || '';
  document.getElementById('cfgGhToken').value = config.ghToken || '';
  document.getElementById('cfgGistId').value = config.gistId || '';
  document.getElementById('cfgFavEffect').value = config.favEffect || 'heart';
  document.getElementById('skippedCountLabel').textContent = skippedIds.size;
  document.getElementById('settingsModal').classList.add('open');
}

function saveSettings() {
  vibe([15, 25]);
  config.tmdbKey = document.getElementById('cfgTmdbKey').value.trim();
  config.ghToken = document.getElementById('cfgGhToken').value.trim();
  config.gistId = document.getElementById('cfgGistId').value.trim();
  config.favEffect = document.getElementById('cfgFavEffect').value || 'heart';
  localStorage.setItem(CFG_KEY, JSON.stringify(config));
  closeModal('settingsModal');
  renderCatalog();
  showToast('Налаштування збережено');
  if (config.ghToken && config.gistId) syncFromGist();
}

function closeModal(id) {
  vibe(10);
  document.getElementById(id).classList.remove('open');
}

document.querySelectorAll('.modal-backdrop').forEach(bd => {
  bd.addEventListener('click', (e) => {
    if (e.target === bd) closeModal(bd.id);
  });
});

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

let tTimer;
function showToast(m) {
  const e = document.getElementById('toast');
  e.textContent = m;
  e.classList.add('show');
  clearTimeout(tTimer);
  tTimer = setTimeout(() => e.classList.remove('show'), 3000);
}