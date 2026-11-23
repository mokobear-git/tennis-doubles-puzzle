/* 軌道計算 + コート描画エンジン (依存なし) */
(function (global) {
  'use strict';
  const NY = 11.885, CW = 10.97, CL = 23.77;
  const SLOW = 2.4; // スロー倍率 (実時間 → 表示時間)

  // 球種テーブル: v=平均球速km/h, d=減速度, A=山なり量(m), h0=打点高さ, r2=バウンド後の速度比, A2=バウンド後の跳ね高さ
  const TYPES = {
    serve:      { n: 'フラットサーブ', note: '速い・低い弾道',       c: '#ffd23f', v: 145, d: .22, A: .5,  h0: 2.6, r2: .55, A2: .5,  spin: 0.5 },
    drive:      { n: 'フラット',       note: '直線的で速い',         c: '#ff9f43', v: 105, d: .22, A: 1.0, h0: .95, r2: .62, A2: .6,  spin: 0.6 },
    topspin:    { n: 'トップスピン',   note: '山なり・高く弾む',     c: '#ff6b6b', v: 82,  d: .18, A: 1.9, h0: .95, r2: .62, A2: 1.2, spin: 3 },
    slice:      { n: 'スライス',       note: '低く滑る・失速',       c: '#4dd0e1', v: 60,  d: .30, A: .75, h0: .95, r2: .78, A2: .10, spin: -3 },
    lob:        { n: 'ロブ',           note: '高く遅い',             c: '#b388ff', v: 40,  d: .08, A: 5.0, h0: .8,  r2: .45, A2: 1.8, spin: 1 },
    volley:     { n: 'ボレー',         note: 'ノーバウンドで返す',   c: '#69f0ae', v: 88,  d: .20, A: .35, h0: 1.1, r2: .60, A2: .5,  spin: -1.5 },
    dropvolley: { n: 'ドロップボレー', note: '勢いを殺して落とす',   c: '#f48fb1', v: 26,  d: .35, A: .7,  h0: 1.0, r2: .30, A2: .08, spin: -3 },
    drop:       { n: 'ドロップショット', note: 'ネット前に落ちて止まる', c: '#f48fb1', v: 32, d: .35, A: 1.1, h0: .9, r2: .25, A2: .12, spin: -3 },
    smash:      { n: 'スマッシュ',     note: '上から叩きつける',     c: '#ff5252', v: 120, d: .12, A: 0,   h0: 2.7, r2: .70, A2: 1.7, spin: 0.5 },
    halfvolley: { n: 'ハーフボレー',   note: 'バウンド直後を押さえる', c: '#80cbc4', v: 70, d: .25, A: .45, h0: .3, r2: .6, A2: .4, spin: -1 },
    floater:    { n: 'ゆるい球',       note: 'ふわっと浮いた甘い球', c: '#cfd8dc', v: 50,  d: .10, A: 2.6, h0: .95, r2: .50, A2: 1.2, spin: 1 }
  };

  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = t => t * t * (3 - 2 * t);

  /** state: {pos:{id:[x,y]}, eh} から events を順に再生するタイムラインを作る */
  function compile(state, events) {
    const pos = {};
    Object.keys(state.pos).forEach(k => pos[k] = state.pos[k].slice());
    const startPos = JSON.parse(JSON.stringify(pos));
    let t = 0, eh = state.eh == null ? null : state.eh;
    const pieces = [], moves = {}, evs = [];
    const addMove = (id, t0, t1, to) => {
      (moves[id] = moves[id] || []).push({ t0, t1, a: pos[id].slice(), b: to.slice() });
      pos[id] = to.slice();
    };

    events.forEach((ev, idx) => {
      const ty = TYPES[ev.type];
      const p0 = pos[ev.by].slice();
      const h0 = ev.h0 != null ? ev.h0 : (eh != null ? eh : ty.h0);
      const v = ev.v || ty.v, A = ev.A != null ? ev.A : ty.A;
      const fin = !!ev.fin;
      const ehEnd = ev.eh != null ? ev.eh : (fin ? 0 : .9);
      const tStart = t;
      let e = ev.e ? ev.e.slice() : null;
      if (ev.b) {
        const L = ev.b;
        if (!e) { // 終点省略: 同方向へ延長
          const dx = L[0] - p0[0], dy = L[1] - p0[1];
          const k = ty.r2 * .6;
          e = [L[0] + dx * k, L[1] + dy * k];
        }
        const d1 = dist(p0, L), d2 = dist(L, e);
        const T1 = Math.max(.45, d1 / (v / 3.6) * SLOW);
        const v2 = v * ty.r2;
        const T2 = Math.max(.35, d2 / (v2 / 3.6) * SLOW);
        pieces.push({ t0: t, t1: t + T1, a: p0, b: L, h0, h1: 0, A, d: ty.d, v, ev: idx });
        pieces.push({ t0: t + T1, t1: t + T1 + T2, a: L, b: e, h0: 0, h1: ehEnd, A: ty.A2, d: ty.d, v: v2, ev: idx, post: true });
        t += T1 + T2;
        evs.push({ t0: tStart, tb: tStart + T1, t1: t, ev, ty, by: ev.by, bounce: L, p0 });
      } else {
        if (!e) e = p0.slice();
        const d1 = dist(p0, e);
        const T1 = Math.max(.5, d1 / (v / 3.6) * SLOW);
        pieces.push({ t0: t, t1: t + T1, a: p0, b: e, h0, h1: ehEnd, A, d: ty.d, v, ev: idx });
        t += T1;
        if (ev.net) { // ネットにかかる: その場で落下
          pieces.push({ t0: t, t1: t + .35, a: e, b: [e[0], e[1] + (p0[1] > NY ? .25 : -.25)], h0: ehEnd, h1: 0, A: 0, d: 0, v: 5, ev: idx, post: true });
          t += .35;
        }
        evs.push({ t0: tStart, tb: null, t1: t, ev, ty, by: ev.by, bounce: null, p0 });
      }
      // 選手の動き
      const dur = t - tStart;
      const mv = Object.assign({}, ev.mv || {});
      if (ev.nx) mv[ev.nx] = e;
      Object.keys(mv).forEach(id => addMove(id, tStart, tStart + dur, mv[id]));
      eh = ev.net ? 0 : ehEnd;
    });
    const last = pieces[pieces.length - 1];
    return { pieces, moves, evs, duration: t, startPos, end: { pos, eh }, endBall: last ? { x: last.b[0], y: last.b[1], h: last.h1 } : null, startBall: state.ball || null };
  }

  function ballAt(tl, t) {
    const ps = tl.pieces;
    if (!ps.length) return null;
    let p = ps[0];
    if (t >= tl.duration) { p = ps[ps.length - 1]; t = p.t1; }
    else for (let i = 0; i < ps.length; i++) if (t >= ps[i].t0 && t < ps[i].t1) { p = ps[i]; break; }
    const u = Math.min(1, Math.max(0, (t - p.t0) / (p.t1 - p.t0)));
    const s = u + p.d * u * (1 - u);
    const h = lerp(p.h0, p.h1, u) + 4 * p.A * u * (1 - u);
    const sp = p.v * (1 + p.d * (1 - 2 * u));
    return { x: lerp(p.a[0], p.b[0], s), y: lerp(p.a[1], p.b[1], s), h: Math.max(0, h), speed: sp, ev: p.ev, post: !!p.post, u };
  }

  function playerAt(tl, id, t) {
    const ms = tl.moves[id];
    let cur = tl.startPos[id];
    if (!ms) return cur;
    for (const m of ms) {
      if (t < m.t0) return m.a;
      if (t <= m.t1) { const k = ease((t - m.t0) / (m.t1 - m.t0 || 1)); return [lerp(m.a[0], m.b[0], k), lerp(m.a[1], m.b[1], k)]; }
      cur = m.b;
    }
    return cur;
  }

  /** イベント1つ分の軌道サンプル (サイドビュー/軌跡用) */
  function sampleEvent(tl, evIdx, n) {
    const e = tl.evs[evIdx]; const out = []; let cum = 0, prev = null;
    for (let i = 0; i <= n; i++) {
      const t = e.t0 + (e.t1 - e.t0) * i / n;
      const b = ballAt(tl, Math.min(t, tl.duration - 1e-6));
      if (prev) cum += Math.hypot(b.x - prev.x, b.y - prev.y);
      out.push({ x: b.x, y: b.y, h: b.h, d: cum, t });
      prev = b;
    }
    return out;
  }

  /* ===== 描画 ===== */
  const COL = { me: '#ffc43d', pt: '#5cc8ff', o1: '#ff7a7a', o2: '#ff7a7a' };
  const LABEL = { me: 'あなた', pt: '味方', o1: '相手A', o2: '相手B' };

  function Stage(canvas, side) {
    this.cv = canvas; this.ctx = canvas.getContext('2d');
    this.side = side; this.sctx = side.getContext('2d');
    this.mx0 = -1.4; this.mx1 = CW + 1.4; this.my0 = -3.2; this.my1 = CL + 3.0;
    this.resize();
  }
  Stage.prototype.resize = function () {
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    [this.cv, this.side].forEach(c => {
      const r = c.getBoundingClientRect();
      c.width = Math.max(10, Math.round(r.width * dpr)); c.height = Math.max(10, Math.round(r.height * dpr));
      c._w = r.width; c._h = r.height; c._dpr = dpr;
    });
    const w = this.cv._w, h = this.cv._h;
    this.k = Math.min(w / (this.mx1 - this.mx0), h / (this.my1 - this.my0));
    this.ox = (w - this.k * (this.mx1 - this.mx0)) / 2 - this.k * this.mx0;
    this.oy = (h - this.k * (this.my1 - this.my0)) / 2 - this.k * this.my0;
  };
  Stage.prototype.X = function (x) { return this.ox + x * this.k; };
  Stage.prototype.Y = function (y) { return this.oy + y * this.k; };

  Stage.prototype.drawCourt = function (g) {
    const X = x => this.X(x), Y = y => this.Y(y), k = this.k;
    g.fillStyle = '#1d4d3a'; g.fillRect(0, 0, this.cv._w, this.cv._h);
    g.fillStyle = '#2a6aa3'; g.fillRect(X(-1.4), Y(-3.2), (CW + 2.8) * k, (CL + 6.4) * k);
    g.fillStyle = '#3479b8'; g.fillRect(X(0), Y(0), CW * k, CL * k);
    g.strokeStyle = '#f4f7fb'; g.lineWidth = Math.max(1.2, k * .09); g.lineCap = 'butt';
    const L = (x0, y0, x1, y1) => { g.beginPath(); g.moveTo(X(x0), Y(y0)); g.lineTo(X(x1), Y(y1)); g.stroke(); };
    g.strokeRect(X(0), Y(0), CW * k, CL * k);
    L(1.37, 0, 1.37, CL); L(CW - 1.37, 0, CW - 1.37, CL);
    L(1.37, NY - 6.4, CW - 1.37, NY - 6.4); L(1.37, NY + 6.4, CW - 1.37, NY + 6.4);
    L(CW / 2, NY - 6.4, CW / 2, NY + 6.4);
    L(CW / 2, 0, CW / 2, .25); L(CW / 2, CL, CW / 2, CL - .25);
    // ネット
    g.strokeStyle = '#e8eef5'; g.lineWidth = Math.max(2.5, k * .22);
    L(-.5, NY, CW + .5, NY);
    g.fillStyle = '#1b2b3a'; [-.5, CW + .5].forEach(x => { g.beginPath(); g.arc(X(x), Y(NY), k * .3, 0, 7); g.fill(); });
  };

  Stage.prototype.render = function (tl, t, opt) {
    opt = opt || {};
    const g = this.ctx; g.setTransform(this.cv._dpr, 0, 0, this.cv._dpr, 0, 0);
    this.drawCourt(g);
    const k = this.k, hk = k * .85;
    const X = x => this.X(x), Y = y => this.Y(y);
    const ball = tl && tl.pieces.length ? ballAt(tl, t) : null;
    const curEv = ball ? ball.ev : -1;

    // 軌跡
    if (tl && tl.pieces.length) {
      tl.evs.forEach((e, i) => {
        if (i > curEv) return;
        const smp = sampleEvent(tl, i, 48);
        const active = i === curEv;
        g.save();
        g.strokeStyle = e.ty.c; g.globalAlpha = active ? .55 : .22; g.lineWidth = Math.max(1.5, k * .1);
        g.setLineDash([k * .25, k * .3]);
        // 影(地面)の線
        g.beginPath(); smp.forEach((s, j) => { if (active && s.t > t) return; j ? g.lineTo(X(s.x), Y(s.y)) : g.moveTo(X(s.x), Y(s.y)); }); g.stroke();
        g.restore();
        // 実際のボール軌道(高さ込み)
        g.save(); g.strokeStyle = e.ty.c; g.globalAlpha = active ? .9 : .35; g.lineWidth = Math.max(1.5, k * .12);
        g.beginPath(); let started = false;
        smp.forEach(s => { if (active && s.t > t) return; const px = X(s.x), py = Y(s.y) - s.h * hk; if (!started) { g.moveTo(px, py); started = true; } else g.lineTo(px, py); });
        g.stroke(); g.restore();
        // バウンドマーク
        if (e.bounce && (!active || t >= e.tb)) {
          g.save(); g.strokeStyle = '#fff'; g.globalAlpha = active ? .9 : .4; g.lineWidth = 1.5;
          g.beginPath(); g.ellipse(X(e.bounce[0]), Y(e.bounce[1]), k * .45, k * .28, 0, 0, 7); g.stroke(); g.restore();
        }
      });
      // 等時間間隔のドット(間隔が球速を表す)
      if (curEv >= 0) {
        const e = tl.evs[curEv]; const dt = .075;
        for (let tt = Math.min(t, e.t1) - dt; tt >= e.t0; tt -= dt) {
          const b = ballAt(tl, tt);
          g.fillStyle = e.ty.c; g.globalAlpha = .75;
          g.beginPath(); g.arc(X(b.x), Y(b.y) - b.h * hk, k * .17, 0, 7); g.fill();
        }
        g.globalAlpha = 1;
      }
    }

    // 選手
    ['o1', 'o2', 'pt', 'me'].forEach(id => {
      const p = tl ? playerAt(tl, id, t) : opt.pos[id];
      this.drawPlayer(g, id, X(p[0]), Y(p[1]), id === 'me' && opt.ring);
    });

    // スイングの波紋
    if (tl && curEv >= 0) {
      const e = tl.evs[curEv]; const dt = t - e.t0;
      if (dt >= 0 && dt < .35) {
        const q = playerAt(tl, e.by, e.t0);
        g.strokeStyle = '#fff'; g.globalAlpha = 1 - dt / .35; g.lineWidth = 2;
        g.beginPath(); g.arc(X(q[0]), Y(q[1]), k * (.8 + dt * 4), 0, 7); g.stroke(); g.globalAlpha = 1;
      }
    }

    // ボール
    let b = ball;
    if (!b && opt.ball) b = { x: opt.ball.x, y: opt.ball.y, h: opt.ball.h, speed: 0, ev: -1 };
    if (b) {
      const px = X(b.x), py = Y(b.y), r = k * (.34 + b.h * .035);
      g.fillStyle = 'rgba(0,0,0,' + Math.max(.15, .5 - b.h * .08) + ')';
      g.beginPath(); g.ellipse(px, py, k * .38, k * .24, 0, 0, 7); g.fill();
      const by = py - b.h * hk;
      if (b.h > .3) { g.strokeStyle = 'rgba(255,255,255,.25)'; g.lineWidth = 1; g.beginPath(); g.moveTo(px, py); g.lineTo(px, by); g.stroke(); }
      const ty = curEv >= 0 ? tl.evs[curEv].ty : null;
      const ang = ty ? t * ty.spin * 4 : 0;
      g.save(); g.translate(px, by); g.rotate(ang);
      g.fillStyle = '#d8f23a'; g.beginPath(); g.arc(0, 0, r, 0, 7); g.fill();
      g.strokeStyle = '#fff'; g.lineWidth = Math.max(1, r * .22);
      g.beginPath(); g.arc(-r * 1.05, 0, r * .85, -.9, .9); g.stroke();
      g.beginPath(); g.arc(r * 1.05, 0, r * .85, Math.PI - .9, Math.PI + .9); g.stroke();
      g.strokeStyle = 'rgba(0,0,0,.45)'; g.lineWidth = 1; g.beginPath(); g.arc(0, 0, r, 0, 7); g.stroke();
      g.restore();
    }
    this.drawSide(tl, t, ball);
    return ball;
  };

  Stage.prototype.drawPlayer = function (g, id, x, y, ring) {
    const k = this.k, r = k * .75;
    if (ring) {
      const pulse = 1 + .12 * Math.sin(performance.now() / 180);
      g.strokeStyle = 'rgba(255,196,61,.9)'; g.lineWidth = 3;
      g.beginPath(); g.arc(x, y, r * 1.55 * pulse, 0, 7); g.stroke();
    }
    g.fillStyle = 'rgba(0,0,0,.3)'; g.beginPath(); g.ellipse(x + 2, y + 3, r, r * .6, 0, 0, 7); g.fill();
    g.fillStyle = COL[id]; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
    g.strokeStyle = id === 'me' ? '#fff' : 'rgba(0,0,0,.45)'; g.lineWidth = id === 'me' ? 2.5 : 1.5; g.stroke();
    g.fillStyle = '#10202e'; g.font = 'bold ' + Math.max(9, r * .95) + 'px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(id === 'me' ? '私' : id === 'pt' ? '味' : id === 'o1' ? 'A' : 'B', x, y + 1);
    g.fillStyle = '#fff'; g.font = 'bold ' + Math.max(9, k * .72) + 'px sans-serif'; g.textBaseline = 'alphabetic';
    g.lineWidth = 3; g.strokeStyle = 'rgba(0,20,40,.8)';
    g.strokeText(LABEL[id], x, y - r - 4); g.fillText(LABEL[id], x, y - r - 4);
  };

  /** サイドビュー: 横=進行距離, 縦=高さ。ネットの高さと弾道の違いが見える */
  Stage.prototype.drawSide = function (tl, t, ball) {
    const c = this.side, g = this.sctx, W = c._w, H = c._h;
    g.setTransform(c._dpr, 0, 0, c._dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    g.fillStyle = 'rgba(255,255,255,.06)'; g.fillRect(0, 0, W, H);
    g.fillStyle = 'rgba(255,255,255,.5)'; g.font = '10px sans-serif'; g.textAlign = 'left'; g.fillText('横から見た弾道', 4, 11);
    if (!tl || !tl.evs.length || !ball) return;
    const i = Math.max(0, ball.ev), e = tl.evs[i];
    const smp = sampleEvent(tl, i, 60);
    const total = 26; // 横軸は固定スケール(26m)。短い球は短く、長い球は長く描かれる
    const hmax = 6.2; // 縦軸も固定(ロブの高さまで入る)
    const px = 8, py = H - 8, w = W - 16, hh = H - 22;
    const SX = d => px + d / total * w, SY = h => py - h / hmax * hh;
    g.strokeStyle = 'rgba(255,255,255,.4)'; g.lineWidth = 1; g.beginPath(); g.moveTo(px, py); g.lineTo(px + w, py); g.stroke();
    // ネット
    for (let j = 1; j < smp.length; j++) {
      const a = smp[j - 1].y - NY, b2 = smp[j].y - NY;
      if (a * b2 <= 0 && a !== b2) {
        const f = a / (a - b2), d = lerp(smp[j - 1].d, smp[j].d, f);
        g.strokeStyle = '#fff'; g.lineWidth = 2; g.beginPath(); g.moveTo(SX(d), py); g.lineTo(SX(d), SY(.914)); g.stroke();
        g.fillStyle = '#fff'; g.font = '9px sans-serif'; g.textAlign = 'center'; g.fillText('ネット', SX(d), SY(.914) - 3);
        break;
      }
    }
    g.strokeStyle = e.ty.c; g.lineWidth = 2; g.beginPath();
    smp.forEach((s, j) => { j ? g.lineTo(SX(s.d), SY(s.h)) : g.moveTo(SX(s.d), SY(s.h)); }); g.stroke();
    // 到達距離(落点・終点までの水平距離)
    const L = smp[smp.length - 1].d;
    g.strokeStyle = e.ty.c; g.lineWidth = 1; g.beginPath(); g.moveTo(SX(L), py - 3); g.lineTo(SX(L), py + 3); g.stroke();
    g.fillStyle = 'rgba(255,255,255,.75)'; g.font = '9px sans-serif'; g.textAlign = 'right'; g.fillText(Math.round(L) + 'm', W - 4, 11);
    // 現在位置
    let cd = 0; for (let j = 0; j < smp.length; j++) { if (smp[j].t <= Math.min(t, e.t1)) cd = smp[j].d; }
    g.fillStyle = '#d8f23a'; g.beginPath(); g.arc(SX(cd), SY(ball.h), 4, 0, 7); g.fill();
  };

  /** タイムラインを再生する。resolveで完了。 */
  function Runner(stage) { this.stage = stage; this.raf = 0; this.mul = 1; this.skipFlag = false; }
  Runner.prototype.play = function (tl, opts) {
    opts = opts || {};
    const self = this; cancelAnimationFrame(this.raf);
    return new Promise(res => {
      const t0 = performance.now(); let lastEv = -2;
      this.skipFlag = false;
      const loop = () => {
        let t = (performance.now() - t0) / 1000 * self.mul;
        if (self.skipFlag) t = tl.duration;
        const b = self.stage.render(tl, Math.min(t, tl.duration), { ring: false });
        if (b && b.ev !== lastEv) { lastEv = b.ev; opts.onEvent && opts.onEvent(b.ev, tl.evs[b.ev], tl); }
        opts.onFrame && opts.onFrame(b, tl.evs[b ? b.ev : 0]);
        if (t >= tl.duration) { self.raf = 0; res(); return; }
        self.raf = requestAnimationFrame(loop);
      };
      if (!tl.pieces.length) { res(); return; }
      loop();
    });
  };
  Runner.prototype.skip = function () { this.skipFlag = true; };
  Runner.prototype.stop = function () { cancelAnimationFrame(this.raf); this.raf = 0; };

  /** 静止表示(出題時) */
  Stage.prototype.still = function (state, tl, ring) {
    if (tl) { this.render(tl, tl.duration, { ring }); return; }
    this.render(null, 0, { pos: state.pos, ring, ball: null });
  };

  global.TDP = { TYPES, compile, ballAt, Stage, Runner, NY, CW, CL, SLOW, dist };
})(window);
