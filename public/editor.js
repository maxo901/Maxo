'use strict';
/* =====================================================================
   editor.js — full-screen image editor (crop, rotate, light/colour,
   draw, text) + simple preview/caption screen for video.
   openMediaCompose(file, {index,total,mode}) -> {file, caption, w, h} | null
   ===================================================================== */

const ED_COLORS = ['#ffffff', '#000000', '#ff3b30', '#ff9500', '#ffcc00', '#34c759', '#00c7be', '#0a84ff', '#af52de', '#ff2d92'];
const ED_ASPECTS = [['free', 0], ['1:1', 1], ['4:3', 4 / 3], ['3:4', 3 / 4], ['16:9', 16 / 9], ['9:16', 9 / 16]];

/* pixel pass for brightness / contrast / saturation / warmth / vignette
   (done by hand because ctx.filter is missing on some mobile browsers) */
function edAdjust(ctx, w, h, A) {
  const img = ctx.getImageData(0, 0, w, h), d = img.data;
  const br = A.b * 2.55, ct = A.c * 1.6, cf = (259 * (ct + 255)) / (255 * (259 - ct));
  const sat = 1 + A.s / 100, warm = A.w * 0.45, vig = A.v / 100;
  const cx = w / 2, cy = h / 2, maxd = Math.hypot(cx, cy);
  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    let r = d[i] + br + warm, g = d[i + 1] + br, b = d[i + 2] + br - warm;
    if (A.c) { r = cf * (r - 128) + 128; g = cf * (g - 128) + 128; b = cf * (b - 128) + 128; }
    if (A.s) { const gr = 0.299 * r + 0.587 * g + 0.114 * b; r = gr + (r - gr) * sat; g = gr + (g - gr) * sat; b = gr + (b - gr) * sat; }
    if (vig) {
      const x = p % w, y = (p / w) | 0, dd = Math.hypot(x - cx, y - cy) / maxd, f = 1 - vig * dd * dd * 1.15;
      r *= f; g *= f; b *= f;
    }
    d[i] = r < 0 ? 0 : r > 255 ? 255 : r;
    d[i + 1] = g < 0 ? 0 : g > 255 ? 255 : g;
    d[i + 2] = b < 0 ? 0 : b > 255 ? 255 : b;
  }
  ctx.putImageData(img, 0, 0);
}

function openMediaCompose(file, { index = 1, total = 1, mode = 'chat' } = {}) {
  return new Promise((resolve) => {
    const isImg = file.type.startsWith('image/') && file.type !== 'image/gif';
    const isVid = file.type.startsWith('video/');
    let settled = false;
    const done = (val) => { if (settled) return; settled = true; resolve(val); };

    const title = total > 1 ? `${index} / ${total}` : '';
    const sendLabel = mode === 'story' ? t('story_post') : t('send');
    const v = openView(`
      <div class="vhead"><button class="icon-btn" type="button" data-x>${ic('x', 24)}</button><b class="grow">${esc(title)}</b>
        <button class="icon-btn" type="button" data-undo disabled style="opacity:.4">${ic('rotL', 22)}</button></div>
      <div class="stage"><div class="cvbox" id="edBox"></div></div>
      <div class="tools hidden" id="edTools"><div class="tool-panel" id="edPanel"></div>
        <div class="tabs2" id="edTabs"></div></div>
      <div class="cap"><input id="edCap" maxlength="${mode === 'story' ? 200 : 1000}" placeholder="${esc(t('caption_ph'))}" autocomplete="off">
        <button class="send big" type="button" data-send aria-label="${esc(sendLabel)}">${ic('send', 22)}</button></div>`, 'ed');
    v.onClose = () => done(null);
    const stage = $('.stage', v.el), box = $('#edBox', v.el), cap = $('#edCap', v.el);
    const sendBtn = $('[data-send]', v.el), undoBtn = $('[data-undo]', v.el);
    $('[data-x]', v.el).onclick = () => v.close();
    const finish = (val) => { done(val); v.close(); };

    /* ---------- video / unsupported: preview only ---------- */
    if (!isImg) {
      const url = URL.createObjectURL(file);
      const media = isVid ? document.createElement('video') : document.createElement('img');
      media.src = url; media.style.cssText = 'max-width:100%;max-height:100%;border-radius:8px';
      if (isVid) { media.controls = true; media.playsInline = true; media.muted = true; media.autoplay = true; media.loop = true; }
      box.append(media);
      undoBtn.remove();
      let w = 0, h = 0;
      media.onloadedmetadata = () => { w = media.videoWidth; h = media.videoHeight; };
      media.onload = () => { w = media.naturalWidth; h = media.naturalHeight; };
      sendBtn.onclick = () => { URL.revokeObjectURL(url); finish({ file, caption: cap.value.trim(), w, h }); };
      cap.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendBtn.click(); });
      return;
    }

    /* ---------- image editor ---------- */
    const st = {
      base: null, tool: 'adjust', adj: { b: 0, c: 0, s: 0, w: 0, v: 0 },
      strokes: [], texts: [], hist: [], color: '#ff3b30', pen: 0.012, sel: null,
      crop: { x: 0, y: 0, w: 1, h: 1 }, aspect: 0, dirty: false, dw: 0, dh: 0,
    };
    const cv = document.createElement('canvas'), ctx = cv.getContext('2d', { willReadFrequently: true });
    box.append(cv);
    const cropEl = document.createElement('div');
    cropEl.className = 'crop hidden';
    box.append(cropEl);
    ['nw', 'ne', 'sw', 'se'].forEach((k) => { const h = document.createElement('div'); h.className = 'hd ' + k; h.dataset.h = k; cropEl.append(h); });

    const hasAdj = () => Object.values(st.adj).some(Boolean);
    const updateUndo = () => { const n = st.hist.length; undoBtn.disabled = !n; undoBtn.style.opacity = n ? 1 : 0.4; };

    function drawOverlays(c, w, h, preview) {
      c.lineCap = 'round'; c.lineJoin = 'round';
      for (const s of st.strokes) {
        if (!s.pts.length) continue;
        c.strokeStyle = s.color; c.lineWidth = Math.max(1, s.size * w);
        c.beginPath();
        c.moveTo(s.pts[0][0] * w, s.pts[0][1] * h);
        if (s.pts.length === 1) c.lineTo(s.pts[0][0] * w + 0.01, s.pts[0][1] * h);
        for (let i = 1; i < s.pts.length - 1; i++) {
          const mx = ((s.pts[i][0] + s.pts[i + 1][0]) / 2) * w, my = ((s.pts[i][1] + s.pts[i + 1][1]) / 2) * h;
          c.quadraticCurveTo(s.pts[i][0] * w, s.pts[i][1] * h, mx, my);
        }
        if (s.pts.length > 1) c.lineTo(s.pts[s.pts.length - 1][0] * w, s.pts[s.pts.length - 1][1] * h);
        c.stroke();
      }
      for (const tx of st.texts) {
        const fs = tx.size * w, lines = String(tx.t || ' ').split('\n');
        c.font = `700 ${fs}px Vazirmatn, system-ui, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
        const lh = fs * 1.3, widths = lines.map((l) => c.measureText(l).width), tw = Math.max(...widths), th = lh * lines.length;
        const cx = tx.x * w, cy = tx.y * h;
        if (tx.bg) {
          c.fillStyle = tx.color; c.beginPath();
          c.roundRect ? c.roundRect(cx - tw / 2 - fs * 0.35, cy - th / 2 - fs * 0.15, tw + fs * 0.7, th + fs * 0.3, fs * 0.3) : c.rect(cx - tw / 2 - fs * 0.35, cy - th / 2 - fs * 0.15, tw + fs * 0.7, th + fs * 0.3);
          c.fill();
          c.fillStyle = tx.color === '#ffffff' || tx.color === '#ffcc00' || tx.color === '#34c759' || tx.color === '#00c7be' ? '#000' : '#fff';
        } else { c.fillStyle = tx.color; c.shadowColor = 'rgba(0,0,0,.45)'; c.shadowBlur = fs * 0.12; }
        lines.forEach((l, i) => c.fillText(l, cx, cy - th / 2 + lh * (i + 0.5)));
        c.shadowBlur = 0;
        tx.bb = { x0: (cx - tw / 2 - fs * 0.35) / w, y0: (cy - th / 2 - fs * 0.15) / h, x1: (cx + tw / 2 + fs * 0.35) / w, y1: (cy + th / 2 + fs * 0.15) / h };
        if (preview && st.tool === 'text' && tx === st.sel) {
          c.setLineDash([6, 4]); c.strokeStyle = '#fff'; c.lineWidth = 1.5;
          c.strokeRect(tx.bb.x0 * w, tx.bb.y0 * h, (tx.bb.x1 - tx.bb.x0) * w, (tx.bb.y1 - tx.bb.y0) * h); c.setLineDash([]);
        }
      }
    }

    let raf = 0;
    const render = () => { if (raf) return; raf = requestAnimationFrame(() => { raf = 0; paint(); }); };
    function paint() {
      if (!st.base) return;
      ctx.clearRect(0, 0, cv.width, cv.height);
      ctx.drawImage(st.base, 0, 0, cv.width, cv.height);
      if (hasAdj()) edAdjust(ctx, cv.width, cv.height, st.adj);
      if (st.tool !== 'crop') drawOverlays(ctx, cv.width, cv.height, true);
    }
    function layout() {
      if (!st.base) return;
      const mw = stage.clientWidth - 16, mh = stage.clientHeight - 16;
      const k = Math.min(mw / st.base.width, mh / st.base.height);
      st.dw = Math.max(40, Math.floor(st.base.width * k));
      st.dh = Math.max(40, Math.floor(st.base.height * k));
      const dpr = Math.min(devicePixelRatio || 1, 2);
      cv.width = Math.round(st.dw * dpr); cv.height = Math.round(st.dh * dpr);
      cv.style.width = st.dw + 'px'; cv.style.height = st.dh + 'px';
      placeCrop(); render();
    }
    new ResizeObserver(layout).observe(stage);

    /* ---- geometry helpers: base canvas swaps (rotate / crop) ---- */
    function setBase(c) { st.base = c; layout(); }
    function rotate(dir) { // dir: 1 = clockwise
      const b = st.base, c = document.createElement('canvas');
      c.width = b.height; c.height = b.width;
      const x = c.getContext('2d');
      x.translate(c.width / 2, c.height / 2); x.rotate(dir * Math.PI / 2); x.drawImage(b, -b.width / 2, -b.height / 2);
      const ratio = b.width / c.width; // old width / new width
      const tr = (px, py) => (dir > 0 ? [1 - py, px] : [py, 1 - px]);
      st.strokes.forEach((s) => { s.pts = s.pts.map(([px, py]) => tr(px, py)); s.size *= ratio; });
      st.texts.forEach((tx) => { [tx.x, tx.y] = tr(tx.x, tx.y); tx.size *= ratio; });
      st.dirty = true; st.crop = { x: 0, y: 0, w: 1, h: 1 };
      setBase(c);
    }
    function applyCrop() {
      const k = st.crop;
      if (k.w > 0.995 && k.h > 0.995) return;
      const b = st.base, sx = Math.round(k.x * b.width), sy = Math.round(k.y * b.height), sw = Math.max(8, Math.round(k.w * b.width)), sh = Math.max(8, Math.round(k.h * b.height));
      const c = document.createElement('canvas');
      c.width = sw; c.height = sh;
      c.getContext('2d').drawImage(b, sx, sy, sw, sh, 0, 0, sw, sh);
      st.strokes.forEach((s) => { s.pts = s.pts.map(([px, py]) => [(px - k.x) / k.w, (py - k.y) / k.h]); s.size /= k.w; });
      st.texts.forEach((tx) => { tx.x = (tx.x - k.x) / k.w; tx.y = (tx.y - k.y) / k.h; tx.size /= k.w; });
      st.crop = { x: 0, y: 0, w: 1, h: 1 }; st.dirty = true;
      setBase(c);
    }

    /* ---- crop box ---- */
    function placeCrop() {
      const on = st.tool === 'crop';
      cropEl.classList.toggle('hidden', !on);
      if (!on) return;
      const k = st.crop;
      Object.assign(cropEl.style, { left: k.x * st.dw + 'px', top: k.y * st.dh + 'px', width: k.w * st.dw + 'px', height: k.h * st.dh + 'px' });
    }
    function setAspect(a) {
      st.aspect = a;
      if (!a) return;
      const target = a * (st.base.height / st.base.width); // w/h in normalised units
      let w = st.crop.w, h = w / target;
      if (h > 1) { h = 1; w = h * target; }
      if (w > 1) { w = 1; h = w / target; }
      const cx = st.crop.x + st.crop.w / 2, cy = st.crop.y + st.crop.h / 2;
      st.crop = { x: clamp(cx - w / 2, 0, 1 - w), y: clamp(cy - h / 2, 0, 1 - h), w, h };
      placeCrop();
    }
    let drag = null;
    cropEl.addEventListener('pointerdown', (e) => {
      e.preventDefault(); cropEl.setPointerCapture(e.pointerId);
      drag = { mode: e.target.dataset.h || 'move', sx: e.clientX, sy: e.clientY, k: { ...st.crop } };
    });
    cropEl.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const dx = (e.clientX - drag.sx) / st.dw, dy = (e.clientY - drag.sy) / st.dh, k = drag.k, min = 0.08;
      let { x, y, w, h } = k;
      if (drag.mode === 'move') { x = clamp(k.x + dx, 0, 1 - k.w); y = clamp(k.y + dy, 0, 1 - k.h); }
      else {
        const m = drag.mode;
        if (m.includes('w')) { x = clamp(k.x + dx, 0, k.x + k.w - min); w = k.x + k.w - x; }
        if (m.includes('e')) { w = clamp(k.w + dx, min, 1 - k.x); }
        if (m.includes('n')) { y = clamp(k.y + dy, 0, k.y + k.h - min); h = k.y + k.h - y; }
        if (m.includes('s')) { h = clamp(k.h + dy, min, 1 - k.y); }
        if (st.aspect) {
          const target = st.aspect * (st.base.height / st.base.width);
          h = w / target;
          if (m.includes('n')) y = k.y + k.h - h;
          if (y < 0) { y = 0; h = k.y + k.h; w = h * target; if (m.includes('w')) x = k.x + k.w - w; }
          if (y + h > 1) { h = 1 - y; w = h * target; if (m.includes('w')) x = k.x + k.w - w; }
          if (x + w > 1) { w = 1 - x; h = w / target; if (m.includes('n')) y = k.y + k.h - h; }
        }
      }
      st.crop = { x, y, w, h }; placeCrop();
    });
    const endDrag = () => { drag = null; };
    cropEl.addEventListener('pointerup', endDrag); cropEl.addEventListener('pointercancel', endDrag);

    /* ---- drawing + text dragging on the canvas ---- */
    let cur = null, dragText = null;
    const pos = (e) => { const r = cv.getBoundingClientRect(); return [clamp((e.clientX - r.left) / r.width, 0, 1), clamp((e.clientY - r.top) / r.height, 0, 1)]; };
    cv.addEventListener('pointerdown', (e) => {
      if (st.tool === 'draw') {
        e.preventDefault(); cv.setPointerCapture(e.pointerId);
        cur = { color: st.color, size: st.pen, pts: [pos(e)] };
        st.strokes.push(cur); render();
      } else if (st.tool === 'text') {
        const [px, py] = pos(e);
        const hit = [...st.texts].reverse().find((tx) => tx.bb && px >= tx.bb.x0 && px <= tx.bb.x1 && py >= tx.bb.y0 && py <= tx.bb.y1);
        st.sel = hit || null;
        if (hit) { cv.setPointerCapture(e.pointerId); dragText = { tx: hit, dx: hit.x - px, dy: hit.y - py }; }
        syncTextPanel(); render();
      }
    });
    cv.addEventListener('pointermove', (e) => {
      if (cur) { cur.pts.push(pos(e)); render(); }
      else if (dragText) { const [px, py] = pos(e); dragText.tx.x = clamp(px + dragText.dx, 0, 1); dragText.tx.y = clamp(py + dragText.dy, 0, 1); st.dirty = true; render(); }
    });
    const up = () => {
      if (cur) { st.hist.push({ kind: 'stroke', ref: cur }); st.dirty = true; cur = null; updateUndo(); }
      dragText = null;
    };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);

    undoBtn.onclick = () => {
      const h = st.hist.pop();
      if (!h) return;
      if (h.kind === 'stroke') st.strokes = st.strokes.filter((s) => s !== h.ref);
      else if (h.kind === 'text') { st.texts = st.texts.filter((x) => x !== h.ref); if (st.sel === h.ref) st.sel = null; syncTextPanel(); }
      updateUndo(); render();
    };

    /* ---- tool panels ---- */
    const panel = $('#edPanel', v.el), tabs = $('#edTabs', v.el), tools = $('#edTools', v.el);
    const TOOLS = [['crop', 'crop', 'ed_crop'], ['adjust', 'sliders', 'ed_adjust'], ['draw', 'pen', 'ed_draw'], ['text', 'type', 'ed_text']];
    tabs.innerHTML = TOOLS.map(([id, icon, key]) => `<button type="button" data-tool="${id}">${ic(icon, 22)}<span>${esc(t(key))}</span></button>`).join('');
    tabs.addEventListener('click', (e) => { const b = e.target.closest('[data-tool]'); if (b) setTool(b.dataset.tool); });

    const swatchHTML = (cur) => `<div class="swatches">${ED_COLORS.map((c) => `<button type="button" data-c="${c}" class="${c === cur ? 'on' : ''}" style="background:${c}"></button>`).join('')}</div>`;
    const slider = (key, label, min, max, val) => `<label class="sl"><span>${esc(label)}</span><input type="range" min="${min}" max="${max}" value="${val}" data-k="${key}"><output>${val}</output></label>`;

    function setTool(tool) {
      if (st.tool === 'crop' && tool !== 'crop') applyCrop();
      st.tool = tool; st.sel = tool === 'text' ? st.sel : null;
      $$('[data-tool]', tabs).forEach((b) => b.classList.toggle('on', b.dataset.tool === tool));
      cv.style.cursor = tool === 'draw' ? 'crosshair' : 'default';
      if (tool === 'crop') {
        panel.innerHTML = `<div class="chips">${ED_ASPECTS.map(([n, a]) => `<button type="button" class="chip ${st.aspect === a ? 'on' : ''}" data-a="${a}">${n === 'free' ? esc(t('ed_free')) : n}</button>`).join('')}
          <button type="button" class="chip" data-rot="-1">${ic('rotL', 16)}</button><button type="button" class="chip" data-rot="1">${ic('rotR', 16)}</button></div>`;
        placeCrop();
      } else if (tool === 'adjust') {
        panel.innerHTML = [['b', 'ed_light'], ['c', 'ed_contrast'], ['s', 'ed_saturation'], ['w', 'ed_warmth'], ['v', 'ed_vignette']].map(([k, key]) => slider(k, t(key), k === 'v' ? 0 : -100, 100, st.adj[k])).join('');
        panel.style.maxHeight = '150px'; panel.style.overflowY = 'auto';
      } else if (tool === 'draw') {
        panel.innerHTML = swatchHTML(st.color) + slider('pen', t('ed_size'), 2, 40, Math.round(st.pen * 1000));
      } else {
        panel.innerHTML = `<div style="display:flex;gap:8px;align-items:flex-start"><textarea class="txt" id="edTxt" rows="1" placeholder="${esc(t('ed_text_ph'))}"></textarea>
          <button type="button" class="chip on" data-addtext>${esc(t('ed_add'))}</button></div>
          <div id="edTxtOpts"></div>`;
        syncTextPanel();
      }
      if (tool !== 'adjust') { panel.style.maxHeight = ''; panel.style.overflowY = ''; }
      placeCrop(); render();
    }
    function syncTextPanel() {
      const opts = $('#edTxtOpts', v.el);
      if (!opts) return;
      const s = st.sel;
      opts.innerHTML = s ? `${swatchHTML(s.color)}<div style="display:flex;gap:8px;align-items:center"><label class="sl" style="flex:1">${'<span>' + esc(t('ed_size')) + '</span>'}<input type="range" min="2" max="16" value="${Math.round(s.size * 100)}" data-k="tsize"><output>${Math.round(s.size * 100)}</output></label>
        <button class="chip ${s.bg ? 'on' : ''}" type="button" data-tbg>${esc(t('ed_bg'))}</button><button class="chip" type="button" data-tdel>${ic('trash', 15)}</button></div>` : '';
      const ta = $('#edTxt', v.el);
      if (ta && s && document.activeElement !== ta) ta.value = s.t;
    }
    panel.addEventListener('input', (e) => {
      const k = e.target.dataset.k;
      if (e.target.id === 'edTxt' && st.sel) { st.sel.t = e.target.value; st.dirty = true; render(); return; }
      if (!k) return;
      const val = Number(e.target.value);
      e.target.nextElementSibling.textContent = val;
      if (k === 'pen') st.pen = val / 1000;
      else if (k === 'tsize' && st.sel) { st.sel.size = val / 100; st.dirty = true; }
      else { st.adj[k] = val; st.dirty = true; }
      render();
    });
    panel.addEventListener('click', (e) => {
      const el = e.target.closest('button');
      if (!el) return;
      if (el.dataset.c) {
        if (st.tool === 'draw') st.color = el.dataset.c;
        else if (st.sel) { st.sel.color = el.dataset.c; st.dirty = true; }
        $$('.swatches button', el.parentElement).forEach((b) => b.classList.toggle('on', b === el));
        render();
      } else if (el.dataset.a !== undefined) { setAspect(Number(el.dataset.a)); $$('[data-a]', panel).forEach((b) => b.classList.toggle('on', b === el)); }
      else if (el.dataset.rot) { applyCrop(); rotate(Number(el.dataset.rot)); placeCrop(); }
      else if (el.hasAttribute('data-addtext')) {
        const ta = $('#edTxt', v.el);
        const tx = { t: ta.value.trim() || t('ed_text_default'), x: 0.5, y: 0.5, size: 0.07, color: st.color === '#ff3b30' ? '#ffffff' : st.color, bg: false };
        st.texts.push(tx); st.hist.push({ kind: 'text', ref: tx }); st.sel = tx; st.dirty = true; ta.value = tx.t; updateUndo(); syncTextPanel(); render();
      } else if (el.hasAttribute('data-tbg') && st.sel) { st.sel.bg = !st.sel.bg; el.classList.toggle('on', st.sel.bg); render(); }
      else if (el.hasAttribute('data-tdel') && st.sel) { st.texts = st.texts.filter((x) => x !== st.sel); st.sel = null; syncTextPanel(); render(); }
    });

    /* ---- export ---- */
    async function exportImage() {
      if (st.tool === 'crop') applyCrop();
      if (!st.dirty && !hasAdj() && ['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
        const img = await loadImage(file).catch(() => null);
        return { blob: file, w: img ? img.naturalWidth : st.base.width, h: img ? img.naturalHeight : st.base.height };
      }
      const w = st.base.width, h = st.base.height, c = document.createElement('canvas');
      c.width = w; c.height = h;
      const x = c.getContext('2d', { willReadFrequently: true });
      x.fillStyle = '#fff'; x.fillRect(0, 0, w, h);
      x.drawImage(st.base, 0, 0);
      if (hasAdj()) edAdjust(x, w, h, st.adj);
      drawOverlays(x, w, h, false);
      const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.9));
      return { blob, w, h };
    }
    sendBtn.onclick = async () => {
      sendBtn.disabled = true;
      try {
        const { blob, w, h } = await exportImage();
        const name = (file.name || 'photo').replace(/\.[^.]+$/, '') + (blob === file ? (file.name.match(/\.[^.]+$/) || ['.jpg'])[0] : '.jpg');
        finish({ file: blob instanceof File ? blob : new File([blob], name, { type: 'image/jpeg' }), caption: cap.value.trim(), w, h });
      } catch { sendBtn.disabled = false; toast(t('e.bad_image'), true); }
    };
    cap.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendBtn.click(); });

    /* ---- load ---- */
    loadImage(file).then((img) => {
      const k = Math.min(1, 2048 / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      tools.classList.remove('hidden');
      st.base = c;
      setTool('adjust');
      layout();
    }).catch(() => { toast(t('e.bad_image'), true); finish(null); });
  });
}
