'use strict';
/* =====================================================================
   core.js — state, helpers, icons, settings/themes, API, panels, popups
   ===================================================================== */

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const isMobile = () => matchMedia('(max-width: 800px)').matches;

/* ---------------- state ---------------- */
const S = {
  token: localStorage.getItem('token') || '',
  me: null,
  users: new Map(),
  online: new Set(),
  chats: [],
  activeId: null,
  msgs: [],
  hasMore: false,
  peerRead: 0,
  typing: {},
  reply: null,
  edit: null,
  stories: [],
  panels: [],
  views: [],
  hist: false,
  ignorePop: 0,
  socket: null,
  set: null,
  query: '',
};

/* ---------------- icons ---------------- */
const P = {
  menu: '<line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/>',
  x: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
  check: '<polyline points="20 6 9 17 4 12"/>',
  checks: '<path d="M2 13l4 4L16 7"/><path d="M11 15l2 2L23 7"/>',
  arrowL: '<line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>',
  arrowR: '<line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>',
  chevR: '<polyline points="9 18 15 12 9 6"/>',
  chevL: '<polyline points="15 18 9 12 15 6"/>',
  down: '<polyline points="6 9 12 15 18 9"/>',
  send: '<line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>',
  mic: '<path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/>',
  clip: '<path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>',
  smile: '<circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/>',
  users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  userPlus: '<path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/>',
  channel: '<path d="M4 11a9 9 0 0 1 9 9"/><path d="M4 4a16 16 0 0 1 16 16"/><circle cx="5" cy="19" r="1"/>',
  chat: '<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>',
  trash: '<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>',
  edit: '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z"/>',
  pen: '<path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>',
  reply: '<polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/>',
  fwd: '<polyline points="15 14 20 9 15 4"/><path d="M4 20v-7a4 4 0 0 1 4-4h12"/>',
  copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
  dots: '<circle cx="12" cy="5" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="12" cy="19" r="1.6"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>',
  file: '<path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/>',
  play: '<polygon points="6 3 20 12 6 21 6 3" fill="currentColor"/>',
  pause: '<rect x="6" y="4" width="4" height="16" fill="currentColor"/><rect x="14" y="4" width="4" height="16" fill="currentColor"/>',
  moon: '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>',
  sun: '<circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>',
  bookmark: '<path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  camera: '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>',
  video: '<polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/>',
  crop: '<path d="M6.13 1L6 16a2 2 0 0 0 2 2h15"/><path d="M1 6.13L16 6a2 2 0 0 1 2 2v15"/>',
  rotR: '<polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>',
  rotL: '<polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>',
  type: '<polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/>',
  sliders: '<line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  globe: '<circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
  lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  key: '<path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.78 7.78 5.5 5.5 0 0 1 7.78-7.78zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/>',
  eye: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
  search: '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
  info: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>',
  verified: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>',
  drop: '<path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
  share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>',
  at: '<circle cx="12" cy="12" r="4"/><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-3.92 7.94"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
  mail: '<path d="M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/><polyline points="22,6 12,13 2,6"/>',
  ban: '<circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>',
  clean: '<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M6 6l1 14h10l1-14"/><path d="M10 11l4 4M14 11l-4 4"/>',
  film: '<rect x="2" y="2" width="20" height="20" rx="2.2"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/>',
};
const ic = (n, s = 22, sw = 2) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[n] || ''}</svg>`;
const backIc = () => ic(LANG_META().dir === 'rtl' ? 'arrowR' : 'arrowL', 22);

/* ---------------- formatting (locale aware) ---------------- */
let F = {};
function buildFormatters() {
  const loc = LANG_META().loc;
  const safe = (o) => { try { return new Intl.DateTimeFormat(loc, o); } catch { return new Intl.DateTimeFormat('en', o); } };
  F.time = safe({ hour: '2-digit', minute: '2-digit', hour12: false });
  F.date = safe({ year: 'numeric', month: 'long', day: 'numeric' });
  F.short = safe({ month: 'short', day: 'numeric' });
  F.wd = safe({ weekday: 'short' });
  F.num = new Intl.NumberFormat(loc);
}
const fnum = (n) => F.num.format(n);
const sameDay = (a, b) => new Date(a).toDateString() === new Date(b).toDateString();
const fTime = (ts) => F.time.format(ts);
function dayLabel(ts) {
  const now = Date.now();
  if (sameDay(ts, now)) return t('today');
  if (sameDay(ts, now - 864e5)) return t('yesterday');
  return F.date.format(ts);
}
function listTime(ts) {
  if (!ts) return '';
  const now = Date.now();
  if (sameDay(ts, now)) return fTime(ts);
  if (now - ts < 6 * 864e5) return F.wd.format(ts);
  return F.short.format(ts);
}
function seenText(u) {
  if (!u) return '';
  if (S.online.has(u.id)) return t('online');
  if (u.presence_hidden || !u.last_seen) return t('seen_recently');
  const d = Date.now() - u.last_seen;
  if (d < 60e3) return t('seen_now');
  if (d < 3600e3) return t('seen_min', { n: fnum(Math.floor(d / 60e3)) });
  if (sameDay(u.last_seen, Date.now())) return t('seen_today', { time: fTime(u.last_seen) });
  if (sameDay(u.last_seen, Date.now() - 864e5)) return t('seen_yday', { time: fTime(u.last_seen) });
  return t('seen_date', { date: F.short.format(u.last_seen) });
}
const fsize = (b) => {
  if (!b) return '';
  const u = ['unit_b', 'unit_kb', 'unit_mb', 'unit_gb'];
  let i = 0;
  while (b >= 1024 && i < 3) { b /= 1024; i++; }
  return fnum(+b.toFixed(i ? 1 : 0)) + ' ' + t(u[i]);
};
const fdur = (s) => { s = Math.max(0, Math.round(s || 0)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
function linkify(text) {
  return esc(text).replace(/(https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"])/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
}

/* ---------------- avatars ---------------- */
const GRADS = [['#ff885e', '#ff516a'], ['#ffcd6a', '#ffa85c'], ['#82b1ff', '#665fff'], ['#a0de7e', '#54cb68'], ['#53edd6', '#28c9b7'], ['#72d5fd', '#2a9ef1'], ['#e0a2f3', '#d669ed'], ['#ff9fb6', '#e8537a']];
function avatar(o, size = 40, opt = {}) {
  const name = (o && (o.display_name || o.title)) || '?';
  const g = GRADS[Math.abs(o?.id || 0) % GRADS.length];
  const init = esc(Array.from(name.trim())[0] || '?').toUpperCase();
  const attrs = opt.link && o?.id ? ` data-user="${o.id}"` : '';
  const dot = opt.dot ? '<i class="dot"></i>' : '';
  if (opt.saved) return `<span class="av saved"${attrs} style="width:${size}px;height:${size}px">${ic('bookmark', size * 0.5)}</span>`;
  const img = o?.avatar ? `<img src="${esc(o.avatar)}" alt="" loading="lazy" decoding="async" draggable="false">` : '';
  return `<span class="av"${attrs} style="width:${size}px;height:${size}px;font-size:${size * 0.42}px;background:linear-gradient(135deg,${g[0]},${g[1]})">${img ? '' : init}${img}${dot}</span>`;
}

/* ---------------- themes / settings ---------------- */
const THEMES = [
  { id: 'auto', dark: null, sw: ['linear-gradient(90deg,#bfd9c4 50%,#14202c 50%)', '#fff', '#2b5278'] },
  { id: 'classic', dark: false, sw: ['#bfd9c4', '#fff', '#e1f6cd'], color: '#ffffff' },
  { id: 'night', dark: true, sw: ['#14202c', '#182533', '#2b5278'], color: '#17212b' },
  { id: 'amoled', dark: true, sw: ['#000', '#1c1c1e', '#0a4fa8'], color: '#000000' },
  { id: 'ocean', dark: false, sw: ['#9fd0e6', '#fff', '#cdeaf5'], color: '#ffffff' },
  { id: 'forest', dark: false, sw: ['#b5d9b9', '#fff', '#d4f2e0'], color: '#fcfefc' },
  { id: 'rose', dark: false, sw: ['#f8c3d6', '#fff', '#fcd5e3'], color: '#fffafb' },
  { id: 'violet', dark: true, sw: ['#2a1f4d', '#2a2540', '#5b3fd0'], color: '#1d1a2b' },
  { id: 'sunset', dark: true, sw: ['#4a2415', '#3a2626', '#a64a1c'], color: '#2b1d1d' },
];
const WALLS = [
  { id: 'theme', css: null },
  { id: 'aurora', css: 'linear-gradient(135deg,#667eea,#764ba2)' },
  { id: 'sunrise', css: 'linear-gradient(135deg,#f6d365,#fda085)' },
  { id: 'mint', css: 'linear-gradient(135deg,#84fab0,#8fd3f4)' },
  { id: 'candy', css: 'linear-gradient(135deg,#ff9a9e,#fad0c4 60%,#fbc2eb)' },
  { id: 'dusk', css: 'linear-gradient(160deg,#0f2027,#203a43 50%,#2c5364)' },
  { id: 'plum', css: 'linear-gradient(135deg,#41295a,#2f0743)' },
  { id: 'slate', css: 'linear-gradient(160deg,#232526,#414345)' },
  { id: 'sand', css: 'linear-gradient(135deg,#e6dada,#c9b9a6)' },
  { id: 'cloud', css: 'linear-gradient(160deg,#e0eafc,#cfdef3)' },
  { id: 'lime', css: 'linear-gradient(135deg,#d4fc79,#96e6a1)' },
  { id: 'ink', css: '#0b0b0f' },
];
const DEFAULT_SET = { theme: 'auto', wp: 'theme', textSize: 15, radius: 14, anim: true, pattern: true, lang: '' };
function loadSet() {
  let s = {};
  try { s = JSON.parse(localStorage.getItem('set') || '{}'); } catch { /* ignore */ }
  const d = { ...DEFAULT_SET, ...s };
  if (!('anim' in s) && matchMedia('(prefers-reduced-motion: reduce)').matches) d.anim = false;
  return d;
}
S.set = loadSet();

const resolveTheme = () => (S.set.theme !== 'auto' ? S.set.theme : matchMedia('(prefers-color-scheme: dark)').matches ? 'night' : 'classic');
function applySettings({ animate = false } = {}) {
  const root = document.documentElement;
  if (animate && S.set.anim) { root.classList.add('theme-anim'); clearTimeout(applySettings._t); applySettings._t = setTimeout(() => root.classList.remove('theme-anim'), 450); }
  const id = resolveTheme();
  const th = THEMES.find((x) => x.id === id) || THEMES[1];
  root.dataset.theme = id;
  root.dataset.dark = th.dark ? '1' : '0';
  root.dataset.pat = S.set.pattern ? '1' : '0';
  root.style.setProperty('--msg-fs', S.set.textSize + 'px');
  root.style.setProperty('--br', S.set.radius + 'px');
  root.classList.toggle('no-anim', !S.set.anim);
  let wall = '';
  if (S.set.wp === 'custom' && S.me?.wallpaper) wall = `url("${S.me.wallpaper}") center / cover no-repeat`;
  else { const w = WALLS.find((x) => x.id === S.set.wp); if (w && w.css) wall = w.css; }
  if (wall) root.style.setProperty('--wall', wall); else root.style.removeProperty('--wall');
  const meta = $('meta[name=theme-color]');
  if (meta) meta.content = th.color || '#ffffff';
}
let _syncT;
function saveSet(patch, opts) {
  Object.assign(S.set, patch);
  localStorage.setItem('set', JSON.stringify(S.set));
  applySettings(opts);
  if (S.token && S.me) {
    clearTimeout(_syncT);
    _syncT = setTimeout(() => api('/me/settings', { method: 'PUT', body: { settings: S.set } }).catch(() => {}), 700);
  }
}

/* ---------------- toast / clipboard ---------------- */
function toast(msg, bad = false) {
  const el = document.createElement('div');
  el.className = 'toast' + (bad ? ' bad' : '');
  el.textContent = msg;
  $('#toasts').append(el);
  setTimeout(() => el.remove(), 3000);
}
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); }
  catch {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.cssText = 'position:fixed;opacity:0'; document.body.append(ta); ta.select();
    try { document.execCommand('copy'); } catch { /* ignore */ }
    ta.remove();
  }
  toast(t('copied'));
}

/* ---------------- API ---------------- */
const tErr = (k) => (typeof k === 'string' && k.startsWith('e.') ? t(k) : k || t('e.server_error'));
async function api(path, { method = 'GET', body, form } = {}) {
  const headers = {};
  if (S.token) headers.Authorization = 'Bearer ' + S.token;
  let payload;
  if (form) payload = form;
  else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  let res;
  try { res = await fetch('/api' + path, { method, headers, body: payload }); }
  catch { throw new Error(t('e.network')); }
  let data = {};
  try { data = await res.json(); } catch { /* empty */ }
  if (!res.ok) {
    if (res.status === 401 && S.token && !path.startsWith('/auth/')) { forceLogout(); }
    if (res.status === 403 && data.code === 'banned' && S.token) { forceLogout('e.banned'); }
    const e = new Error(tErr(data.error));
    e.status = res.status;
    throw e;
  }
  return data;
}
function uploadXHR(path, form, onProgress) {
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open('POST', '/api' + path);
    x.setRequestHeader('Authorization', 'Bearer ' + S.token);
    x.upload.onprogress = (e) => e.lengthComputable && onProgress && onProgress(e.loaded / e.total);
    x.onload = () => {
      let d = {};
      try { d = JSON.parse(x.responseText); } catch { /* empty */ }
      x.status >= 200 && x.status < 300 ? resolve(d) : reject(new Error(tErr(d.error)));
    };
    x.onerror = () => reject(new Error(t('e.network')));
    x.send(form);
  });
}

/* ---------------- image helpers ---------------- */
function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('bad image')); };
    img.src = url;
  });
}
async function resizeImage(file, { max = 1600, square = false, quality = 0.88 } = {}) {
  const img = await loadImage(file);
  let sx = 0, sy = 0, sw = img.naturalWidth, sh = img.naturalHeight, w, h;
  if (square) { const s = Math.min(sw, sh); sx = (sw - s) / 2; sy = (sh - s) / 2; sw = sh = s; w = h = Math.min(max, s); }
  else { const k = Math.min(1, max / Math.max(sw, sh)); w = Math.round(sw * k); h = Math.round(sh * k); }
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const x = c.getContext('2d');
  x.fillStyle = '#fff'; x.fillRect(0, 0, w, h);
  x.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
  return new Promise((r) => c.toBlob(r, 'image/jpeg', quality));
}
function pickFile(input, accept) {
  return new Promise((resolve) => {
    input.accept = accept || input.accept;
    input.value = '';
    input.onchange = () => resolve(input.files[0] || null);
    input.click();
  });
}

/* ---------------- popup menus ---------------- */
function closePopup() { const p = $('#pop'); p.classList.add('hidden'); p.innerHTML = ''; S.popHandler = null; }
function popup(html, { x = 0, y = 0, anchor, onPick } = {}) {
  const p = $('#pop');
  p.innerHTML = html;
  p.classList.remove('hidden');
  p.style.left = '0px'; p.style.top = '0px';
  const r = p.getBoundingClientRect();
  let left = x, top = y;
  if (anchor) {
    const a = anchor.getBoundingClientRect();
    left = LANG_META().dir === 'rtl' ? a.right - r.width : a.left;
    top = a.bottom + 4;
  }
  left = clamp(left, 8, innerWidth - r.width - 8);
  top = clamp(top, 8, innerHeight - r.height - 8);
  p.style.left = left + 'px'; p.style.top = top + 'px';
  p.style.animation = 'none'; void p.offsetWidth; p.style.animation = '';
  S.popHandler = onPick;
}
document.addEventListener('pointerdown', (e) => { if (!$('#pop').classList.contains('hidden') && !e.target.closest('#pop')) closePopup(); }, true);
document.addEventListener('click', (e) => {
  const b = e.target.closest('#pop [data-act]');
  if (!b) return;
  const h = S.popHandler;
  closePopup();
  h && h(b.dataset.act, b.dataset);
});
const menuItem = (act, icon, label, cls = '', extra = '') => `<button type="button" data-act="${act}" ${extra} class="${cls}">${icon ? ic(icon, 19) : ''}<span>${esc(label)}</span></button>`;

/* Two-tap confirmation instead of a dialog: first tap arms the button, second tap runs it. */
function armButton(btn, fn) {
  let armed = false, tm, orig = btn.innerHTML;
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!armed) {
      armed = true; orig = btn.innerHTML;
      btn.classList.add('armed');
      const lbl = btn.querySelector('.lbl');
      if (lbl) lbl.innerHTML = esc(t('tap_again')); else btn.textContent = t('tap_again');
      tm = setTimeout(reset, 3200);
    } else { clearTimeout(tm); reset(); fn(btn); }
  });
  function reset() { armed = false; btn.classList.remove('armed'); btn.innerHTML = orig; }
}

/* ---------------- history stack (Android/browser back closes panels, views, chat) ---------------- */
const anythingOpen = () => S.views.length > 0 || S.panels.length > 0 || (isMobile() && S.activeId != null);
function histSync() {
  const any = anythingOpen();
  if (any && !S.hist) { history.pushState({ o: 1 }, ''); S.hist = true; }
  else if (!any && S.hist) { S.hist = false; S.ignorePop++; history.back(); }
}
window.addEventListener('popstate', () => {
  if (S.ignorePop > 0) { S.ignorePop--; return; }
  S.hist = false;
  if (S.views.length) S.views[S.views.length - 1].close();
  else if (S.panels.length) S.panels[S.panels.length - 1].close();
  else if (isMobile() && S.activeId != null) closeChat();
  histSync();
});

/* ---------------- panels (sliding pages, replacing dialogs) ---------------- */
function openPanel(build, { cls = '' } = {}) {
  const el = document.createElement('section');
  el.className = 'panel ' + cls;
  el.innerHTML = '<header class="p-head"><button type="button" class="icon-btn p-back"></button><h2 class="p-title"></h2><div class="p-actions"></div></header><div class="p-body"></div>';
  const p = {
    el, body: $('.p-body', el), actions: $('.p-actions', el), build, closed: false,
    setTitle(s) { $('.p-title', el).textContent = s; },
    refresh() { this.body.innerHTML = ''; this.actions.innerHTML = ''; $('.p-back', el).innerHTML = backIc(); this.build(this); },
    close() { closePanel(p); },
  };
  $('.p-back', el).onclick = () => p.close();
  S.panels.push(p);
  $('#panels').append(el);
  p.refresh();
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('in')));
  histSync();
  return p;
}
function closePanel(p) {
  if (p.closed) return;
  p.closed = true;
  S.panels = S.panels.filter((x) => x !== p);
  p.el.classList.remove('in'); p.el.classList.add('out'); p.el.style.pointerEvents = 'none';
  setTimeout(() => p.el.remove(), 360);
  p.onClose && p.onClose();
  histSync();
}
const closeAllPanels = () => [...S.panels].forEach(closePanel);
const refreshPanels = () => S.panels.forEach((p) => p.refresh());

/* ---------------- full-screen views (editor, stories, lightbox) ---------------- */
function openView(html, cls = '') {
  const el = document.createElement('div');
  el.className = 'view ' + cls;
  el.innerHTML = html;
  const v = { el, closed: false, close() { closeView(v); } };
  S.views.push(v);
  $('#views').append(el);
  histSync();
  return v;
}
function closeView(v) {
  if (v.closed) return;
  v.closed = true;
  S.views = S.views.filter((x) => x !== v);
  v.el.classList.add('closing');
  setTimeout(() => v.el.remove(), 230);
  v.onClose && v.onClose();
  histSync();
}
function openLightbox(url, type) {
  const v = openView(`<div class="vhead"><span class="grow"></span><a class="icon-btn" href="${esc(url)}" download target="_blank" rel="noopener">${ic('download', 22)}</a><button class="icon-btn" type="button" data-x>${ic('x', 24)}</button></div>
    <div class="stage">${type === 'video' ? `<video src="${esc(url)}" controls autoplay playsinline></video>` : `<img src="${esc(url)}" alt="">`}</div>`, 'lightbox');
  v.el.addEventListener('click', (e) => { if (e.target.closest('[data-x]') || e.target.classList.contains('stage')) v.close(); });
  v.onClose = () => { const m = $('video', v.el); m && m.pause(); };
}

/* ---------------- viewport: keeps the composer in place when the keyboard opens ---------------- */
function fitViewport() {
  const vv = window.visualViewport;
  const r = document.documentElement.style;
  r.setProperty('--app-h', (vv ? vv.height : innerHeight) + 'px');
  r.setProperty('--app-top', (vv ? vv.offsetTop : 0) + 'px');
}
if (window.visualViewport) {
  visualViewport.addEventListener('resize', fitViewport);
  visualViewport.addEventListener('scroll', fitViewport);
}
addEventListener('resize', fitViewport);
fitViewport();
addEventListener('scroll', () => { if (scrollY) scrollTo(0, 0); }, { passive: true });

/* ---------------- language ---------------- */
function applyStaticI18n() {
  const m = LANG_META();
  const html = document.documentElement;
  html.lang = m.code; html.dir = m.dir;
  $$('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
  $$('[data-i18n-ph]').forEach((el) => { el.placeholder = t(el.dataset.i18nPh); });
  $$('[data-i18n-aria]').forEach((el) => { el.setAttribute('aria-label', t(el.dataset.i18nAria)); });
  buildFormatters();
}
buildFormatters();
