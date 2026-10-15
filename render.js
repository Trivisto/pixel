// Pixel renderer: turns QR modules into a styled SVG.
/* global qrcode */

export const DOT_STYLES = ['square', 'rounded', 'dots', 'diamond', 'squircle', 'vbars', 'hbars', 'tiny'];
export const EYE_FRAMES = ['square', 'rounded', 'circle', 'leaf', 'cushion'];
export const EYE_BALLS = ['square', 'rounded', 'circle', 'diamond', 'leaf'];

export function encode(text, ecl) {
  qrcode.stringToBytes = qrcode.stringToBytesFuncs['UTF-8'];
  const q = qrcode(0, ecl);
  q.addData(text || ' ', 'Byte');
  q.make();
  const n = q.getModuleCount();
  const m = [];
  for (let r = 0; r < n; r++) { const row = []; for (let c = 0; c < n; c++) row.push(q.isDark(r, c)); m.push(row); }
  return { n, m };
}

const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const f = (v) => +v.toFixed(3);

function paint(id, p) {
  // p: { type: 'solid'|'linear'|'radial', c1, c2, angle }
  if (p.type === 'solid') return { def: '', fill: p.c1 };
  if (p.type === 'radial') return { def: `<radialGradient id="${id}" cx="50%" cy="50%" r="70%"><stop offset="0" stop-color="${p.c1}"/><stop offset="1" stop-color="${p.c2}"/></radialGradient>`, fill: `url(#${id})` };
  const a = ((p.angle ?? 45) - 90) * Math.PI / 180;
  const x1 = 50 - Math.cos(a) * 50, y1 = 50 - Math.sin(a) * 50, x2 = 50 + Math.cos(a) * 50, y2 = 50 + Math.sin(a) * 50;
  return { def: `<linearGradient id="${id}" x1="${f(x1)}%" y1="${f(y1)}%" x2="${f(x2)}%" y2="${f(y2)}%"><stop offset="0" stop-color="${p.c1}"/><stop offset="1" stop-color="${p.c2}"/></linearGradient>`, fill: `url(#${id})` };
}

function roundedRectPath(x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  return `M${f(x + r)} ${f(y)}h${f(w - 2 * r)}a${f(r)} ${f(r)} 0 0 1 ${f(r)} ${f(r)}v${f(h - 2 * r)}a${f(r)} ${f(r)} 0 0 1 ${f(-r)} ${f(r)}h${f(-(w - 2 * r))}a${f(r)} ${f(r)} 0 0 1 ${f(-r)} ${f(-r)}v${f(-(h - 2 * r))}a${f(r)} ${f(r)} 0 0 1 ${f(r)} ${f(-r)}z`;
}
// rectangle with individually rounded corners [tl, tr, br, bl]
function cornerRect(x, y, w, h, [tl, tr, br, bl]) {
  return `M${f(x + tl)} ${f(y)}H${f(x + w - tr)}${tr ? `A${f(tr)} ${f(tr)} 0 0 1 ${f(x + w)} ${f(y + tr)}` : ''}V${f(y + h - br)}${br ? `A${f(br)} ${f(br)} 0 0 1 ${f(x + w - br)} ${f(y + h)}` : ''}H${f(x + bl)}${bl ? `A${f(bl)} ${f(bl)} 0 0 1 ${f(x)} ${f(y + h - bl)}` : ''}V${f(y + tl)}${tl ? `A${f(tl)} ${f(tl)} 0 0 1 ${f(x + tl)} ${f(y)}` : ''}Z`;
}
function shapePath(kind, x, y, s) {
  // a shape filling the box (x,y,s,s)
  switch (kind) {
    case 'circle': return `M${f(x + s / 2)} ${f(y)}a${f(s / 2)} ${f(s / 2)} 0 1 1 0 ${f(s)}a${f(s / 2)} ${f(s / 2)} 0 1 1 0 ${f(-s)}z`;
    case 'rounded': return roundedRectPath(x, y, s, s, s * 0.28);
    case 'cushion': return roundedRectPath(x, y, s, s, s * 0.42);
    case 'leaf': return cornerRect(x, y, s, s, [s * 0.45, 0, s * 0.45, 0]);
    case 'diamond': { const k = s * 0.22; return `M${f(x + s / 2)} ${f(y - k)}L${f(x + s + k)} ${f(y + s / 2)}L${f(x + s / 2)} ${f(y + s + k)}L${f(x - k)} ${f(y + s / 2)}Z`; }
    default: return `M${f(x)} ${f(y)}h${f(s)}v${f(s)}h${f(-s)}z`;
  }
}
// ring = outer shape minus inner shape (even-odd)
function eyeFrame(kind, x, y) {
  const outer = shapePath(kind, x, y, 7);
  const innerKind = kind === 'leaf' ? 'leaf' : kind === 'circle' ? 'circle' : kind === 'cushion' ? 'cushion' : kind === 'rounded' ? 'rounded' : 'square';
  const inner = shapePath(innerKind, x + 1, y + 1, 5);
  return outer + inner;
}

/** Small icon for the corner pickers: one finder pattern on a 7×7 grid. */
export function eyePreview(frame, ball) {
  return `<svg viewBox="-0.8 -0.8 8.6 8.6"><path d="${eyeFrame(frame || 'square', 0, 0)}" fill-rule="evenodd"/><path d="${shapePath(ball || 'square', 2, 2, 3)}"/></svg>`;
}

/**
 * Build the SVG.
 * o = { text, ecl, dot, dotScale, eyeFrame, eyeBall, fg(paint), eyeFrameColor, eyeBallColor, bg(paint|transparent), bgImage(dataURL), bgImageFade,
 *       logo(dataURL), logoSize, logoBg('none'|'square'|'rounded'|'circle'), logoPad, margin, frame: {on, text, color, textColor, style} }
 */
export function buildSVG(o) {
  const ecl = o.logo || o.bgImage ? 'H' : (o.ecl || 'M');
  const { n, m } = encode(o.text, ecl);
  const M = o.margin ?? 3;
  const size = n + 2 * M;
  // which modules belong to the three finder patterns
  const inEye = (r, c) => (r < 7 && c < 7) || (r < 7 && c >= n - 7) || (r >= n - 7 && c < 7);
  // logo "hole"
  let hole = null;
  if (o.logo) {
    const k = Math.max(3, Math.round(n * Math.min(0.27, o.logoSize ?? 0.22)));
    const k2 = k + (k % 2 === n % 2 ? 0 : 1);
    const s = Math.floor((n - k2) / 2);
    hole = { s, e: s + k2 };
  }
  const inHole = (r, c) => hole && r >= hole.s - (o.logoPad ? 0 : 0) && r < hole.e && c >= hole.s && c < hole.e;
  const dark = (r, c) => r >= 0 && c >= 0 && r < n && c < n && m[r][c] && !inEye(r, c) && !inHole(r, c);

  const defs = [];
  const fg = paint('pgFg', o.fg);
  if (fg.def) defs.push(fg.def);
  const ef = o.eyeFrameColor ? paint('pgEf', o.eyeFrameColor) : fg; if (o.eyeFrameColor && ef.def) defs.push(ef.def);
  const eb = o.eyeBallColor ? paint('pgEb', o.eyeBallColor) : fg; if (o.eyeBallColor && eb.def) defs.push(eb.def);

  // ── dots ──
  const sc = Math.min(1, Math.max(0.5, o.dotScale ?? 1));
  let d = '';
  const st = o.dot || 'square';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    if (!dark(r, c)) continue;
    const x = c + M, y = r + M;
    if (st === 'square') { const g = (1 - sc) / 2; d += `M${f(x + g)} ${f(y + g)}h${f(sc)}v${f(sc)}h${f(-sc)}z`; }
    else if (st === 'dots') { const rr = 0.5 * sc * 1.04; d += `M${f(x + 0.5 - rr)} ${f(y + 0.5)}a${f(rr)} ${f(rr)} 0 1 0 ${f(2 * rr)} 0a${f(rr)} ${f(rr)} 0 1 0 ${f(-2 * rr)} 0`; }
    else if (st === 'tiny') { const s2 = 0.84 * sc; const g = (1 - s2) / 2; d += roundedRectPath(x + g, y + g, s2, s2, s2 * 0.2); }
    else if (st === 'diamond') { const h = 0.5 * sc * 1.5; d += `M${f(x + 0.5)} ${f(y + 0.5 - h)}L${f(x + 0.5 + h)} ${f(y + 0.5)}L${f(x + 0.5)} ${f(y + 0.5 + h)}L${f(x + 0.5 - h)} ${f(y + 0.5)}Z`; }
    else if (st === 'squircle') { const g = (1 - sc) / 2; d += roundedRectPath(x + g, y + g, sc, sc, sc * 0.38); }
    else if (st === 'rounded') {
      // connected blobs: round only the corners with no neighbours
      const t = dark(r - 1, c), b = dark(r + 1, c), l = dark(r, c - 1), rt = dark(r, c + 1), R = 0.5;
      d += cornerRect(x, y, 1, 1, [!t && !l ? R : 0, !t && !rt ? R : 0, !b && !rt ? R : 0, !b && !l ? R : 0]);
    } else if (st === 'vbars' || st === 'hbars') {
      const v = st === 'vbars';
      const prev = v ? dark(r - 1, c) : dark(r, c - 1), next = v ? dark(r + 1, c) : dark(r, c + 1);
      const w = 0.78 * sc, g = (1 - w) / 2, R = w / 2;
      if (v) d += cornerRect(x + g, y, w, 1, [prev ? 0 : R, prev ? 0 : R, next ? 0 : R, next ? 0 : R]);
      else d += cornerRect(x, y + g, 1, w, [prev ? 0 : R, next ? 0 : R, next ? 0 : R, prev ? 0 : R]);
    }
  }

  // ── eyes ──
  let eF = '', eB = '';
  for (const [r, c] of [[0, 0], [0, n - 7], [n - 7, 0]]) {
    const x = c + M, y = r + M;
    // mirror leaf corners so they point outward
    eF += eyeFrame(o.eyeFrame || 'square', x, y);
    eB += shapePath(o.eyeBall || 'square', x + 2, y + 2, 3);
  }

  // ── background ──
  let bg = '';
  if (o.bg && o.bg.type !== 'transparent') { const bp = paint('pgBg', o.bg); if (bp.def) defs.push(bp.def); bg = `<rect width="${size}" height="${size}" fill="${bp.fill}"/>`; }
  let bgImg = '';
  if (o.bgImage) {
    bgImg = `<image href="${o.bgImage}" x="0" y="0" width="${size}" height="${size}" preserveAspectRatio="xMidYMid slice"/>`;
    const fade = o.bgImageFade ?? 0.55;
    if (fade > 0) bgImg += `<rect width="${size}" height="${size}" fill="${o.bgImageFadeColor || '#ffffff'}" opacity="${fade}"/>`;
  }

  // ── logo ──
  let logo = '';
  if (hole && o.logo) {
    const lx = hole.s + M, ly = hole.s + M, ls = hole.e - hole.s;
    const shape = o.logoBg || 'rounded';
    const inset = 0.35;
    if (shape !== 'none') {
      const bgc = o.logoBgColor || '#ffffff';
      logo += shape === 'circle' ? `<circle cx="${f(lx + ls / 2)}" cy="${f(ly + ls / 2)}" r="${f(ls / 2)}" fill="${bgc}"/>`
        : `<path d="${shape === 'square' ? shapePath('square', lx, ly, ls) : roundedRectPath(lx, ly, ls, ls, ls * 0.22)}" fill="${bgc}"/>`;
    }
    const pad = shape === 'none' ? 0 : ls * 0.12 + inset;
    const clip = shape === 'circle' ? `<clipPath id="pgLogoClip"><circle cx="${f(lx + ls / 2)}" cy="${f(ly + ls / 2)}" r="${f(ls / 2 - pad)}"/></clipPath>`
      : `<clipPath id="pgLogoClip"><path d="${roundedRectPath(lx + pad, ly + pad, ls - 2 * pad, ls - 2 * pad, (ls - 2 * pad) * (shape === 'square' ? 0.04 : 0.18))}"/></clipPath>`;
    defs.push(clip);
    logo += `<image href="${o.logo}" x="${f(lx + pad)}" y="${f(ly + pad)}" width="${f(ls - 2 * pad)}" height="${f(ls - 2 * pad)}" preserveAspectRatio="xMidYMid ${o.logoFit === 'contain' ? 'meet' : 'slice'}" clip-path="url(#pgLogoClip)"/>`;
  }

  // ── frame with label ──
  const fr = o.frame || {};
  let vb = `0 0 ${size} ${size}`, body = `${bg}${bgImg}<path d="${d}" fill="${fg.fill}"/><path d="${eF}" fill="${ef.fill}" fill-rule="evenodd"/><path d="${eB}" fill="${eb.fill}"/>${logo}`;
  if (fr.on) {
    const pad = 1.4, label = Math.max(4.2, size * 0.14), W = size + pad * 2, H = size + pad * 2 + label;
    const rad = fr.style === 'square' ? 0.6 : 3.2;
    const fc = fr.color || '#111111';
    const inner = `<clipPath id="pgInner"><path d="${roundedRectPath(0, 0, size, size, Math.max(0, rad - pad))}"/></clipPath>`;
    defs.push(inner);
    const fontSize = label * 0.48;
    const text = esc((fr.text || 'SCAN ME').slice(0, 24));
    vb = `0 0 ${f(W)} ${f(H)}`;
    body = `<path d="${roundedRectPath(0, 0, W, H, rad)}" fill="${fc}"/>`
      + `<g transform="translate(${pad} ${pad})" clip-path="url(#pgInner)"><rect width="${size}" height="${size}" fill="#ffffff"/>${body}</g>`
      + `<text x="${f(W / 2)}" y="${f(size + pad * 2 + label * 0.62)}" text-anchor="middle" dominant-baseline="middle" font-family="Segoe UI, Inter, -apple-system, Arial, sans-serif" font-weight="800" letter-spacing="${f(fontSize * 0.08)}" font-size="${f(fontSize)}" fill="${fr.textColor || '#ffffff'}">${text}</text>`;
  }
  let out = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" shape-rendering="geometricPrecision"><defs>${defs.join('')}</defs>${body}</svg>`;
  if (o.idPrefix) out = out.replace(/\bpg(Fg|Ef|Eb|Bg|LogoClip|Inner)\b/g, o.idPrefix + '$1');
  return { svg: out, modules: n, ecl };
}
