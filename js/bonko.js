/* =====================================================================
   BONKO ENGINE — shared runtime for every Bonkoball mini game.
   Logical canvas: 540 x 960 (portrait). Scaled to fit any screen.
   Games call Bonko.createGame({...}) and get a `g` handle.
   ===================================================================== */
(function () {
  "use strict";
  const CFG = window.BONKO_CONFIG || {};
  const W = 540, H = 960;

  const COLORS = {
    bg: "#0B1020", bg2: "#141B33", orange: "#FF6B3D", orange2: "#FF964A",
    cyan: "#38E8FF", white: "#F0F4FF", ink: "#10122A", grey: "#5B627A",
    grey2: "#2E3450", purple: "#9B7BDF", green: "#5BFF9B", pink: "#FF5BA8",
    yellow: "#FFD93D", red: "#FF4B4B",
  };

  // ---------- math helpers ----------
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const rand = (a = 1, b) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a));
  const randi = (a, b) => Math.floor(rand(a, b + 1));
  const dist = (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1);
  const TAU = Math.PI * 2;
  function hsv(h, s = 1, v = 1, a = 1) {
    h = ((h % 360) + 360) % 360;
    const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c;
    let r = 0, g = 0, b = 0;
    if (h < 60) [r, g, b] = [c, x, 0]; else if (h < 120) [r, g, b] = [x, c, 0];
    else if (h < 180) [r, g, b] = [0, c, x]; else if (h < 240) [r, g, b] = [0, x, c];
    else if (h < 300) [r, g, b] = [x, 0, c]; else [r, g, b] = [c, 0, x];
    return `rgba(${Math.round((r + m) * 255)},${Math.round((g + m) * 255)},${Math.round((b + m) * 255)},${a})`;
  }
  function withAlpha(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }

  // ---------- storage ----------
  const store = {
    get(k, d) { try { const v = localStorage.getItem("bonko." + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem("bonko." + k, JSON.stringify(v)); } catch (e) { } },
  };

  // ---------- audio (pentatonic synth, like the videos) ----------
  const SCALE = [0, 2, 4, 7, 9];
  const sfx = (() => {
    let ctx = null, master = null, comp = null, voices = 0, lastVoiceClear = 0, muted = store.get("muted", false);
    function ensure() {
      if (ctx) { if (ctx.state === "suspended") ctx.resume(); return true; }
      try {
        ctx = new (window.AudioContext || window.webkitAudioContext)();
        comp = ctx.createDynamicsCompressor();
        comp.threshold.value = -14; comp.ratio.value = 6; comp.attack.value = 0.003; comp.release.value = 0.12;
        master = ctx.createGain(); master.gain.value = muted ? 0 : 0.6;
        comp.connect(master); master.connect(ctx.destination);
        return true;
      } catch (e) { return false; }
    }
    function cap(max) {
      const now = performance.now();
      if (now - lastVoiceClear > 60) { voices = 0; lastVoiceClear = now; }
      if (voices >= max) return false; voices++; return true;
    }
    const midiHz = (m) => 440 * Math.pow(2, (m - 69) / 12);
    function penta(i, base = 60) { i = Math.max(0, Math.floor(i)); return base + 12 * Math.floor(i / 5) + SCALE[i % 5]; }
    function tone(midi, { vel = 0.5, dur = 0.5, kind = "pluck" } = {}) {
      if (!ensure() || !cap(8)) return;
      const t0 = ctx.currentTime, f = midiHz(midi);
      const g = ctx.createGain(); g.connect(comp);
      const env = (peak, decay) => { g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(peak, t0 + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t0 + decay); };
      const osc = (type, freq, gain, decay) => { const o = ctx.createOscillator(); const og = ctx.createGain(); o.type = type; o.frequency.value = freq; og.gain.value = gain; o.connect(og); og.connect(g); o.start(t0); o.stop(t0 + decay + 0.05); return o; };
      if (kind === "pluck") { env(vel, dur); osc("sine", f, 1, dur); osc("sine", f * 2, 0.3, dur * 0.5); osc("triangle", f * 3, 0.1, dur * 0.3); }
      else if (kind === "bell") { env(vel * 0.8, dur * 1.6); osc("sine", f, 1, dur * 1.6); osc("sine", f * 2.76, 0.35, dur * 0.8); osc("sine", f * 5.4, 0.15, dur * 0.4); }
      else if (kind === "thud") { env(vel, 0.25); const o = osc("sine", f * 2.5, 1, 0.3); o.frequency.exponentialRampToValueAtTime(Math.max(30, f * 0.5), t0 + 0.12); }
      else if (kind === "soft") { env(vel * 0.6, dur); osc("triangle", f, 1, dur); }
      else { env(vel, dur); osc("sine", f, 1, dur); }
    }
    function noise({ vel = 0.4, dur = 0.12, hp = 800 } = {}) {
      if (!ensure() || !cap(6)) return;
      const n = Math.floor(ctx.sampleRate * dur), buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2);
      const src = ctx.createBufferSource(); src.buffer = buf;
      const flt = ctx.createBiquadFilter(); flt.type = "highpass"; flt.frequency.value = hp;
      const g = ctx.createGain(); g.gain.value = vel;
      src.connect(flt); flt.connect(g); g.connect(comp); src.start();
    }
    return {
      unlock: ensure, penta,
      note(i, o = {}) { tone(penta(i, o.base || 60), o); },
      midi: tone,
      thud(v = 0.5) { tone(45, { vel: v, kind: "thud" }); },
      pop(i = 0) { tone(penta(i + 5, 72), { vel: 0.35, dur: 0.18 }); noise({ vel: 0.15, dur: 0.05, hp: 2000 }); },
      crack() { noise({ vel: 0.45, dur: 0.14, hp: 600 }); tone(40, { vel: 0.3, kind: "thud" }); },
      whoosh() { noise({ vel: 0.2, dur: 0.3, hp: 300 }); },
      tick() { tone(84, { vel: 0.12, dur: 0.06, kind: "soft" }); },
      win() { [0, 2, 4, 7, 9].forEach((s, k) => setTimeout(() => tone(72 + s, { vel: 0.45, dur: 0.6, kind: "bell" }), k * 90)); },
      fail() { [52, 48, 45].forEach((m, k) => setTimeout(() => tone(m, { vel: 0.4, dur: 0.5, kind: "soft" }), k * 140)); },
      record() { [0, 4, 7, 12, 16, 19, 24].forEach((s, k) => setTimeout(() => tone(60 + s, { vel: 0.4, dur: 0.5, kind: "bell" }), k * 70)); },
      get muted() { return muted; },
      toggleMute() { muted = !muted; store.set("muted", muted); if (master) master.gain.value = muted ? 0 : 0.6; return muted; },
    };
  })();

  // ---------- mascot drawing ----------
  function drawMascot(ctx, x, y, r, opt = {}) {
    const mood = opt.mood || "grin", look = opt.look || [0.35, -0.25], color = opt.color || COLORS.orange;
    const ring = opt.ring !== undefined ? opt.ring : false, rot = opt.rot || 0, squash = opt.squash || 1;
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(1 / squash, squash);
    if (ring) { // back half of the orbit ring
      ctx.save(); ctx.rotate(-0.28); ctx.strokeStyle = COLORS.cyan; ctx.lineWidth = Math.max(2, r * 0.12); ctx.lineCap = "round";
      ctx.beginPath(); ctx.ellipse(0, r * 0.15, r * 1.55, r * 0.5, 0, Math.PI, TAU); ctx.stroke(); ctx.restore();
    }
    // body
    const grad = ctx.createRadialGradient(-r * 0.3, -r * 0.35, r * 0.1, 0, 0, r * 1.05);
    grad.addColorStop(0, opt.light || COLORS.orange2); grad.addColorStop(0.55, color); grad.addColorStop(1, opt.dark || "#C8431F");
    ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
    // highlight capsule
    ctx.save(); ctx.translate(-r * 0.5, -r * 0.55); ctx.rotate(-0.66); ctx.fillStyle = "rgba(255,240,230,0.9)";
    ctx.beginPath(); ctx.ellipse(0, 0, r * 0.25, r * 0.1, 0, 0, TAU); ctx.fill(); ctx.restore();
    // eyes
    const eyes = [[r * 0.05, -r * 0.12, 0.30], [r * 0.52, -r * 0.24, 0.27]];
    for (const [ex, ey, er] of eyes) {
      const R = r * er;
      ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(ex, ey, R, 0, TAU); ctx.fill();
      const px = ex + R * 0.35 + look[0] * R * 0.3, py = ey - R * 0.25 + look[1] * R * 0.3;
      ctx.fillStyle = "#0E0E16"; ctx.beginPath(); ctx.arc(px, py, R * 0.52, 0, TAU); ctx.fill();
      ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(px + R * 0.18, py - R * 0.2, R * 0.15, 0, TAU); ctx.fill();
    }
    // mouth
    ctx.strokeStyle = COLORS.ink; ctx.fillStyle = COLORS.ink; ctx.lineWidth = Math.max(1.5, r * 0.09); ctx.lineCap = "round";
    if (mood === "grin") { ctx.beginPath(); ctx.arc(r * 0.26, r * 0.1, r * 0.3, Math.PI * 0.15, Math.PI * 0.95); ctx.stroke(); }
    else if (mood === "wow") { ctx.beginPath(); ctx.ellipse(r * 0.26, r * 0.33, r * 0.11, r * 0.15, 0, 0, TAU); ctx.fill(); }
    else if (mood === "sad") { ctx.beginPath(); ctx.arc(r * 0.24, r * 0.6, r * 0.22, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke(); }
    else if (mood === "dizzy") { ctx.beginPath(); ctx.moveTo(r * 0.08, r * 0.38); ctx.quadraticCurveTo(r * 0.2, r * 0.25, r * 0.3, r * 0.38); ctx.quadraticCurveTo(r * 0.4, r * 0.5, r * 0.5, r * 0.36); ctx.stroke(); }
    if (ring) { // front half
      ctx.save(); ctx.rotate(-0.28); ctx.strokeStyle = COLORS.cyan; ctx.lineWidth = Math.max(2, r * 0.12); ctx.lineCap = "round";
      ctx.beginPath(); ctx.ellipse(0, r * 0.15, r * 1.55, r * 0.5, 0, 0, Math.PI); ctx.stroke(); ctx.restore();
    }
    ctx.restore();
  }
  function drawGrumpo(ctx, x, y, s, opt = {}) { // s = full side length
    const h = s / 2, rad = s * 0.18, mood = opt.mood || "angry";
    ctx.save(); ctx.translate(x, y); ctx.rotate(opt.rot || 0);
    const grad = ctx.createLinearGradient(-h, -h, h, h); grad.addColorStop(0, "#4A4F66"); grad.addColorStop(1, "#1B1E2E");
    ctx.fillStyle = grad; ctx.strokeStyle = opt.border || COLORS.purple; ctx.lineWidth = Math.max(2, s * 0.06);
    ctx.beginPath(); ctx.roundRect(-h, -h, s, s, rad); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.35)"; ctx.beginPath(); ctx.ellipse(-h * 0.45, -h * 0.6, s * 0.16, s * 0.06, 0, 0, TAU); ctx.fill();
    // eyes
    for (const sx of [-0.3, 0.3]) {
      ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(sx * s, -s * 0.02, s * 0.1, 0, TAU); ctx.fill();
      ctx.fillStyle = "#0E0E16"; ctx.beginPath(); ctx.arc(sx * s + s * 0.02, s * 0.0, s * 0.05, 0, TAU); ctx.fill();
    }
    ctx.strokeStyle = "#0E0E16"; ctx.lineWidth = Math.max(2, s * 0.07); ctx.lineCap = "round";
    if (mood === "angry") { // brows + frown
      ctx.beginPath(); ctx.moveTo(-s * 0.42, -s * 0.28); ctx.lineTo(-s * 0.15, -s * 0.16); ctx.moveTo(s * 0.42, -s * 0.28); ctx.lineTo(s * 0.15, -s * 0.16); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, s * 0.34, s * 0.17, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
    } else if (mood === "dizzy") {
      ctx.beginPath(); ctx.moveTo(-s * 0.42, -s * 0.22); ctx.lineTo(-s * 0.15, -s * 0.22); ctx.moveTo(s * 0.42, -s * 0.22); ctx.lineTo(s * 0.15, -s * 0.22); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(0, s * 0.28, s * 0.1, s * 0.12, 0, 0, TAU); ctx.stroke();
    }
    ctx.restore();
  }
  function glowCircle(ctx, x, y, r, color, glow = 12, width = 0) {
    ctx.save(); ctx.shadowColor = color; ctx.shadowBlur = glow;
    if (width) { ctx.strokeStyle = color; ctx.lineWidth = width; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke(); }
    else { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); }
    ctx.restore();
  }

  // ---------- particles ----------
  const particles = (() => {
    const list = [];
    return {
      burst(x, y, o = {}) {
        const n = o.n || 14, speed = o.speed || 260, life = o.life || 0.7, color = o.color || COLORS.orange;
        for (let i = 0; i < n; i++) {
          const a = rand(TAU), s = rand(0.3, 1) * speed;
          list.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life, max: life, r: o.size || rand(3, 7), color: Array.isArray(color) ? color[i % color.length] : color, g: o.gravity === undefined ? 500 : o.gravity, shape: o.shape || "circle" });
        }
      },
      ring(x, y, o = {}) { list.push({ x, y, vx: 0, vy: 0, life: o.life || 0.45, max: o.life || 0.45, r: o.r || 20, grow: o.grow || 260, color: o.color || COLORS.cyan, ringW: o.width || 4, g: 0, shape: "ring" }); },
      update(dt) {
        for (let i = list.length - 1; i >= 0; i--) {
          const p = list[i]; p.life -= dt; if (p.life <= 0) { list.splice(i, 1); continue; }
          if (p.shape === "ring") { p.r += p.grow * dt; continue; }
          p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.985;
        }
      },
      draw(ctx) {
        for (const p of list) {
          const a = clamp(p.life / p.max, 0, 1);
          ctx.globalAlpha = a;
          if (p.shape === "ring") { ctx.strokeStyle = p.color; ctx.lineWidth = p.ringW; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.stroke(); }
          else if (p.shape === "square") { ctx.fillStyle = p.color; ctx.fillRect(p.x - p.r, p.y - p.r, p.r * 2, p.r * 2); }
          else { ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.r * a, 0, TAU); ctx.fill(); }
        }
        ctx.globalAlpha = 1;
      },
      clear() { list.length = 0; }, get count() { return list.length; },
    };
  })();

  // ---------- floating score text ("+10") ----------
  const floaters = [];
  function floatText(x, y, text, color = COLORS.white, size = 36) { floaters.push({ x, y, text, color, size, life: 0.9, max: 0.9 }); }
  function drawFloaters(ctx, dt) {
    for (let i = floaters.length - 1; i >= 0; i--) {
      const f = floaters[i]; f.life -= dt; f.y -= 70 * dt; if (f.life <= 0) { floaters.splice(i, 1); continue; }
      ctx.globalAlpha = clamp(f.life / f.max * 1.5, 0, 1); ctx.fillStyle = f.color; ctx.font = `800 ${f.size}px Nunito, system-ui, sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(f.text, f.x, f.y); ctx.globalAlpha = 1;
    }
  }

  function haptic(ms = 12) { try { if (navigator.vibrate && (!navigator.userActivation || navigator.userActivation.hasBeenActive)) navigator.vibrate(ms); } catch (e) { } }
  const fmt = (n) => (n >= 1e6 ? (n / 1e6).toFixed(1) + "M" : n >= 1e4 ? (n / 1e3).toFixed(1) + "K" : String(Math.floor(n)));

  // ---------- game shell ----------
  function createGame(def) {
    const id = def.id, info = (window.BONKO_GAMES || []).find((x) => x.id === id) || { name: def.name || id, hue: 200 };
    const root = document.getElementById("app") || document.body;
    root.innerHTML = `
      <div class="hud">
        <a class="hud-btn" href="../../" aria-label="Home">⌂</a>
        <div class="hud-score"><span class="hud-label">SCORE</span><span id="hud-score">0</span></div>
        <div class="hud-best"><span class="hud-label">BEST</span><span id="hud-best">0</span></div>
        <button class="hud-btn" id="hud-mute" aria-label="Sound">${sfx.muted ? "🔇" : "🔊"}</button>
      </div>
      <div class="stage"><canvas id="game"></canvas>
        <div class="overlay" id="ov-start">
          <div class="ov-card">
            <canvas class="ov-mascot" width="160" height="160"></canvas>
            <h1>${info.name}</h1>
            <p class="howto">${def.howto || info.desc || ""}</p>
            <button class="btn btn-primary" id="btn-start">TAP TO PLAY</button>
            <p class="ov-best">Best: <b id="ov-best">0</b></p>
            <p class="who">Playing as <b id="who-name">…</b> <button class="link" id="who-edit">change</button></p>
            <div class="name-row hidden" id="name-row"><input id="name-in" maxlength="16" placeholder="Your name" autocomplete="off"><button class="btn btn-ghost" id="name-ok">OK</button></div>
          </div>
        </div>
        <div class="overlay hidden" id="ov-over">
          <div class="ov-card">
            <div class="record hidden" id="ov-record">🏆 NEW RECORD!</div>
            <p class="ov-label">SCORE</p>
            <div class="ov-score" id="ov-score">0</div>
            <p class="ov-best">Best: <b id="ov-best2">0</b> · <span id="ov-rank"></span></p>
            <div class="lb" id="ov-lb"></div>
            <button class="btn btn-reward hidden" id="btn-continue">▶ CONTINUE <small>(watch ad)</small></button>
            <button class="btn btn-primary" id="btn-again">PLAY AGAIN</button>
            <div class="row">
              <button class="btn btn-ghost" id="btn-share">SHARE</button>
              <a class="btn btn-ghost" id="btn-next" href="#">NEXT GAME →</a>
            </div>
            <a class="follow" href="${CFG.instagram || "#"}" target="_blank" rel="noopener">Follow @bonkoball for daily simulations 🟠</a>
          </div>
        </div>
      </div>
      <div class="ad-slot" id="ad-bottom"></div>`;

    const canvas = root.querySelector("#game"), ctx = canvas.getContext("2d");
    const el = (s) => root.querySelector(s);
    const g = {
      canvas, ctx, W, H, state: "ready", score: 0, time: 0, plays: 0, best: store.get("best." + id, 0),
      pointer: { x: W / 2, y: H / 2, down: false }, shakeAmt: 0, canContinue: !!def.onContinue, continued: false,
      id, info, dt: 0,
      setScore(n) { g.score = n; el("#hud-score").textContent = fmt(n); },
      addScore(n, x, y, color) { g.setScore(g.score + n); if (x !== undefined) floatText(x, y, (n >= 0 ? "+" : "") + fmt(n), color || COLORS.white); },
      shake(a = 8) { g.shakeAmt = Math.max(g.shakeAmt, a); },
      floatText, particles, sfx, haptic, store, rand, randi, lerp, clamp, dist, hsv, withAlpha, TAU, COLORS,
      drawMascot: (x, y, r, o) => drawMascot(ctx, x, y, r, o), drawGrumpo: (x, y, s, o) => drawGrumpo(ctx, x, y, s, o), glowCircle: (x, y, r, c, gl, w) => glowCircle(ctx, x, y, r, c, gl, w),
      start() {
        sfx.unlock(); g.state = "playing"; g.time = 0; g.continued = false; g.setScore(0); particles.clear(); floaters.length = 0;
        el("#ov-start").classList.add("hidden"); el("#ov-over").classList.add("hidden");
        def.init(g);
      },
      gameOver(opts = {}) {
        if (g.state !== "playing") return; g.state = "over"; g.plays++;
        const isRecord = g.score > g.best && g.score > 0; if (isRecord) { g.best = g.score; store.set("best." + id, g.best); }
        bumpTotals(g.score);
        if (isRecord) sfx.record(); else if (opts.win) sfx.win(); else sfx.fail();
        if (window.BonkoOnline) publishScore(g.score);
        setTimeout(() => {
          el("#ov-score").textContent = fmt(g.score); el("#ov-best2").textContent = fmt(g.best); el("#hud-best").textContent = fmt(g.best);
          el("#ov-record").classList.toggle("hidden", !isRecord);
          el("#btn-continue").classList.toggle("hidden", !(g.canContinue && !g.continued && !opts.win && (window.BonkoAds ? BonkoAds.rewardedAvailable() : false)));
          el("#ov-over").classList.remove("hidden");
          const n = (g.plays % (CFG.interstitialEveryNPlays || 2)) === 0;
          if (n && window.BonkoAds) BonkoAds.interstitial();
        }, opts.delay === undefined ? 700 : opts.delay);
      },
      resume() { g.state = "playing"; el("#ov-over").classList.add("hidden"); },
    };
    el("#hud-best").textContent = fmt(g.best); el("#ov-best").textContent = fmt(g.best);

    // ---- online: name, leaderboard, presence ----
    const O = window.BonkoOnline;
    function showName() { if (O) el("#who-name").textContent = O.ensureName(); }
    if (O) {
      showName(); O.join(id);
      el("#who-edit").onclick = () => { el("#name-row").classList.remove("hidden"); el("#name-in").value = O.name; el("#name-in").focus(); };
      const commit = () => { if (O.setName(el("#name-in").value)) { showName(); el("#name-row").classList.add("hidden"); } };
      el("#name-ok").onclick = commit; el("#name-in").addEventListener("keydown", (e) => { if (e.key === "Enter") commit(); });
    } else { el("#who-name").parentElement.classList.add("hidden"); }
    async function publishScore(score) {
      const lb = el("#ov-lb"), rk = el("#ov-rank"); lb.innerHTML = ""; rk.textContent = "";
      await O.submitScore(id, score);
      const [rank, top] = await Promise.all([O.rankOf(id, score), O.top(id, { today: true, limit: 10 })]);
      rk.textContent = "Today #" + rank;
      if (!top.length) return;
      const h = document.createElement("div"); h.className = "lb-title"; h.textContent = O.enabled ? "TODAY'S TOP 10" : "TOP 10 (this device)"; lb.appendChild(h);
      top.forEach((r, i) => {
        const row = document.createElement("div"); row.className = "lb-row" + (r.cid === O.clientId ? " me" : "");
        const a = document.createElement("span"); a.textContent = (i + 1) + ". " + r.name; const b = document.createElement("b"); b.textContent = fmt(r.score);
        row.appendChild(a); row.appendChild(b); lb.appendChild(row);
      });
    }
    const mc = root.querySelector(".ov-mascot"); drawMascot(mc.getContext("2d"), 80, 90, 52, { ring: true });

    // next game link
    const list = window.BONKO_GAMES || [], idx = list.findIndex((x) => x.id === id);
    if (list.length) el("#btn-next").href = "../" + list[(idx + 1) % list.length].id + "/";

    el("#btn-start").onclick = () => g.start();
    el("#btn-again").onclick = () => g.start();
    el("#hud-mute").onclick = (e) => { e.target.textContent = sfx.toggleMute() ? "🔇" : "🔊"; };
    el("#btn-continue").onclick = () => {
      if (!window.BonkoAds) return;
      BonkoAds.rewarded(() => { g.continued = true; g.resume(); def.onContinue(g); }, () => { });
    };
    el("#btn-share").onclick = async () => {
      const text = `I scored ${fmt(g.score)} in ${info.name} 🟠 Can you beat me? ${CFG.siteUrl || location.origin}/games/${id}/`;
      try { if (navigator.share) await navigator.share({ title: "Bonkoball", text, url: `${CFG.siteUrl || location.origin}/games/${id}/` }); else { await navigator.clipboard.writeText(text); el("#btn-share").textContent = "COPIED!"; } } catch (e) { }
    };
    if (window.BonkoAds) BonkoAds.banner(el("#ad-bottom"));

    // sizing
    function resize() {
      const stage = root.querySelector(".stage"), r = stage.getBoundingClientRect();
      const s = Math.min(r.width / W, r.height / H), dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.style.width = W * s + "px"; canvas.style.height = H * s + "px";
      canvas.width = Math.round(W * s * dpr); canvas.height = Math.round(H * s * dpr);
      g._scale = s * dpr;
    }
    window.addEventListener("resize", resize); resize(); setTimeout(resize, 50);

    // input
    function toLocal(e) { const r = canvas.getBoundingClientRect(); return [(e.clientX - r.left) / r.width * W, (e.clientY - r.top) / r.height * H]; }
    function emit(type, e) {
      const [x, y] = toLocal(e); g.pointer.x = x; g.pointer.y = y;
      if (type === "down") g.pointer.down = true; if (type === "up") g.pointer.down = false;
      if (g.state === "playing" && def.pointer) def.pointer({ type, x, y, id: e.pointerId }, g);
    }
    canvas.addEventListener("pointerdown", (e) => { sfx.unlock(); canvas.setPointerCapture(e.pointerId); emit("down", e); e.preventDefault(); });
    canvas.addEventListener("pointermove", (e) => emit("move", e));
    canvas.addEventListener("pointerup", (e) => emit("up", e));
    canvas.addEventListener("pointercancel", (e) => emit("up", e));
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    window.addEventListener("keydown", (e) => {
      if (e.repeat) return;
      if (g.state === "ready" && (e.code === "Space" || e.code === "Enter")) { g.start(); return; }
      if (g.state === "playing" && def.key) def.key({ code: e.code, type: "down" }, g);
      if (g.state === "playing" && !def.key && e.code === "Space") def.pointer && def.pointer({ type: "down", x: W / 2, y: H / 2, key: true }, g);
    });
    window.addEventListener("keyup", (e) => { if (g.state === "playing" && def.key) def.key({ code: e.code, type: "up" }, g); });

    // loop
    let last = performance.now(), hidden = false;
    document.addEventListener("visibilitychange", () => { hidden = document.hidden; last = performance.now(); });
    function tick(dt) {
      g.dt = dt;
      if (g.state === "playing") { g.time += dt; def.update(dt, g); }
      particles.update(dt);
    }
    // Headless stepping for automated tests (background tabs get no requestAnimationFrame): __bonko.step(seconds)
    g.step = (sec) => { const n = Math.max(1, Math.round(sec * 60)); for (let i = 0; i < n; i++) tick(1 / 60); render(1 / 60); };
    function frame(now) {
      requestAnimationFrame(frame);
      if (hidden) return;
      let dt = (now - last) / 1000; last = now; dt = clamp(dt, 0, 1 / 30);
      tick(dt); render(dt);
    }
    function render(dt) {
      ctx.setTransform(g._scale, 0, 0, g._scale, 0, 0);
      ctx.fillStyle = def.bg || COLORS.bg; ctx.fillRect(0, 0, W, H);
      ctx.save();
      if (g.shakeAmt > 0.2) { ctx.translate(rand(-g.shakeAmt, g.shakeAmt), rand(-g.shakeAmt, g.shakeAmt)); g.shakeAmt *= 0.86; } else g.shakeAmt = 0;
      def.draw(ctx, g);
      particles.draw(ctx); drawFloaters(ctx, dt);
      ctx.restore();
    }
    window.__bonko = g; // debug handle
    def.init(g); // pre-start preview so draw() is safe before the first tap
    requestAnimationFrame(frame);
    return g;
  }

  function bumpTotals(score) {
    store.set("plays", (store.get("plays", 0) || 0) + 1);
    store.set("total", (store.get("total", 0) || 0) + Math.max(0, Math.floor(score)));
  }

  window.Bonko = { W, H, COLORS, clamp, lerp, rand, randi, dist, hsv, withAlpha, TAU, store, sfx, particles, floatText, haptic, fmt, drawMascot, drawGrumpo, glowCircle, createGame };
})();
