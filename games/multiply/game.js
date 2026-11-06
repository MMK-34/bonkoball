/* Multiply — tap to place a glowing gate; every Bonko that crosses it is cloned.
   The swarm erodes the grey core before the timer runs out. */
(function () {
  const B = window.Bonko, C = B.COLORS, W = B.W, H = B.H;
  const AX0 = 20, AX1 = 520, AY0 = 120, AY1 = 880;           // arena
  const BALL_R = 14, SPEED = 420, MAX_BALLS = 180, MASCOTS = 40;
  const CX = 270, CY = 500, CORE_R0 = 110;                   // core centre / base radius
  const GATE_W = 10, GATE_H = 120, GATE_LIFE = 3, MAX_GATES = 3;
  const TIME0 = 40, TIME_CAP = 50, STEPS = 2;
  const DOT_GREY = "#8A90AA", DARK_GREY = "#3C4054";

  let balls = [], gates = [], core = [], coreR = CORE_R0, coreHp = 2, coreScale = 0, level = 1;
  let timer = TIME0, timerMax = TIME0, gateSeq = 0, hint = 1, ended = false, hits = 0;
  let lastWall = -1, lastHit = -1, lastPop = -1, lastCrack = -1, lastFloat = -1, flash = 0, pulse = 0;
  window.__multiply = { get balls() { return balls; }, get core() { return core; }, get level() { return level; }, get timer() { return timer; }, get gates() { return gates; } };

  function makeBall(x, y, vx, vy, gen, gatesSeen) {
    return { x, y, px: x, py: y, vx, vy, gen, rot: 0, mood: "grin", gates: gatesSeen || [],
      color: gen > 0 ? B.hsv(B.rand(25, 40), 0.95, 1) : C.orange };
  }
  function buildCore(radius, hp) {
    core = []; coreR = radius; coreHp = hp; coreScale = 0;
    const n = B.clamp(Math.round(50 * (radius / CORE_R0) * (radius / CORE_R0)), 40, 110);
    for (let i = 0; i < n; i++) {
      const rr = radius * Math.sqrt((i + 0.5) / n), a = i * 2.39996 + B.rand(-0.15, 0.15);
      core.push({ x: CX + Math.cos(a) * rr + B.rand(-6, 6), y: CY + Math.sin(a) * rr + B.rand(-6, 6),
        r: B.rand(14, 26), hp, max: hp, crack: B.rand(0, B.TAU), alive: true });
    }
  }
  function init(g) {
    balls = []; gates = []; level = 1; timer = TIME0; timerMax = TIME0; gateSeq = 0; hint = 1; ended = false; hits = 0;
    lastWall = lastHit = lastPop = lastCrack = -1; flash = 0; pulse = 0;
    const a = B.rand(0.5, 1.1) * (Math.random() < 0.5 ? 1 : -1);
    balls.push(makeBall(CX, 260, Math.cos(a) * SPEED, Math.sin(a) * SPEED, 0));
    buildCore(CORE_R0, 2); coreScale = 1;
  }
  function placeGate(x, y, g) {
    hint = 0;
    const gx = B.clamp(x, AX0 + GATE_W, AX1 - GATE_W), gy = B.clamp(y, AY0 + GATE_H / 2, AY1 - GATE_H / 2);
    if (gates.length >= MAX_GATES) gates.shift();
    gates.push({ id: ++gateSeq, x: gx, y: gy, life: GATE_LIFE, born: g.time });
    g.sfx.whoosh(); g.haptic(8);
    g.particles.ring(gx, gy, { color: C.cyan, grow: 300, life: 0.3, r: 10 });
  }
  function clearLevel(g) {
    g.sfx.win(); g.shake(14); g.haptic([30, 30, 60]);
    g.particles.ring(CX, CY, { color: C.cyan, grow: 700, width: 7, life: 0.6 });
    g.particles.ring(CX, CY, { color: C.yellow, grow: 450, width: 4, life: 0.7 });
    g.particles.burst(CX, CY, { n: 40, speed: 500, life: 1, color: [C.cyan, C.yellow, C.white, C.orange] });
    g.addScore(500 * level, CX, CY - 20, C.yellow);
    timer = Math.min(TIME_CAP, timer + 10); timerMax = Math.max(timerMax, timer); flash = 1;
    level++;
    // HP grows geometrically: a 180-ball swarm erodes linearly-scaled cores in seconds, the run must end
    buildCore(Math.min(235, CORE_R0 + 15 * (level - 1)), Math.round(2 * Math.pow(1.8, level - 1)));
    for (const b of balls) b.mood = "wow";
  }
  function update(dt, g) {
    if (ended) return;
    pulse += dt;
    flash *= 0.9;
    timer -= dt;
    if (timer <= 0) {
      timer = 0; ended = true;
      for (const b of balls) b.mood = "sad";
      g.gameOver({ delay: 700 });
      return;
    }
    for (let i = gates.length - 1; i >= 0; i--) { gates[i].life -= dt; if (gates[i].life <= 0) gates.splice(i, 1); }
    if (coreScale < 1) coreScale = Math.min(1, coreScale + dt / 0.7);
    const solid = coreScale >= 1, broad = coreR * coreScale + 26 + BALL_R + 30, cnt0 = balls.length;
    const pitch = Math.min(8, Math.floor(Math.log2(Math.max(1, cnt0))));
    const h = dt / STEPS;
    let pops = 0, alive = 0;
    for (let s = 0; s < STEPS; s++) {
      const n = balls.length;
      for (let i = 0; i < n; i++) {
        const b = balls[i];
        b.px = b.x; b.py = b.y;
        b.x += b.vx * h; b.y += b.vy * h; b.rot += b.vx * h * 0.01;
        // walls
        let wall = false;
        if (b.x < AX0 + BALL_R) { b.x = AX0 + BALL_R; b.vx = Math.abs(b.vx); wall = true; }
        else if (b.x > AX1 - BALL_R) { b.x = AX1 - BALL_R; b.vx = -Math.abs(b.vx); wall = true; }
        if (b.y < AY0 + BALL_R) { b.y = AY0 + BALL_R; b.vy = Math.abs(b.vy); wall = true; }
        else if (b.y > AY1 - BALL_R) { b.y = AY1 - BALL_R; b.vy = -Math.abs(b.vy); wall = true; }
        if (wall && g.time - lastWall > 0.06) { lastWall = g.time; g.sfx.note(pitch, { base: 48, kind: "soft", vel: 0.22, dur: 0.1 }); }
        // gates: segment (px,py)->(x,y) crossing the vertical bar
        for (let k = 0; k < gates.length; k++) {
          const gt = gates[k];
          if (b.gates.indexOf(gt.id) !== -1) continue;
          const a0 = b.px < gt.x, a1 = b.x < gt.x;
          if (a0 === a1 || b.x === b.px) continue;
          const t = (gt.x - b.px) / (b.x - b.px), yc = b.py + t * (b.y - b.py);
          if (Math.abs(yc - gt.y) > GATE_H / 2) continue;
          b.gates.push(gt.id);
          if (balls.length >= MAX_BALLS) continue;
          const j = B.rand(-0.06, 0.06), ca = Math.cos(j), sa = Math.sin(j), mvx = b.vx, mvy = -b.vy;
          const c = makeBall(b.x, b.y, mvx * ca - mvy * sa, mvx * sa + mvy * ca, b.gen + 1, b.gates.slice());
          balls.push(c);
          if (pops < 6) { pops++; g.particles.ring(b.x, b.y, { color: C.cyan, grow: 220, life: 0.3, r: 8, width: 3 }); }
          if (g.time - lastPop > 0.04) { lastPop = g.time; g.sfx.pop(Math.min(9, Math.floor(Math.log2(balls.length)))); }
        }
        // core (broad-phase by distance to centre)
        const dxc = b.x - CX, dyc = b.y - CY;
        if (dxc * dxc + dyc * dyc > broad * broad) continue;
        for (let k = 0; k < core.length; k++) {
          const c = core[k];
          if (!c.alive) continue;
          const cr = c.r * coreScale, dx = b.x - c.x, dy = b.y - c.y, min = BALL_R + cr, d2 = dx * dx + dy * dy;
          if (d2 >= min * min) continue;
          const d = Math.sqrt(d2) || 0.001, nx = dx / d, ny = dy / d;
          b.x = c.x + nx * min; b.y = c.y + ny * min;
          const dot = b.vx * nx + b.vy * ny;
          if (dot < 0) {
            b.vx -= 2 * dot * nx; b.vy -= 2 * dot * ny;
            const sp = Math.hypot(b.vx, b.vy) || 1; b.vx = b.vx / sp * SPEED; b.vy = b.vy / sp * SPEED;
            if (!solid) continue;
            hits++; c.hp--;
            g.setScore(g.score + 5);
            if (c.hp <= 0) {
              c.alive = false;
              if (g.time - lastFloat > 0.12) { lastFloat = g.time; g.addScore(25, c.x, c.y, "#D8DCEC"); } else g.setScore(g.score + 25);
              g.particles.burst(c.x, c.y, { n: 7, speed: 200, life: 0.5, size: 4, color: [DOT_GREY, DARK_GREY, "#C4C8DC"], shape: "square", gravity: 400 });
              if (g.time - lastCrack > 0.05) { lastCrack = g.time; g.sfx.crack(); g.shake(3); }
            } else if (g.time - lastHit > 0.04) {
              lastHit = g.time; g.sfx.note(2 + (hits % 10), { vel: 0.25, dur: 0.15, kind: "pluck" });
            }
          }
        }
      }
    }
    for (let k = 0; k < core.length; k++) if (core[k].alive) { alive++; break; }
    if (alive === 0 && solid) clearLevel(g);
  }
  function roundRect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }
  function draw(ctx, g) {
    const t = g.time;
    // arena walls (glow)
    for (let k = 3; k >= 0; k--) { ctx.strokeStyle = B.withAlpha(C.cyan, k === 0 ? 0.8 : (0.1 + flash * 0.1) * (4 - k) / 3); ctx.lineWidth = k === 0 ? 3 : 3 + k * 5; roundRect(ctx, AX0, AY0, AX1 - AX0, AY1 - AY0, 16); ctx.stroke(); }
    ctx.fillStyle = "rgba(255,255,255,0.025)"; roundRect(ctx, AX0, AY0, AX1 - AX0, AY1 - AY0, 16); ctx.fill();
    // timer bar
    const frac = B.clamp(timer / timerMax, 0, 1), low = timer < 8 && !ended;
    ctx.fillStyle = "rgba(255,255,255,0.08)"; roundRect(ctx, AX0, 78, AX1 - AX0, 14, 7); ctx.fill();
    const tc = low ? (Math.sin(t * 10) > 0 ? C.red : C.pink) : C.cyan;
    if (frac > 0) { ctx.fillStyle = B.withAlpha(tc, 0.25); roundRect(ctx, AX0 - 3, 75, (AX1 - AX0) * frac + 6, 20, 10); ctx.fill(); ctx.fillStyle = tc; roundRect(ctx, AX0, 78, (AX1 - AX0) * frac, 14, 7); ctx.fill(); }
    // core
    if (core.length) {
      ctx.fillStyle = "rgba(60,64,84,0.18)"; ctx.beginPath(); ctx.arc(CX, CY, (coreR + 22) * coreScale, 0, B.TAU); ctx.fill();
      for (let k = 0; k < core.length; k++) {
        const c = core[k]; if (!c.alive) continue;
        const dmg = 1 - c.hp / c.max, cr = c.r * coreScale;
        ctx.fillStyle = dmg > 0 ? (dmg >= 0.66 ? "#2C2F40" : dmg >= 0.33 ? DARK_GREY : "#5A5F78") : DOT_GREY;
        ctx.beginPath(); ctx.arc(c.x, c.y, cr, 0, B.TAU); ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,0.18)"; ctx.beginPath(); ctx.arc(c.x - cr * 0.3, c.y - cr * 0.35, cr * 0.25, 0, B.TAU); ctx.fill();
        if (dmg > 0) { // crack
          ctx.strokeStyle = "#141622"; ctx.lineWidth = 2; ctx.beginPath();
          const a = c.crack; ctx.moveTo(c.x + Math.cos(a) * cr * 0.9, c.y + Math.sin(a) * cr * 0.9);
          ctx.lineTo(c.x + Math.cos(a + 0.5) * cr * 0.35, c.y + Math.sin(a + 0.5) * cr * 0.35);
          ctx.lineTo(c.x + Math.cos(a + 2.6) * cr * 0.4, c.y + Math.sin(a + 2.6) * cr * 0.4);
          if (dmg >= 0.66) ctx.lineTo(c.x + Math.cos(a + 3.6) * cr * 0.9, c.y + Math.sin(a + 3.6) * cr * 0.9);
          ctx.stroke();
        }
      }
    }
    // gates
    for (let k = 0; k < gates.length; k++) {
      const gt = gates[k], p = 0.7 + Math.sin(t * 9 + gt.id) * 0.3, fade = Math.min(1, gt.life / 0.6), w = GATE_W + p * 3;
      ctx.save(); ctx.globalAlpha = fade; ctx.shadowColor = C.cyan; ctx.shadowBlur = 16 + p * 14;
      ctx.fillStyle = B.withAlpha(C.cyan, 0.55 + p * 0.3); roundRect(ctx, gt.x - w / 2, gt.y - GATE_H / 2, w, GATE_H, 5); ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.85)"; roundRect(ctx, gt.x - 2, gt.y - GATE_H / 2 + 6, 4, GATE_H - 12, 2); ctx.fill();
      ctx.restore();
    }
    // balls
    const n = balls.length;
    for (let i = 0; i < n; i++) {
      const b = balls[i];
      if (i < MASCOTS) g.drawMascot(b.x, b.y, BALL_R, { mood: b.mood, rot: b.rot, look: [b.vx / SPEED, b.vy / SPEED], color: b.color, ring: i === 0 });
      else {
        ctx.fillStyle = B.withAlpha(C.orange, 0.22); ctx.beginPath(); ctx.arc(b.x, b.y, BALL_R + 5, 0, B.TAU); ctx.fill();
        ctx.fillStyle = b.color; ctx.beginPath(); ctx.arc(b.x, b.y, BALL_R, 0, B.TAU); ctx.fill();
        ctx.fillStyle = "#0E0E16"; ctx.beginPath(); ctx.arc(b.x + BALL_R * 0.3, b.y - BALL_R * 0.2, BALL_R * 0.22, 0, B.TAU); ctx.fill();
      }
    }
    // ball count pictogram (1 dot per 10 balls, max 18)
    const dots = Math.min(18, Math.ceil(n / 10));
    for (let i = 0; i < dots; i++) { ctx.fillStyle = i < dots ? C.orange : C.grey2; ctx.beginPath(); ctx.arc(30 + i * 15, H - 60, 4.5, 0, B.TAU); ctx.fill(); }
    // level pips bottom-right
    for (let i = 0; i < Math.min(level - 1, 10); i++) { ctx.fillStyle = C.yellow; ctx.beginPath(); ctx.arc(W - 30 - i * 15, H - 60, 4.5, 0, B.TAU); ctx.fill(); }
    if (hint > 0 && t < 4) {
      ctx.globalAlpha = 0.6 + Math.sin(t * 5) * 0.3; ctx.fillStyle = C.white; ctx.font = "800 21px Nunito"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText("Tap to place a gate. Every pass = 2 Bonkos.", W / 2, 105); ctx.globalAlpha = 1;
    }
  }
  function pointer(e, g) {
    if (ended) return;
    if (e.type === "down") placeGate(e.x, e.y, g);
  }
  B.createGame({
    id: "multiply", howto: "Tap to place a gate. Every Bonko that passes is cloned. Erase the grey core before time runs out!",
    init, update, draw, pointer,
    onContinue(g) { ended = false; timer += 15; timerMax = Math.max(timerMax, timer); for (const b of balls) b.mood = "grin"; g.floatText(W / 2, H / 2, "+15 s", C.green, 48); },
  });
})();
