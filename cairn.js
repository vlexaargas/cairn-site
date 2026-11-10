// The marketing site's islands and its pebble playground, drawn on canvas the way the app draws them.
//
// The geometry is a hand port of the app's Swift, so the playground follows the app's own rules for where a pebble
// fits. When those change, change this too:
//   Palette and materials   Cairn/Design/Palette.swift
//   Dodecahedron            CairnCore/Geometry/Dodecahedron.swift
//   Pebbles and fitting     CairnCore/Geometry/Sculpture.swift, Sculpture+Sample.swift
//   Island mesh and shading Cairn/Scene/SculptureScene+Meshes.swift
//   Sky                     Cairn/Views/Sky.swift
//   Camera framing          Cairn/Scene/Viewpoint.swift
(() => {
  'use strict';
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- Palette (Cairn/Design/Palette.swift) ----------
  const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const mix = (a, share, b) => a.map((v, i) => v * share + b[i] * (1 - share));
  const rgba = (c, a = 1) => 'rgba(' + c.map((v) => Math.round(v * 255)).join(',') + ',' + a + ')';
  const P = { ground: hex('#EEF3F6'), main: hex('#2F6F8F'), second: hex('#1D2A33'), accent: hex('#C99A3E'), clay: hex('#A65A3C'), heather: hex('#6E5C8F') };
  const MATERIALS = {
    brass: { tint: P.accent, island: P.main, mark: P.main },
    lake: { tint: P.main, island: P.clay, mark: P.accent },
    dusk: { tint: mix(P.main, 0.5, P.accent), island: P.heather, mark: P.accent },
  };
  // The film's three-step face shading.
  function shade(color, br) {
    if (br > 0.86) return mix(color, 0.62, P.ground);
    if (br > 0.6) return mix(color, (80 + 25 * (br - 0.6)) / 100, P.ground);
    return mix(color, (62 + 38 * br / 0.6) / 100, P.second);
  }

  // ---------- Vectors ----------
  const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const len = (a) => Math.hypot(a[0], a[1], a[2]), norm = (a) => mul(a, 1 / len(a)), dist = (a, b) => len(sub(a, b));
  const mv = (m, v) => [m[0] * v[0] + m[1] * v[1] + m[2] * v[2], m[3] * v[0] + m[4] * v[1] + m[5] * v[2], m[6] * v[0] + m[7] * v[1] + m[8] * v[2]];
  const mm = (a, b) => { const o = []; for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) o.push(a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c]); return o; };
  const tr = (m) => [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]];
  const ID = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  const rng = (seed) => { let a = seed | 0; return () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; };

  // ---------- The dodecahedron (CairnCore/Geometry/Dodecahedron.swift, from the film's shared.js) ----------
  const D = (() => {
    const PHI = (1 + Math.sqrt(5)) / 2, IP = 1 / PHI;
    let V = [];
    for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) V.push([x, y, z]);
    for (const a of [-1, 1]) for (const b of [-1, 1]) { V.push([0, a * IP, b * PHI]); V.push([a * IP, b * PHI, 0]); V.push([a * PHI, 0, b * IP]); }
    const N0 = [];
    for (const a of [-1, 1]) for (const b of [-1, 1]) { N0.push(norm([a, 0, b * PHI])); N0.push(norm([0, a * PHI, b])); N0.push(norm([a * PHI, b, 0])); }
    const k = Math.hypot(1, PHI), cs = PHI / k, sn = 1 / k;
    const rot = (p) => [p[0], p[1] * cs + p[2] * sn, -p[1] * sn + p[2] * cs];
    V = V.map(rot);
    const FACES = N0.map((n0) => {
      const n = rot(n0);
      const ids = V.map((v, i) => [dot(v, n), i]).sort((a, b) => b[0] - a[0]).slice(0, 5).map((p) => p[1]);
      const c = mul(ids.reduce((s, i) => add(s, V[i]), [0, 0, 0]), 0.2);
      const u = norm(sub(V[ids[0]], c)), w = cross(n, u);
      const ang = (i) => Math.atan2(dot(sub(V[i], c), w), dot(sub(V[i], c), u));
      return ids.sort((i, j) => ang(i) - ang(j));
    });
    const inr = len(mul(FACES[0].reduce((s, i) => add(s, V[i]), [0, 0, 0]), 0.2));
    V = V.map((v) => mul(v, 1 / inr));
    const minY = Math.min(...V.map((v) => v[1]));
    V = V.map((v) => [v[0], v[1] - minY, v[2]]);
    const C0 = [0, -minY, 0];
    const LOCAL = V.map((v) => sub(v, C0));
    const NORMALS = FACES.map((f) => norm(f.reduce((s, i) => add(s, LOCAL[i]), [0, 0, 0])));
    const edges = [], seen = new Set();
    for (const f of FACES) for (let c = 0; c < 5; c++) { const a = f[c], b = f[(c + 1) % 5], key = Math.min(a, b) + ':' + Math.max(a, b); if (!seen.has(key)) { seen.add(key); edges.push([a, b]); } }
    const SAMPLES = LOCAL.concat([[0, 0, 0]], NORMALS, edges.map(([a, b]) => mul(add(LOCAL[a], LOCAL[b]), 0.5)));
    return { V, FACES, LOCAL, NORMALS, SAMPLES, C0, BOTTOM: NORMALS.findIndex((n) => n[1] < -0.99), CIRC: Math.max(...LOCAL.map(len)) };
  })();

  // ---------- Sculpture (CairnCore/Geometry/Sculpture.swift) ----------
  // A pebble is the canonical solid turned by `b` (a rotation or mirror image of one) and moved to `c`.
  function pebble(c, b, used) { return { c, b, used, V: D.LOCAL.map((l) => add(c, mv(b, l))) }; }
  const faceNormal = (p, f) => mv(p.b, D.NORMALS[f]);
  function orthonormal(m) {
    const c0 = [m[0], m[3], m[6]], c1 = [m[1], m[4], m[7]], c2 = [m[2], m[5], m[8]];
    const x = norm(c0), y = norm(sub(c1, mul(x, dot(c1, x))));
    let z = cross(x, y); if (dot(z, c2) < 0) z = mul(z, -1);
    return [x[0], y[0], z[0], x[1], y[1], z[1], x[2], y[2], z[2]];
  }
  // The pebble that would sit on `face`: this one mirrored across that face.
  function child(p, f) {
    const n = norm(faceNormal(p, f));
    const M = [1 - 2 * n[0] * n[0], -2 * n[0] * n[1], -2 * n[0] * n[2], -2 * n[1] * n[0], 1 - 2 * n[1] * n[1], -2 * n[1] * n[2], -2 * n[2] * n[0], -2 * n[2] * n[1], 1 - 2 * n[2] * n[2]];
    return pebble(add(p.c, mul(n, 2)), orthonormal(mm(M, p.b)), 1 << f);
  }
  function pokes(a, o, margin) {
    const t = tr(o.b), r = mm(t, a.b), off = mv(t, sub(a.c, o.c)), lim = 1 - margin;
    outer: for (const s of D.SAMPLES) {
      const pt = add(off, mv(r, s));
      for (const n of D.NORMALS) if (dot(pt, n) > lim) continue outer;
      return true;
    }
    return false;
  }
  const overlaps = (a, b, m) => pokes(a, b, m) || pokes(b, a, m);

  class Sculpture {
    constructor(placements = []) { this.pebbles = []; this.placements = []; this.open = new Set(); for (const p of placements) this.place(p.parent, p.face); }
    fits(pi, f) {
      const parent = this.pebbles[pi];
      if (!parent || parent.used & (1 << f)) return false;
      const c = add(parent.c, mul(faceNormal(parent, f), 2));
      let nw = null;
      if (c[1] < D.CIRC + 0.05) { nw = child(parent, f); if (nw.V.some((v) => v[1] < -0.02)) return false; }
      for (let j = 0; j < this.pebbles.length; j++) {
        if (j === pi) continue;
        const d = dist(this.pebbles[j].c, c);
        if (d < 1.99) return false;
        if (d >= 2 * D.CIRC) continue;
        nw = nw || child(parent, f);
        if (overlaps(nw, this.pebbles[j], 0.03)) return false;
      }
      return true;
    }
    place(parent, face) {
      if (parent == null) {
        if (this.pebbles.length) return null;
        this.pebbles.push(pebble([0, 1, 0], ID.slice(), 1 << D.BOTTOM));
      } else {
        if (!this.fits(parent, face)) return null;
        this.pebbles[parent].used |= 1 << face;
        this.pebbles.push(child(this.pebbles[parent], face));
        this.open.delete(parent * 12 + face);
      }
      this.placements.push({ parent, face });
      const idx = this.pebbles.length - 1, added = this.pebbles[idx], reach = 2 * D.CIRC;
      for (const k of [...this.open]) {
        const p = this.pebbles[Math.floor(k / 12)], f = k % 12;
        const d = dist(add(p.c, mul(faceNormal(p, f), 2)), added.c);
        if (d < reach && (d < 1.99 || overlaps(child(p, f), added, 0.03))) this.open.delete(k);
      }
      for (let f = 0; f < 12; f++) if (this.fits(idx, f)) this.open.add(idx * 12 + f);
      return idx;
    }
    openFaces() { return [...this.open].sort((a, b) => a - b).map((k) => ({ pebble: Math.floor(k / 12), face: k % 12 })); }
    // Grows into a mound the way a person might (Sculpture+Sample.swift).
    grow(count, seed) {
      const r = rng(seed + this.pebbles.length);
      if (!this.pebbles.length) this.place(null, D.BOTTOM);
      let stalls = 0;
      while (this.pebbles.length < count && stalls < 50) {
        const n = this.pebbles.length, pool = [];
        for (let i = Math.max(0, n - 40); i < n; i++) pool.push(i);
        for (let i = 0; i < 12; i++) pool.push(Math.floor(r() * n));
        let best = null;
        for (const i of pool) {
          const p = this.pebbles[i];
          for (let f = 0; f < 12; f++) {
            if (!this.open.has(i * 12 + f)) continue;
            const s = add(p.c, mul(faceNormal(p, f), 2));
            const score = -s[1] * 0.35 - Math.hypot(s[0], s[2]) * 0.25 + r() * 1.2;
            if (!best || score > best.score) best = { i, f, score };
          }
        }
        if (!best) { stalls++; continue; }
        stalls = 0;
        this.place(best.i, best.f);
      }
      return this;
    }
  }


  // Figures drawn in pebbles. A figure is strokes in the plane the film's camera faces (u across, v up, in
  // pebble radii); the grower places real pebbles, by the app's own fit rules, steering each one toward the
  // next point on the stroke. Strokes are grown in order, so any first n pebbles are the figure part-built.
  const FIG_YAW = 0.5; // The film's viewpoint; the view code below calls it FILM_YAW.
  const PLANE = [Math.cos(FIG_YAW), 0, -Math.sin(FIG_YAW)];
  const at = (u, v) => add(mul(PLANE, u), [0, v, 0]);
  function along(pts, step = 1.6) {
    const out = [pts[0]];
    for (let i = 1; i < pts.length; i++) {
      const [a, b] = [pts[i - 1], pts[i]], n = Math.max(1, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / step));
      for (let k = 1; k <= n; k++) out.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]);
    }
    return out;
  }
  const ring = (cu, cv, r, from = -Math.PI / 2, n = Math.max(6, Math.round(2 * Math.PI * r / 1.7))) =>
    Array.from({ length: n + 1 }, (_, i) => { const a = from + i / n * 2 * Math.PI; return [cu + Math.cos(a) * r, cv + Math.sin(a) * r]; });
  function figure(strokes, scale = 1) {
    const s = new Sculpture();
    s.place(null, D.BOTTOM);
    const scaled = ([u, v]) => [u * scale, 1 + (v - 1) * scale];
    const toward = (goal, near) => {
      let best = null;
      for (const k of s.open) {
        const p = s.pebbles[Math.floor(k / 12)], c = add(p.c, mul(faceNormal(p, k % 12), 2));
        // Stay near the figure's plane, so it reads from the film's angle.
        const d = dist(c, goal) + 0.35 * Math.abs(dot(c, [Math.sin(FIG_YAW), 0, Math.cos(FIG_YAW)]));
        if (!best || d < best.d) best = { d, k, gain: near - dist(c, goal) };
      }
      return best;
    };
    for (const stroke of strokes) {
      if (!Array.isArray(stroke)) { fill(s, stroke.fill.map(scaled).map(([u, v]) => at(u, v)), toward); continue; }
      for (const [u, v] of along(stroke.map(scaled))) {
      const goal = at(u, v);
      for (let tries = 0; tries < 8; tries++) {
        const near = Math.min(...s.pebbles.map((p) => dist(p.c, goal)));
        if (near < 1.3) break;
        const best = toward(goal, near);
        if (!best || best.gain < 0.15) break;
        s.place(Math.floor(best.k / 12), best.k % 12);
      }
      }
    }
    return s.pebbles;
  }
  // Covers an area: always the uncovered point nearest the pebbles so far, until each is covered or out of reach.
  function fill(s, goals, toward) {
    let left = goals.slice();
    const covered = (g) => s.pebbles.some((p) => dist(p.c, g) < 1.3);
    for (let guard = 0; guard < 400; guard++) {
      left = left.filter((g) => !covered(g));
      if (!left.length) return;
      const near = (g) => Math.min(...s.pebbles.map((p) => dist(p.c, g)));
      left.sort((a, b) => near(a) - near(b) || a[1] - b[1]);
      const goal = left[0], best = toward(goal, near(goal));
      if (!best || best.gain < 0.15) { left.shift(); if (!left.length) return; continue; }
      s.place(Math.floor(best.k / 12), best.k % 12);
    }
  }
  // Lattice points inside a shape, a pebble apart.
  const area = (inside, [u0, u1], [v0, v1]) => { const pts = []; for (let v = v0; v <= v1; v += 1.8) for (let u = u0; u <= u1; u += 1.8) if (inside(u, v)) pts.push([u, v]); return pts; };
  const FIGURES = {
    // A stick figure waving: a leg up to the hip, the other leg back down, the body, both arms, then the head.
    person: () => figure([
      [[0, 1], [2.6, 9]], [[2.6, 9], [5.4, 1]], [[2.6, 9], [2.6, 17]],
      [[2.6, 15.5], [-1.6, 10.5]], [[2.6, 15.5], [7, 20.5]],
      ring(2.6, 21.6, 3, -Math.PI / 2),
    ], 1.45),
    // A pine: the trunk, then its crown filled in from the bottom up.
    tree: () => figure([
      [[0, 1], [0, 5]],
      { fill: area((u, v) => Math.abs(u) <= (18 - v) * 0.5, [-7, 7], [5, 18]) },
    ], 1.15),
    // A heart standing on its point.
    heart: () => {
      const pts = (t0, t1) => Array.from({ length: 13 }, (_, i) => { const t = t0 + (t1 - t0) * i / 12; return [0.42 * 16 * Math.sin(t) ** 3, 1 + 0.42 * (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t) + 17)]; });
      return figure([pts(Math.PI, 0.02), pts(Math.PI, 2 * Math.PI - 0.02)], 1.25);
    },
    // A house: along the floor, up a wall, over the roof and down the other wall.
    house: () => figure([[[0, 1], [9, 1], [9, 9], [4.5, 15], [0, 9], [0, 2.5]]], 1.2),
  };
  const figCache = {};
  const fig = (k) => figCache[k] || (figCache[k] = FIGURES[k]());

  // ---------- Island (SculptureScene+Meshes.swift) ----------
  const LIGHT = norm([-0.55, 0.85, 0.5]);
  function islandPolys(radius, color) {
    const r = rng(7), thick = radius * 0.09, under = [], top = [];
    const rim = []; for (let s = 0; s < 48; s++) { const a = s / 48 * 2 * Math.PI; rim.push([Math.cos(a) * radius, 0, Math.sin(a) * radius]); }
    top.push({ pts: rim, col: mix(color, 0.38, P.ground) });
    top.push({ pts: rim.map((p) => [p[0] * 0.72 - radius * 0.08, 0.004, p[2] * 0.72 - radius * 0.05]), col: mix(color, 0.26, P.ground) });
    for (let i = 0; i < 48; i++) { const h = rim[i], n = rim[(i + 1) % 48]; under.push({ pts: [h, sub(h, [0, thick, 0]), sub(n, [0, thick, 0]), n], col: mix(color, 0.85, P.second) }); }
    const sides = 11, depth = radius * 1.15, tip = [radius * 0.05, -thick - depth, radius * 0.04];
    const ring = []; for (let s = 0; s < sides; s++) { const a = s / sides * 2 * Math.PI, out = radius * (0.9 + r() * 0.1); ring.push([Math.cos(a) * out, -thick - depth * (0.1 + r() * 0.12), Math.sin(a) * out]); }
    const lit = mix(color, 0.72, P.ground), dark = mix(color, 0.88, P.second);
    const sun = (() => { const l = Math.hypot(LIGHT[0], LIGHT[2]); return [LIGHT[0] / l, LIGHT[2] / l]; })();
    const lip = (p) => { const l = Math.hypot(p[0], p[2]); return [p[0] / l * radius, -thick, p[2] / l * radius]; };
    for (let i = 0; i < sides; i++) {
      const h = ring[i], n = ring[(i + 1) % sides], m = mul(add(h, n), 0.5), ml = Math.hypot(m[0], m[2]);
      const br = Math.max(0, (m[0] * sun[0] + m[2] * sun[1]) / ml), col = mix(dark, br, lit);
      under.push({ pts: [lip(h), lip(n), n, h], col });
      under.push({ pts: [h, n, tip], col: mix(col, 0.9, P.second) });
    }
    for (let i = 0; i < 9; i++) {
      const a = r() * 2 * Math.PI, d = radius * (0.45 + r() * 0.45), size = 0.12 + r() * 0.16, spot = [Math.cos(a) * d, 0.008, Math.sin(a) * d];
      const pts = []; for (let s = 0; s < 6; s++) { const t = s / 6 * 2 * Math.PI; pts.push(add(spot, [Math.cos(t) * size * 1.4, 0, Math.sin(t) * size])); }
      top.push({ pts, col: mix(color, 0.55, P.ground) });
    }
    return { under, top };
  }

  // ---------- Sky (Cairn/Views/Sky.swift) ----------
  const FAR_TINTS = Object.values(MATERIALS).map((m) => mix(m.island, 0.28, P.ground));
  function wrapX(x, w, m) { const span = w + m * 2; return ((((x + m) % span) + span) % span) - m; }
  function drawSky(ctx, w, h, t, seed, far = true) {
    const r = rng(seed * 977), scale = Math.max(w, 600) / 1080;
    for (let i = 0; i < 6; i++) {
      const hw = (220 + r() * 300) * scale, cx = wrapX(r() * w - t * 10 * scale, w, hw), cy = (0.06 + r() * 0.8) * h;
      ctx.fillStyle = rgba(P.ground, 0.75); ctx.beginPath(); ctx.ellipse(cx, cy, hw, hw * 0.16, 0, 0, Math.PI * 2); ctx.fill();
    }
    if (far) for (let i = 0; i < 9; i++) {
      const hw = (10 + r() * 26) * scale, cx = wrapX(r() * w - t * 4 * scale, w, hw), top = (0.1 + r() * 0.75) * h + 3 * Math.sin(t * 0.8) * scale;
      ctx.fillStyle = rgba(FAR_TINTS[i % 3]); ctx.beginPath(); ctx.moveTo(cx - hw, top); ctx.lineTo(cx + hw, top); ctx.lineTo(cx, top + hw * 1.2); ctx.closePath(); ctx.fill();
    }
  }

  // ---------- A view of one or more islands ----------
  const FILM_YAW = 0.5, FILM_PITCH = 0.3, TURN = 0.011;
  const centroid = (pts) => mul(pts.reduce((s, p) => add(s, p), [0, 0, 0]), 1 / pts.length);
  // Face centres and normals, worked out once per pebble.
  function faces(p) {
    if (!p.F) p.F = D.FACES.map((ids) => { const c = centroid(ids.map((i) => p.V[i])); return { ids, c, n: norm(sub(c, p.c)) }; });
    return p.F;
  }

  class View {
    // islands: [{ pebbles(), material, offset: [x,0,z], born: [] }]
    constructor(canvas, o) {
      Object.assign(this, { canvas, ctx: canvas.getContext('2d'), band: [0.2, 0.92], pad: 1.3, minimum: 7, interactive: false, sky: 0, phase: 0 }, o);
      this.cam = { yaw: FILM_YAW, pitch: FILM_PITCH, scale: 7, target: [0, 1, 0] };
      this.goal = { ...this.cam };
      this.spin = 0; this.w = 1; this.h = 1; this.hits = []; this.isles = [];
      new ResizeObserver(() => this.resize()).observe(canvas);
      this.resize();
      if (this.interactive) this.attach();
    }
    resize() {
      const r = this.canvas.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1);
      if (!r.width || !r.height) return;
      this.w = r.width; this.h = r.height; this.dpr = dpr;
      this.canvas.width = Math.round(r.width * dpr); this.canvas.height = Math.round(r.height * dpr);
      this.fit(false);
    }
    setIslands(isles) { this.isles = isles; isles.forEach((i) => this.buildIsland(i)); this.fit(false); }
    buildIsland(isle) {
      const ps = isle.frame || isle.pebbles();
      const ground = ps.filter((p) => p.c[1] < 2.5);
      let center = [0, 0, 0];
      if (ground.length) { const c = centroid(ground.map((p) => p.c)); center = [c[0], 0, c[2]]; }
      const reach = Math.max(0, ...ground.map((p) => Math.hypot(p.c[0] - center[0], p.c[2] - center[2])));
      const radius = Math.max(3.4, reach + 2);
      if (isle.radius && Math.abs(isle.radius - radius) < 0.01 && dist(isle.center, center) < 1e-6) return;
      Object.assign(isle, { center, radius, polys: islandPolys(radius, MATERIALS[isle.material].island) });
    }
    pose(c = this.cam) {
      const eye = [Math.sin(c.yaw) * Math.cos(c.pitch), Math.sin(c.pitch), Math.cos(c.yaw) * Math.cos(c.pitch)], right = [Math.cos(c.yaw), 0, -Math.sin(c.yaw)];
      return { eye, right, up: cross(eye, right) };
    }
    // Centres the content in the band and sizes the view to hold it from the goal angle (Viewpoint.refit).
    fit(animated = true) {
      const pts = [];
      let pad = this.pad, minimum = this.minimum;
      for (const isle of this.isles) {
        const o = isle.offset || [0, 0, 0], ps = isle.frame || isle.pebbles();
        if (this.placing && ps.length) { ps.forEach((p) => pts.push(add(p.c, o))); pad = 1.4; minimum = 3.2; continue; }
        ps.forEach((p) => pts.push(add(p.c, o)));
        const c = add(isle.center, o);
        for (let s = 0; s < 16; s++) { const a = s / 16 * 2 * Math.PI; pts.push(add(c, [Math.cos(a) * isle.radius, 0, Math.sin(a) * isle.radius])); }
        pts.push(add(c, [0, -isle.radius * 0.9, 0]));
        if (!ps.length) pts.push(add(c, [0, 2.4, 0]));
      }
      if (!pts.length) return;
      const { right, up } = this.pose(this.goal);
      const lo = pts.reduce((a, p) => a.map((v, i) => Math.min(v, p[i]))), hi = pts.reduce((a, p) => a.map((v, i) => Math.max(v, p[i])));
      const pivot = mul(add(lo, hi), 0.5);
      const halfH = Math.max(...pts.map((p) => Math.abs(dot(sub(p, pivot), up)))) + pad;
      const halfW = Math.max(...pts.map((p) => Math.abs(dot(sub(p, pivot), right)))) + pad;
      const span = this.band[1] - this.band[0];
      const scale = Math.max(halfH / span, halfW * this.h / (0.86 * this.w), minimum);
      const lift = ((this.band[0] + this.band[1]) / 2 - 0.5) * 2 * scale;
      this.goal.scale = scale; this.goal.target = add(pivot, mul(up, lift));
      if (!animated || reduce) { this.cam.scale = scale; this.cam.target = this.goal.target; }
    }
    reset() {
      this.goal.yaw = this.cam.yaw - remainder(this.cam.yaw - FILM_YAW); this.goal.pitch = FILM_PITCH; this.spin = 0;
      this.fit(true);
    }
    step(dt) {
      if (this.spin) { this.cam.yaw += this.spin * dt; this.goal.yaw = this.cam.yaw; this.spin *= Math.exp(-3.2 * dt); if (Math.abs(this.spin) < 0.05) this.spin = 0; }
      const k = reduce ? 1 : 1 - Math.exp(-dt * 7);
      const c = this.cam, g = this.goal;
      c.yaw += (g.yaw - c.yaw) * k; c.pitch += (g.pitch - c.pitch) * k; c.scale += (g.scale - c.scale) * k;
      c.target = add(c.target, mul(sub(g.target, c.target), k));
    }
    draw(t) {
      const { ctx, w, h, dpr } = this;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      if (this.sky) drawSky(ctx, w, h, reduce ? 0 : t, this.sky);
      const { eye, right, up } = this.pose(), kk = h / (2 * this.cam.scale), tg = this.cam.target;
      const bob = reduce ? 0 : 0.07 - 0.07 * Math.cos(2 * Math.PI * (t + this.phase) / 5);
      const proj = (p, o) => { const d = sub(add(p, o), tg); return [w / 2 + dot(d, right) * kk, h / 2 - (dot(d, up) + bob) * kk]; };
      const poly = (pts, o) => { ctx.beginPath(); pts.forEach((p, i) => { const q = proj(p, o); i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); }); ctx.closePath(); };
      const lw = Math.max(0.6, Math.min(1.3, kk * 0.035));
      ctx.lineJoin = 'round';
      this.hits = [];
      const pulse = reduce ? 1 : 0.725 + 0.275 * Math.cos(2 * Math.PI * t / 1.6);
      // Far islands first.
      const order = this.isles.map((isle, i) => [dot(isle.offset || [0, 0, 0], eye), i]).sort((a, b) => a[0] - b[0]).map((p) => this.isles[p[1]]);
      for (const isle of order) {
        const o = add(isle.offset || [0, 0, 0], isle.center), mat = MATERIALS[isle.material];
        const under = isle.polys.under.map((q) => [dot(centroid(q.pts), eye), q]).sort((a, b) => a[0] - b[0]);
        for (const [, q] of under) { poly(q.pts, o); ctx.fillStyle = rgba(q.col); ctx.fill(); ctx.strokeStyle = rgba(q.col); ctx.lineWidth = 0.6; ctx.stroke(); }
        for (const q of isle.polys.top) { poly(q.pts, o); ctx.fillStyle = rgba(q.col); ctx.fill(); }
        const po = isle.offset || [0, 0, 0], ps = isle.pebbles();
        const open = this.placing && isle.sculpture ? isle.sculpture.openFaces() : [];
        // On the bare island the marker previews the pebble about to land.
        if (this.placing && isle.sculpture && !ps.length) {
          const ring = D.FACES[D.BOTTOM].map((i) => add(D.V[i], [0, 0.02, 0]));
          poly(ring, po); ctx.fillStyle = rgba(mix(P.ground, 0.85, mat.tint), pulse); ctx.fill();
          ctx.strokeStyle = rgba(mat.tint, pulse); ctx.lineWidth = 1.6; ctx.stroke();
          this.hits.push({ kind: 'mark', ref: { pebble: -1, face: D.BOTTOM }, pts: ring.map((p) => proj(p, po)) });
        }
        const openBy = new Map(); open.forEach((r) => { if (!openBy.has(r.pebble)) openBy.set(r.pebble, []); openBy.get(r.pebble).push(r.face); });
        const stroke = rgba(mix(P.second, 0.3, mat.tint));
        const idx = ps.map((p, i) => [dot(p.c, eye), i]).sort((a, b) => a[0] - b[0]);
        for (const [, i] of idx) {
          const p = ps[i];
          let o = po, alpha = 1;
          const born = isle.born && isle.born[i];
          if (born != null && !reduce) {
            const q = Math.min(1, (t - born) / 0.42);
            if (q < 0) continue;
            o = add(po, [0, 1.4 * Math.pow(1 - q, 3), 0]); alpha = Math.min(1, q / 0.4);
          }
          ctx.globalAlpha = alpha;
          const F = faces(p);
          for (let f = 0; f < 12; f++) {
            const { ids, n } = F[f];
            if (dot(n, eye) <= 0.02) continue;
            const pts = ids.map((j) => p.V[j]);
            poly(pts, o);
            ctx.fillStyle = rgba(shade(mat.tint, Math.max(0, dot(n, LIGHT)))); ctx.fill();
            ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke();
            if (isle.sculpture) this.hits.push({ kind: 'face', ref: { pebble: i, face: f }, pts: pts.map((q) => proj(q, o)) });
          }
          const marks = openBy.get(i);
          if (marks) for (const f of marks) {
            const { ids, n, c } = F[f];
            if (dot(n, eye) <= 0.02) continue;
            const ring = ids.map((j) => add(add(c, mul(sub(p.V[j], c), 0.78)), mul(n, 0.015)));
            poly(ring, o); ctx.fillStyle = rgba(mix(P.ground, 0.85, mat.mark), pulse); ctx.fill();
            ctx.strokeStyle = rgba(mat.mark, pulse); ctx.lineWidth = 1.6; ctx.stroke();
            this.hits.push({ kind: 'mark', ref: { pebble: i, face: f }, pts: ring.map((q) => proj(q, o)) });
          }
          ctx.globalAlpha = 1;
        }
      }
    }
    // The open face under a point: a marker, an open pebble face, or the nearest marker within 44pt.
    hitTest(x, y) {
      for (let i = this.hits.length - 1; i >= 0; i--) {
        const h = this.hits[i];
        if (!inside(h.pts, x, y)) continue;
        if (h.kind === 'mark') return h.ref;
        if (this.isles[0].sculpture.open.has(h.ref.pebble * 12 + h.ref.face)) return h.ref;
        break;
      }
      let best = null, bd = 44;
      for (const h of this.hits) if (h.kind === 'mark') { const c = centroid(h.pts.map((p) => [p[0], p[1], 0])), d = Math.hypot(c[0] - x, c[1] - y); if (d < bd) { bd = d; best = h.ref; } }
      return best;
    }
    attach() {
      const el = this.canvas;
      let down = null, last = null, vel = 0, lastTap = 0;
      el.addEventListener('pointerdown', (e) => {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        down = { x: e.clientX, y: e.clientY, moved: false }; last = { x: e.clientX, y: e.clientY, t: performance.now() }; vel = 0; this.spin = 0;
        el.setPointerCapture(e.pointerId);
      });
      el.addEventListener('pointermove', (e) => {
        if (!down) return;
        const dx = e.clientX - last.x, dy = e.clientY - last.y, now = performance.now();
        if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) down.moved = true;
        if (!down.moved) return;
        this.cam.yaw -= dx * TURN; this.goal.yaw = this.cam.yaw;
        if (this.placing || e.pointerType === 'mouse') { this.cam.pitch = Math.min(1.3, Math.max(0.05, this.cam.pitch + dy * TURN)); this.goal.pitch = this.cam.pitch; }
        vel = dx / Math.max(1, now - last.t) * 1000; last = { x: e.clientX, y: e.clientY, t: now };
      });
      const up = (e) => {
        if (!down) return;
        const r = el.getBoundingClientRect();
        if (down.moved) { if (!reduce && performance.now() - last.t < 80) { this.spin = Math.max(-14, Math.min(14, -vel * TURN)); if (Math.abs(this.spin) <= 0.3) this.spin = 0; } }
        else if (this.placing) { const ref = this.hitTest(e.clientX - r.left, e.clientY - r.top); if (ref && this.onPlace) this.onPlace(ref); }
        else { const now = performance.now(); if (now - lastTap < 320) { this.reset(); lastTap = 0; } else lastTap = now; }
        down = null;
      };
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', () => { down = null; });
    }
  }
  const remainder = (x) => x - 2 * Math.PI * Math.round(x / (2 * Math.PI));
  function inside(pts, x, y) {
    let c = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i], [xj, yj] = pts[j];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c;
    }
    return c;
  }

  // ---------- Animation loop: only views on screen draw ----------
  const live = new Set(), visible = new WeakSet();
  const io = new IntersectionObserver((es) => es.forEach((e) => e.isIntersecting ? visible.add(e.target) : visible.delete(e.target)), { rootMargin: '100px' });
  function track(thing) { live.add(thing); io.observe(thing.canvas); return thing; }
  let prev = performance.now();
  function frame(now) {
    const dt = Math.min(1 / 20, (now - prev) / 1000), t = now / 1000; prev = now;
    for (const v of live) if (visible.has(v.canvas)) { v.step && v.step(dt); v.draw(t); }
    requestAnimationFrame(frame);
  }

  // Sky bands behind sections.
  document.querySelectorAll('canvas.air').forEach((canvas) => {
    const seed = +canvas.dataset.sky;
    const sky = { canvas, ctx: canvas.getContext('2d'), w: 1, h: 1,
      resize() { const r = canvas.getBoundingClientRect(), d = Math.min(2, devicePixelRatio || 1); this.w = r.width; this.h = r.height; this.d = d; canvas.width = Math.round(r.width * d); canvas.height = Math.round(r.height * d); },
      draw(t) { this.ctx.setTransform(this.d, 0, 0, this.d, 0, 0); this.ctx.clearRect(0, 0, this.w, this.h); this.ctx.globalAlpha = 0.55; drawSky(this.ctx, this.w, this.h, reduce ? 0 : t, seed, false); } };
    new ResizeObserver(() => sky.resize()).observe(canvas); sky.resize();
    track(sky);
  });

  // ---------- Hero: a waving figure, counting up ----------
  const heroDice = fig('person');
  const heroIsle = { material: 'brass', frame: heroDice, born: [], shown: reduce ? heroDice.length : 0, pebbles() { return heroDice.slice(0, this.shown); } };
  const hero = track(new View(document.getElementById('hero-canvas'), { interactive: true, band: [0.16, 0.95], phase: 0 }));
  hero.setIslands([heroIsle]);
  const dayEl = document.getElementById('hero-day');
  dayEl.textContent = String(heroDice.length);
  if (!reduce) {
    const start = performance.now() / 1000 + 0.4;
    dayEl.textContent = '1';
    const tickHero = () => {
      const t = performance.now() / 1000, p = Math.min(1, Math.max(0, (t - start) / 4.2));
      const n = Math.max(1, Math.round(1 + (heroDice.length - 1) * (0.45 * p + 0.55 * p * p)));
      while (heroIsle.shown < n) { heroIsle.born[heroIsle.shown] = t; heroIsle.shown++; }
      dayEl.textContent = String(heroIsle.shown);
      if (heroIsle.shown < heroDice.length) requestAnimationFrame(tickHero);
    };
    requestAnimationFrame(tickHero);
  }

  // ---------- Beats: one practice on day 1, 12 and 42 ----------
  document.querySelectorAll('canvas[data-beat]').forEach((canvas, i) => {
    const tree = fig('tree'), n = canvas.dataset.beat === 'all' ? tree.length : +canvas.dataset.beat, dice = tree.slice(0, n);
    const day = canvas.closest('.beat').querySelector('.kicker');
    // The cards mark time only: the day as the heading, its pebbles above it (one a day).
    day.textContent = n === 1 ? '1 pebble' : n + ' pebbles';
    canvas.closest('.beat').querySelector('h3').textContent = 'Day ' + n;
    const v = track(new View(canvas, { band: [0.08, 0.97], pad: 1.2, phase: i * 1.7 }));
    // Every card is framed to the day-42 sculpture, so the three read at one scale.
    v.setIslands([{ material: 'brass', frame: tree, pebbles: () => dice }]);
  });

  // ---------- End card: three practices, three islands ----------
  const endIsles = [
    { material: 'brass', dice: fig('tree'), offset: [-17, 0, 6] },
    { material: 'dusk', dice: fig('heart'), offset: [0, 0, -2] },
    { material: 'lake', dice: fig('house'), offset: [15, 0, -10] },
  ].map((s) => ({ ...s, pebbles() { return s.dice; } }));
  const end = track(new View(document.getElementById('end-canvas'), { band: [0.1, 0.97], interactive: true, phase: 2 }));
  end.setIslands(endIsles);

  // ---------- Playground: the practice page ----------
  const practices = [
    { name: 'Read every day', material: 'lake', seed: 5, start: 3 },
  ].map((p) => ({ ...p, sculpture: new Sculpture().grow(p.start, p.seed), born: [] }));

  const phone = document.getElementById('phone');
  const $ = (id) => document.getElementById(id);
  const play = track(new View($('play-canvas'), { interactive: true, band: [0.36, 0.86], sky: 4, phase: 1 }));
  let current = 0, placing = false, undoable = false;

  function isleFor(p) { return { material: p.material, sculpture: p.sculpture, born: p.born, pebbles: () => p.sculpture.pebbles }; }
  function count(n) { return n === 0 ? 'No pebbles yet' : n === 1 ? '1 pebble' : n.toLocaleString() + ' pebbles'; }

  function render() {
    const p = practices[current], n = p.sculpture.pebbles.length;
    $('pp-name').textContent = p.name;
    $('pp-count').textContent = count(n);
    $('pp-remove').disabled = n === 0;
    phone.toggleAttribute('data-placing', placing);
    const foot = $('pp-foot');
    foot.innerHTML = '';
    if (placing) {
      const hint = document.createElement('p'); hint.className = 'pp-hint';
      hint.textContent = n === 0 ? 'Tap the island to set your first pebble' : 'Tap a glowing face. Drag to turn.';
      const cancel = document.createElement('button'); cancel.className = 'quiet'; cancel.textContent = 'Cancel';
      cancel.onclick = () => setPlacing(false);
      foot.append(hint, cancel);
    } else {
      if (undoable) { const u = document.createElement('button'); u.className = 'quiet'; u.textContent = 'Undo last pebble'; u.onclick = undo; foot.append(u); }
      const b = document.createElement('button'); b.className = 'primary'; b.id = 'place-pebble';
      b.textContent = n === 0 ? 'Place your first pebble' : 'Place a pebble';
      b.onclick = () => { undoable = false; setPlacing(true); };
      foot.append(b);
    }
  }
  function setPlacing(on) {
    placing = on; play.placing = on; closeMenu();
    if (on) play.fit(true); else play.reset();
    render();
  }
  function rebuild() { const p = practices[current]; play.setIslands([isleFor(p)]); play.isles[0].radius = 0; play.buildIsland(play.isles[0]); }
  function place(ref) {
    const p = practices[current];
    const idx = ref.pebble < 0 ? p.sculpture.place(null, D.BOTTOM) : p.sculpture.place(ref.pebble, ref.face);
    if (idx == null) return;
    p.born[idx] = performance.now() / 1000;
    play.buildIsland(play.isles[0]);
    undoable = true;
    if (navigator.vibrate) try { navigator.vibrate(12); } catch (e) {}
    setPlacing(false);
  }
  function undo() {
    const p = practices[current];
    if (!p.sculpture.placements.length) return;
    p.sculpture = new Sculpture(p.sculpture.placements.slice(0, -1));
    p.born.length = p.sculpture.pebbles.length;
    undoable = false; closeMenu();
    rebuild(); play.fit(true); render();
  }
  play.onPlace = place;


  const menuBtn = $('pp-menu'), pop = $('pp-pop');
  function closeMenu() { pop.hidden = true; menuBtn.setAttribute('aria-expanded', 'false'); }
  menuBtn.onclick = (e) => { e.stopPropagation(); pop.hidden = !pop.hidden; menuBtn.setAttribute('aria-expanded', String(!pop.hidden)); };
  document.addEventListener('click', (e) => { if (!pop.hidden && !pop.contains(e.target)) closeMenu(); });
  $('pp-remove').onclick = undo;
  $('pp-reset').onclick = () => { const p = practices[current]; p.sculpture = new Sculpture(); p.born = []; undoable = false; closeMenu(); rebuild(); play.fit(true); render(); };

  rebuild(); render();

  // ---------- Download links: inert until the store listings are live; add their URLs to the badges then ----------
  document.querySelectorAll('a[data-store]').forEach((a) => a.addEventListener('click', (e) => e.preventDefault()));

  requestAnimationFrame(frame);
})();
