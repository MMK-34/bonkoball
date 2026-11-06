/* Melody Plinko — reference implementation of the Bonko game contract.
   Drag to aim, release to drop. Each peg hit plays the next pentatonic note. */
(function () {
  const B = window.Bonko, C = B.COLORS, W = B.W, H = B.H;
  const ROWS = 10, TOP = 200, ROWGAP = 58, PEG_R = 7, BALL_R = 12, GRAV = 1500, WALL = 16;
  const SLOTS = [25, 8, 3, 1.5, 0.5, 0.3, 0.5, 1.5, 3, 8, 25];
  const SLOT_HUE = (m) => (m >= 25 ? 330 : m >= 8 ? 20 : m >= 3 ? 45 : m >= 1.5 ? 150 : 200);
  let pegs = [], balls = [], ballsLeft, aimX, dropping, slotFlash, combo, lastMult, hint;

  function buildPegs() {
    pegs = [];
    for (let r = 0; r < ROWS; r++) {
      const n = r + 3, gap = 42, x0 = W / 2 - ((n - 1) * gap) / 2;
      for (let i = 0; i < n; i++) pegs.push({ x: x0 + i * gap, y: TOP + r * ROWGAP, glow: 0, row: r });
    }
  }
  function init(g) {
    buildPegs(); balls = []; ballsLeft = 10; aimX = W / 2; dropping = false; slotFlash = SLOTS.map(() => 0); combo = 0; lastMult = 0; hint = 1;
  }
  function drop(g) {
    if (ballsLeft <= 0 || balls.length >= 3) return;
    ballsLeft--; hint = 0;
    balls.push({ x: aimX + B.rand(-1, 1), y: 110, vx: 0, vy: 0, note: 0, mood: "grin", rot: 0, done: false });
    g.sfx.whoosh(); g.haptic(8);
  }
  function update(dt, g) {
    for (const p of pegs) p.glow *= 0.9;
    for (let i = 0; i < SLOTS.length; i++) slotFlash[i] *= 0.92;
    const steps = 3, h = dt / steps;
    for (const b of balls) {
      for (let s = 0; s < steps; s++) {
        b.vy += GRAV * h; b.x += b.vx * h; b.y += b.vy * h; b.rot += b.vx * h * 0.02;
        if (b.x < WALL) { b.x = WALL; b.vx = Math.abs(b.vx) * 0.6 + 30; }
        if (b.x > W - WALL) { b.x = W - WALL; b.vx = -Math.abs(b.vx) * 0.6 - 30; }
        for (const p of pegs) {
          const dx = b.x - p.x, dy = b.y - p.y, d = Math.hypot(dx, dy), min = BALL_R + PEG_R;
          if (d < min && d > 0) {
            const nx = dx / d, ny = dy / d, dot = b.vx * nx + b.vy * ny;
            b.x = p.x + nx * min; b.y = p.y + ny * min;
            if (dot < 0) {
              b.vx -= 1.6 * dot * nx; b.vy -= 1.6 * dot * ny; b.vx += B.rand(-60, 60); b.vx *= 0.9; b.vy *= 0.9; if (Math.abs(b.vx) < 25) b.vx += (b.x < p.x ? -1 : 1) * 40;
              p.glow = 1; b.note = p.row; g.sfx.note(p.row + 2, { vel: 0.35, dur: 0.35 }); b.mood = p.row > 7 ? "wow" : "grin";
              g.particles.burst(p.x, p.y, { n: 4, speed: 120, life: 0.35, size: 3, color: B.hsv(p.row * 30, 0.8, 1), gravity: 300 });
            }
          }
        }
      }
      // anti-stuck: a ball that stops moving gets a kick
      if (Math.abs(b.vy) < 40 && !b.done) { b.stuck = (b.stuck || 0) + dt; if (b.stuck > 0.5) { b.vx += B.rand(-200, 200); b.vy = -250; b.stuck = 0; } } else b.stuck = 0;
      if (b.y > H - 150 && !b.done) {
        b.done = true;
        const idx = B.clamp(Math.floor((b.x - 30) / ((W - 60) / SLOTS.length)), 0, SLOTS.length - 1), m = SLOTS[idx];
        const base = 100, gain = Math.round(base * m * (1 + combo * 0.25));
        combo = m >= 3 && lastMult >= 3 ? combo + 1 : m >= 3 ? 1 : 0; lastMult = m;
        slotFlash[idx] = 1; g.addScore(gain, b.x, H - 190, B.hsv(SLOT_HUE(m), 0.6, 1));
        if (m >= 8) { g.shake(m >= 25 ? 18 : 9); g.sfx.win(); g.particles.burst(b.x, H - 150, { n: 40, speed: 420, color: [C.orange, C.cyan, C.yellow, C.pink], life: 1 }); g.particles.ring(b.x, H - 150, { color: C.yellow, grow: 500 }); g.haptic([30, 30, 60]); }
        else if (m >= 1.5) { g.sfx.pop(idx); g.particles.burst(b.x, H - 150, { n: 14, speed: 220, color: C.orange }); }
        else { g.sfx.thud(0.3); b.mood = "sad"; }
        if (combo >= 2) g.floatText(W / 2, 150, `COMBO x${combo}`, C.yellow, 42);
      }
    }
    balls = balls.filter((b) => !(b.done && b.y > H + 40));
    if (ballsLeft <= 0 && balls.length === 0) g.gameOver({ delay: 500 });
  }
  function draw(ctx, g) {
    // slots
    const sw = (W - 60) / SLOTS.length;
    for (let i = 0; i < SLOTS.length; i++) {
      const x = 30 + i * sw, m = SLOTS[i], hue = SLOT_HUE(m), f = slotFlash[i];
      ctx.fillStyle = B.hsv(hue, 0.7, 0.25 + f * 0.75); ctx.beginPath(); ctx.roundRect(x + 3, H - 150, sw - 6, 70, 10); ctx.fill();
      ctx.fillStyle = B.hsv(hue, 0.3, 1); ctx.font = `900 ${m >= 10 ? 17 : 15}px Nunito`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText("x" + m, x + sw / 2, H - 115);
    }
    // pegs
    for (const p of pegs) { ctx.fillStyle = B.hsv(p.row * 30 + 180, 0.6, 0.5 + p.glow * 0.5); ctx.beginPath(); ctx.arc(p.x, p.y, PEG_R + p.glow * 4, 0, B.TAU); ctx.fill(); if (p.glow > 0.3) B.glowCircle(ctx, p.x, p.y, PEG_R, B.hsv(p.row * 30 + 180, 0.4, 1, p.glow), 18); }
    // aim
    if (!dropping || true) {
      ctx.setLineDash([6, 10]); ctx.strokeStyle = B.withAlpha(C.cyan, 0.35); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(aimX, 130); ctx.lineTo(aimX, TOP - 20); ctx.stroke(); ctx.setLineDash([]);
      g.drawMascot(aimX, 110, BALL_R, { ring: true, look: [0, 0.8], squash: 1 + Math.sin(g.time * 8) * 0.04 });
    }
    for (const b of balls) g.drawMascot(b.x, b.y, BALL_R, { mood: b.mood, rot: b.rot, look: [b.vx / 400, 0.5] });
    // balls left pictogram
    for (let i = 0; i < ballsLeft; i++) { ctx.fillStyle = i < ballsLeft ? C.orange : C.grey2; ctx.beginPath(); ctx.arc(30 + i * 20, 40, 7, 0, B.TAU); ctx.fill(); }
    if (hint > 0 && g.time < 6) { ctx.globalAlpha = 0.6 + Math.sin(g.time * 5) * 0.3; ctx.fillStyle = C.white; ctx.font = "800 22px Nunito"; ctx.textAlign = "center"; ctx.fillText("drag to aim · release to drop", W / 2, 75); ctx.globalAlpha = 1; }
  }
  function pointer(e, g) {
    if (e.type === "down" || e.type === "move") { if (g.pointer.down || e.key) aimX = B.clamp(e.x, 60, W - 60); }
    if (e.type === "up" || e.key) drop(g);
  }
  B.createGame({ id: "plinko", howto: "Drag to aim, release to drop. 10 balls. Hit the x25 edges!", init, update, draw, pointer,
    onContinue(g) { ballsLeft += 3; g.floatText(W / 2, H / 2, "+3 BALLS", C.green, 48); } });
})();
