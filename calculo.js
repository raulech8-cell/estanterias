/* Cálculo de estanterías de casilleros: COPIA EXACTA de estanteria.py (piezas, reparto en
   tablas, metros de corte y horas) + precio de la tarifa (tarifa.js).
   Si cambias estanteria.py, cambia esto igual y pasa:  python corte-laser/estanterias/comparar_web.py
   Funciona en el navegador (window.Calculo) y en Node (require). */
(function (root) {
  "use strict";

  // Python round(x): mitad al par
  function roundEven(x) {
    const f = Math.floor(x), d = x - f;
    if (d > 0.5) return f + 1;
    if (d < 0.5) return f;
    return f % 2 === 0 ? f : f + 1;
  }
  // Python round(x, 3)
  function r3(x) { return Number(x.toFixed(3)); }

  class Fallo extends Error {}

  // ------------------------------------------------------------------ piezas
  class Estanteria {
    constructor(cols, rows, cw, ch, d, t = 3.0, tol = 1.0, pitch = 20.0) {
      Object.assign(this, { cols, rows, cw, ch, d, t, tol, pitch });
      this.iw = cols * cw + (cols - 1) * t;
      this.ih = rows * ch + (rows - 1) * t;
      this.ow = this.iw + 2 * t; this.oh = this.ih + 2 * t;
      this.vslots = this._slots(cols, cw);
      this.hslots = this._slots(rows, ch);
    }
    _slots(n, cell) {
      const t = this.t, h = this.tol / 2, out = [];
      for (let i = 1; i < n; i++) out.push([i * cell + (i - 1) * t - h, i * cell + i * t + h]);
      return out;
    }
    fingers(L) {
      let n = Math.max(3, roundEven(L / this.pitch));
      if (n % 2 === 0) n += 1;
      const w = L / n, out = [];
      for (let j = 0; j < n; j++) out.push([j * w, (j + 1) * w, j % 2 === 0]);
      return out;
    }
    wall(L, slots, kind) {
      const t = this.t, d = this.d, h = this.tol / 2;
      const b1 = d / 4, b2 = 3 * d / 4;
      const [x0, x1] = kind === "short" ? [-t, L + t] : [0.0, L];
      const p = [[x0, 0.0]];
      for (const [a, b] of slots) p.push([a, 0.0], [a, d / 2], [b, d / 2], [b, 0.0]);
      p.push([x1, 0.0]);
      if (kind === "long") p.push([L, b1], [L + t, b1], [L + t, b2], [L, b2], [L, d]);
      else p.push([L + t, b1 - h], [L, b1 - h], [L, b2 + h], [L + t, b2 + h]);
      const segs = this.fingers(L).slice().reverse();
      segs.forEach(([a, b, fing], k) => {
        const y = fing ? d + t : d;
        const xa = (kind === "short" && k === 0) ? L + t : b;
        const xb = (kind === "short" && k === segs.length - 1) ? -t : a;
        p.push([xa, y], [xb, y]);
      });
      if (kind === "long") p.push([0.0, d], [0.0, b2], [-t, b2], [-t, b1], [0.0, b1]);
      else p.push([-t, b2 + h], [0.0, b2 + h], [0.0, b1 - h], [-t, b1 - h]);
      return p;
    }
    divider(L, slots, fromBack) {
      const t = this.t, d = this.d;
      let p;
      if (fromBack) {
        p = [[-t, 0.0], [L + t, 0.0], [L + t, d / 2], [L, d / 2], [L, d]];
        for (const [a, b] of slots.slice().reverse()) p.push([b, d], [b, d / 2], [a, d / 2], [a, d]);
        p.push([0.0, d], [0.0, d / 2], [-t, d / 2]);
      } else {
        p = [[-t, 0.0]];
        for (const [a, b] of slots) p.push([a, 0.0], [a, d / 2], [b, d / 2], [b, 0.0]);
        p.push([L + t, 0.0], [L + t, d / 2], [L, d / 2], [L, d], [0.0, d], [0.0, d / 2], [-t, d / 2]);
      }
      return p;
    }
    _edge(L, inner, outer) {
      const h = this.tol / 2, pts = [[0.0, inner]];
      for (const [a, b, fing] of this.fingers(L))
        if (!fing) pts.push([a + h, inner], [a + h, outer], [b - h, outer], [b - h, inner]);
      pts.push([L, inner]);
      return pts;
    }
    back() {
      const t = this.t, iw = this.iw, ih = this.ih;
      let p = this._edge(iw, 0.0, -t).slice();
      p = p.concat(this._edge(ih, iw, iw + t).map(([x, y]) => [y, x]));
      p = p.concat(this._edge(iw, ih, ih + t).slice().reverse());
      p = p.concat(this._edge(ih, 0.0, -t).slice().reverse().map(([x, y]) => [y, x]));
      return p;
    }
    pieces() {
      const out = [["Trasera", this.back()]];
      const rep = (n, item) => { for (let i = 0; i < n; i++) out.push(item); };
      rep(2, ["Pared larga", this.wall(this.iw, this.vslots, "long")]);
      rep(2, ["Pared corta", this.wall(this.ih, this.hslots, "short")]);
      rep(this.rows - 1, ["Separador horizontal", this.divider(this.iw, this.vslots, true)]);
      rep(this.cols - 1, ["Separador vertical", this.divider(this.ih, this.hslots, false)]);
      return out.map(([n, p]) => [n, norm(clean(p))]);
    }
  }

  // ------------------------------------------------------------------ geometría
  function clean(p) {
    const out = [];
    for (let q of p) {
      q = [r3(q[0]), r3(q[1])];
      const l = out[out.length - 1];
      if (!l || l[0] !== q[0] || l[1] !== q[1]) out.push(q);
    }
    while (out.length > 1 && out[out.length - 1][0] === out[0][0] && out[out.length - 1][1] === out[0][1]) out.pop();
    const res = [], n = out.length;
    for (let i = 0; i < n; i++) {
      const a = out[(i - 1 + n) % n], b = out[i], c = out[(i + 1) % n];
      if ((b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]) !== 0) res.push(b);
    }
    return res;
  }
  function bbox(p) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of p) { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; }
    return [x0, y0, x1, y1];
  }
  function size(p) { const b = bbox(p); return [b[2] - b[0], b[3] - b[1]]; }
  function norm(p) { const b = bbox(p); return p.map(([a, c]) => [a - b[0], c - b[1]]); }
  function rot(p) { return norm(p.map(([a, b]) => [b, -a])); }
  function perimeter(p) {
    let s = 0;
    for (let i = 0; i < p.length; i++) {
      const a = p[(i - 1 + p.length) % p.length], b = p[i];
      s += Math.hypot(b[0] - a[0], b[1] - a[1]);
    }
    return s;
  }
  function area(p) {
    let s = 0;
    for (let i = 0; i < p.length; i++) {
      const a = p[(i - 1 + p.length) % p.length], b = p[i];
      s += a[0] * b[1] - b[0] * a[1];
    }
    return Math.abs(s) / 2;
  }
  function areaBB(p) { const [w, h] = size(p); return w * h; }

  // ------------------------------------------------------------------ reparto en tablas
  function nestMaxrects(pieces, bw, bh, margin = 3.0, gap = 2.0) {
    const BW = bw - 2 * margin + gap, BH = bh - 2 * margin + gap;
    const items = pieces.map((x, i) => [x, i]).sort((A, B) => (-areaBB(A[0][1])) - (-areaBB(B[0][1])) || A[1] - B[1]).map(x => x[0]);
    const bins = [];
    const lt = (s, b) => s[0] < b[0] || (s[0] === b[0] && s[1] < b[1]);
    function fitsAny(b, w, h) {
      let best = null;
      for (const [fx, fy, fw, fh] of b.free)
        for (const [rw, rh, r] of [[w, h, false], [h, w, true]])
          if (rw <= fw + 1e-6 && rh <= fh + 1e-6) {
            const score = [Math.min(fw - rw, fh - rh), Math.max(fw - rw, fh - rh)];
            if (best === null || lt(score, best[0])) best = [score, fx, fy, rw, rh, r];
          }
      return best;
    }
    function split(b, x, y, w, h) {
      const nw = [];
      for (const [fx, fy, fw, fh] of b.free) {
        if (x >= fx + fw || x + w <= fx || y >= fy + fh || y + h <= fy) { nw.push([fx, fy, fw, fh]); continue; }
        if (x > fx) nw.push([fx, fy, x - fx, fh]);
        if (x + w < fx + fw) nw.push([x + w, fy, fx + fw - x - w, fh]);
        if (y > fy) nw.push([fx, fy, fw, y - fy]);
        if (y + h < fy + fh) nw.push([fx, y + h, fw, fy + fh - y - h]);
      }
      const same = (r, o) => r[0] === o[0] && r[1] === o[1] && r[2] === o[2] && r[3] === o[3];
      const kept = nw.filter(r => !nw.some(o => !same(r, o) && r[0] >= o[0] && r[1] >= o[1] &&
        r[0] + r[2] <= o[0] + o[2] && r[1] + r[3] <= o[1] + o[3]));
      const seen = new Set(), uniq = [];
      for (const r of kept) { const k = r.join(","); if (!seen.has(k)) { seen.add(k); uniq.push(r); } }
      b.free = uniq;
    }
    for (const [name, p] of items) {
      let [w, h] = size(p);
      w += gap; h += gap;
      if (Math.min(w, h) > Math.min(BW, BH) || Math.max(w, h) > Math.max(BW, BH))
        throw new Fallo(`La pieza "${name}" (${(w - gap).toFixed(0)} x ${(h - gap).toFixed(0)} mm) no cabe en la tabla.`);
      let choice = null;
      for (const b of bins) { const c = fitsAny(b, w, h); if (c) { choice = [b, c]; break; } }
      if (!choice) {
        const b = { free: [[0.0, 0.0, BW, BH]], placed: [] };
        bins.push(b);
        const c = fitsAny(b, w, h);
        if (!c) throw new Fallo(`La pieza "${name}" no cabe en la tabla.`);
        choice = [b, c];
      }
      const [b, [, fx, fy, rw, rh, r]] = choice;
      const q = r ? rot(p) : p;
      b.placed.push([name, q.map(([a, c2]) => [a + fx + margin, c2 + fy + margin])]);
      split(b, fx, fy, rw, rh);
    }
    return bins.map(b => b.placed);
  }

  function nestRows(pieces, bw, bh, margin = 3.0, gap = 2.0) {
    const backs = pieces.filter(x => x[0] === "Trasera");
    const stable = (arr, key) => arr.map((x, i) => [x, i]).sort((A, B) => key(A[0]) - key(B[0]) || A[1] - B[1]).map(x => x[0]);
    const longs = stable(pieces.filter(x => x[0] === "Pared larga" || x[0] === "Separador horizontal"), x => x[0] !== "Pared larga" ? 1 : 0);
    const shorts = stable(pieces.filter(x => x[0] === "Pared corta" || x[0] === "Separador vertical"), x => x[0] !== "Pared corta" ? 1 : 0);
    const W = bw - margin, H = bh - margin, boards = [];

    function put(b, name, p, x, y) {
      const [w, h] = size(p);
      if (!(x + w <= W + 1e-6 && y + h <= H + 1e-6)) throw new Error("assert");   // en Python: AssertionError
      b.push([name, p.map(([a, c]) => [a + x, c + y])]);
    }
    function column(b, x) {
      while (shorts.length) {
        const [name, p] = shorts[0];
        const pr = rot(p), [w, h] = size(pr);
        if (x + w > W || margin + h > H) break;
        put(b, name, pr, x, margin);
        shorts.shift();
        x += w + gap;
      }
    }
    function rowsOf(b, y, xEnd, pool) {
      while (pool.length && y + size(pool[0][1])[1] <= H) {
        let x = margin, rowh = 0;
        while (pool.length && x + size(pool[0][1])[0] <= xEnd && y + size(pool[0][1])[1] <= H) {
          const [name, p] = pool.shift();
          put(b, name, p, x, y);
          x += size(p)[0] + gap;
          rowh = Math.max(rowh, size(p)[1]);
        }
        if (rowh === 0) break;
        y += rowh + gap;
      }
      return y;
    }
    for (const [name, p] of backs) {
      const [w, h] = size(p);
      if (w > W - margin || h > H - margin)
        throw new Fallo(`La trasera (${w.toFixed(0)} x ${h.toFixed(0)} mm) no cabe en la tabla.`);
      const b = []; boards.push(b);
      put(b, name, p, margin, margin);
      column(b, margin + w + gap);
      rowsOf(b, margin + h + gap, W, shorts);
    }
    for (const [name, p] of longs)
      if (size(p)[0] > W - margin) throw new Fallo(`La tira "${name}" mide ${size(p)[0].toFixed(0)} mm y no cabe.`);
    while (longs.length) {
      const b = []; boards.push(b);
      const lw = size(longs[0][1])[0];
      const y = rowsOf(b, margin, W, longs);
      column(b, margin + lw + gap);
      rowsOf(b, y, margin + lw, shorts);
    }
    while (shorts.length) {
      const b = []; boards.push(b);
      if (size(shorts[0][1])[0] > W - margin) throw new Fallo(`La tira corta mide ${size(shorts[0][1])[0].toFixed(0)} mm y no cabe.`);
      rowsOf(b, margin, W, shorts);
    }
    for (const b of boards) {
      const bb = b.map(([, p]) => bbox(p));
      for (let i = 0; i < bb.length; i++) for (let j = i + 1; j < bb.length; j++) {
        const a = bb[i], c = bb[j];
        if (a[0] < c[2] - 1e-6 && c[0] < a[2] - 1e-6 && a[1] < c[3] - 1e-6 && c[1] < a[3] - 1e-6)
          throw new Fallo("Error interno: piezas solapadas.");
      }
    }
    return boards;
  }

  function nest(pieces, bw, bh, margin = 3.0, gap = 2.0) {
    let best = null, err = null;
    for (const fn of [nestRows, nestMaxrects]) {
      let r;
      try { r = fn(pieces.slice(), bw, bh, margin, gap); }
      catch (e) { if (e instanceof Fallo) { err = e; continue; } throw e; }
      if (best === null || r.length < best.length) best = r;
    }
    if (best === null) throw err;
    return best;
  }

  // ------------------------------------------------------------------ precio (igual que precio_venta() de estanteria.py)
  function redondear(x, paso) { return paso > 0 ? Math.floor(x / paso + 0.5) * paso : Math.round(x * 100) / 100; }

  function precioVenta(tablas, horas, T, entregaId) {
    const madera = tablas * T.precio_tabla_eur;
    const laser = horas * T.euros_hora_laser;
    const porTabla = T.precio_venta_por_tabla_eur || 0;   // si está: precio = tablas × esto
    const trabajo = porTabla ? tablas * porTabla : Math.max(T.minimo_eur, redondear(madera + laser, T.redondeo_eur));
    const ent = (T.entregas || []).find(e => e.id === entregaId) || null;
    const entrega = ent ? ent.eur : 0;   // null = a consultar
    return {
      por_tabla_eur: porTabla || null,
      madera_eur: Math.round(madera * 100) / 100,
      laser_eur: Math.round(laser * 100) / 100,
      ajuste_eur: Math.round((trabajo - madera - laser) * 100) / 100,
      estanterias_eur: trabajo,
      entrega_eur: entrega,
      total_eur: entrega === null ? null : trabajo + entrega,
    };
  }

  // ------------------------------------------------------------------ todo junto
  function calcular(cfg, T) {
    const [bw, bh] = T.tabla_mm;
    const est = new Estanteria(cfg.columnas, cfg.filas, cfg.ancho, cfg.alto, cfg.fondo, T.grosor_mm, T.holgura_mm);
    const one = est.pieces();
    let allp = [];
    for (let i = 0; i < cfg.cantidad; i++) allp = allp.concat(one);
    let boards;
    try { boards = nest(allp, bw, bh); }
    catch (e) { return { ok: false, error: e instanceof Fallo ? e.message : "No cabe en las tablas de madera.", est }; }
    let per = 0;
    for (const b of boards) for (const [, p] of b) per += perimeter(p);
    const cut_m = per / 1000;
    const horas = cut_m * 1000 / T.velocidad_mm_min / 60;
    return {
      ok: true, est, boards,
      medida_montada_mm: [Math.round(est.ow * 10) / 10, Math.round(est.oh * 10) / 10, Math.round((cfg.fondo + T.grosor_mm) * 10) / 10],
      piezas_total: allp.length,
      tablas: boards.length,
      metros_corte: cut_m,
      horas_laser: horas,
      precio: precioVenta(boards.length, horas, T, cfg.entrega),
    };
  }

  // Código que el cliente manda por WhatsApp y que entiende estanteria.py --codigo
  function codigo(cfg) {
    const g = v => String(+(+v).toFixed(1));
    return `EST-${cfg.columnas}x${cfg.filas}-${g(cfg.ancho)}x${g(cfg.alto)}x${g(cfg.fondo)}-${cfg.cantidad}` + (cfg.entrega ? `-${cfg.entrega}` : "");
  }

  const api = { Estanteria, calcular, codigo, precioVenta, nest, perimeter, area, size, bbox };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Calculo = api;
})(typeof window !== "undefined" ? window : this);
