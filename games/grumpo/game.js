/* Whack Grumpo — whack-a-mole with the channel villain.
   Grumpo cubes pop out of 9 holes; smash them for combo points. Bonko pops up too — never hit him. */
(function () {
  const B = window.Bonko, C = B.COLORS, W = B.W, H = B.H;
  const COLS = 3, ROWS = 3, GAP = 150, CX = 270, CY = 540, SIZE = 90, HOLE_RX = 62, HOLE_RY = 24;
  const RISE_T = 0.15, SINK_T = 0.15, HIT_T = 0.3, HURT_T = 0.45, HIT_R = 60;
  let holes = [], lives, combo, spawnT, hint, over;

  function makeHoles() {
    holes = [];
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++)
      holes.push({ x: CX + (c - 1) * GAP, y: CY + (r - 1) * GAP, type: null, phase: "idle", t: 0, rise: 0, stay: 1, mood: "angry", flash: 0, glow: 0, rot: 0, squash: 1 });
  }
  function init(g) { makeHoles(); lives = 3; combo = 0; spawnT = 0.6; hint = 1; over = false; }

  const prog = (t) => B.clamp(t, 0, 1);
  const spawnInterval = (time) => B.lerp(1.1, 0.35, prog(time / 60));
  const stayTime = (time) => B.lerp(1.4, 0.5, prog(time / 60));
  const maxUp = (time) => 1 + Math.floor(B.clamp(time, 0, 59) / 20); // 1 -> 2 -> 3

  function spawn(g) {
    const free = holes.filter((h) => h.phase === "idle");
    if (!free.length) return;
    const h = free[B.randi(0, free.length - 1)], roll = Math.random();
    h.type = roll < 0.05 ? "gold" : roll < 0.25 ? "bonko" : "grumpo";
    h.phase = "rise"; h.t = 0; h.rise = 0; h.stay = stayTime(g.time); h.mood = h.type === "bonko" ? "grin" : "angry"; h.rot = 0; h.squash = 1;
  }

  function update(dt, g) {
    if (over) return;
    spawnT -= dt;
    let up = 0;
    for (const h of holes) if (h.phase === "rise" || h.phase === "stay") up++;
    if (spawnT <= 0) { const cap = maxUp(g.time); if (up < cap) spawn(g); spawnT = spawnInterval(g.time) * (up >= cap ? 0.3 : 1); }
    for (const h of holes) {
      h.flash *= 0.9; h.glow *= 0.88;
      if (h.phase === "idle") continue;
      h.t += dt;
      if (h.phase === "rise") { h.rise = prog(h.t / RISE_T); if (h.t >= RISE_T) { h.phase = "stay"; h.t = 0; } }
      else if (h.phase === "stay") { h.rise = 1; if (h.t >= h.stay) { h.phase = "sink"; h.t = 0; if (h.type !== "bonko") combo = 0; } }
      else if (h.phase === "sink") { h.rise = 1 - prog(h.t / SINK_T); if (h.t >= SINK_T) { h.phase = "idle"; h.type = null; } }
      else if (h.phase === "hit") { const k = prog(h.t / HIT_T); h.squash = 1 - k * 0.55; h.rise = 1 - k * k; h.rot = Math.sin(k * 9) * 0.25 * (1 - k); if (h.t >= HIT_T) { h.phase = "idle"; h.type = null; } }
      else if (h.phase === "hurt") { const k = prog(h.t / HURT_T); h.rise = 1 - k; if (h.t >= HURT_T) { h.phase = "idle"; h.type = null; } }
    }
  }

  function tap(x, y, g) {
    if (over) return;
    hint = 0;
    let best = null, bd = 1e9;
    for (const h of holes) {
      if (!(h.phase === "rise" || h.phase === "stay") || h.rise < 0.3) continue;
      const d = Math.min(B.dist(x, y, h.x, h.y), B.dist(x, y, h.x, h.y - (SIZE / 2) * h.rise));
      if (d < HIT_R && d < bd) { bd = d; best = h; }
    }
    if (!best) return;
    const h = best, ex = h.x, ey = h.y - 45;
    if (h.type === "bonko") {
      lives--; combo = 0; h.phase = "hurt"; h.t = 0; h.mood = "sad"; h.flash = 1;
      g.sfx.crack(); g.haptic([40, 30, 40]); g.shake(4);
      g.particles.burst(ex, ey, { n: 10, speed: 160, life: 0.5, size: 4, color: C.red, gravity: 400 });
      g.floatText(ex, ey - 60, "NO!", C.red, 34);
      if (lives <= 0) { over = true; g.gameOver({ delay: 600 }); }
      return;
    }
    combo++; h.phase = "hit"; h.t = 0; h.mood = "dizzy"; h.glow = 1;
    const gold = h.type === "gold", gain = gold ? 50 : 10 * combo;
    g.addScore(gain, ex, ey - 50, gold ? C.yellow : C.cyan);
    g.sfx.note(Math.min(combo, 15) + 1, { vel: 0.5, dur: 0.3, kind: gold ? "bell" : "pluck" });
    g.shake(gold ? 10 : 6); g.haptic(gold ? [20, 20, 40] : 14);
    g.particles.burst(ex, ey, { n: gold ? 26 : 14, speed: gold ? 320 : 240, life: 0.6, size: 5, color: gold ? [C.yellow, C.orange, C.purple] : C.purple, gravity: 500, shape: "square" });
    if (gold) { g.particles.ring(ex, ey, { color: C.yellow, grow: 520, width: 5 }); g.particles.ring(ex, ey, { color: C.orange, grow: 340, width: 3 }); }
    if (combo >= 3) g.floatText(ex, ey - 95, "x" + combo, C.yellow, 40);
  }

  function drawHoleBack(ctx, h) {
    ctx.fillStyle = h.flash > 0.02 ? B.withAlpha(C.red, 0.25 + h.flash * 0.55) : "#070B1A";
    ctx.beginPath(); ctx.ellipse(h.x, h.y, HOLE_RX, HOLE_RY, 0, 0, B.TAU); ctx.fill();
    if (h.flash > 0.02) { ctx.fillStyle = B.withAlpha(C.red, h.flash * 0.35); ctx.beginPath(); ctx.ellipse(h.x, h.y, HOLE_RX + 14, HOLE_RY + 8, 0, 0, B.TAU); ctx.fill(); }
  }
  function drawEntity(ctx, g, h) {
    if (h.phase === "idle" || !h.type) return;
    const lift = h.rise * (SIZE + 10), cy = h.y + SIZE / 2 + 4 - lift;
    ctx.save(); ctx.beginPath(); ctx.rect(h.x - 90, h.y - 220, 180, 222); ctx.clip();
    if (h.type === "bonko") g.drawMascot(h.x, cy, SIZE / 2 - 4, { mood: h.mood, ring: false, look: [0, -0.4], squash: h.phase === "rise" ? 1.1 : 1 });
    else {
      const sq = h.squash || 1;
      ctx.save(); ctx.translate(h.x, cy + (SIZE / 2) * (1 - sq)); ctx.scale(1 + (1 - sq) * 0.6, sq);
      g.drawGrumpo(0, 0, SIZE, { mood: h.mood, rot: h.rot || 0, border: h.type === "gold" ? C.yellow : undefined });
      ctx.restore();
      if (h.type === "gold" && h.phase !== "hit") B.glowCircle(ctx, h.x, cy, SIZE * 0.6, B.withAlpha(C.yellow, 0.35 + Math.sin(g.time * 10) * 0.15), 24, 3);
    }
    ctx.restore();
  }
  function drawRim(ctx, h) {
    ctx.strokeStyle = h.glow > 0.05 ? B.withAlpha(C.purple, 0.5 + h.glow * 0.5) : B.withAlpha(C.cyan, 0.85); ctx.lineWidth = 4 + h.glow * 4;
    ctx.beginPath(); ctx.ellipse(h.x, h.y, HOLE_RX, HOLE_RY, 0, 0, B.TAU); ctx.stroke();
    if (h.glow > 0.3) B.glowCircle(ctx, h.x, h.y, HOLE_RX, B.withAlpha(C.purple, h.glow * 0.5), 20, 2);
  }

  function draw(ctx, g) {
    for (const h of holes) drawHoleBack(ctx, h);
    // back rim under the entity, entity, then the front half of the hole on top so it looks like it rises out
    for (const h of holes) {
      ctx.save(); ctx.beginPath(); ctx.rect(h.x - 100, h.y - 60, 200, 60); ctx.clip(); drawRim(ctx, h); ctx.restore();
      drawEntity(ctx, g, h);
      ctx.save(); ctx.beginPath(); ctx.rect(h.x - 100, h.y, 200, 60); ctx.clip();
      ctx.fillStyle = h.flash > 0.02 ? B.withAlpha(C.red, 0.25 + h.flash * 0.55) : "#070B1A"; ctx.beginPath(); ctx.ellipse(h.x, h.y, HOLE_RX, HOLE_RY, 0, 0, Math.PI); ctx.fill();
      drawRim(ctx, h); ctx.restore();
    }
    // lives (orange dots top-left)
    for (let i = 0; i < 3; i++) { ctx.fillStyle = i < lives ? C.orange : C.grey2; ctx.beginPath(); ctx.arc(30 + i * 24, 40, 8, 0, B.TAU); ctx.fill(); }
    if (combo >= 2 && g.state === "playing") { ctx.fillStyle = B.withAlpha(C.yellow, 0.9); ctx.font = "900 26px Nunito"; ctx.textAlign = "right"; ctx.textBaseline = "middle"; ctx.fillText("x" + combo, W - 24, 40); }
    if (hint > 0 && g.time < 4) { ctx.globalAlpha = 0.65 + Math.sin(g.time * 5) * 0.3; ctx.fillStyle = C.white; ctx.font = "800 22px Nunito"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("Smash Grumpo. Never hit Bonko.", W / 2, 120); ctx.globalAlpha = 1; }
  }

  function pointer(e, g) { if (e.type === "down") tap(e.x, e.y, g); }

  window.__grumpoDebug = { get entities() { return holes; }, get lives() { return lives; }, get combo() { return combo; } };

  B.createGame({ id: "grumpo", howto: "Tap Grumpo cubes when they pop up. Never hit Bonko!", init, update, draw, pointer,
    onContinue(g) { lives = 3; over = false; g.floatText(W / 2, H / 2, "+3 LIVES", C.green, 48); } });
})();
