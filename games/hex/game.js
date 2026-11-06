/* Hex Hole — a rotating hexagon with one missing edge. Tap to launch Bonko toward the tap point;
   escape through the hole before it grows shut. Copies the channel's v7 "hex hole" video. */
(function () {
  const B = window.Bonko, C = B.COLORS, W = B.W, H = B.H;
  const CX = 270, CY = 520, R = 210, BALL_R = 18, GRAV = 1300, STROKE = 12, REST = 0.85, LAUNCH = 900;
  const SUBSTEPS = 6, TRAIL_N = 8, RESPAWN_T = 0.3, HINT_T = 4;

  // state
  let level, sides, rot, w, holeIdx, closeT, closeDur, hue;
  let bx, by, bvx, bvy, brot, mood, moodT, trail, trailHead;
  let phase, phaseT, fromX, fromY, shards, hint, bounceCd, over, fade;
  // scratch
  const vx = new Float64Array(9), vy = new Float64Array(9);

  // vibrate only after a real user gesture (Chrome logs a console error otherwise)
  function hap(g, ms) { if (!navigator.userActivation || navigator.userActivation.hasBeenActive) g.haptic(ms); }
  function sidesFor(lv) { return lv % 5 === 0 ? 8 : lv % 3 === 0 ? 5 : 6; }
  function setupLevel(lv) {
    level = lv; sides = sidesFor(lv); hue = ((lv - 1) * 40) % 360;
    w = (0.9 + 0.12 * (lv - 1)) * (lv % 2 === 1 ? 1 : -1);
    rot = B.rand(B.TAU); holeIdx = B.randi(0, sides - 1); closeT = 0;
    closeDur = Math.max(4.5, 8 - (lv - 1) * (3.5 / 11));
  }
  function init(g) {
    setupLevel(1); fade = 1;
    bx = CX; by = CY; bvx = 0; bvy = 0; brot = 0; mood = "grin"; moodT = 0;
    trail = []; for (let i = 0; i < TRAIL_N; i++) trail.push({ x: CX, y: CY }); trailHead = 0;
    phase = "play"; phaseT = 0; fromX = CX; fromY = CY; shards = []; hint = 1; bounceCd = 0; over = false;
  }
  function pushTrail() { const t = trail[trailHead]; t.x = bx; t.y = by; trailHead = (trailHead + 1) % TRAIL_N; }
  function verts() {
    for (let i = 0; i <= sides; i++) { const a = rot + (i % sides) * B.TAU / sides; vx[i] = CX + R * Math.cos(a); vy[i] = CY + R * Math.sin(a); }
  }
  // circle vs segment: push out + reflect. returns impact speed (0 if no hit)
  function hitSeg(ax, ay, cx2, cy2) {
    const ex = cx2 - ax, ey = cy2 - ay, L2 = ex * ex + ey * ey; if (L2 < 1e-6) return 0;
    let t = ((bx - ax) * ex + (by - ay) * ey) / L2; t = t < 0 ? 0 : t > 1 ? 1 : t;
    const px = ax + ex * t, py = ay + ey * t, dx = bx - px, dy = by - py, d = Math.hypot(dx, dy), min = BALL_R + STROKE / 2;
    if (d >= min || d < 1e-6) return 0;
    const nx = dx / d, ny = dy / d; bx = px + nx * min; by = py + ny * min;
    const dot = bvx * nx + bvy * ny; if (dot >= 0) return 0;
    bvx -= (1 + REST) * dot * nx; bvy -= (1 + REST) * dot * ny; return -dot;
  }
  function onBounce(g, imp) {
    if (imp < 120 || bounceCd > 0) return; bounceCd = 0.08;
    g.sfx.thud(0.35); g.sfx.note(level + 1, { vel: 0.3, dur: 0.3 });
    g.addScore(5); g.particles.burst(bx, by, { n: 5, speed: 160, life: 0.3, size: 3, color: B.hsv(hue, 0.7, 1), gravity: 300 });
  }
  function launch(x, y, g) {
    let dx = x - bx, dy = y - by, d = Math.hypot(dx, dy); if (d < 4) { dx = 0; dy = -1; d = 1; }
    bvx = dx / d * LAUNCH; bvy = dy / d * LAUNCH; hint = 0; mood = "grin";
    g.sfx.whoosh(); hap(g, 8); g.particles.ring(bx, by, { color: B.hsv(hue, 0.5, 1), grow: 300, life: 0.25, width: 3 });
  }
  function escape(g) {
    verts(); const col = B.hsv(hue, 0.85, 1);
    for (let i = 0; i < sides; i++) {
      if (i === holeIdx) continue;
      const mx = (vx[i] + vx[i + 1]) / 2, my = (vy[i] + vy[i + 1]) / 2, nl = Math.hypot(mx - CX, my - CY), nx = (mx - CX) / nl, ny = (my - CY) / nl;
      for (let k = 0; k < 14; k++) {
        const t = (k + 0.5) / 14, s = B.rand(380, 620);
        shards.push({ x: vx[i] + (vx[i + 1] - vx[i]) * t, y: vy[i] + (vy[i + 1] - vy[i]) * t, vx: nx * s + B.rand(-60, 60), vy: ny * s + B.rand(-60, 60), life: 0.9, max: 0.9, r: B.rand(4, 7), col });
      }
    }
    g.shake(12); g.sfx.note(level + 9, { kind: "bell", vel: 0.6, dur: 0.9 }); g.sfx.pop(level);
    g.addScore(100 * level, bx, by - 30, col); g.particles.ring(CX, CY, { color: col, grow: 700, width: 6, life: 0.5 });
    g.particles.burst(bx, by, { n: 20, speed: 320, life: 0.6, color: [col, C.white, C.cyan] });
    mood = "wow"; moodT = 1.2; hap(g, [20, 20, 50]);
    setupLevel(level + 1); phase = "respawn"; phaseT = 0; fromX = bx; fromY = by; bvx = 0; bvy = 0;
  }
  function update(dt, g) {
    if (over) return;
    for (let i = shards.length - 1; i >= 0; i--) { const s = shards[i]; s.life -= dt; if (s.life <= 0) { shards.splice(i, 1); continue; } s.vy += 400 * dt; s.x += s.vx * dt; s.y += s.vy * dt; }
    if (moodT > 0) { moodT -= dt; if (moodT <= 0) mood = "grin"; }
    if (bounceCd > 0) bounceCd -= dt;
    if (phase === "respawn") {
      phaseT += dt; const k = Math.min(1, phaseT / RESPAWN_T), e = 1 - (1 - k) * (1 - k);
      bx = B.lerp(fromX, CX, e); by = B.lerp(fromY, CY, e); fade = k;
      rot += w * dt; pushTrail();
      if (k >= 1) { phase = "play"; fade = 1; }
      return;
    }
    rot += w * dt; closeT += dt;
    const c = Math.min(1, closeT / closeDur), half = c / 2;
    const h = dt / SUBSTEPS;
    for (let s = 0; s < SUBSTEPS; s++) {
      bvy += GRAV * h; bx += bvx * h; by += bvy * h; brot += bvx * h * 0.01;
      verts();
      for (let i = 0; i < sides; i++) {
        if (i !== holeIdx) { const imp = hitSeg(vx[i], vy[i], vx[i + 1], vy[i + 1]); if (imp) onBounce(g, imp); }
        else if (half > 0) {
          const ex = vx[i + 1] - vx[i], ey = vy[i + 1] - vy[i];
          let imp = hitSeg(vx[i], vy[i], vx[i] + ex * half, vy[i] + ey * half); if (imp) onBounce(g, imp);
          imp = hitSeg(vx[i] + ex * (1 - half), vy[i] + ey * (1 - half), vx[i + 1], vy[i + 1]); if (imp) onBounce(g, imp);
        }
      }
    }
    pushTrail();
    // escape: fully past the hole edge line (outward)
    verts();
    const mx = (vx[holeIdx] + vx[holeIdx + 1]) / 2, my = (vy[holeIdx] + vy[holeIdx + 1]) / 2, nl = Math.hypot(mx - CX, my - CY);
    const outDist = ((bx - CX) * (mx - CX) + (by - CY) * (my - CY)) / nl; // along outward normal of hole edge
    if (outDist > nl + BALL_R || Math.hypot(bx - CX, by - CY) > R + BALL_R + 6) { escape(g); return; }
    if (c >= 1) { over = true; mood = "sad"; g.sfx.crack(); g.shake(6); hap(g, 40); g.gameOver({ delay: 900 }); }
  }
  function draw(ctx, g) {
    verts();
    const col = B.hsv(hue, 0.8, 1), c = Math.min(1, closeT / closeDur), half = c / 2;
    // shards (burst)
    for (const s of shards) { ctx.globalAlpha = Math.max(0, s.life / s.max); ctx.fillStyle = s.col; ctx.fillRect(s.x - s.r, s.y - s.r, s.r * 2, s.r * 2); }
    ctx.globalAlpha = 1;
    // polygon
    ctx.save(); ctx.globalAlpha = fade; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.lineWidth = STROKE; ctx.strokeStyle = col; ctx.shadowColor = col; ctx.shadowBlur = 22;
    ctx.beginPath();
    for (let i = 0; i < sides; i++) {
      if (i !== holeIdx) { ctx.moveTo(vx[i], vy[i]); ctx.lineTo(vx[i + 1], vy[i + 1]); }
      else if (half > 0) {
        const ex = vx[i + 1] - vx[i], ey = vy[i + 1] - vy[i];
        ctx.moveTo(vx[i], vy[i]); ctx.lineTo(vx[i] + ex * half, vy[i] + ey * half);
        ctx.moveTo(vx[i + 1], vy[i + 1]); ctx.lineTo(vx[i + 1] - ex * half, vy[i + 1] - ey * half);
      }
    }
    ctx.stroke();
    // hole end-caps pulse (shows where the gap is)
    const pulse = 0.5 + Math.sin(g.time * 7) * 0.4, ex = vx[holeIdx + 1] - vx[holeIdx], ey = vy[holeIdx + 1] - vy[holeIdx];
    ctx.shadowBlur = 0; ctx.fillStyle = B.hsv(hue, 0.3, 1, pulse * (1 - c));
    ctx.beginPath(); ctx.arc(vx[holeIdx] + ex * half, vy[holeIdx] + ey * half, STROKE * 0.7, 0, B.TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(vx[holeIdx + 1] - ex * half, vy[holeIdx + 1] - ey * half, STROKE * 0.7, 0, B.TAU); ctx.fill();
    ctx.restore();
    // trail
    for (let i = 0; i < TRAIL_N; i++) {
      const t = trail[(trailHead + i) % TRAIL_N], a = (i + 1) / TRAIL_N;
      ctx.fillStyle = B.withAlpha(C.orange, a * 0.35); ctx.beginPath(); ctx.arc(t.x, t.y, BALL_R * (0.3 + a * 0.6), 0, B.TAU); ctx.fill();
    }
    g.drawMascot(bx, by, BALL_R, { mood, rot: brot, ring: true, look: [B.clamp(bvx / 600, -1, 1), B.clamp(bvy / 600, -1, 1)] });
    // level pictogram (dots, top-left)
    for (let i = 0; i < level; i++) { ctx.fillStyle = B.hsv(((i) * 40) % 360, 0.7, 1); ctx.beginPath(); ctx.arc(30 + (i % 12) * 18, 40 + Math.floor(i / 12) * 16, 6, 0, B.TAU); ctx.fill(); }
    if (hint > 0 && g.time < HINT_T) {
      ctx.globalAlpha = 0.6 + Math.sin(g.time * 5) * 0.3; ctx.fillStyle = C.white; ctx.font = "800 22px Nunito"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText("Tap to launch Bonko through the hole.", W / 2, 80); ctx.globalAlpha = 1;
    }
  }
  function pointer(e, g) {
    if (e.type !== "down" || over || phase !== "play") return;
    if (e.key) { launch(bx, by - 10, g); return; }
    launch(e.x, e.y, g);
  }
  window.__hexDebug = {
    centre: { x: CX, y: CY },
    holeAngle() { return rot + (holeIdx + 0.5) * B.TAU / sides; },
    holePoint() { const a = rot + (holeIdx + 0.5) * B.TAU / sides, ap = R * Math.cos(Math.PI / sides); return { x: CX + ap * Math.cos(a), y: CY + ap * Math.sin(a) }; },
    state() { return { level, sides, rot, holeIdx, R, closeT, closeDur, phase, bx, by, bvx, bvy, over, insideDist: Math.hypot(bx - CX, by - CY) }; },
  };
  B.createGame({ id: "hex", howto: "Tap to launch Bonko through the hole before it closes!", init, update, draw, pointer,
    onContinue(g) { over = false; closeT = 0; mood = "grin"; bvx = 0; bvy = 0; g.floatText(W / 2, H / 2, "HOLE REOPENED", C.green, 40); } });
})();
