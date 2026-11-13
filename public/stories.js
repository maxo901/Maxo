'use strict';
/* =====================================================================
   stories.js — 24h photo/video stories: bar, posting, full-screen viewer
   ===================================================================== */

async function loadStories() {
  try {
    const d = await api('/stories');
    S.stories = d.groups || [];
  } catch { /* keep old */ }
  renderStoryBar();
}

function renderStoryBar() {
  const bar = $('#storyBar');
  if (!bar || !S.me) return;
  const mine = S.stories.find((g) => g.user.id === S.me.id);
  let html = `<div class="st-item" data-st="me">
      <div class="st-ring ${mine ? 'new' : ''}" style="${mine ? '' : 'background:transparent'}"><div class="st-in">${avatar(S.me, 52)}</div>
        <span class="st-plus" data-st-add>${ic('plus', 14, 3)}</span></div>
      <span class="st-name ellipsis">${esc(t('my_story'))}</span></div>`;
  for (const g of S.stories) {
    if (g.user.id === S.me.id) continue;
    html += `<div class="st-item" data-st="${g.user.id}"><div class="st-ring ${g.unseen ? 'new' : ''}"><div class="st-in">${avatar(g.user, 52)}</div></div>
      <span class="st-name ellipsis">${esc(g.user.display_name.split(' ')[0])}</span></div>`;
  }
  bar.innerHTML = html;
}

async function postStory() {
  const f = await pickFile($('#fileMedia'), 'image/*,video/*');
  if (!f) return;
  if (!f.type.startsWith('image/') && !f.type.startsWith('video/')) return toast(t('e.bad_file'), true);
  const r = await openMediaCompose(f, { mode: 'story' });
  if (!r) return;
  const fd = new FormData();
  fd.append('file', r.file, r.file.name || 'story');
  fd.append('caption', r.caption || '');
  toast(t('story_uploading'));
  try {
    await uploadXHR('/stories', fd);
    toast(t('story_posted'));
    loadStories();
  } catch (e) { toast(e.message, true); }
}

function onStoryBarClick(e) {
  const item = e.target.closest('[data-st]');
  if (!item) return;
  if (e.target.closest('[data-st-add]')) return postStory();
  if (item.dataset.st === 'me') {
    if (S.stories.some((g) => g.user.id === S.me.id)) openStoryViewer(S.me.id);
    else postStory();
  } else openStoryViewer(Number(item.dataset.st));
}

function openStoryViewer(startUid) {
  const groups = S.stories;
  let gi = groups.findIndex((g) => g.user.id === startUid);
  if (gi < 0) return;
  const firstUnseen = (g) => { const i = g.items.findIndex((x) => !x.seen); return i < 0 ? 0 : i; };
  let si = firstUnseen(groups[gi]);

  const v = openView(`<div class="frame" id="svFrame">
      <div class="media-box" id="svMedia"></div>
      <div class="cap-t hidden" id="svCap"></div>
      <div class="bars" id="svBars"></div>
      <div class="top"><span id="svAv"></span><div class="grow"><b id="svName" class="ellipsis" style="display:block"></b><small id="svTime" style="opacity:.75"></small></div>
        <button class="icon-btn hidden" type="button" id="svDel">${ic('trash', 21)}</button>
        <button class="icon-btn" type="button" id="svX">${ic('x', 24)}</button></div>
      <div class="foot hidden" id="svFoot"></div></div>`, 'sv');
  const frame = $('#svFrame', v.el);
  let raf = 0, elapsed = 0, dur = 5000, last = 0, paused = false, media = null, sheet = null, delArmed = 0;

  const cur = () => groups[gi].items[si];
  function stop() { cancelAnimationFrame(raf); raf = 0; }

  function show() {
    stop();
    const g = groups[gi], it = cur(), mine = g.user.id === S.me.id;
    sheet?.remove(); sheet = null; delArmed = 0;
    $('#svBars', v.el).innerHTML = g.items.map((_, i) => `<i><b style="width:${i < si ? 100 : 0}%"></b></i>`).join('');
    $('#svAv', v.el).innerHTML = avatar(g.user, 40);
    $('#svName', v.el).textContent = g.user.display_name;
    $('#svTime', v.el).textContent = listTime(it.created_at);
    $('#svDel', v.el).classList.toggle('hidden', !(mine || S.me.role === 'owner'));
    const capEl = $('#svCap', v.el);
    capEl.textContent = it.caption || ''; capEl.classList.toggle('hidden', !it.caption);
    const foot = $('#svFoot', v.el);
    foot.classList.toggle('hidden', !mine);
    if (mine) foot.innerHTML = `<button class="vcount" type="button" id="svViews">${ic('eye', 18)}<span>${fnum(it.views || 0)}</span></button>`;

    const box = $('#svMedia', v.el);
    elapsed = 0; paused = false; media = null;
    if (it.type === 'video') {
      box.innerHTML = `<video src="${esc(it.url)}" playsinline autoplay></video>`;
      media = $('video', box);
      media.addEventListener('ended', next);
      media.play().catch(() => { media.muted = true; media.play().catch(() => {}); });
    } else box.innerHTML = `<img src="${esc(it.url)}" alt="">`;

    if (!mine && !it.seen) {
      it.seen = true;
      g.unseen = g.items.some((x) => !x.seen);
      api(`/stories/${it.id}/view`, { method: 'POST' }).catch(() => {});
    }
    last = performance.now();
    raf = requestAnimationFrame(tick);
  }
  function tick(now) {
    raf = requestAnimationFrame(tick);
    const dt = now - last; last = now;
    if (paused) return;
    let p;
    if (media) p = media.duration ? media.currentTime / media.duration : 0;
    else { elapsed += dt; p = elapsed / dur; }
    const bar = $('#svBars', v.el).children[si]?.firstChild;
    if (bar) bar.style.width = Math.min(100, p * 100) + '%';
    if (p >= 1 && !media) next();
  }
  function next() {
    if (si < groups[gi].items.length - 1) { si++; show(); }
    else if (gi < groups.length - 1) { gi++; si = firstUnseen(groups[gi]); show(); }
    else v.close();
  }
  function prev() {
    if (si > 0) si--;
    else if (gi > 0) { gi--; si = 0; }
    show();
  }
  const setPaused = (p) => { paused = p; if (media) p ? media.pause() : media.play().catch(() => {}); };

  /* gestures: tap sides, hold to pause, swipe down to close */
  let down = null;
  frame.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button, .sheet')) return;
    down = { t: performance.now(), x: e.clientX, y: e.clientY };
    setPaused(true);
  });
  frame.addEventListener('pointermove', (e) => { if (down && e.clientY - down.y > 110) { down = null; v.close(); } });
  const release = (e) => {
    if (!down) return;
    const d = down; down = null;
    if (sheet) { sheet.remove(); sheet = null; setPaused(false); return; }
    setPaused(false);
    const moved = Math.hypot(e.clientX - d.x, e.clientY - d.y);
    if (performance.now() - d.t < 250 && moved < 12) {
      const r = frame.getBoundingClientRect();
      (e.clientX - r.left) / r.width < 0.35 ? prev() : next();
    }
  };
  frame.addEventListener('pointerup', release);
  frame.addEventListener('pointercancel', () => { down = null; setPaused(false); });

  $('#svX', v.el).onclick = () => v.close();
  $('#svDel', v.el).onclick = async () => {
    if (Date.now() - delArmed > 2500) { delArmed = Date.now(); toast(t('tap_again')); return; }
    const it = cur(), g = groups[gi];
    try { await api('/stories/' + it.id, { method: 'DELETE' }); } catch (e) { return toast(e.message, true); }
    g.items.splice(si, 1);
    if (!g.items.length) { groups.splice(gi, 1); if (!groups.length) return v.close(); if (gi >= groups.length) gi = groups.length - 1; si = 0; }
    else if (si >= g.items.length) si = g.items.length - 1;
    show();
  };
  v.el.addEventListener('click', async (e) => {
    if (!e.target.closest('#svViews')) return;
    setPaused(true);
    let list = [];
    try { list = (await api(`/stories/${cur().id}/views`)).views; } catch (er) { toast(er.message, true); }
    sheet?.remove();
    sheet = document.createElement('div');
    sheet.className = 'sheet';
    sheet.innerHTML = `<div class="sec-title">${esc(t('story_viewers'))} · ${fnum(list.length)}</div>` +
      (list.length ? list.map((x) => `<div class="urow" data-user="${x.user.id}">${avatar(x.user, 42)}<div class="grow"><div class="nm">${esc(x.user.display_name)}</div><div class="su">${esc(listTime(x.seen_at))}</div></div></div>`).join('') : `<div class="empty">${esc(t('story_no_views'))}</div>`);
    sheet.addEventListener('pointerdown', (ev) => ev.stopPropagation());
    sheet.addEventListener('click', (ev) => { if (ev.target.closest('[data-user]')) { v.close(); openProfile(Number(ev.target.closest('[data-user]').dataset.user)); } });
    frame.append(sheet);
  });
  const onKey = (e) => { if (e.key === 'ArrowRight') next(); else if (e.key === 'ArrowLeft') prev(); else if (e.key === 'Escape') v.close(); else if (e.key === ' ') setPaused(!paused); };
  document.addEventListener('keydown', onKey);
  v.onClose = () => { stop(); document.removeEventListener('keydown', onKey); media && media.pause(); loadStories(); };
  show();
}
