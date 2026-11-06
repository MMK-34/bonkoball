/* Ring Escape — Bonko bounces inside nested rotating rainbow rings.
   Tap to flip gravity (plus a nudge toward the tap). Slip through the gap before the ring closes;
   every escape shatters the ring and a new outer ring spawns. */
(function () {
  const B = window.Bonko, C = B.COLORS, W = B.W, H = B.H;
  const CX = 270, CY = 520, BALL_R = 16, STROKE = 10, R0 = 80, SPACING = 55, VISIBLE = 4;
  const GRAV = 1100, MAX_SPEED = 950, REST = 0.92, SHARDS = 24, NEAR = (15 * Math.PI) / 180, MIN_ESC = 330;
  const BAR_X = 50, BAR_W = 440, BAR_Y = 70;
  let rings = [], ball, gravSign, ringIndex, timeLeft, timeMax, closing, closeF, mood, moodT, hint, bounceCool, spawned, over;

  const timeFor = (idx) => Math.max(5, 9 - (idx - 1) * (4 / 14));
  const gapFor = (idx) => (B.clamp(62 - (idx - 1) * 1.8, 40, 62) * Math.PI) / 180;
  const speedFor = (idx) => Math.min(2.6, 0.8 + (idx - 1) * 0.11) * (idx % 2 ? 1 : -1);
  const norm = (a) => { a = a % B.TAU; if (a > Math.PI) a -= B.TAU; if (a < -Math.PI) a += B.TAU; return a; };

  function makeRing(idx, k, startR) {
    return { idx, r: startR, target: R0 + k * SPACING, angle: B.rand(B.TAU), speed: speedFor(idx), gap: gapFor(idx), hue: (idx * 47 + 300) % 360, alpha: 0, flash: 0 };
  }
  function init(g) {
    rings = []; ringIndex = 1;
    for (let k = 0; k < VISIBLE; k++) { const r = makeRing(k + 1, k, R0 + k * SPACING); r.alpha = 1; rings.push(r); }
    ball = { x: CX, y: CY - 20, vx: B.rand(-60, 60), vy: 0, rot: 0, squash: 1 };
    gravSign = 1; timeMax = timeFor(1); timeLeft = timeMax; closing = false; closeF = 0; mood = "grin"; moodT = 0; hint = 1; bounceCool = 0; spawned = 0; over = false;
  }

  function escape(g) {
    const ring = rings[0];
    const col = B.hsv(ring.hue, 0.85, 1);
    // arc shards along the ring
    const span = B.TAU - ring.gap, a0 = ring.angle + ring.gap / 2;
    for (let k = 0; k < SHARDS; k++) {
      const a = a0 + (span * (k + 0.5)) / SHARDS, px = CX + Math.cos(a) * ring.r, py = CY + Math.sin(a) * ring.r;
      g.particles.burst(px, py, { n: 1, speed: 320, life: 0.9, size: 5, color: col, gravity: 420, shape: "square" });
    }
    g.particles.ring(CX, CY, { r: ring.r, grow: 420, color: col, width: 6, life: 0.5 });
    g.sfx.note(ringIndex + 4, { kind: "bell", vel: 0.6, dur: 0.7 });
    g.shake(10); g.haptic([20, 20, 40]);
    g.addScore(100 * ringIndex, ball.x, ball.y - 40, col);
    ringIndex++; hint = 0;
    rings.shift();
    const last = rings[rings.length - 1];
    rings.push(makeRing(last.idx + 1, VISIBLE - 1, last.r + SPACING));
    for (let k = 0; k < rings.length; k++) rings[k].target = R0 + k * SPACING;
    timeMax = timeFor(ringIndex); timeLeft = timeMax;
    mood = "wow"; moodT = 0.8;
    // push Bonko slightly outward so it clears the shards
    const d = Math.hypot(ball.x - CX, ball.y - CY) || 1;
    ball.vx += ((ball.x - CX) / d) * 120; ball.vy += ((ball.y - CY) / d) * 120;
  }

  function fail(g) {
    if (over) return; over = true; closing = true;
    mood = "sad"; moodT = 99; g.sfx.crack(); g.shake(6); g.haptic(60);
    ball.vx *= 0.3; ball.vy *= 0.3;
    g.gameOver({ delay: 900 });
  }

  function update(dt, g) {
    // rings: rotate, ease radius, fade in
    const rOld = rings[0].r;
    for (const r of rings) {
      if (!closing) r.angle += r.speed * dt;
      r.r = B.lerp(r.r, r.target, 1 - Math.exp(-7 * dt));
      r.alpha = Math.min(1, r.alpha + dt * 2.5);
      r.flash *= Math.exp(-6 * dt);
    }
    // the inner ring shrinks after an escape: carry Bonko with it so the ring never sweeps over him
    const ratio = rings[0].r / rOld;
    if (ratio !== 1) { ball.x = CX + (ball.x - CX) * ratio; ball.y = CY + (ball.y - CY) * ratio; ball.vx *= ratio; ball.vy *= ratio; }
    if (closing) { closeF = Math.min(1, closeF + dt * 3); }
    if (moodT > 0) { moodT -= dt; if (moodT <= 0 && !over) mood = "grin"; }
    if (bounceCool > 0) bounceCool -= dt;
    ball.squash = B.lerp(ball.squash, 1, 1 - Math.exp(-10 * dt));
    if (over) return;

    timeLeft -= dt;
    if (timeLeft <= 0) { timeLeft = 0; fail(g); return; }

    const ring = rings[0], steps = 3, h = dt / steps;
    for (let s = 0; s < steps; s++) {
      ball.vy += GRAV * gravSign * h;
      const sp = Math.hypot(ball.vx, ball.vy);
      if (sp > MAX_SPEED) { ball.vx *= MAX_SPEED / sp; ball.vy *= MAX_SPEED / sp; }
      ball.x += ball.vx * h; ball.y += ball.vy * h; ball.rot += ball.vx * h * 0.01;
      const dx = ball.x - CX, dy = ball.y - CY, d = Math.hypot(dx, dy) || 0.001;
      const limit = ring.r - STROKE / 2 - BALL_R;
      if (d > limit) {
        const nx = dx / d, ny = dy / d, a = Math.atan2(dy, dx);
        const diff = Math.abs(norm(a - ring.angle)), halfBall = Math.asin(Math.min(1, BALL_R / ring.r)) * 0.9;
        const inGap = diff + halfBall < ring.gap / 2;
        const dot = ball.vx * nx + ball.vy * ny;
        // the gap is a thin membrane: only a fast Bonko breaks through (a resting ball cannot drift out)
        if (inGap && dot >= MIN_ESC) {
          if (d >= ring.r) { escape(g); break; }
          continue; // flying through the gap
        }
        // bounce off the inside of the ring (or off the membrane when too slow)
        ball.x = CX + nx * limit; ball.y = CY + ny * limit;
        if (dot > 0) {
          ball.vx -= (1 + REST) * dot * nx; ball.vy -= (1 + REST) * dot * ny;
          if (inGap) { ring.flash = 1; }
          if (dot > 90 && bounceCool <= 0) {
            bounceCool = 0.07;
            g.sfx.thud(0.35); g.sfx.note(ringIndex - 1, { vel: 0.3, dur: 0.3 });
            g.addScore(10); ball.squash = 1.25;
            const near = !inGap && diff < ring.gap / 2 + NEAR;
            g.particles.burst(ball.x + nx * BALL_R, ball.y + ny * BALL_R, { n: near ? 10 : 4, speed: near ? 260 : 140, life: 0.35, size: 3, color: near || inGap ? C.white : B.hsv(ring.hue, 0.6, 1), gravity: 200 });
            if (near || inGap) { g.sfx.tick(); g.haptic(6); }
          }
        }
      }
    }
  }


  function drawRing(ctx, r, isInner) {
    const gap = isInner ? r.gap * (1 - closeF) : r.gap;
    const col = B.hsv(r.hue, 0.85, 1, r.alpha);
    ctx.save();
    ctx.globalAlpha = r.alpha;
    ctx.shadowColor = B.hsv(r.hue, 0.8, 1); ctx.shadowBlur = 18;
    ctx.strokeStyle = col; ctx.lineWidth = STROKE; ctx.lineCap = "round";
    ctx.beginPath();
    if (gap <= 0.001) ctx.arc(CX, CY, r.r, 0, B.TAU); else ctx.arc(CX, CY, r.r, r.angle + gap / 2, r.angle + B.TAU - gap / 2);
    ctx.stroke();
    if (gap > 0.001 && (isInner || r.flash > 0.05)) { // faint membrane across the gap; flashes white when Bonko is too slow
      ctx.shadowBlur = 0; ctx.lineWidth = 2; ctx.setLineDash([4, 8]);
      ctx.strokeStyle = B.withAlpha(C.white, 0.12 + r.flash * 0.6);
      ctx.beginPath(); ctx.arc(CX, CY, r.r, r.angle - gap / 2, r.angle + gap / 2); ctx.stroke(); ctx.setLineDash([]);
    }
    ctx.restore();
  }

  function draw(ctx, g) {
    // backdrop disc
    const outer = rings[rings.length - 1];
    ctx.fillStyle = B.withAlpha(C.bg2 || "#141A33", 0.8); ctx.beginPath(); ctx.arc(CX, CY, outer.r + 14, 0, B.TAU); ctx.fill();
    // gravity indicator (faint chevron in the middle)
    ctx.save(); ctx.translate(CX, CY); ctx.globalAlpha = 0.12; ctx.fillStyle = C.cyan;
    const s = gravSign;
    ctx.beginPath(); ctx.moveTo(-16, -10 * s); ctx.lineTo(0, 10 * s); ctx.lineTo(16, -10 * s); ctx.lineTo(0, -2 * s); ctx.closePath(); ctx.fill();
    ctx.restore();
    // rings, outer to inner
    for (let k = rings.length - 1; k >= 0; k--) drawRing(ctx, rings[k], k === 0);
    // Bonko
    g.drawMascot(ball.x, ball.y, BALL_R, { mood, rot: ball.rot, squash: ball.squash, look: [B.clamp(ball.vx / 500, -1, 1), gravSign * 0.6], ring: true });
    // time bar
    const frac = B.clamp(timeLeft / timeMax, 0, 1), low = frac < 0.25;
    ctx.fillStyle = B.withAlpha(C.white, 0.08); ctx.beginPath(); ctx.roundRect(BAR_X, BAR_Y - 5, BAR_W, 10, 5); ctx.fill();
    if (frac > 0) {
      const barCol = low ? C.red : C.cyan;
      ctx.save(); ctx.shadowColor = barCol; ctx.shadowBlur = low ? 14 + Math.sin(g.time * 14) * 6 : 10;
      ctx.fillStyle = barCol; ctx.beginPath(); ctx.roundRect(BAR_X, BAR_Y - 5, Math.max(10, BAR_W * frac), 10, 5); ctx.fill(); ctx.restore();
    }
    // ring count pictogram
    const n = Math.min(ringIndex - 1, 30);
    for (let i = 0; i < n; i++) { ctx.fillStyle = B.hsv((((i + 1) * 47 + 300) % 360), 0.8, 1); ctx.beginPath(); ctx.arc(24 + i * 15, 44, 4, 0, B.TAU); ctx.fill(); }
    if (hint > 0 && g.time < 4) {
      ctx.globalAlpha = 0.65 + Math.sin(g.time * 5) * 0.3; ctx.fillStyle = C.white; ctx.font = "800 22px Nunito"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText("Tap to flip gravity. Slip through the gap.", W / 2, 112); ctx.globalAlpha = 1;
    }
  }

  function pointer(e, g) {
    if (e.type !== "down" || over) return;
    gravSign = -gravSign; hint = 0;
    ball.vy *= 0.55;
    ball.vx += B.clamp((e.x - ball.x) * 1.6, -170, 170);
    ball.squash = 0.85;
    g.sfx.whoosh(); g.haptic(5);
  }

  B.createGame({
    id: "rings", howto: "Tap to flip gravity. Slip through the gap before the ring closes!", bg: "#0B1020",
    init, update, draw, pointer,
    onContinue(g) {
      over = false; closing = false; closeF = 0; mood = "grin"; moodT = 0;
      timeMax = timeFor(ringIndex); timeLeft = timeMax;
      ball.x = CX; ball.y = CY; ball.vx = B.rand(-60, 60); ball.vy = 0;
      g.floatText(W / 2, H / 2 - 120, "GAP REOPENED", C.green, 40);
    },
  });
})();
