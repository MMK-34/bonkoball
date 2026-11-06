/* Spike Dash — Bonko runs around the inside of a glowing ring. Tap to reverse.
   Spikes grow on the track ahead of him; every pop brings him back FASTER (channel video v6). */
(function () {
  const B = window.Bonko, C = B.COLORS, W = B.W, H = B.H, TAU = B.TAU;
  const CX = 270, CY = 520, R = 215, BR = 18, RUN_R = R - BR - 4;      // Bonko runs on radius RUN_R inside the ring
  const W0 = 1.6, W_CAP = 6, W_RAMP = 0.05, W_HIT = 0.4;
  const SPAN = (18 * Math.PI) / 180, HALF = SPAN / 2, BONKO_HALF = BR / RUN_R;
  const WARN_T = 0.6, LIVE_T = 2.5, FADE_T = 0.3, INVULN_T = 1.0, TRAIL_N = 16;
  const SPIKE_TIP = R - 44;

  let ang, dir, wmag, lives, spikes, spawnT, dodges, noteIdx, moodT, invuln, speedPulse, trail, gameIsOver, hintOn, lastRev;

  const angDiff = (a, b) => { let d = (a - b) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };
  const speedLevel = () => Math.floor((wmag - W0) / 0.5) + 1;
  const bx = () => CX + Math.cos(ang) * RUN_R, by = () => CY + Math.sin(ang) * RUN_R;

  function init(g) {
    ang = -Math.PI / 2; dir = 1; wmag = W0; lives = 3; spikes = []; spawnT = 1.0; dodges = 0; noteIdx = 0;
    moodT = 0; invuln = 0; speedPulse = 0; gameIsOver = false; hintOn = true; lastRev = -9;
    trail = []; for (let i = 0; i < TRAIL_N; i++) trail.push({ x: bx(), y: by() });
  }

  function spawn(g) {
    const double = g.time >= 25 && Math.random() < 0.35;
    for (let tries = 0; tries < 8; tries++) {
      let lead = wmag * (WARN_T + B.rand(0.15, 0.6));            // Bonko reaches it shortly after it turns solid
      lead = 0.5 + (lead % (TAU - 1.0));
      const a = ang + dir * lead;
      let ok = Math.abs(angDiff(a, ang)) > 0.45;
      for (const s of spikes) if (Math.abs(angDiff(s.a, a)) < (double ? 0.95 : 0.45)) ok = false;
      if (double) for (const s of spikes) if (Math.abs(angDiff(s.a, a + dir * 0.5)) < 0.45) ok = false;
      if (!ok) continue;
      spikes.push({ a, t: 0, hit: false, scored: false, hue: B.rand(335, 360) });
      if (double) spikes.push({ a: a + dir * 0.5, t: 0, hit: false, scored: false, hue: B.rand(300, 330) });
      return;
    }
  }

  function pop(g, s) {
    s.hit = true; s.t = WARN_T + LIVE_T;                        // start fading now, no dodge points
    const x = bx(), y = by();
    g.particles.burst(x, y, { n: 28, speed: 320, life: 0.7, size: 4, color: [C.orange, C.orange2, C.yellow], gravity: 500 });
    g.particles.ring(x, y, { color: C.orange, grow: 420, width: 5 });
    g.sfx.crack(); g.shake(10); g.haptic([20, 30, 40]);
    lives--; invuln = INVULN_T; moodT = 0; wmag = Math.min(W_CAP, wmag + W_HIT); speedPulse = 1;
    if (lives <= 0) { gameIsOver = true; g.gameOver({ delay: 700 }); }
    else g.floatText(W - 80, 150, "FASTER", C.orange, 20);
  }

  function update(dt, g) {
    if (gameIsOver) return;
    wmag = Math.min(W_CAP, wmag + W_RAMP * dt);
    ang += dir * wmag * dt;
    if (ang > TAU) ang -= TAU; if (ang < 0) ang += TAU;
    // trail (ring buffer: recycle the oldest entry)
    const t0 = trail.shift(); t0.x = bx(); t0.y = by(); trail.push(t0);
    if (invuln > 0) invuln -= dt;
    if (moodT > 0) moodT -= dt;
    if (speedPulse > 0) speedPulse = Math.max(0, speedPulse - dt * 1.6);
    if (hintOn && g.time > 4) hintOn = false;

    // spawn
    spawnT -= dt;
    if (spawnT <= 0) { spawn(g); spawnT = Math.max(0.5, 1.6 - g.time * 0.0275); }

    // spikes
    for (let i = spikes.length - 1; i >= 0; i--) {
      const s = spikes[i]; s.t += dt;
      const solid = s.t >= WARN_T && s.t < WARN_T + LIVE_T;
      if (solid && !s.hit && invuln <= 0 && Math.abs(angDiff(ang, s.a)) < HALF + BONKO_HALF * 0.75) { pop(g, s); if (gameIsOver) return; continue; }
      if (s.t >= WARN_T + LIVE_T && !s.hit && !s.scored) {
        s.scored = true; dodges++;
        const sx = CX + Math.cos(s.a) * (R - 20), sy = CY + Math.sin(s.a) * (R - 20);
        g.addScore(10 * speedLevel(), sx, sy, B.hsv(170, 0.5, 1)); g.sfx.tick();
        if (dodges % 10 === 0) { noteIdx = Math.min(noteIdx + 1, 14); g.sfx.note(noteIdx, { vel: 0.5, dur: 0.5, kind: "bell" }); g.shake(5); moodT = 0.4; g.particles.ring(bx(), by(), { color: C.cyan, grow: 360, width: 4 }); }
      }
      if (s.t >= WARN_T + LIVE_T + FADE_T) spikes.splice(i, 1);
    }
  }

  function drawSpike(ctx, s) {
    const a0 = s.a - HALF, a1 = s.a + HALF;
    const x0 = CX + Math.cos(a0) * (R + 3), y0 = CY + Math.sin(a0) * (R + 3);
    const x1 = CX + Math.cos(a1) * (R + 3), y1 = CY + Math.sin(a1) * (R + 3);
    const tx = CX + Math.cos(s.a) * SPIKE_TIP, ty = CY + Math.sin(s.a) * SPIKE_TIP;
    ctx.save();
    if (s.t < WARN_T) {                                      // warning: dashed pulsing outline
      const p = s.t / WARN_T, pulse = 0.45 + 0.45 * Math.sin(s.t * 28);
      ctx.globalAlpha = 0.35 + 0.6 * p * pulse; ctx.setLineDash([5, 5]); ctx.lineDashOffset = -s.t * 60;
      ctx.strokeStyle = B.hsv(s.hue, 0.8, 1); ctx.lineWidth = 2.5; ctx.shadowColor = B.hsv(s.hue, 0.9, 1); ctx.shadowBlur = 8;
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(tx, ty); ctx.lineTo(x1, y1); ctx.closePath(); ctx.stroke();
    } else {
      const over = s.t - WARN_T - LIVE_T, alpha = over > 0 ? Math.max(0, 1 - over / FADE_T) : 1;
      const grow = Math.min(1, (s.t - WARN_T) / 0.12);         // snap in
      const gx = B.lerp(CX + Math.cos(s.a) * (R + 3), tx, grow), gy = B.lerp(CY + Math.sin(s.a) * (R + 3), ty, grow);
      ctx.globalAlpha = alpha;
      ctx.shadowColor = B.hsv(s.hue, 0.9, 1); ctx.shadowBlur = 18 + 8 * Math.sin(s.t * 10);
      const grad = ctx.createLinearGradient(x0, y0, gx, gy); grad.addColorStop(0, B.hsv(s.hue, 0.9, 0.75)); grad.addColorStop(1, B.hsv(s.hue - 15, 0.6, 1));
      ctx.fillStyle = grad; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(gx, gy); ctx.lineTo(x1, y1); ctx.closePath(); ctx.fill();
      ctx.shadowBlur = 0; ctx.strokeStyle = "rgba(255,255,255,0.75)"; ctx.lineWidth = 1.5; ctx.stroke();
    }
    ctx.restore();
  }

  function draw(ctx, g) {
    // track ring
    ctx.save(); ctx.strokeStyle = B.withAlpha(C.cyan, 0.12); ctx.lineWidth = 34; ctx.beginPath(); ctx.arc(CX, CY, R - 17, 0, TAU); ctx.stroke(); ctx.restore();
    g.glowCircle(CX, CY, R, C.cyan, 22, 5);
    ctx.save(); ctx.strokeStyle = B.withAlpha(C.cyan, 0.25); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(CX, CY, R - 36, 0, TAU); ctx.stroke(); ctx.restore();

    // spikes
    for (const s of spikes) drawSpike(ctx, s);

    // trail
    const x = bx(), y = by();
    for (let i = 0; i < TRAIL_N; i++) {
      const p = trail[i], f = (i + 1) / TRAIL_N;
      ctx.fillStyle = B.hsv(30, 0.9, 1, f * f * 0.45); ctx.beginPath(); ctx.arc(p.x, p.y, BR * (0.3 + f * 0.6), 0, TAU); ctx.fill();
    }

    // Bonko
    const blink = invuln > 0 && Math.floor(invuln / 0.08) % 2 === 1;
    if (!blink) {
      const mood = invuln > 0 ? "dizzy" : moodT > 0 ? "wow" : "grin";
      const spd = wmag / W_CAP;
      g.drawMascot(x, y, BR, { mood, ring: true, rot: ang + Math.PI / 2, look: [dir * 0.8, 0.2], squash: 1 + spd * 0.08 });
    }

    // lives (orange dots, top-left)
    for (let i = 0; i < 3; i++) { ctx.fillStyle = i < lives ? C.orange : B.withAlpha(C.grey2, 0.5); ctx.beginPath(); ctx.arc(30 + i * 22, 42, 7, 0, TAU); ctx.fill(); }

    // speed bar (right side)
    const barX = W - 34, barTop = 170, barH = 420, f = B.clamp((wmag - 0) / W_CAP, 0, 1), hue = B.lerp(190, 0, B.clamp((wmag - W0) / (W_CAP - W0), 0, 1));
    ctx.save();
    ctx.fillStyle = "rgba(255,255,255,0.08)"; ctx.beginPath(); ctx.roundRect(barX - 7, barTop, 14, barH, 7); ctx.fill();
    const fh = barH * f;
    ctx.shadowColor = B.hsv(hue, 0.9, 1); ctx.shadowBlur = 10 + speedPulse * 22;
    ctx.fillStyle = speedPulse > 0 ? B.hsv(B.lerp(hue, 28, speedPulse), 0.9, 1) : B.hsv(hue, 0.85, 1);
    ctx.beginPath(); ctx.roundRect(barX - 5 - speedPulse * 3, barTop + barH - fh, 10 + speedPulse * 6, fh, 5); ctx.fill();
    ctx.shadowBlur = 0; ctx.fillStyle = B.hsv(hue, 0.5, 1); ctx.font = "900 13px Nunito"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("x" + speedLevel(), barX, barTop + barH + 18);
    ctx.restore();

    // hint
    if (hintOn && g.state === "playing" && g.time < 4) {
      ctx.save(); ctx.globalAlpha = 0.6 + Math.sin(g.time * 5) * 0.3; ctx.fillStyle = C.white; ctx.font = "800 22px Nunito"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText("Tap to reverse. Dodge the spikes.", W / 2, 84); ctx.restore();
    }
  }

  function pointer(e, g) {
    if (e.type !== "down" || gameIsOver) return;
    if (g.time - lastRev < 0.06) return;                        // debounce double events
    lastRev = g.time; dir = -dir; hintOn = false;
    g.sfx.whoosh(); g.haptic(8);
    g.particles.ring(bx(), by(), { color: C.white, grow: 220, width: 3, r: 10, life: 0.3 });
  }

  B.createGame({
    id: "speed", howto: "Tap to reverse. Dodge the spikes — every pop makes Bonko faster!", bg: "#0B1020",
    init, update, draw, pointer,
    onContinue(g) { lives = 3; invuln = INVULN_T; gameIsOver = false; spikes.length = 0; spawnT = 1.0; g.floatText(W / 2, H / 2, "+3 LIVES", C.green, 48); },
  });
})();
