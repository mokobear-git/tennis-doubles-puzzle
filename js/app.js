/* UI・ゲーム進行 */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const PROBLEMS = window.PROBLEMS;
  const { TYPES, compile, Stage, Runner } = window.TDP;
  const KEY = 'tdp_best_v1';
  const clone = o => JSON.parse(JSON.stringify(o));
  const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const store = {
    get() { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } },
    set(v) { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (e) { /* noop */ } }
  };

  let stage, runner, cur = null, idle = 0, lastTl = null, token = 0;

  /* ---------- ホーム ---------- */
  function renderHome() {
    const best = store.get();
    $('list').innerHTML = PROBLEMS.map((p, i) => {
      const n = p.steps.length, b = best[p.id];
      const score = b == null ? '未挑戦' : '最高 ' + b + '/' + n * 2;
      const stars = '★'.repeat(p.lv) + '☆'.repeat(3 - p.lv);
      return '<button class="card" data-i="' + i + '"><span class="no">' + (i + 1) + '</span><span class="ct"><b>' + esc(p.title) +
        '</b><small>' + esc(p.tag) + '・' + n + '場面</small></span><span class="sc"><i>' + stars + '</i>' + score + '</span></button>';
    }).join('');
    $('legend').innerHTML = Object.keys(TYPES).map(k => '<span class="lg"><i style="background:' + TYPES[k].c + '"></i>' + TYPES[k].n + '</span>').join('');
  }
  $('list').addEventListener('click', e => { const b = e.target.closest('.card'); if (b) startProblem(+b.dataset.i); });

  /* ---------- 画面切替 ---------- */
  function show(which) {
    $('home').hidden = which !== 'home'; $('play').hidden = which !== 'play';
    if (which === 'play') { if (!stage) { stage = new Stage($('court'), $('side')); runner = new Runner(stage); } stage.resize(); redraw(); }
    if (which === 'home') { stopIdle(); runner && runner.stop(); renderHome(); window.scrollTo(0, 0); }
  }
  $('back').onclick = () => { token++; show('home'); };
  window.addEventListener('resize', () => { if (stage && !$('play').hidden) { stage.resize(); redraw(); } });
  const SPEEDS = [0.5, 0.8, 1, 1.5]; let speed = 1;
  $('spd').onclick = () => { speed = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length]; $('spd').textContent = '速度 ×' + speed; if (runner) runner.mul = speed; };

  /* ---------- 描画補助 ---------- */
  function redraw() {
    if (!stage || !cur) return;
    if (lastTl) stage.render(lastTl, lastTl.duration, { ring: cur.asking });
    else stage.render(null, 0, { pos: cur.state.pos, ring: false });
    updateChip(null);
  }
  function startIdle() {
    stopIdle();
    const f = () => { if (cur && cur.asking) { stage.render(lastTl, lastTl.duration, { ring: true }); idle = requestAnimationFrame(f); } };
    idle = requestAnimationFrame(f);
  }
  function stopIdle() { cancelAnimationFrame(idle); idle = 0; }
  function updateChip(b, e) {
    const c = $('chip');
    if (!b || !e) {
      if (lastTl && lastTl.evs.length) { const ev = lastTl.evs[lastTl.evs.length - 1]; c.innerHTML = chipHtml(ev.ty, null); } else c.innerHTML = '<span class="muted">球の情報がここに出ます</span>';
      return;
    }
    c.innerHTML = chipHtml(e.ty, b.speed);
  }
  function chipHtml(ty, sp) {
    return '<span class="dot" style="background:' + ty.c + '"></span><b>' + ty.n + '</b>' + (sp != null ? '<em>' + Math.round(sp / 5) * 5 + ' km/h</em>' : '') + '<small>' + ty.note + '</small>';
  }

  function run(events, opts, state) {
    const tl = compile(state || cur.state, events);
    lastTl = tl; runner.mul = speed;
    $('skip').hidden = false; setRunning(true);
    return runner.play(tl, {
      onEvent: (i, e) => { opts && opts.onEvent && opts.onEvent(e); },
      onFrame: (b, e) => updateChip(b, e)
    }).then(() => { $('skip').hidden = true; setRunning(false); redraw(); return tl; });
  }

  /* 拡大モード：ラリー再生中だけ下の説明欄を細くして、コートを大きく表示する */
  let zoomOn = true;
  try { zoomOn = localStorage.getItem('tdp_zoom') !== '0'; } catch (e) { /* noop */ }
  function applyZoom() { $('play').classList.toggle('zoom', zoomOn); $('zm').textContent = zoomOn ? '🔍 拡大中' : '🔍 拡大'; }
  function setRunning(b) { $('play').classList.toggle('running', b); if (stage) stage.resize(); }
  $('zm').onclick = () => { zoomOn = !zoomOn; try { localStorage.setItem('tdp_zoom', zoomOn ? '1' : '0'); } catch (e) { /* noop */ } applyZoom(); if (stage) { stage.resize(); redraw(); } };
  applyZoom();
  $('skip').onclick = () => runner && runner.skip();

  /* 繝ｩ繝ｪ繝ｼ縺ｮ蜀咲函・域怙蛻昴°繧臥樟蝨ｨ縺ｮ蝣ｴ髱｢縺ｾ縺ｧ・・*/
  async function replay() {
    if (!cur || !cur.hist || cur.busy || !(cur.asking || cur.done)) return;
    const my = token, wasAsking = cur.asking, saved = lastTl;
    cur.busy = true; cur.asking = false; stopIdle();
    await run(cur.hist, null, { pos: clone(cur.p.init), eh: null });
    if (my !== token) return;
    lastTl = saved; cur.busy = false; cur.asking = wasAsking;
    if (wasAsking) startIdle(); else redraw();
  }
  $('rp').onclick = replay;
  (function () { let last = 0, lx = 0, ly = 0; $('stage').addEventListener('pointerup', e => { if (e.target.closest('button')) return; const n = Date.now(); if (n - last < 320 && Math.hypot(e.clientX - lx, e.clientY - ly) < 40) { last = 0; if (cur && cur.intro) begin(); else replay(); } else { last = n; lx = e.clientX; ly = e.clientY; } }); })();

  /* ---------- 進行 ---------- */
  function startProblem(i) {
    token++;
    const p = PROBLEMS[i];
    cur = { pi: i, p, si: 0, state: { pos: clone(p.init), eh: null }, res: [], asking: false, intro: true };
    lastTl = null; $('rp').hidden = true;
    $('ttl').textContent = (i + 1) + '. ' + p.title;
    renderDots();
    show('play');
    setPanel('<div class="pad"><h2>' + esc(p.title) + '</h2><p>' + esc(p.intro) + '</p>' +
      '<p class="muted">全 ' + p.steps.length + ' 場面。サーブ〜ラリーの流れを見て、あなた(黄色の「私」)が打つ直前で止まります。コートをダブルタップしても開始できます。</p>' +
      '<button class="btn primary" id="go">スタート ▶</button></div>');
    $('go').onclick = begin;
  }

  async function begin() {
    if (!cur || !cur.intro) return;
    cur.intro = false;
    const my = token;
    setPanel('<div class="pad cap" id="cap">サーブ…</div>');
    const tl = await run(cur.p.lead, { onEvent: e => setCap(e.ev.say) });
    if (my !== token) return;
    cur.prev = { state: { pos: clone(cur.p.init), eh: null }, events: cur.p.lead }; cur.state = tl.end; cur.hist = cur.p.lead.slice(); $('rp').hidden = false;
    ask();
  }
  function setCap(t) { const c = $('cap'); if (c && t) c.textContent = t; }

  function renderDots() {
    $('dots').innerHTML = cur.p.steps.map((s, i) => {
      const r = cur.res[i]; const cls = r ? 'r' + r.ok : (i === cur.si ? 'now' : '');
      return '<i class="' + cls + '"></i>';
    }).join('');
  }

  function ask() {
    const st = cur.p.steps[cur.si];
    cur.asking = true; renderDots();
    const opts = st.opts.map((o, i) => ({ o, i }));
    for (let i = opts.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [opts[i], opts[j]] = [opts[j], opts[i]]; }
    const L = 'ABCD';
    setPanel('<div class="pad">' + (cur.lastFb ? '<details class="prev"><summary>前の場面の解説を見る</summary>' + cur.lastFb + '</details>' : '') + '<div class="qh">第' + (cur.si + 1) + '場面 / ' + cur.p.steps.length + '</div><p class="q">' + esc(st.q) + '</p><div class="opts">' +
      opts.map((x, k) => '<button class="opt" data-i="' + x.i + '"><b>' + L[k] + '</b>' + esc(x.o.t) + '</button>').join('') + '</div></div>');
    $('panel').querySelectorAll('.opt').forEach(b => b.onclick = () => answer(+b.dataset.i));
    startIdle();
  }

  async function answer(oi) {
    if (!cur.asking) return;
    const my = token;
    const st = cur.p.steps[cur.si], o = st.opts[oi];
    cur.asking = false; stopIdle();
    const best = st.opts.find(x => x.ok === 2);
    cur.res[cur.si] = { ok: o.ok, mine: o.t, best: best.t };
    renderDots();
    const icon = o.ok === 2 ? '◎ ベストの一手！' : o.ok === 1 ? '△ 悪くないが次善' : '✕ もっと良い手があります';
    const fb = '<div class="fb f' + o.ok + '"><b>' + icon + '</b>' +
      '<div class="who">' + (o.ok === 2 ? 'あなたの選択（ベスト）' : 'あなたの選択') + '</div><div class="pick">「' + esc(o.t) + '」</div><p>' + esc(o.fb) + '</p>' +
      (o.ok < 2 ? '<div class="who best">ベストの手</div><div class="pick">「' + esc(best.t) + '」</div><p>' + esc(best.fb) + '</p>' : '') + '</div>';
    cur.lastFb = fb;
    if (o.ok === 2) {
      await playMain(fb, my);
    } else if (o.alt) {
      setPanel('<div class="pad cap" id="cap">あなたの選択：' + esc(o.t) + '</div>');
      await run(o.alt, { onEvent: e => setCap(e.ev.say || ('あなたの選択：' + o.t)) });
      if (my !== token) return;
      setPanel('<div class="pad">' + fb + (o.res ? '<p class="res">▶ ' + esc(o.res) + '</p>' : '') + '<button class="btn primary" id="nx">直前のラリー → 正解の場面を見る ▶</button></div>');
      $('nx').onclick = () => playMain('', token, true);
    } else {
      setPanel('<div class="pad">' + fb + (o.res ? '<p class="res">▶ ' + esc(o.res) + '</p>' : '') + '<button class="btn primary" id="nx">直前のラリー → 正解の場面を見る ▶</button></div>');
      $('nx').onclick = () => playMain('', token, true);
    }
  }

  async function playMain(fb, my, withPrev) {
    const st = cur.p.steps[cur.si], before = cur.state;
    setPanel('<div class="pad">' + fb + '<div class="cap" id="cap">' + (withPrev ? '直前のラリーをもう一度…' : '…') + '</div></div>');
    const tl = withPrev ? await run(cur.prev.events.concat(st.main), { onEvent: e => setCap(e.ev.say) }, cur.prev.state)
      : await run(st.main, { onEvent: e => setCap(e.ev.say) });
    if (my !== token) return;
    cur.prev = { state: before, events: st.main };
    cur.state = tl.end; cur.hist = cur.hist.concat(st.main);
    if (cur.si < cur.p.steps.length - 1) {
      cur.si++;
      ask();
    } else finish(st.end);
  }

  function finish(endText) {
    cur.asking = false; cur.done = true; renderDots();
    const n = cur.p.steps.length, sc = cur.res.reduce((a, r) => a + r.ok, 0), max = n * 2;
    const b = store.get(); if (b[cur.p.id] == null || sc > b[cur.p.id]) { b[cur.p.id] = sc; store.set(b); }
    const rank = sc === max ? '完璧！プロ級の判断です' : sc >= max * .75 ? 'とても良い判断でした' : sc >= max * .5 ? 'もう少し。解説を見直そう' : '定石を押さえて再挑戦しよう';
    const sym = { 2: '◎', 1: '△', 0: '✕' };
    const next = cur.pi + 1 < PROBLEMS.length;
    setPanel('<div class="pad"><div class="score"><span>' + sc + '</span>/' + max + '</div><p class="rank">' + rank + '</p>' +
      (endText ? '<p>' + esc(endText) + '</p>' : '') +
      '<ol class="rev">' + cur.res.map(r => '<li><b class="s' + r.ok + '">' + sym[r.ok] + '</b>' + esc(r.mine) + (r.ok < 2 ? '<small>ベスト：' + esc(r.best) + '</small>' : '') + '</li>').join('') + '</ol>' +
      '<div class="row"><button class="btn" id="again">もう一度</button>' + (next ? '<button class="btn primary" id="nextp">次の問題 ▶</button>' : '') + '<button class="btn" id="tolist">一覧へ</button></div></div>');
    $('again').onclick = () => startProblem(cur.pi);
    if (next) $('nextp').onclick = () => startProblem(cur.pi + 1);
    $('tolist').onclick = () => { token++; show('home'); };
  }

  function setPanel(h) { const p = $('panel'); p.innerHTML = h; p.scrollTop = 0; }

  renderHome();
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
