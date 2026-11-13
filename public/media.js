'use strict';
/* =====================================================================
   Media: full-screen photo editor / video preview (chat + stories),
   story picker and story viewer.   No dialogs — everything is a screen.
   ===================================================================== */

function openScreen(html) {
  const s = $('#screen');
  s.innerHTML = html;
  s.classList.remove('hidden', 'out');
  requestAnimationFrame(() => s.classList.add('in'));
  return s;
}
function closeScreen() {
  const s = $('#screen');
  if (s.classList.contains('hidden')) return;
  s.classList.remove('in');
  s.classList.add('out');
  const done = () => { s.classList.add('hidden'); s.classList.remove('out'); s.innerHTML = ''; };
  prefs().anim ? setTimeout(done, 220) : done();
  if (s._onClose) { const f = s._onClose; s._onClose = null; f(); }
}

const HAS_FILTER = typeof CanvasRenderingContext2D !== 'undefined' && 'filter' in CanvasRenderingContext2D.prototype;

async function loadBitmap(file) {
  if (window.createImageBitmap) { try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch { /* fall through */ } }
  return new Promise((res, rej) => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => { URL.revokeObjectURL(url); res(img); };
    img.onerror = () => rej(new Error(t('err_generic')));
    img.src = url;
  });
}

/* pixel fallback for browsers without ctx.filter */
function adjustPixels(ctx, w, h, b, c, s) {
  const d = ctx.getImageData(0, 0, w, h), a = d.data;
  for (let i = 0; i < a.length; i += 4) {
    let r = a[i] * b, g = a[i + 1] * b, bl = a[i + 2] * b;
    r = (r - 128) * c + 128; g = (g - 128) * c + 128; bl = (bl - 128) * c + 128;
    const gray = 0.299 * r + 0.587 * g + 0.114 * bl;
    a[i] = gray + (r - gray) * s; a[i + 1] = gray + (g - gray) * s; a[i + 2] = gray + (bl - gray) * s;
  }
  ctx.putImageData(d, 0, 0);
}

/* =====================================================================
   Media composer. Resolves when the user sends or cancels.
   opts: { mode: 'chat' | 'story', chatId }
   ===================================================================== */
function openMediaComposer(file, opts) {
  return new Promise((resolve) => {
    const isVideo = file.type.startsWith('video/');
    const story = opts.mode === 'story';
    const replyTo = !story && S.ctx && S.ctx.type === 'reply' ? S.ctx.msg.id : undefined;
    const typed = !story && S.activeId === opts.chatId && !(S.ctx && S.ctx.type === 'edit') ? $('#input').value.trim() : '';

    const scr = openScreen(`<div class="mc">
      <div class="mc-top"><button class="icon-btn" type="button" id="mcClose">${ic('x')}</button><b>${esc(t(isVideo ? 'send' : 'edit_photo'))}</b><span class="grow"></span>
        ${isVideo ? '' : `<button class="icon-btn" type="button" id="mcUndo">${ic('undo')}</button>`}</div>
      <div class="mc-stage" id="mcStage"></div>
      <div class="mc-tools hidden" id="mcOpts"></div>
      ${isVideo ? '' : `<div class="mc-tabs"><button type="button" data-tool="crop">${ic('crop', 20)}<span>${esc(t('crop'))}</span></button>
        <button type="button" data-tool="adjust">${ic('sliders', 20)}<span>${esc(t('adjust'))}</span></button>
        <button type="button" data-tool="draw">${ic('pen', 20)}<span>${esc(t('draw'))}</span></button>
        <button type="button" data-tool="text">${ic('type', 20)}<span>${esc(t('add_text'))}</span></button>
        <button type="button" data-act="rotate">${ic('rotate', 20)}<span>${esc(t('rotate'))}</span></button>
        <button type="button" data-act="flip">${ic('flip', 20)}<span>${esc(t('flip'))}</span></button></div>`}
      <div class="mc-bar"><input class="mc-cap" id="mcCap" maxlength="${story ? 200 : 1000}" placeholder="${esc(t('caption_ph'))}" value="${esc(typed)}">
        <button class="send" id="mcSend" type="button" title="${esc(t(story ? 'publish' : 'send'))}">${ic('send')}</button></div>
    </div>`);

    let finished = false;
    const done = () => { if (finished) return; finished = true; closeScreen(); resolve(); };
    scr._onClose = () => { finished = true; resolve(); };
    $('#mcClose', scr).onclick = done;

    const submit = async (getBlob, name) => {
      const btn = $('#mcSend', scr);
      btn.disabled = true;
      try {
        const blob = await getBlob();
        const caption = $('#mcCap', scr).value.trim();
        if (story) {
          const fd = new FormData();
          fd.append('caption', caption); fd.append('file', blob, name);
          const r = await uploadForm('/stories', fd, setProgress);
          S.stories.push(r.story); renderStories();
        } else {
          await sendOne(blob, { chatId: opts.chatId, caption, replyTo, name });
          if (typed && S.activeId === opts.chatId) resetInput();
          if (replyTo) clearCtx();
        }
        done();
      } catch (e) { toast(e.message, 'err'); btn.disabled = false; }
    };

    const stage = $('#mcStage', scr);
    $('#mcCap', scr).addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); $('#mcSend', scr).click(); } });

    if (isVideo) {
      const url = URL.createObjectURL(file);
      stage.innerHTML = `<video src="${url}" controls playsinline autoplay muted loop></video>`;
      const prev = scr._onClose;
      scr._onClose = () => { URL.revokeObjectURL(url); prev(); };
      $('#mcSend', scr).onclick = () => submit(async () => file, file.name || 'video.mp4');
      return;
    }
    runPhotoEditor(file, scr, stage, submit);
  });
}

async function runPhotoEditor(file, scr, stage, submit) {
  let bmp;
  try { bmp = await loadBitmap(file); } catch (e) { toast(e.message, 'err'); closeScreen(); return; }

  // working base canvas (max 2048px)
  const k0 = Math.min(1, 2048 / Math.max(bmp.width, bmp.height));
  let base = document.createElement('canvas');
  base.width = Math.round(bmp.width * k0); base.height = Math.round(bmp.height * k0);
  base.getContext('2d').drawImage(bmp, 0, 0, base.width, base.height);

  const E = { adj: { b: 100, c: 100, s: 100 }, strokes: [], texts: [], undo: [], tool: '', color: '#ffffff', size: 6, crop: null, aspect: 0, sel: -1 };
  stage.innerHTML = `<div class="cv-wrap" id="cvWrap"><canvas id="cv"></canvas><div class="crop hidden" id="cropOv"><div class="crop-box" id="cropBox"><i data-h="nw"></i><i data-h="ne"></i><i data-h="sw"></i><i data-h="se"></i></div></div></div>`;
  const cv = $('#cv', stage), ctx = cv.getContext('2d');
  const opts = $('#mcOpts', scr);

  function paintAnnotations(c, W) {
    const k = W / 800;
    c.lineCap = 'round'; c.lineJoin = 'round';
    for (const s of E.strokes) {
      c.strokeStyle = s.color; c.lineWidth = s.size * k; c.beginPath();
      s.pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
      if (s.pts.length === 1) c.lineTo(s.pts[0][0] + 0.1, s.pts[0][1]);
      c.stroke();
    }
    for (const tx of E.texts) {
      c.font = `700 ${tx.size * k}px Vazirmatn, "Segoe UI", Tahoma, sans-serif`;
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.lineWidth = tx.size * k * 0.14; c.strokeStyle = 'rgba(0,0,0,.55)'; c.strokeText(tx.text, tx.x, tx.y);
      c.fillStyle = tx.color; c.fillText(tx.text, tx.x, tx.y);
    }
  }
  const filterStr = () => `brightness(${E.adj.b}%) contrast(${E.adj.c}%) saturate(${E.adj.s}%)`;

  function render() {
    cv.width = base.width; cv.height = base.height;
    if (HAS_FILTER) { ctx.filter = filterStr(); ctx.drawImage(base, 0, 0); ctx.filter = 'none'; cv.style.filter = ''; }
    else { ctx.drawImage(base, 0, 0); cv.style.filter = filterStr(); }
    paintAnnotations(ctx, base.width);
  }
  function exportBlob() {
    const out = document.createElement('canvas');
    out.width = base.width; out.height = base.height;
    const c = out.getContext('2d');
    if (HAS_FILTER) { c.filter = filterStr(); c.drawImage(base, 0, 0); c.filter = 'none'; }
    else { c.drawImage(base, 0, 0); adjustPixels(c, out.width, out.height, E.adj.b / 100, E.adj.c / 100, E.adj.s / 100); }
    paintAnnotations(c, out.width);
    return new Promise((res, rej) => out.toBlob((b) => (b ? res(b) : rej(new Error(t('err_generic')))), 'image/jpeg', 0.9));
  }
  const bake = () => { // merge strokes/text into the base before a destructive edit
    if (!E.strokes.length && !E.texts.length) return;
    const c = document.createElement('canvas'); c.width = base.width; c.height = base.height;
    const x = c.getContext('2d'); x.drawImage(base, 0, 0); paintAnnotations(x, c.width);
    base = c; E.strokes = []; E.texts = []; E.undo = [];
  };
  const pushBase = () => { E.undo.push({ t: 'base', prev: base }); if (E.undo.length > 8) E.undo.shift(); };

  /* ---- rotate / flip ---- */
  function rotate() {
    bake(); pushBase();
    const c = document.createElement('canvas'); c.width = base.height; c.height = base.width;
    const x = c.getContext('2d'); x.translate(c.width / 2, c.height / 2); x.rotate(Math.PI / 2); x.drawImage(base, -base.width / 2, -base.height / 2);
    base = c; render();
  }
  function flip() {
    bake(); pushBase();
    const c = document.createElement('canvas'); c.width = base.width; c.height = base.height;
    const x = c.getContext('2d'); x.translate(c.width, 0); x.scale(-1, 1); x.drawImage(base, 0, 0);
    base = c; render();
  }

  /* ---- crop ---- */
  const ov = $('#cropOv', stage), box = $('#cropBox', stage);
  function showCrop(on) {
    ov.classList.toggle('hidden', !on);
    if (on && !E.crop) E.crop = { x: 0.08, y: 0.08, w: 0.84, h: 0.84 };
    if (on) placeCrop();
  }
  function placeCrop() { const c = E.crop; box.style.cssText = `left:${c.x * 100}%;top:${c.y * 100}%;width:${c.w * 100}%;height:${c.h * 100}%`; }
  function setAspect(a) { // a = w/h in pixels (0 = free)
    E.aspect = a;
    if (!a) return;
    const c = E.crop, ratio = (a * base.height) / base.width; // aspect in fraction space
    c.h = Math.min(1 - c.y, c.w / ratio); c.w = c.h * ratio;
    if (c.x + c.w > 1) { c.w = 1 - c.x; c.h = c.w / ratio; }
    placeCrop();
  }
  let drag = null;
  ov.addEventListener('pointerdown', (e) => {
    const r = cv.getBoundingClientRect(), h = e.target.dataset.h;
    const inBox = e.target === box;
    if (!h && !inBox) return;
    ov.setPointerCapture(e.pointerId);
    drag = { h: h || 'move', sx: e.clientX, sy: e.clientY, c: { ...E.crop }, r };
    e.preventDefault();
  });
  ov.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dx = (e.clientX - drag.sx) / drag.r.width, dy = (e.clientY - drag.sy) / drag.r.height, o = drag.c, c = E.crop, min = 0.06;
    if (drag.h === 'move') { c.x = Math.min(1 - o.w, Math.max(0, o.x + dx)); c.y = Math.min(1 - o.h, Math.max(0, o.y + dy)); }
    else {
      let x1 = o.x, y1 = o.y, x2 = o.x + o.w, y2 = o.y + o.h;
      if (drag.h.includes('w')) x1 = Math.min(x2 - min, Math.max(0, o.x + dx)); else x2 = Math.max(x1 + min, Math.min(1, x2 + dx));
      if (drag.h.includes('n')) y1 = Math.min(y2 - min, Math.max(0, o.y + dy)); else y2 = Math.max(y1 + min, Math.min(1, y2 + dy));
      c.x = x1; c.y = y1; c.w = x2 - x1; c.h = y2 - y1;
      if (E.aspect) {
        const ratio = (E.aspect * base.height) / base.width;
        c.h = c.w / ratio;
        if (drag.h.includes('n')) c.y = y2 - c.h;
        if (c.y < 0) { c.y = 0; c.h = (drag.h.includes('n') ? y2 : c.h); c.w = c.h * ratio; if (drag.h.includes('w')) c.x = x2 - c.w; }
        if (c.y + c.h > 1) { c.h = 1 - c.y; c.w = c.h * ratio; }
      }
    }
    placeCrop();
  });
  ['pointerup', 'pointercancel'].forEach((ev) => ov.addEventListener(ev, () => { drag = null; }));
  function applyCrop() {
    bake(); pushBase();
    const c = E.crop, sx = Math.round(c.x * base.width), sy = Math.round(c.y * base.height), w = Math.max(8, Math.round(c.w * base.width)), h = Math.max(8, Math.round(c.h * base.height));
    const n = document.createElement('canvas'); n.width = w; n.height = h;
    n.getContext('2d').drawImage(base, sx, sy, w, h, 0, 0, w, h);
    base = n; E.crop = null; render(); setTool('');
  }

  /* ---- drawing + text (pointer on canvas) ---- */
  const toImg = (e) => { const r = cv.getBoundingClientRect(); return [((e.clientX - r.left) / r.width) * base.width, ((e.clientY - r.top) / r.height) * base.height]; };
  let cur = null, dragText = null;
  cv.addEventListener('pointerdown', (e) => {
    if (E.tool === 'draw') {
      cv.setPointerCapture(e.pointerId);
      cur = { color: E.color, size: E.size, pts: [toImg(e)] }; E.strokes.push(cur); render(); e.preventDefault();
    } else if (E.tool === 'text') {
      const [x, y] = toImg(e);
      const hit = E.texts.findIndex((tx) => { const w = tx.text.length * tx.size * (base.width / 800) * 0.35 + 20; const h = tx.size * (base.width / 800); return Math.abs(x - tx.x) < w && Math.abs(y - tx.y) < h; });
      if (hit >= 0) { cv.setPointerCapture(e.pointerId); dragText = { i: hit, dx: x - E.texts[hit].x, dy: y - E.texts[hit].y }; e.preventDefault(); }
    }
  });
  cv.addEventListener('pointermove', (e) => {
    if (cur) { cur.pts.push(toImg(e)); render(); }
    else if (dragText) { const [x, y] = toImg(e); const tx = E.texts[dragText.i]; tx.x = x - dragText.dx; tx.y = y - dragText.dy; render(); }
  });
  ['pointerup', 'pointercancel'].forEach((ev) => cv.addEventListener(ev, () => {
    if (cur) { E.undo.push({ t: 'stroke' }); cur = null; }
    dragText = null;
  }));

  /* ---- undo ---- */
  $('#mcUndo', scr).onclick = () => {
    const a = E.undo.pop();
    if (!a) return;
    if (a.t === 'stroke') E.strokes.pop(); else if (a.t === 'text') E.texts.pop(); else if (a.t === 'base') base = a.prev;
    render();
  };

  /* ---- tool options ---- */
  const swatches = ['#ffffff', '#111111', '#e5484d', '#f0a020', '#ffd60a', '#2fb344', '#3390ec', '#a855f7'];
  const colorRow = () => `<div class="mc-colors">${swatches.map((c) => `<button type="button" class="acc${E.color === c ? ' on' : ''}" data-col="${c}" style="background:${c}"></button>`).join('')}</div>`;
  function setTool(tool) {
    E.tool = tool;
    $$('.mc-tabs [data-tool]', scr).forEach((b) => b.classList.toggle('on', b.dataset.tool === tool));
    showCrop(tool === 'crop');
    cv.style.cursor = tool === 'draw' ? 'crosshair' : '';
    cv.classList.toggle('drawing', tool === 'draw' || tool === 'text');
    opts.classList.toggle('hidden', !tool);
    if (tool === 'crop') {
      opts.innerHTML = `<div class="mc-row">${[['0', '⬚'], ['1', '1:1'], ['1.3333', '4:3'], ['1.7778', '16:9'], ['0.75', '3:4']].map(([a, l]) => `<button type="button" class="chip${(+a) === E.aspect ? ' on' : ''}" data-asp="${a}">${l}</button>`).join('')}<span class="grow"></span><button type="button" class="btn small" id="mcApply">${esc(t('apply'))}</button></div>`;
      $$('[data-asp]', opts).forEach((b) => (b.onclick = () => { setAspect(+b.dataset.asp); $$('[data-asp]', opts).forEach((x) => x.classList.toggle('on', x === b)); }));
      $('#mcApply', opts).onclick = applyCrop;
    } else if (tool === 'adjust') {
      const sl = (k, label) => `<label class="mc-sl"><span>${esc(label)}</span><input type="range" min="40" max="180" value="${E.adj[k]}" data-adj="${k}"></label>`;
      opts.innerHTML = sl('b', t('brightness')) + sl('c', t('contrast')) + sl('s', t('saturation')) + `<button type="button" class="chip" id="mcReset">${esc(t('reset_img'))}</button>`;
      $$('[data-adj]', opts).forEach((r) => (r.oninput = () => { E.adj[r.dataset.adj] = +r.value; render(); }));
      $('#mcReset', opts).onclick = () => { E.adj = { b: 100, c: 100, s: 100 }; render(); setTool('adjust'); };
    } else if (tool === 'draw') {
      opts.innerHTML = colorRow() + `<label class="mc-sl"><span>${esc(t('size'))}</span><input type="range" min="2" max="24" value="${E.size}" id="mcSize"></label>`;
      $('#mcSize', opts).oninput = (e) => (E.size = +e.target.value);
      $$('[data-col]', opts).forEach((b) => (b.onclick = () => { E.color = b.dataset.col; $$('[data-col]', opts).forEach((x) => x.classList.toggle('on', x === b)); }));
    } else if (tool === 'text') {
      opts.innerHTML = colorRow() + `<div class="mc-row"><input class="inp" id="mcTxt" placeholder="${esc(t('text_ph'))}" maxlength="80"><button type="button" class="btn small" id="mcAddTxt">${ic('plus', 16)}</button></div><label class="mc-sl"><span>${esc(t('size'))}</span><input type="range" min="16" max="90" value="40" id="mcTsize"></label>`;
      $$('[data-col]', opts).forEach((b) => (b.onclick = () => { E.color = b.dataset.col; $$('[data-col]', opts).forEach((x) => x.classList.toggle('on', x === b)); }));
      const add = () => {
        const v = $('#mcTxt', opts).value.trim();
        if (!v) return;
        E.texts.push({ x: base.width / 2, y: base.height / 2, text: v, color: E.color, size: +$('#mcTsize', opts).value }); E.undo.push({ t: 'text' });
        $('#mcTxt', opts).value = ''; render();
      };
      $('#mcAddTxt', opts).onclick = add;
      $('#mcTxt', opts).onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } };
    }
  }
  $$('.mc-tabs [data-tool]', scr).forEach((b) => (b.onclick = () => setTool(E.tool === b.dataset.tool ? '' : b.dataset.tool)));
  $('.mc-tabs [data-act=rotate]', scr).onclick = rotate;
  $('.mc-tabs [data-act=flip]', scr).onclick = flip;
  $('#mcSend', scr).onclick = () => submit(exportBlob, 'photo.jpg');
  render();
}

/* =====================================================================
   STORIES
   ===================================================================== */
function pickStory() {
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = 'image/*,video/*';
  inp.onchange = () => {
    const f = inp.files[0];
    if (!f) return;
    if (!/^(image|video)\//.test(f.type) || f.size > S.cfg.max_upload_mb * 1048576) return toast(t('err_big'), 'err');
    openMediaComposer(f, { mode: 'story' });
  };
  inp.click();
}

function timeAgo(ts) {
  const m = Math.round((Date.now() - ts) / 60000), rf = new Intl.RelativeTimeFormat(localeOf(), { numeric: 'auto' });
  return m < 60 ? rf.format(-Math.max(m, 0), 'minute') : rf.format(-Math.round(m / 60), 'hour');
}

function openStoryViewer(startUser) {
  const order = $$('#storyStrip [data-st]').map((e) => +e.dataset.st).filter((id) => S.stories.some((s) => s.user_id === id));
  let ui = Math.max(0, order.indexOf(startUser)), si = 0, raf = 0, t0 = 0, paused = false, elapsed = 0, dur = 5000;
  const userStories = () => S.stories.filter((s) => s.user_id === order[ui]);
  const scr = openScreen('<div class="sv" id="sv"></div>');
  scr._onClose = () => { cancelAnimationFrame(raf); renderStories(); };
  const root = $('#sv', scr);

  function show() {
    cancelAnimationFrame(raf);
    const list = userStories();
    if (!list.length) return closeScreen();
    if (si >= list.length) si = list.length - 1;
    if (si < 0) si = 0;
    const s = list[si], u = userOf(s.user_id) || { display_name: '?' }, mine = s.user_id === S.me.id;
    if (!mine && !s.seen) { s.seen = true; api(`/stories/${s.id}/view`, { method: 'POST' }).catch(() => {}); }
    root.innerHTML = `<div class="sv-bars">${list.map((_, i) => `<i><b style="width:${i < si ? 100 : 0}%"></b></i>`).join('')}</div>
      <div class="sv-head">${avatar(u, 38)}<div><b>${esc(u.display_name)}</b><small>${esc(timeAgo(s.created_at))}</small></div><span class="grow"></span>
        ${mine ? `<button class="icon-btn" type="button" id="svViews">${ic('eye', 22)}<span>${fnum(s.views || 0)}</span></button><button class="icon-btn" type="button" id="svDel">${ic('trash', 22)}</button>` : ''}
        <button class="icon-btn" type="button" id="svClose">${ic('x', 24)}</button></div>
      <div class="sv-media">${s.type === 'video' ? `<video src="${esc(s.url)}" playsinline autoplay></video>` : `<img src="${esc(s.url)}" alt="">`}</div>
      ${s.caption ? `<div class="sv-cap" dir="auto">${esc(s.caption)}</div>` : ''}
      <div class="sv-zone prev" data-z="prev"></div><div class="sv-zone next" data-z="next"></div><div class="sv-viewers hidden" id="svList"></div>`;
    $('#svClose', root).onclick = closeScreen;
    const del = $('#svDel', root);
    if (del) armConfirm(del, async () => { try { await api('/stories/' + s.id, { method: 'DELETE' }); S.stories = S.stories.filter((x) => x.id !== s.id); renderStories(); si = Math.max(0, si - 1); show(); } catch (e) { toast(e.message, 'err'); } });
    const vw = $('#svViews', root);
    if (vw) vw.onclick = async () => {
      const box = $('#svList', root);
      if (!box.classList.contains('hidden')) { box.classList.add('hidden'); paused = false; return; }
      paused = true;
      try {
        const { views } = await api(`/stories/${s.id}/views`);
        box.innerHTML = `<h4>${esc(t('views_n', { n: fnum(views.length) }))}</h4>` + (views.map((v) => `<div class="ci">${avatar(v, 36)}<div class="ci-main"><div class="ci-title">${esc(v.display_name)}</div><div class="ci-sub">${esc(timeAgo(v.viewed_at))}</div></div></div>`).join('') || '');
        box.classList.remove('hidden');
      } catch (e) { toast(e.message, 'err'); paused = false; }
    };
    const media = $('video', root);
    elapsed = 0; dur = 5000; t0 = performance.now();
    const bar = $$('.sv-bars i b', root)[si];
    const tick = (now) => {
      if (!$('#sv')) return;
      if (media) {
        dur = (media.duration || 5) * 1000; elapsed = media.currentTime * 1000;
        if (media.ended) return next();
      } else {
        if (paused) t0 = now - elapsed; else elapsed = now - t0;
        if (elapsed >= dur) return next();
      }
      bar.style.width = Math.min(100, (elapsed / dur) * 100) + '%';
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  }
  function next() {
    const list = userStories();
    if (si < list.length - 1) { si++; return show(); }
    if (ui < order.length - 1) { ui++; si = 0; return show(); }
    closeScreen();
  }
  function prev() {
    if (si > 0) { si--; return show(); }
    if (ui > 0) { ui--; si = Math.max(0, userStories().length - 1); return show(); }
    show();
  }
  root.addEventListener('click', (e) => {
    const z = e.target.closest('[data-z]');
    if (!z) return;
    const toNext = (z.dataset.z === 'next') !== rtl(); // physical halves flip in RTL languages
    toNext ? next() : prev();
  });
  si = Math.max(0, userStories().findIndex((s) => !s.seen));
  show();
}
