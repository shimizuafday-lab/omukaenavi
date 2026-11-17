// ===== 写真編集(矢印・記号スタンプ・モザイク・黒塗り)と、見取図スタンプの共通定義 =====
// 種類ごとに: l=表示名, d=アイコンの線(24x24), c=背景色(theme.cssの変数名), fg=線の色(省略時は文字色)
export const STAMPS = {
  arrow: { l: '矢印', d: 'M12 20V5M12 5l-6 6M12 5l6 6', c: '--accent' },
  park:  { l: 'P 駐車場', d: 'M9 18V6h4a3.5 3.5 0 0 1 0 7H9', c: '--soft' },
  door:  { l: '出入口', d: 'M6 21V4h10v17M3 21h18M13 12.5v.01', c: '--sun' },
  ng:    { l: '進入禁止', d: 'M6 6l12 12M18 6L6 18', c: '--danger', fg: '#ffffff' },
  warn:  { l: '注意', d: 'M12 4l9 16H3zM12 10v4M12 17v.01', c: '--sun' },
  spot:  { l: 'ここ', d: 'M12 5a7 7 0 1 0 0 14a7 7 0 1 0 0-14zM12 10a2 2 0 1 0 0 4a2 2 0 1 0 0-4z', c: '--blossom' }
};
export const stampSvg = (t, size = 22, sw = 2.4) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${STAMPS[t].d}"/></svg>`;

const cv = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim() || '#000';
const MAXPX = 1280;

let styled = false;
function style() {
  if (styled) return; styled = true;
  const s = document.createElement('style');
  s.textContent = `
.ed{position:fixed;inset:0;z-index:100;background:var(--bg);display:flex;flex-direction:column;color:var(--ink);font-family:var(--font)}
.ed-bar{display:flex;gap:8px;justify-content:space-between;padding:max(12px,env(safe-area-inset-top)) 12px 8px}
.ed .sbtn{min-height:40px;padding:0 14px;font-size:13px}
.ed-stage{flex:1;min-height:0;display:flex;align-items:center;justify-content:center;padding:8px}
.ed canvas{border:2px solid var(--ink);border-radius:12px;touch-action:none;background:#fff;cursor:crosshair}
.ed-hint{font-size:12px;font-weight:800;text-align:center;margin:6px 12px}
.ed-tools{display:flex;gap:8px;overflow-x:auto;padding:6px 12px 8px}
.ed .tl{min-height:46px;flex:none;padding:0 14px;font-size:13px}
.ed .tl[aria-pressed="true"]{background:var(--ink);color:var(--on-ink)}
.ed-size{display:flex;gap:8px;align-items:center;justify-content:center;padding:0 12px max(14px,env(safe-area-inset-bottom));font-size:12px;font-weight:800}
.ed-size .btn{min-height:38px;padding:0 16px;font-size:13px}
.ed-size .btn[aria-pressed="true"]{background:var(--ink);color:var(--on-ink)}
`;
  document.head.append(s);
}

async function loadBitmap(file) {
  if (self.createImageBitmap) { try { return await createImageBitmap(file); } catch (e) { /* 下で代替 */ } }
  return new Promise((res, rej) => {
    const im = new Image(), u = URL.createObjectURL(file);
    im.onload = () => res(im); im.onerror = rej; im.src = u;
  });
}

const ARROWTOOL = new Set(['arrow']);
const RECTTOOL = new Set(['mosaic', 'black']);

/** 写真を開いて編集する。決定すると { blob, raw:true }、キャンセルは null */
export function editPhoto(file) {
  style();
  return new Promise(async resolve => {
    let bmp;
    try { bmp = await loadBitmap(file); } catch (e) { resolve({ blob: file, raw: false }); return; }
    const k = Math.min(1, MAXPX / Math.max(bmp.width, bmp.height));
    const W = Math.round(bmp.width * k), H = Math.round(bmp.height * k);
    const base = document.createElement('canvas'); base.width = W; base.height = H;
    base.getContext('2d').drawImage(bmp, 0, 0, W, H);
    const small = document.createElement('canvas');

    const ops = []; let tool = 'arrow', size = 1, tmp = null, drag = null;
    const unit = () => Math.max(W, H) * 0.075 * [0.7, 1, 1.5][size];

    const TOOLS = [
      ['arrow', '矢印', stampSvg('arrow', 18, 2.6)],
      ['mosaic', 'モザイク', '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="3" y="3" width="6" height="6"/><rect x="15" y="3" width="6" height="6"/><rect x="9" y="9" width="6" height="6"/><rect x="3" y="15" width="6" height="6"/><rect x="15" y="15" width="6" height="6"/></svg>'],
      ['black', '黒塗り', '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="3" y="6" width="18" height="12" rx="2"/></svg>'],
      ...['park', 'door', 'ng', 'warn', 'spot'].map(t => [t, STAMPS[t].l, stampSvg(t, 18, 2.6)])
    ];

    const root = document.createElement('div'); root.className = 'ed'; root.setAttribute('role', 'dialog'); root.setAttribute('aria-label', '写真を編集');
    root.innerHTML = `<div class="ed-bar"><button class="btn sbtn" data-c>キャンセル</button><button class="btn sbtn" data-u>やり直し</button><button class="btn btn--primary sbtn" data-ok>この写真を使う</button></div>
<div class="ed-stage"><canvas></canvas></div>
<p class="ed-hint" id="edh"></p>
<div class="ed-tools">${TOOLS.map(([t, l, i]) => `<button class="btn tl" data-tool="${t}" aria-pressed="${t === tool}">${i}${l}</button>`).join('')}</div>
<div class="ed-size"><span>大きさ</span>${['小', '中', '大'].map((l, i) => `<button class="btn" data-size="${i}" aria-pressed="${i === size}">${l}</button>`).join('')}</div>`;
    document.body.append(root);
    const prevOverflow = document.body.style.overflow; document.body.style.overflow = 'hidden';
    const cvs = root.querySelector('canvas'); cvs.width = W; cvs.height = H;
    const ctx = cvs.getContext('2d');
    const ink = cv('--ink');

    const fit = () => {
      const st = root.querySelector('.ed-stage').getBoundingClientRect();
      const s = Math.min((st.width - 16) / W, (st.height - 16) / H);
      cvs.style.width = Math.floor(W * s) + 'px'; cvs.style.height = Math.floor(H * s) + 'px';
    };
    addEventListener('resize', fit); fit();
    const hint = () => {
      root.querySelector('#edh').textContent = ARROWTOOL.has(tool) ? '指でなぞって、矢印を引きます' : RECTTOOL.has(tool) ? (tool === 'mosaic' ? '指でなぞった四角をモザイクにします(顔・ナンバーを隠す)' : '指でなぞった四角を黒く塗ります') : 'タップして置きます';
    };
    hint();

    function drawArrow(c, o) {
      const dx = o.x2 - o.x1, dy = o.y2 - o.y1;
      if (Math.hypot(dx, dy) < 4) return;
      const ang = Math.atan2(dy, dx), lw = o.s * 0.32, hl = o.s * 0.95, ux = Math.cos(ang), uy = Math.sin(ang);
      const pass = (w, col, outline) => {
        c.strokeStyle = col; c.fillStyle = col; c.lineWidth = w; c.lineCap = 'round'; c.lineJoin = 'round';
        c.beginPath(); c.moveTo(o.x1, o.y1); c.lineTo(o.x2 - ux * hl * 0.5, o.y2 - uy * hl * 0.5); c.stroke();
        const bx = o.x2 - ux * hl, by = o.y2 - uy * hl, px = -uy * hl * 0.62, py = ux * hl * 0.62;
        c.beginPath(); c.moveTo(o.x2, o.y2); c.lineTo(bx + px, by + py); c.lineTo(bx - px, by - py); c.closePath(); c.fill(); if (outline) c.stroke();
      };
      c.save(); pass(lw + o.s * 0.2, ink, true); pass(lw, cv('--accent'), false); c.restore();
    }
    function drawStamp(c, o) {
      const d = STAMPS[o.t]; if (!d) return;
      c.save(); c.translate(o.x, o.y); c.scale(o.s / 24, o.s / 24);
      c.beginPath(); c.arc(0, 0, 13, 0, Math.PI * 2); c.fillStyle = cv(d.c); c.fill(); c.lineWidth = 1.6; c.strokeStyle = ink; c.stroke();
      c.translate(-12, -12); c.strokeStyle = d.fg || ink; c.lineWidth = 2.6; c.lineCap = 'round'; c.lineJoin = 'round'; c.stroke(new Path2D(d.d));
      c.restore();
    }
    function drawOp(c, o) {
      if (o.t === 'arrow') return drawArrow(c, o);
      if (o.t === 'black') { c.fillStyle = '#000'; c.fillRect(o.x, o.y, o.w, o.h); return; }
      if (o.t === 'mosaic') {
        const block = Math.max(12, Math.round(Math.max(W, H) / 45));
        const sw = Math.max(1, Math.round(o.w / block)), sh = Math.max(1, Math.round(o.h / block));
        small.width = sw; small.height = sh;
        small.getContext('2d').drawImage(base, o.x, o.y, o.w, o.h, 0, 0, sw, sh);
        c.save(); c.imageSmoothingEnabled = false; c.drawImage(small, 0, 0, sw, sh, o.x, o.y, o.w, o.h); c.restore(); return;
      }
      drawStamp(c, o);
    }
    const render = () => { ctx.drawImage(base, 0, 0); ops.forEach(o => drawOp(ctx, o)); if (tmp) drawOp(ctx, tmp); };
    render();

    const pos = e => { const r = cvs.getBoundingClientRect(); return { x: (e.clientX - r.left) * W / r.width, y: (e.clientY - r.top) * H / r.height }; };
    const mk = (a, b) => ARROWTOOL.has(tool)
      ? { t: 'arrow', x1: a.x, y1: a.y, x2: b.x, y2: b.y, s: unit() }
      : { t: tool, x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) };
    const valid = o => o.t === 'arrow' ? Math.hypot(o.x2 - o.x1, o.y2 - o.y1) >= o.s * 0.5 : o.w >= 8 && o.h >= 8;

    cvs.onpointerdown = e => {
      e.preventDefault(); cvs.setPointerCapture(e.pointerId); const p = pos(e);
      if (ARROWTOOL.has(tool) || RECTTOOL.has(tool)) drag = p;
      else { ops.push({ t: tool, x: p.x, y: p.y, s: unit() }); render(); }
    };
    cvs.onpointermove = e => { if (!drag) return; tmp = mk(drag, pos(e)); render(); };
    cvs.onpointerup = e => { if (!drag) return; const o = mk(drag, pos(e)); drag = null; tmp = null; if (valid(o)) ops.push(o); render(); };
    cvs.onpointercancel = () => { drag = null; tmp = null; render(); };

    const close = r => { removeEventListener('resize', fit); root.remove(); document.body.style.overflow = prevOverflow; resolve(r); };
    root.addEventListener('click', e => {
      const t = e.target.closest('[data-tool]'); if (t) { tool = t.dataset.tool; root.querySelectorAll('[data-tool]').forEach(b => b.setAttribute('aria-pressed', b === t)); hint(); return; }
      const z = e.target.closest('[data-size]'); if (z) { size = +z.dataset.size; root.querySelectorAll('[data-size]').forEach(b => b.setAttribute('aria-pressed', b === z)); return; }
      if (e.target.closest('[data-u]')) { ops.pop(); render(); return; }
      if (e.target.closest('[data-c]')) { if (!ops.length || confirm('編集をやめますか?')) close(null); return; }
      if (e.target.closest('[data-ok]')) { render(); cvs.toBlob(b => b ? close({ blob: b, raw: true }) : close({ blob: file, raw: false }), 'image/jpeg', 0.82); }
    });
  });
}
