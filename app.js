/* global jsQR */
import { buildSVG, eyePreview, DOT_STYLES, EYE_FRAMES, EYE_BALLS } from './render.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const store = {
  get(k, d) { try { const v = localStorage.getItem('pixel:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('pixel:' + k, JSON.stringify(v)); } catch {} },
};
const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isTouch = matchMedia('(pointer: coarse)').matches;
const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

let toastT;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.remove('hidden');
  t.style.animation = 'none'; void t.offsetWidth; t.style.animation = '';
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.add('hidden'), 2400);
}

/* ═══════════════════ content types ═══════════════════ */
const ICONS = {
  link: '<path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1"/><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1"/>',
  text: '<path d="M5 6h14M5 12h14M5 18h9"/>',
  wifi: '<path d="M2.5 9a14 14 0 0 1 19 0M5.5 12.5a9.5 9.5 0 0 1 13 0M8.6 15.8a5 5 0 0 1 6.8 0"/><circle cx="12" cy="19" r=".9" fill="currentColor"/>',
  contact: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  email: '<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="m3.5 7 8.5 6 8.5-6"/>',
  phone: '<path d="M5 3h3l2 5-2.5 1.5a11 11 0 0 0 7 7L16 14l5 2v3a2 2 0 0 1-2 2A17 17 0 0 1 3 5a2 2 0 0 1 2-2"/>',
  sms: '<path d="M4 5h16v11H9l-5 4z"/>',
};
const TYPES = {
  link: { name: 'Link', fields: [{ k: 'url', ph: 'https://example.com', type: 'url', auto: 'url' }],
    build: d => { let u = (d.url || '').trim(); if (!u) return ''; if (!/^[a-z][a-z0-9+.-]*:/i.test(u)) u = 'https://' + u; return u; } },
  text: { name: 'Text', fields: [{ k: 'text', ph: 'Type anything…', area: true }], build: d => d.text || '' },
  wifi: { name: 'Wi-Fi', fields: [
      { k: 'ssid', lab: 'Network name', ph: 'My Wi-Fi' },
      { k: 'pass', lab: 'Password', ph: 'Password', pw: true },
      { k: 'sec', lab: 'Security', select: [['WPA', 'WPA / WPA2 / WPA3'], ['WEP', 'WEP'], ['nopass', 'None (open)']] },
      { k: 'hidden', lab: 'Hidden network', check: true },
    ], hint: 'People scan it and join — no typing the password.',
    build: d => { if (!d.ssid) return ''; const e = s => String(s || '').replace(/([\\;,:"])/g, '\\$1'); const sec = d.sec || 'WPA';
      return `WIFI:T:${sec};S:${e(d.ssid)};${sec !== 'nopass' ? `P:${e(d.pass)};` : ''}${d.hidden ? 'H:true;' : ''};`; } },
  contact: { name: 'Contact', fields: [
      { row: [{ k: 'first', ph: 'First name', auto: 'given-name' }, { k: 'last', ph: 'Last name', auto: 'family-name' }] },
      { k: 'tel', ph: 'Phone', type: 'tel', auto: 'tel' },
      { k: 'mail', ph: 'Email', type: 'email', auto: 'email' },
      { row: [{ k: 'org', ph: 'Company', auto: 'organization' }, { k: 'title', ph: 'Job title', auto: 'organization-title' }] },
      { k: 'web', ph: 'Website', type: 'url' },
      { k: 'adr', ph: 'Address' },
    ], hint: 'Scanning it offers to save you as a contact.',
    build: d => { const e = s => String(s || '').replace(/([\\;,])/g, '\\$1').replace(/\n/g, '\\n');
      if (!d.first && !d.last && !d.tel && !d.mail && !d.org) return '';
      const L = ['BEGIN:VCARD', 'VERSION:3.0', `N:${e(d.last)};${e(d.first)};;;`, `FN:${e([d.first, d.last].filter(Boolean).join(' ') || d.org)}`];
      if (d.org) L.push('ORG:' + e(d.org)); if (d.title) L.push('TITLE:' + e(d.title));
      if (d.tel) L.push('TEL;TYPE=CELL:' + d.tel.trim()); if (d.mail) L.push('EMAIL:' + d.mail.trim());
      if (d.web) L.push('URL:' + d.web.trim()); if (d.adr) L.push('ADR:;;' + e(d.adr) + ';;;;');
      L.push('END:VCARD'); return L.join('\n'); } },
  email: { name: 'Email', fields: [{ k: 'to', ph: 'name@example.com', type: 'email', auto: 'email' }, { k: 'sub', ph: 'Subject (optional)' }, { k: 'body', ph: 'Message (optional)', area: true }],
    build: d => { if (!d.to) return ''; const q = []; if (d.sub) q.push('subject=' + encodeURIComponent(d.sub)); if (d.body) q.push('body=' + encodeURIComponent(d.body));
      return `mailto:${d.to.trim()}${q.length ? '?' + q.join('&') : ''}`; } },
  phone: { name: 'Call', fields: [{ k: 'tel', ph: '+1 555 123 4567', type: 'tel', auto: 'tel' }], hint: 'Scanning it starts a call.',
    build: d => d.tel ? 'tel:' + d.tel.replace(/[^\d+*#]/g, '') : '' },
  sms: { name: 'Message', fields: [{ k: 'tel', ph: 'Phone number', type: 'tel' }, { k: 'msg', ph: 'Message (optional)', area: true }],
    build: d => d.tel ? `SMSTO:${d.tel.replace(/[^\d+]/g, '')}:${d.msg || ''}` : '' },
};

/* ═══════════════════ state ═══════════════════ */
const DEFAULT_STYLE = {
  dot: 'rounded', dotScale: 1, eyeFrame: 'rounded', eyeBall: 'rounded',
  fg: { type: 'solid', c1: '#111111', c2: '#f5a300', angle: 45 },
  eyeCustom: false, eyeFrameColor: '#111111', eyeBallColor: '#f5a300',
  bgMode: 'color', bgColor: '#ffffff', bgGrad: { type: 'linear', c1: '#fff8e1', c2: '#ffe4ec', angle: 135 },
  bgImage: null, bgFade: 0.7, bgFadeColor: '#ffffff',
  logo: null, logoSize: 0.22, logoBg: 'rounded', logoFit: 'cover',
  margin: 3, frameOn: false, frameText: 'SCAN ME', frameStyle: 'rounded', frameColor: '#111111', frameTextColor: '#ffffff',
  ecl: 'M', exportSize: 1024, preset: 'soft',
};
const S = Object.assign(structuredClone(DEFAULT_STYLE), store.get('style', {}));
const D = store.get('data', { link: { url: '' } });
let type = store.get('type', 'link');
if (!TYPES[type]) type = 'link';
const saveState = () => { store.set('style', S); store.set('data', D); store.set('type', type); };

const PRESETS = [
  { id: 'classic', s: { dot: 'square', eyeFrame: 'square', eyeBall: 'square', fg: { type: 'solid', c1: '#000000' }, bgMode: 'color', bgColor: '#ffffff', frameOn: false } },
  { id: 'soft', s: { dot: 'rounded', eyeFrame: 'rounded', eyeBall: 'rounded', fg: { type: 'solid', c1: '#111111' }, bgMode: 'color', bgColor: '#ffffff', frameOn: false } },
  { id: 'dots', s: { dot: 'dots', eyeFrame: 'circle', eyeBall: 'circle', fg: { type: 'solid', c1: '#4338ca' }, bgMode: 'color', bgColor: '#ffffff', frameOn: false } },
  { id: 'sunset', s: { dot: 'squircle', eyeFrame: 'cushion', eyeBall: 'rounded', fg: { type: 'linear', c1: '#ea580c', c2: '#b91c1c', angle: 45 }, bgMode: 'color', bgColor: '#fffbeb', frameOn: false } },
  { id: 'ocean', s: { dot: 'dots', eyeFrame: 'rounded', eyeBall: 'circle', fg: { type: 'radial', c1: '#0284c7', c2: '#1e3a8a' }, bgMode: 'color', bgColor: '#f0f9ff', frameOn: false } },
  { id: 'mint', s: { dot: 'vbars', eyeFrame: 'leaf', eyeBall: 'leaf', fg: { type: 'solid', c1: '#047857' }, bgMode: 'color', bgColor: '#ecfdf5', frameOn: false } },
  { id: 'grape', s: { dot: 'tiny', eyeFrame: 'cushion', eyeBall: 'circle', fg: { type: 'linear', c1: '#7c3aed', c2: '#db2777', angle: 135 }, bgMode: 'gradient', bgGrad: { type: 'linear', c1: '#faf5ff', c2: '#fff1f2', angle: 135 }, frameOn: false } },
  { id: 'candy', s: { dot: 'hbars', eyeFrame: 'circle', eyeBall: 'diamond', fg: { type: 'solid', c1: '#be185d' }, bgMode: 'color', bgColor: '#fff1f2', frameOn: false } },
  { id: 'gold', s: { dot: 'squircle', eyeFrame: 'leaf', eyeBall: 'leaf', fg: { type: 'linear', c1: '#92400e', c2: '#d97706', angle: 90 }, bgMode: 'color', bgColor: '#ffffff', frameOn: true, frameColor: '#92400e', frameTextColor: '#fff7e0', frameStyle: 'rounded' } },
  { id: 'badge', s: { dot: 'rounded', eyeFrame: 'rounded', eyeBall: 'rounded', fg: { type: 'solid', c1: '#111111' }, bgMode: 'color', bgColor: '#ffffff', frameOn: true, frameColor: '#111111', frameTextColor: '#ffffff', frameStyle: 'rounded' } },
  { id: 'ink', s: { dot: 'tiny', eyeFrame: 'square', eyeBall: 'square', fg: { type: 'solid', c1: '#1e293b' }, bgMode: 'color', bgColor: '#f8fafc', frameOn: false, dotScale: 1 } },
  { id: 'lime', s: { dot: 'dots', eyeFrame: 'cushion', eyeBall: 'rounded', fg: { type: 'linear', c1: '#15803d', c2: '#0f766e', angle: 0 }, bgMode: 'color', bgColor: '#f7fee7', frameOn: true, frameColor: '#15803d', frameTextColor: '#f7fee7', frameStyle: 'square' } },
];

const DARKS = ['#000000', '#111111', '#334155', '#4338ca', '#2563eb', '#0e7490', '#047857', '#92400e', '#dc2626', '#be185d', '#7c3aed'];
const LIGHTS = ['#ffffff', '#fffbeb', '#fef3c7', '#ecfdf5', '#f0f9ff', '#faf5ff', '#fff1f2', '#f1f5f9', '#e5e7eb', '#ffd84d'];
const GRADS = [['#ea580c', '#b91c1c'], ['#7c3aed', '#db2777'], ['#0284c7', '#1e3a8a'], ['#059669', '#0e7490'], ['#111111', '#4b5563'], ['#be185d', '#7c2d12'], ['#2563eb', '#7c3aed']];
const LGRADS = [['#fff8e1', '#ffe4ec'], ['#ecfeff', '#eef2ff'], ['#f0fdf4', '#fefce8'], ['#fdf4ff', '#eff6ff'], ['#ffffff', '#e5e7eb'], ['#fff7ed', '#fef2f2']];

/* ═══════════════════ render ═══════════════════ */
function payload() { return TYPES[type].build(D[type] || {}); }
function renderOpts(text) {
  const solid = c => ({ type: 'solid', c1: c });
  let bg = { type: 'transparent' }, bgImage = null;
  if (S.bgMode === 'color') bg = solid(S.bgColor);
  else if (S.bgMode === 'gradient') bg = S.bgGrad;
  else if (S.bgMode === 'photo') { bg = solid(S.bgFadeColor); bgImage = S.bgImage; }
  const logoBgColor = S.bgMode === 'color' ? S.bgColor : S.bgMode === 'photo' ? S.bgFadeColor : '#ffffff';
  return {
    text, ecl: S.ecl, dot: S.dot, dotScale: S.dotScale, eyeFrame: S.eyeFrame, eyeBall: S.eyeBall, fg: S.fg,
    eyeFrameColor: S.eyeCustom ? solid(S.eyeFrameColor) : null, eyeBallColor: S.eyeCustom ? solid(S.eyeBallColor) : null,
    bg, bgImage, bgImageFade: S.bgFade, bgImageFadeColor: S.bgFadeColor,
    logo: S.logo, logoSize: S.logoSize, logoBg: S.logoBg, logoBgColor, logoFit: S.logoFit, margin: S.margin,
    frame: { on: S.frameOn, text: S.frameText || 'SCAN ME', color: S.frameColor, textColor: S.frameTextColor, style: S.frameStyle },
  };
}

let current = null; // { svg, text, modules, ecl }
let renderT, checkSeq = 0;
function scheduleRender(now) { clearTimeout(renderT); $('#qr').classList.add('busy'); renderT = setTimeout(render, now ? 0 : 90); }
function render() {
  const qr = $('#qr'); qr.classList.remove('busy');
  const text = payload();
  const check = $('#check');
  if (!text) {
    current = null; qr.innerHTML = `<div class="empty">${type === 'link' ? 'Paste a link to get started' : 'Fill in the details to make your code'}</div>`;
    setCheck('', 'Your code appears here'); setExport(false); return;
  }
  try {
    const r = buildSVG(renderOpts(text));
    current = { ...r, text };
    qr.innerHTML = r.svg;
    setExport(true);
    runCheck(++checkSeq);
  } catch (e) {
    current = null;
    qr.innerHTML = `<div class="empty">That's too much for one QR code.<br>Shorten it a little.</div>`;
    setCheck('bad', 'Too long to fit'); setExport(false);
  }
  void check;
}
function setCheck(cls, msg) { const c = $('#check'); c.className = 'check ' + cls; $('#checkText').textContent = msg; }
function setExport(on) { for (const b of ['#saveBtn', '#svgBtn', '#copyBtn']) $(b).disabled = !on, $(b).style.opacity = on ? '' : .45; }

/* rasterise an SVG string to a canvas */
function svgToCanvas(svg, width, flatten) {
  return new Promise((res, rej) => {
    const vb = svg.match(/viewBox="([\d.\s-]+)"/)[1].split(/\s+/).map(Number);
    const w = Math.round(width), h = Math.round(width * vb[3] / vb[2]);
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const x = c.getContext('2d');
      if (flatten) { x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); }
      x.drawImage(img, 0, 0, w, h); res(c);
    };
    img.onerror = rej;
    const sized = svg.replace('<svg ', `<svg width="${w}" height="${h}" `);
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(sized);
  });
}
function decodeCanvas(c, inv = 'attemptBoth') {
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height);
  return jsQR(d.data, c.width, c.height, { inversionAttempts: inv });
}
/** Does the styled code still scan? Try a couple of sizes, like a phone at different distances. */
async function runCheck(seq) {
  setCheck('', 'Checking it scans…');
  const { svg, text, modules } = current;
  const total = (modules + 2 * S.margin) * (S.frameOn ? 1.2 : 1);
  // like a phone at different distances: it should read at most of these sizes, not just one lucky one
  const sizes = [3, 4, 5, 6, 8];
  let pass = 0, inv = 0;
  for (const ppm of sizes) {
    if (seq !== checkSeq) return;
    try {
      const c = await svgToCanvas(svg, total * ppm, true);
      const r = decodeCanvas(c, 'dontInvert');
      if (r && r.data === text) pass++;
      else { const r2 = decodeCanvas(c, 'onlyInvert'); if (r2 && r2.data === text) inv++; }
    } catch { /* try the next size */ }
    await new Promise(r => setTimeout(r, 0));
  }
  if (seq !== checkSeq) return;
  const extra = S.logo || S.bgImage ? ' — extra error correction is on' : '';
  if (pass >= 4) setCheck('ok', 'Scans perfectly' + extra);
  else if (pass >= 2) setCheck('warn', 'Scans, but not every time — ' + hintFor(true));
  else if (inv >= 2) setCheck('warn', "Light-on-dark: newer phones read it, some scanners won't");
  else setCheck('bad', 'Might not scan — ' + hintFor());
}
function hintFor() {
  if (S.bgMode === 'photo' && S.bgFade < 0.85) return 'raise the photo fade';
  if (S.logo && S.logoSize > 0.22) return 'make the picture smaller';
  if (S.dotScale < 0.8) return 'make the dots bigger';
  return 'use darker dots or a lighter background';
}

/* ═══════════════════ export ═══════════════════ */
function fileName(ext) {
  const base = (type === 'link' ? (payload().replace(/^https?:\/\//, '').split(/[/?#]/)[0]) : TYPES[type].name).replace(/[^\w.-]+/g, '-').slice(0, 40) || 'qr';
  return `pixel-${base}.${ext}`;
}
async function pngBlob() {
  const c = await svgToCanvas(current.svg, S.exportSize, false);
  return new Promise(r => c.toBlob(r, 'image/png'));
}
function download(blob, name) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
async function shareOrDownload(blob, name) {
  const file = new File([blob], name, { type: blob.type });
  if (isTouch && navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file] }); return; }
    catch (e) { if (e.name === 'AbortError') return; }
  }
  download(blob, name); toast('Saved ' + name);
}
$('#saveBtn').onclick = async () => { if (!current) return; try { await shareOrDownload(await pngBlob(), fileName('png')); } catch { toast("Couldn't save the image"); } };
$('#svgBtn').onclick = () => { if (!current) return; shareOrDownload(new Blob([current.svg], { type: 'image/svg+xml' }), fileName('svg')); };
$('#copyBtn').onclick = async () => {
  if (!current) return;
  try {
    // Safari wants the ClipboardItem created synchronously with a promise inside
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob() })]);
    toast('Image copied');
  } catch { try { await navigator.clipboard.writeText(current.text); toast('Copied the text instead'); } catch { toast("Your browser didn't allow copying"); } }
};
if (isTouch && navigator.canShare) $('#saveText').textContent = 'Save / Share';

/* ═══════════════════ UI: content ═══════════════════ */
function buildTypes() {
  $('#types').innerHTML = Object.entries(TYPES).map(([k, t]) => `<button data-t="${k}" class="${k === type ? 'on' : ''}"><svg viewBox="0 0 24 24">${ICONS[k]}</svg>${t.name}</button>`).join('');
  $('#types').onclick = e => { const b = e.target.closest('button'); if (!b) return; type = b.dataset.t; $$('#types button').forEach(x => x.classList.toggle('on', x === b)); buildFields(); scheduleRender(true); saveState(); };
}
function fieldHTML(f) {
  const d = D[type] || {};
  const v = d[f.k] ?? '';
  const common = `data-k="${f.k}" placeholder="${f.ph || ''}" ${f.auto ? `autocomplete="${f.auto}"` : 'autocomplete="off"'} autocapitalize="${f.type ? 'off' : 'sentences'}"`;
  let h = f.lab && !f.check ? `<div class="lab">${f.lab}</div>` : '';
  if (f.area) h += `<textarea ${common} rows="4">${escapeHTML(v)}</textarea>`;
  else if (f.select) h += `<select data-k="${f.k}">${f.select.map(([val, l]) => `<option value="${val}" ${(v || f.select[0][0]) === val ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
  else if (f.check) h += `<label class="row-toggle" style="margin-top:4px"><span>${f.lab}</span><span class="switch"><input type="checkbox" data-k="${f.k}" ${v ? 'checked' : ''}><i></i></span></label>`;
  else h += `<input ${common} type="${f.pw ? 'text' : f.type || 'text'}" ${f.type === 'url' ? 'inputmode="url"' : ''} value="${escapeHTML(v)}" ${f.pw ? 'spellcheck="false"' : ''}>`;
  return h;
}
function buildFields() {
  const t = TYPES[type]; D[type] = D[type] || {};
  $('#fields').innerHTML = t.fields.map(f => f.row ? `<div class="two">${f.row.map(fieldHTML).join('')}</div>` : fieldHTML(f)).join('')
    + (t.hint ? `<div class="hint">${t.hint}</div>` : '') + (type === 'text' ? '<div class="count" id="count"></div>' : '');
  updateCount();
}
$('#fields').addEventListener('input', e => {
  const el = e.target; if (!el.dataset.k) return;
  D[type] = D[type] || {}; D[type][el.dataset.k] = el.type === 'checkbox' ? el.checked : el.value;
  updateCount(); scheduleRender(); saveState();
});
function updateCount() {
  const c = $('#count'); if (!c) return;
  const n = new TextEncoder().encode(D.text?.text || '').length;
  const max = S.logo || S.bgImage ? 1273 : { L: 2953, M: 2331, Q: 1663, H: 1273 }[S.ecl];
  c.textContent = n > max * 0.6 ? `${n} / ${max}` : ''; c.classList.toggle('over', n > max);
}
const escapeHTML = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ═══════════════════ UI: style controls ═══════════════════ */
function dotIcon(st) {
  const P = [[1, 1, 0], [1, 0, 1], [0, 1, 1]];
  const on = (r, c) => r >= 0 && c >= 0 && r < 3 && c < 3 && P[r][c];
  let d = '';
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
    if (!P[r][c]) continue;
    const x = c, y = r;
    if (st === 'square') d += `M${x} ${y}h1v1h-1z`;
    else if (st === 'dots') d += `M${x + .02} ${y + .5}a.48 .48 0 1 0 .96 0a.48 .48 0 1 0 -.96 0`;
    else if (st === 'tiny') d += `M${x + .2} ${y + .2}h.6v.6h-.6z`;
    else if (st === 'diamond') d += `M${x + .5} ${y}L${x + 1} ${y + .5}L${x + .5} ${y + 1}L${x} ${y + .5}Z`;
    else if (st === 'squircle') d += `M${x + .35} ${y}h.3a.35 .35 0 0 1 .35 .35v.3a.35 .35 0 0 1 -.35 .35h-.3a.35 .35 0 0 1 -.35 -.35v-.3a.35 .35 0 0 1 .35 -.35z`;
    else if (st === 'rounded') {
      const t = on(r - 1, c), b = on(r + 1, c), l = on(r, c - 1), rt = on(r, c + 1), R = .5;
      const [tl, tr, br, bl] = [!t && !l ? R : 0, !t && !rt ? R : 0, !b && !rt ? R : 0, !b && !l ? R : 0];
      d += `M${x + tl} ${y}H${x + 1 - tr}${tr ? `A${tr} ${tr} 0 0 1 ${x + 1} ${y + tr}` : ''}V${y + 1 - br}${br ? `A${br} ${br} 0 0 1 ${x + 1 - br} ${y + 1}` : ''}H${x + bl}${bl ? `A${bl} ${bl} 0 0 1 ${x} ${y + 1 - bl}` : ''}V${y + tl}${tl ? `A${tl} ${tl} 0 0 1 ${x + tl} ${y}` : ''}Z`;
    } else {
      const v = st === 'vbars', pr = v ? on(r - 1, c) : on(r, c - 1), nx = v ? on(r + 1, c) : on(r, c + 1);
      const w = .76, g = .12, R = .38;
      if (v) d += `M${x + g} ${y + (pr ? 0 : R)}${pr ? '' : `a${R} ${R} 0 0 1 ${w} 0`}${pr ? `h${w}` : ''}V${y + 1 - (nx ? 0 : R)}${nx ? `h${-w}` : `a${R} ${R} 0 0 1 ${-w} 0`}Z`;
      else d += `M${x + (pr ? 0 : R)} ${y + g}H${x + 1 - (nx ? 0 : R)}${nx ? `v${w}` : `a${R} ${R} 0 0 1 0 ${w}`}H${x + (pr ? 0 : R)}${pr ? `v${-w}` : `a${R} ${R} 0 0 1 0 ${-w}`}Z`;
    }
  }
  return `<svg viewBox="-.2 -.2 3.4 3.4"><path d="${d}"/></svg>`;
}
const NAMES = { square: 'Square', rounded: 'Rounded', dots: 'Dots', diamond: 'Diamond', squircle: 'Soft square', vbars: 'Vertical bars', hbars: 'Horizontal bars', tiny: 'Small squares', circle: 'Circle', leaf: 'Leaf', cushion: 'Cushion' };
function shapePicker(el, list, key, icon) {
  el.innerHTML = list.map(v => `<button data-v="${v}" title="${NAMES[v]}" aria-label="${NAMES[v]}">${icon(v)}</button>`).join('');
  el.onclick = e => { const b = e.target.closest('button'); if (!b) return; S[key] = b.dataset.v; S.preset = null; syncUI(); scheduleRender(true); saveState(); };
}

function segBind(id, key, after) {
  const el = $('#' + id);
  el.onclick = e => { const b = e.target.closest('button'); if (!b) return; S[key] = isNaN(+b.dataset.v) ? b.dataset.v : +b.dataset.v; after?.(); syncUI(); scheduleRender(true); saveState(); };
}
function placeInd(seg) {
  const ind = seg.querySelector('.ind, .tab-ind'), on = seg.querySelector('button.on');
  if (!ind || !on || !on.offsetWidth) return;
  ind.style.width = on.offsetWidth + 'px'; ind.style.transform = `translateX(${on.offsetLeft - (ind.classList.contains('tab-ind') ? 3 : 0)}px)`;
}
function setSeg(seg, v) { $$('button', seg).forEach(b => b.classList.toggle('on', String(b.dataset.v) === String(v))); placeInd(seg); }

function swatchHTML(colors, cur) {
  const has = colors.includes(cur?.toLowerCase());
  return colors.map(c => `<button class="sw ${c === cur?.toLowerCase() ? 'on' : ''}" data-c="${c}" style="background:${c}" aria-label="${c}"></button>`).join('')
    + `<label class="sw custom ${has ? '' : 'on'}" style="--c:${cur}" title="Any color"><input type="color" value="${cur}"></label>`;
}
function bindSwatches(el, get, set, palette) {
  const draw = () => { el.innerHTML = swatchHTML(palette, get()); };
  el.onclick = e => { const b = e.target.closest('.sw[data-c]'); if (!b) return; set(b.dataset.c); draw(); after(); };
  el.oninput = e => { if (e.target.type === 'color') { set(e.target.value); const l = e.target.closest('.sw'); l.classList.add('on'); l.style.setProperty('--c', e.target.value); $$('.sw[data-c]', el).forEach(x => x.classList.remove('on')); after(true); } };
  el.onchange = e => { if (e.target.type === 'color') draw(); };
  const after = (soft) => { S.preset = null; markPreset(); scheduleRender(!soft); saveState(); };
  draw(); el._draw = draw;
}

const SWATCH_KEYS = {
  eyeFrameColor: DARKS, eyeBallColor: [...DARKS.slice(0, 2), '#f5a300', ...DARKS.slice(2)], bgColor: LIGHTS, bgFadeColor: LIGHTS,
  frameColor: DARKS, frameTextColor: LIGHTS,
};
function bindAllSwatches() {
  $$('[data-color]').forEach(el => { const k = el.dataset.color; bindSwatches(el, () => S[k], v => { S[k] = v; }, SWATCH_KEYS[k]); });
}

/* paint = solid / linear / radial with two colors */
function paintUI(el) {
  const key = el.dataset.paint, noSolid = !!el.dataset.nosolid;
  const P = () => S[key];
  const draw = () => {
    const p = P();
    const isLight = key === 'bgGrad';
    el.innerHTML = `<div class="seg"><i class="ind"></i>${noSolid ? '' : '<button data-v="solid">Solid</button>'}<button data-v="linear">Gradient</button><button data-v="radial">Radial</button></div>`
      + (p.type === 'solid' ? `<div class="swatches sol"></div>` : `
        <div class="grads">${(isLight ? LGRADS : GRADS).map(([a, b]) => `<button class="sw ${p.c1 === a && p.c2 === b ? 'on' : ''}" data-a="${a}" data-b="${b}" style="--g:linear-gradient(135deg,${a},${b})"></button>`).join('')}</div>
        <div class="gcols"><label class="gcol"><i style="--c:${p.c1}"></i>${p.type === 'radial' ? 'Center' : 'Start'}<input type="color" data-ci="c1" value="${p.c1}"></label><label class="gcol"><i style="--c:${p.c2}"></i>${p.type === 'radial' ? 'Edge' : 'End'}<input type="color" data-ci="c2" value="${p.c2 || '#000000'}"></label></div>
        ${p.type === 'linear' ? `<div class="ctl"><label>Angle</label><input type="range" class="ang" min="0" max="360" step="5" value="${p.angle ?? 45}"></div>` : ''}`);
    setSeg($('.seg', el), p.type);
    if (p.type === 'solid') bindSwatches($('.sol', el), () => P().c1, v => { P().c1 = v; }, DARKS);
    $$('input[type=range]', el).forEach(fillRange);
  };
  el.onclick = e => {
    const sb = e.target.closest('.seg button');
    if (sb) { const p = P(); p.type = sb.dataset.v; if (p.type !== 'solid' && !p.c2) p.c2 = key === 'bgGrad' ? '#ffe4ec' : '#f5a300'; S.preset = null; markPreset(); draw(); scheduleRender(true); saveState(); return; }
    const g = e.target.closest('.grads .sw');
    if (g) { Object.assign(P(), { c1: g.dataset.a, c2: g.dataset.b }); S.preset = null; markPreset(); draw(); scheduleRender(true); saveState(); }
  };
  el.oninput = e => {
    const t = e.target;
    if (t.dataset.ci) { P()[t.dataset.ci] = t.value; t.previousElementSibling.style.setProperty('--c', t.value); }
    else if (t.classList.contains('ang')) { P().angle = +t.value; fillRange(t); }
    else return;
    S.preset = null; markPreset(); scheduleRender(); saveState();
  };
  el.onchange = e => { if (e.target.dataset.ci) draw(); };
  el._draw = draw; draw();
}

function fillRange(r) { const p = (r.value - r.min) / (r.max - r.min) * 100; r.style.setProperty('--p', p + '%'); }
function rangeBind(id, key, fmt) {
  const r = $('#' + id);
  r.oninput = () => { S[key] = +r.value; fillRange(r); if (key !== 'margin' && key !== 'bgFade') S.preset = null; scheduleRender(); saveState(); };
  void fmt;
}

/* presets */
function buildPresets() {
  const el = $('#presets');
  el.innerHTML = PRESETS.map(p => {
    const s = { ...DEFAULT_STYLE, ...p.s, logo: null, bgImage: null, margin: 1 };
    const o = (() => { const keep = Object.assign({}, S); Object.assign(S, s); const r = renderOpts('PIXEL'); Object.assign(S, keep); return r; })();
    o.ecl = 'L'; o.idPrefix = 'pp' + p.id;
    return `<button data-p="${p.id}" aria-label="${p.id} style">${buildSVG(o).svg}</button>`;
  }).join('');
  el.onclick = e => {
    const b = e.target.closest('button'); if (!b) return;
    const p = PRESETS.find(x => x.id === b.dataset.p);
    const keep = { logo: S.logo, bgImage: S.bgImage, margin: S.margin, ecl: S.ecl, exportSize: S.exportSize, frameText: S.frameText, logoSize: S.logoSize, logoBg: S.logoBg, logoFit: S.logoFit, bgFade: S.bgFade, bgFadeColor: S.bgFadeColor };
    Object.assign(S, structuredClone(DEFAULT_STYLE), structuredClone(p.s), keep, { preset: p.id, eyeCustom: false });
    if (keep.bgImage && S.bgMode !== 'gradient' && p.s.bgMode === 'color' && S.bgMode === 'photo') S.bgMode = 'photo';
    syncUI(true); scheduleRender(true); saveState();
  };
}
function markPreset() { $$('#presets button').forEach(b => b.classList.toggle('on', b.dataset.p === S.preset)); }

/* pictures */
function readImage(file, max, mime, q) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(img.naturalWidth * k)); c.height = Math.max(1, Math.round(img.naturalHeight * k));
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
      res({ url: c.toDataURL(mime, q), canvas: c });
    };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('bad image')); };
    img.src = url;
  });
}
function hasAlpha(c) {
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  for (let i = 3; i < d.length; i += 16) if (d[i] < 250) return true; return false;
}
$('#logoPick').onclick = () => $('#fileLogo').click();
$('#bgPick').onclick = () => $('#fileBg').click();
$('#fileLogo').onchange = async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  try {
    const { canvas } = await readImage(f, 600, 'image/png');
    S.logo = hasAlpha(canvas) ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', 0.9);
    syncUI(); scheduleRender(true); saveState(); updateCount();
  } catch { toast("Couldn't open that picture"); }
};
$('#logoRemove').onclick = () => { S.logo = null; syncUI(); scheduleRender(true); saveState(); updateCount(); };
$('#fileBg').onchange = async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  try { S.bgImage = (await readImage(f, 1400, 'image/jpeg', 0.86)).url; S.bgMode = 'photo'; syncUI(); scheduleRender(true); saveState(); updateCount(); }
  catch { toast("Couldn't open that photo"); }
};

/* push state → controls */
function syncUI(redrawPaint) {
  if (document.querySelector('#eyeFrames button')) refreshEyeIcons();
  $$('#dotShapes button').forEach(b => b.classList.toggle('on', b.dataset.v === S.dot));
  $$('#eyeFrames button').forEach(b => b.classList.toggle('on', b.dataset.v === S.eyeFrame));
  $$('#eyeBalls button').forEach(b => b.classList.toggle('on', b.dataset.v === S.eyeBall));
  for (const [id, k] of [['dotScale', 'dotScale'], ['bgFade', 'bgFade'], ['margin', 'margin'], ['logoSize', 'logoSize']]) { const r = $('#' + id); r.value = S[k]; fillRange(r); }
  setSeg($('#bgMode'), S.bgMode); setSeg($('#logoBg'), S.logoBg); setSeg($('#logoFit'), S.logoFit);
  setSeg($('#frameStyle'), S.frameStyle); setSeg($('#ecl'), S.logo || S.bgImage && S.bgMode === 'photo' ? 'H' : S.ecl); setSeg($('#exportSize'), S.exportSize);
  $$('.bg-pane').forEach(p => p.classList.toggle('hidden', p.dataset.bg !== S.bgMode));
  $('#eyeCustom').checked = S.eyeCustom; $('#eyeColors').classList.toggle('hidden', !S.eyeCustom);
  $('#frameOn').checked = S.frameOn; $('#frameOpts').classList.toggle('hidden', !S.frameOn);
  $('#frameText').value = S.frameText;
  const lt = $('#logoThumb'); lt.classList.toggle('has', !!S.logo); lt.style.backgroundImage = S.logo ? `url("${S.logo}")` : '';
  $('#logoOpts').classList.toggle('hidden', !S.logo); $('#logoRemove').classList.toggle('hidden', !S.logo);
  $('#logoPick').lastChild.textContent = S.logo ? 'Change picture' : 'Add picture';
  const bt = $('#bgThumb'); bt.classList.toggle('has', !!S.bgImage); bt.style.backgroundImage = S.bgImage ? `url("${S.bgImage}")` : '';
  $('#bgPick').lastChild.textContent = S.bgImage ? 'Change photo' : 'Choose photo';
  $('#ecl').title = S.logo || S.bgImage ? 'Set to Max automatically because you added a picture' : '';
  $$('#ecl button').forEach(b => { b.disabled = !!(S.logo || (S.bgImage && S.bgMode === 'photo')); b.style.opacity = b.disabled && !b.classList.contains('on') ? .4 : ''; });
  $$('[data-color]').forEach(el => el._draw?.());
  if (redrawPaint !== false) $$('[data-paint]').forEach(el => el._draw?.());
  markPreset();
}

function initStyleUI() {
  shapePicker($('#dotShapes'), DOT_STYLES, 'dot', dotIcon);
  shapePicker($('#eyeFrames'), EYE_FRAMES, 'eyeFrame', frameIcon);
  shapePicker($('#eyeBalls'), EYE_BALLS, 'eyeBall', ballIcon);
  rangeBind('dotScale', 'dotScale'); rangeBind('bgFade', 'bgFade'); rangeBind('margin', 'margin'); rangeBind('logoSize', 'logoSize');
  segBind('bgMode', 'bgMode', () => { if (S.bgMode === 'photo' && !S.bgImage) setTimeout(() => $('#fileBg').click(), 0); S.preset = null; });
  segBind('logoBg', 'logoBg'); segBind('logoFit', 'logoFit'); segBind('frameStyle', 'frameStyle'); segBind('exportSize', 'exportSize');
  segBind('ecl', 'ecl', updateCount);
  $('#eyeCustom').onchange = e => { S.eyeCustom = e.target.checked; S.preset = null; syncUI(false); scheduleRender(true); saveState(); };
  $('#frameOn').onchange = e => { S.frameOn = e.target.checked; S.preset = null; syncUI(false); scheduleRender(true); saveState(); };
  $('#frameText').oninput = e => { S.frameText = e.target.value; scheduleRender(); saveState(); };
  $('#resetStyle').onclick = () => { Object.assign(S, structuredClone(DEFAULT_STYLE)); syncUI(); scheduleRender(true); saveState(); updateCount(); toast('Style reset'); };
  $$('[data-paint]').forEach(paintUI);
  bindAllSwatches();
  buildPresets();
  // segmented indicators need a layout pass when an accordion opens
  $$('details.acc').forEach(d => d.addEventListener('toggle', () => { $$('.seg', d).forEach(placeInd); }));
  addEventListener('resize', () => $$('.seg, .tabs').forEach(placeInd));
}
// corner icons show the other half faded, so they follow each other's choice
const frameIcon = v => eyePreview(v, S.eyeBall).replace(/"\/><\/svg>$/, '" opacity=".22"/></svg>');
const ballIcon = v => eyePreview(S.eyeFrame, v).replace('fill-rule="evenodd"', 'fill-rule="evenodd" opacity=".22"');
function refreshEyeIcons() {
  $$('#eyeFrames button').forEach(b => { b.innerHTML = frameIcon(b.dataset.v); });
  $$('#eyeBalls button').forEach(b => { b.innerHTML = ballIcon(b.dataset.v); });
}

/* ═══════════════════ tabs ═══════════════════ */
function showTab(t) {
  $$('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === t));
  placeInd($('#tabs'));
  $('#view-make').classList.toggle('hidden', t !== 'make');
  $('#view-scan').classList.toggle('hidden', t !== 'scan');
  if (t !== 'scan') stopCam();
  if (t === 'make') requestAnimationFrame(() => $$('.seg').forEach(placeInd));
  store.set('tab', t);
}
$('#tabs').onclick = e => { const b = e.target.closest('button'); if (b) showTab(b.dataset.tab); };

/* ═══════════════════ scanner ═══════════════════ */
let stream = null, scanning = false, lastTick = 0;
const video = $('#video'), work = $('#work');
async function startCam() {
  const idle = $('#camIdle');
  $('.err', idle)?.remove();
  if (!navigator.mediaDevices?.getUserMedia) return camError(location.protocol === 'http:' && location.hostname !== 'localhost' ? 'The camera needs a secure (https) page.' : "This browser can't use the camera. Try scanning a photo instead.");
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 1280 } }, audio: false });
  } catch (e) {
    return camError(e.name === 'NotAllowedError' ? (isIOS ? 'Camera blocked. Allow it in Settings → Safari → Camera (or tap "aA" → Website Settings).' : 'Camera blocked. Allow camera access for this site and try again.') : 'No camera found. Try scanning a photo instead.');
  }
  video.srcObject = stream;
  try { await video.play(); } catch {}
  idle.classList.add('hidden'); $('#finder').classList.remove('hidden'); $('#camStop').classList.remove('hidden');
  scanning = true; requestAnimationFrame(tick);
}
function camError(msg) { const p = document.createElement('p'); p.className = 'err'; p.textContent = msg; $('#camIdle').appendChild(p); }
function stopCam() {
  scanning = false;
  if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
  video.srcObject = null;
  $('#camIdle').classList.remove('hidden'); $('#finder').classList.add('hidden'); $('#camStop').classList.add('hidden');
}
function tick(ts) {
  if (!scanning) return;
  if (ts - lastTick > 110 && video.readyState >= 2 && video.videoWidth) {
    lastTick = ts;
    const vw = video.videoWidth, vh = video.videoHeight, side = Math.min(vw, vh);
    const target = Math.min(720, side);
    work.width = target; work.height = target;
    const x = work.getContext('2d', { willReadFrequently: true });
    x.drawImage(video, (vw - side) / 2, (vh - side) / 2, side, side, 0, 0, target, target);
    const r = decodeCanvas(work);
    if (r && r.data) { found(r.data); return; }
  }
  requestAnimationFrame(tick);
}
function found(text) {
  const f = $('#flash'); f.classList.remove('go'); void f.offsetWidth; f.classList.add('go');
  navigator.vibrate?.(40);
  stopCam(); $('#camStart').textContent = 'Scan again';
  showResult(text);
}
$('#camStart').onclick = startCam;
$('#camStop').onclick = stopCam;
$('#photoScan').onclick = () => $('#fileScan').click();
$('#fileScan').onchange = async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  try {
    for (const max of [1600, 1100, 800, 600, 450, 340, 2400]) {
      const { canvas } = await readImage(f, max, 'image/png');
      const r = decodeCanvas(canvas);
      if (r && r.data) { showResult(r.data); return; }
    }
    toast('No QR code found in that picture');
  } catch { toast("Couldn't open that picture"); }
};

function parseKV(s, prefix) {
  const out = {}; const body = s.slice(prefix.length);
  const re = /([A-Z]+):((?:\\.|[^;\\])*);/gi; let m;
  while ((m = re.exec(body))) out[m[1].toUpperCase()] = m[2].replace(/\\(.)/g, '$1');
  return out;
}
function vcardField(s, name) {
  const m = s.match(new RegExp('^' + name + '(?:;[^:\\n]*)?:(.*)$', 'im')); return m ? m[1].replace(/\\([,;\\])/g, '$1').replace(/\\n/gi, ' ').trim() : '';
}
function showResult(text) {
  const kindEl = $('#resKind'), body = $('#resBody'), acts = $('#resActions');
  const A = [];
  const btn = (label, fn, main) => A.push({ label, fn, main });
  const copy = (t, what = 'Copied') => async () => { try { await navigator.clipboard.writeText(t); toast(what); } catch { toast("Couldn't copy"); } };
  const go = url => () => { location.href = url; };
  let kind = 'Text', html = '';
  const t = text.trim();
  if (/^https?:\/\//i.test(t)) {
    kind = 'Link'; let host = '';
    try { const u = new URL(t); host = u.hostname; } catch {}
    html = `<div class="url">${escapeHTML(t)}</div>${host ? `<div class="domain">Goes to <b>${escapeHTML(host)}</b></div>` : ''}`
      + (/^http:/i.test(t) ? '<div class="warnline">Not a secure (https) link</div>' : '') + (/xn--/i.test(host) ? '<div class="warnline">This address uses look-alike characters — be careful</div>' : '');
    btn('Open link', () => window.open(t, '_blank', 'noopener'), true); btn('Copy', copy(t, 'Link copied'));
    if (navigator.share) btn('Share', () => navigator.share({ url: t }).catch(() => {}));
  } else if (/^WIFI:/i.test(t)) {
    kind = 'Wi-Fi'; const w = parseKV(t, 'WIFI:');
    html = `<div class="kv"><span>Network</span><b>${escapeHTML(w.S || '')}</b><span>Password</span><b>${w.P ? escapeHTML(w.P) : '<i>none</i>'}</b><span>Security</span><b>${escapeHTML(w.T && w.T !== 'nopass' ? w.T : 'Open')}</b></div>`
      + (isIOS ? '<div class="domain">Copy the password, then join in Settings → Wi-Fi.</div>' : '');
    if (w.P) btn('Copy password', copy(w.P, 'Password copied'), true); btn('Copy network name', copy(w.S || '', 'Network name copied'));
  } else if (/^BEGIN:VCARD/i.test(t)) {
    kind = 'Contact';
    const fn = vcardField(t, 'FN') || vcardField(t, 'N').split(';').reverse().join(' ').trim(), tel = vcardField(t, 'TEL'), mail = vcardField(t, 'EMAIL'), org = vcardField(t, 'ORG').replace(/;/g, ' '), url = vcardField(t, 'URL');
    html = `<div class="kv">${[['Name', fn], ['Phone', tel], ['Email', mail], ['Company', org], ['Website', url]].filter(x => x[1]).map(([k, v]) => `<span>${k}</span><b>${escapeHTML(v)}</b>`).join('')}</div>`;
    btn('Save contact', () => { const b = new Blob([t.replace(/\r?\n/g, '\r\n')], { type: 'text/vcard' }); isIOS ? (location.href = URL.createObjectURL(b)) : download(b, (fn || 'contact').replace(/[^\w-]+/g, '-') + '.vcf'); }, true);
    if (tel) btn('Call', go('tel:' + tel)); if (mail) btn('Email', go('mailto:' + mail));
  } else if (/^mailto:/i.test(t) || /^MATMSG:/i.test(t)) {
    kind = 'Email'; let to = '', sub = '', b = '';
    if (/^MATMSG:/i.test(t)) { const m = parseKV(t, 'MATMSG:'); to = m.TO || ''; sub = m.SUB || ''; b = m.BODY || ''; }
    else { const [a, q = ''] = t.slice(7).split('?'); to = decodeURIComponent(a); const p = new URLSearchParams(q); sub = p.get('subject') || ''; b = p.get('body') || ''; }
    html = `<div class="kv"><span>To</span><b>${escapeHTML(to)}</b>${sub ? `<span>Subject</span><b>${escapeHTML(sub)}</b>` : ''}${b ? `<span>Message</span><b>${escapeHTML(b)}</b>` : ''}</div>`;
    btn('Write email', go(`mailto:${to}?subject=${encodeURIComponent(sub)}&body=${encodeURIComponent(b)}`), true); btn('Copy address', copy(to, 'Address copied'));
  } else if (/^tel:/i.test(t)) {
    kind = 'Phone'; const n = t.slice(4);
    html = `<div class="url">${escapeHTML(n)}</div>`; btn('Call', go(t), true); btn('Copy number', copy(n, 'Number copied'));
  } else if (/^(SMSTO|sms):/i.test(t)) {
    kind = 'Message'; let n, msg = '';
    if (/^SMSTO:/i.test(t)) { const rest = t.slice(6); const i = rest.indexOf(':'); n = i < 0 ? rest : rest.slice(0, i); msg = i < 0 ? '' : rest.slice(i + 1); }
    else { const [a, q = ''] = t.slice(4).split('?'); n = a; msg = new URLSearchParams(q).get('body') || ''; }
    html = `<div class="kv"><span>To</span><b>${escapeHTML(n)}</b>${msg ? `<span>Message</span><b>${escapeHTML(msg)}</b>` : ''}</div>`;
    btn('Send message', go(`sms:${n}${isIOS ? '&' : '?'}body=${encodeURIComponent(msg)}`), true); btn('Copy number', copy(n, 'Number copied'));
  } else if (/^geo:/i.test(t)) {
    kind = 'Location'; const [lat, lng] = t.slice(4).split(/[,?;]/);
    html = `<div class="url">${escapeHTML(lat)}, ${escapeHTML(lng)}</div>`;
    btn('Open in Maps', () => window.open(isIOS ? `https://maps.apple.com/?ll=${lat},${lng}&q=${lat},${lng}` : `https://www.google.com/maps?q=${lat},${lng}`, '_blank', 'noopener'), true);
  } else if (/^BEGIN:VEVENT|BEGIN:VCALENDAR/i.test(t)) {
    kind = 'Event'; const sum = vcardField(t, 'SUMMARY'), loc = vcardField(t, 'LOCATION');
    html = `<div class="kv">${sum ? `<span>Event</span><b>${escapeHTML(sum)}</b>` : ''}${loc ? `<span>Where</span><b>${escapeHTML(loc)}</b>` : ''}</div>`;
    btn('Add to calendar', () => { const b = new Blob([/BEGIN:VCALENDAR/i.test(t) ? t : `BEGIN:VCALENDAR\r\nVERSION:2.0\r\n${t}\r\nEND:VCALENDAR`], { type: 'text/calendar' }); isIOS ? (location.href = URL.createObjectURL(b)) : download(b, 'event.ics'); }, true);
    btn('Copy', copy(t));
  } else if (/^[a-z][a-z0-9+.-]*:\/\//i.test(t)) {
    kind = 'App link'; html = `<div class="url">${escapeHTML(t)}</div>`; btn('Open', go(t), true); btn('Copy', copy(t));
  } else {
    html = `<div class="raw">${escapeHTML(text)}</div>`;
    btn('Copy text', copy(text, 'Text copied'), true);
    if (navigator.share) btn('Share', () => navigator.share({ text }).catch(() => {}));
    if (/^[\w.-]+\.[a-z]{2,}(\/\S*)?$/i.test(t)) btn('Open as link', () => window.open('https://' + t, '_blank', 'noopener'));
    else if (t.length < 200) btn('Search the web', () => window.open('https://duckduckgo.com/?q=' + encodeURIComponent(t), '_blank', 'noopener'));
  }
  kindEl.textContent = kind; body.innerHTML = html;
  acts.innerHTML = A.map((a, i) => `<button class="btn ${a.main ? 'main' : ''}" data-i="${i}">${a.label}</button>`).join('');
  acts.onclick = e => { const b = e.target.closest('button'); if (b) A[+b.dataset.i].fn(); };
  const r = $('#result'); r.classList.remove('hidden'); r.style.animation = 'none'; void r.offsetWidth; r.style.animation = '';
  r.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
$('#resClose').onclick = () => $('#result').classList.add('hidden');

/* ═══════════════════ install help ═══════════════════ */
let deferredPrompt = null;
function initInstall() {
  const dismissed = store.get('instDismissed', 0) > Date.now() - 1000 * 60 * 60 * 24 * 14;
  const bar = $('#install');
  if (!standalone && !dismissed && isIOS) {
    const safari = !/CriOS|FxiOS|EdgiOS|OPiOS/.test(navigator.userAgent);
    if (!safari) $('#instHow').innerHTML = 'Tap the share button <svg class="share" viewBox="0 0 24 24"><path d="M12 3v12M8 7l4-4 4 4"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/></svg> then <b>Add to Home Screen</b> (works best in Safari)';
    bar.classList.remove('hidden');
  }
  addEventListener('beforeinstallprompt', e => {
    e.preventDefault(); deferredPrompt = e;
    if (standalone || dismissed) return;
    $('#instHow').textContent = 'Opens like an app and works offline.';
    $('#instBtn').classList.remove('hidden'); bar.classList.remove('hidden');
  });
  $('#instBtn').onclick = async () => { if (!deferredPrompt) return; deferredPrompt.prompt(); await deferredPrompt.userChoice.catch(() => {}); deferredPrompt = null; bar.classList.add('hidden'); };
  $('#instX').onclick = () => { bar.classList.add('hidden'); store.set('instDismissed', Date.now()); };
  addEventListener('appinstalled', () => bar.classList.add('hidden'));
  // on a computer: a QR of this page so it's one scan to get Pixel onto the phone
  if (!isTouch && /^https?:/.test(location.protocol)) {
    const url = location.origin + location.pathname;
    $('#dpQr').innerHTML = buildSVG({ text: url, ecl: 'M', dot: 'rounded', eyeFrame: 'rounded', eyeBall: 'rounded', fg: { type: 'solid', c1: '#111111' }, bg: { type: 'solid', c1: '#ffffff' }, margin: 1, idPrefix: 'dp' }).svg;
    $('#deskPhone').classList.remove('hidden');
  }
}

/* ═══════════════════ boot ═══════════════════ */
buildTypes(); buildFields(); initStyleUI(); syncUI();
initInstall();
showTab(new URLSearchParams(location.search).get('tab') === 'scan' || store.get('tab', 'make') === 'scan' ? 'scan' : 'make');
render();
requestAnimationFrame(() => $$('.seg, .tabs').forEach(placeInd));
document.fonts?.ready.then(() => $$('.seg, .tabs').forEach(placeInd));
// shared to Pixel / opened with ?text=… → prefill
const qp = new URLSearchParams(location.search);
if (qp.get('text') || qp.get('url')) { type = 'link'; const v = qp.get('url') || qp.get('text'); if (/^\S+\.\S+$/.test(v)) { D.link = { url: v }; } else { type = 'text'; D.text = { text: v }; } buildTypes(); buildFields(); render(); }

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
