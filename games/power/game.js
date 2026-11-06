/* Power Dig — tap the instant Bonko lands. Every PERFECT tap doubles his power
   (1, 2, 4 … 4096) and carves a bigger crater through the rainbow tile shell. */
(function () {
  const B = window.Bonko, C = B.COLORS, W = B.W, H = B.H;
  const COLS = 18, TILE = 30, GAP = 2, SURF0 = 500, BR = 20, GRAV = 2200, APEX = 170, BX = W / 2;
  const VLAUNCH = Math.sqrt(2 * GRAV * APEX); // ≈ 865 px/s → apex always APEX above the surface
  const WINDOW = 0.09, MAX_POW = 4096, MAX_LP = 12, RUN_TIME = 45, TIME_CAP = 60, TOP = 60, BOTTOM = H - 40;
  let rows = [], by = 0, vy = 0, camY = 0, power = 1, timeLeft = RUN_TIME, tSince = 9, impactUsed = true, pendingHit = false;
  let lastSurf = SURF0, sadT = 0, hitFlash = 0, glitchT = 0, glitchCool = 0, glitchSeed = 0, over = false, hintOn = true, maxDepth = 0, flashRow = -1;

  // ---------- tile shell ----------
  function makeRow(r) {
    const hue = (r * 23) % 360, cells = new Uint8Array(COLS); cells.fill(1);
    return { cells, count: COLS, hue, base: B.hsv(hue, 0.72, 0.8), hi: B.hsv(hue, 0.45, 1), lo: B.hsv(hue, 0.85, 0.5), fly: B.hsv(hue, 0.6, 1) };
  }
  function ensureRows(n) { while (rows.length <= n) rows.push(makeRow(rows.length)); }
  const rowY = (r) => SURF0 + r * TILE;
  function surfaceRow() { // first row with an intact tile under Bonko (cols 8 / 9)
    for (let r = 0; ; r++) { ensureRows(r + 1); const c = rows[r].cells; if (c[8] || c[9]) return r; }
  }
  const surfaceY = () => rowY(surfaceRow());
  const lp = () => Math.round(Math.log2(power));

  function init(g) {
    rows = []; ensureRows(40);
    power = 1; timeLeft = RUN_TIME; tSince = 9; impactUsed = true; pendingHit = false; sadT = 0; hitFlash = 0;
    glitchT = 0; glitchCool = 0; glitchSeed = 0; over = false; hintOn = true; maxDepth = 0; flashRow = -1;
    lastSurf = SURF0; by = SURF0 - BR - APEX; vy = 0; camY = SURF0 - 475;
  }

  function timeToImpact() { // seconds until Bonko's bottom reaches the surface under him
    const d = surfaceY() - BR - by; if (d <= 0) return 0;
    return (-vy + Math.sqrt(vy * vy + 2 * GRAV * d)) / GRAV;
  }

  // circular crater, radius grows with log2(power): 3 tiles wide at 1 → full width at 4096
  function carve(g, cx, cy) {
    const L = lp(), Rt = 1.5 + 7.5 * (L / MAX_LP), R = Rt * TILE, cyy = cy + R * 0.45;
    const r0 = Math.max(0, Math.floor((cyy - R - SURF0) / TILE)), r1 = Math.floor((cyy + R - SURF0) / TILE);
    ensureRows(r1 + 2);
    const stride = Math.max(1, Math.ceil((3.2 * Rt * Rt) / 90)); let n = 0, spawned = 0;
    const budget = Math.max(0, 280 - g.particles.count);
    for (let r = r0; r <= r1; r++) {
      const row = rows[r], ty = rowY(r) + TILE / 2, cells = row.cells;
      for (let c = 0; c < COLS; c++) {
        if (!cells[c]) continue;
        const tx = c * TILE + TILE / 2, dx = tx - cx, dy = ty - cyy;
        if (dx * dx + dy * dy > R * R) continue;
        cells[c] = 0; row.count--; n++;
        if (spawned < budget && n % stride === 0) {
          spawned++;
          g.particles.burst(tx, ty - camY, { n: 1, speed: 320 + L * 40, life: 0.9, size: 9, color: row.fly, gravity: 1200, shape: "square" });
        }
      }
    }
    return n;
  }

  function doHit(g) {
    const L = lp(), sy = lastSurf, scy = sy - camY, col = B.hsv((L * 30 + 20) % 360, 0.6, 1);
    const n = carve(g, BX, sy);
    g.addScore(10 * n, BX, scy - 80, col);
    g.sfx.thud(0.6 + L * 0.03);
    g.sfx.note(L + 1, { vel: 0.5, dur: 0.55, kind: L >= 7 ? "bell" : "pluck" });
    g.particles.ring(BX, scy, { color: col, grow: 520 + L * 90, width: 3 + L * 0.6, life: 0.5 });
    g.particles.burst(BX, scy, { n: 8 + L * 2, speed: 260 + L * 30, life: 0.5, size: 4, color: [C.white, C.orange, col], gravity: 400 });
    g.shake(Math.max(3, Math.min(20, 2 * L)));
    g.haptic(L >= 6 ? [20, 20, 40] : 15);
    hitFlash = 1; flashRow = surfaceRow(); hintOn = false;
    timeLeft = Math.min(TIME_CAP, timeLeft + 1); g.floatText(W / 2, 100, "+1s", C.cyan, 22);
    if (power < MAX_POW) power *= 2;
    if (power >= MAX_POW) g.floatText(BX, scy - 140, "MAX", C.yellow, 44);
  }
  function fail(g) {
    power = 1; sadT = 0.5; pendingHit = false;
    g.sfx.midi(50, { kind: "soft", vel: 0.35, dur: 0.3 }); g.haptic(30); g.shake(4);
  }

  function update(dt, g) {
    if (over) return;
    timeLeft -= dt; tSince += dt;
    if (sadT > 0) sadT -= dt;
    hitFlash = Math.max(0, hitFlash - dt * 3);
    // vertical bounce
    const surf = surfaceY();
    vy += GRAV * dt; by += vy * dt;
    if (vy > 0 && by + BR >= surf) {
      tSince = Math.max(0, (by + BR - surf) / vy); // sub-frame accurate impact time
      by = surf - BR; vy = -VLAUNCH; lastSurf = surf; impactUsed = false;
      if (pendingHit) { pendingHit = false; impactUsed = true; doHit(g); }
      else { g.sfx.thud(0.14); g.particles.burst(BX, surf - camY, { n: 3, speed: 120, life: 0.3, size: 3, color: rows[surfaceRow()].hi, gravity: 600 }); }
    }
    const depth = surfaceRow(); if (depth > maxDepth) maxDepth = depth;
    // camera: keep the bounce range (apex .. landing surface) centred around y≈380
    const target = (lastSurf - BR - APEX + surfaceY()) / 2 - 380;
    camY += (target - camY) * Math.min(1, dt * 8);
    // glitch bursts at power ≥ 256, at most ~3 per second
    if (lp() >= 8) {
      glitchCool -= dt; glitchT -= dt;
      if (glitchCool <= 0 && Math.random() < dt * 3) { glitchT = 0.07; glitchCool = 0.34; glitchSeed = B.randi(0, 1000); }
    } else glitchT = 0;
    if (timeLeft <= 0) { timeLeft = 0; over = true; g.gameOver({ delay: 400 }); }
  }

  function drawTiles(ctx, r0, r1, ox, fixed, L) {
    for (let r = r0; r <= r1; r++) {
      const row = rows[r]; if (!row.count) continue;
      const y = rowY(r) - camY + GAP / 2, cells = row.cells; let jx = ox;
      if (glitchT > 0 && (r * 7 + glitchSeed) % 3 === 0) jx += ((r + glitchSeed) & 1 ? 1 : -1) * (6 + (L - 8) * 2);
      ctx.fillStyle = fixed || row.base;
      for (let c = 0; c < COLS; c++) if (cells[c]) ctx.fillRect(c * TILE + GAP / 2 + jx, y, TILE - GAP, TILE - GAP);
      if (fixed) continue;
      ctx.fillStyle = row.hi;
      for (let c = 0; c < COLS; c++) if (cells[c]) ctx.fillRect(c * TILE + GAP / 2 + jx, y, TILE - GAP, 7);
      ctx.fillStyle = row.lo;
      for (let c = 0; c < COLS; c++) if (cells[c]) ctx.fillRect(c * TILE + GAP / 2 + jx, y + TILE - GAP - 5, TILE - GAP, 5);
    }
  }

  function draw(ctx, g) {
    if (!rows.length) return;
    const L = lp(), glitch = L >= 8, t = g.time;
    // cavern behind the shell
    const shellTop = Math.max(TOP, rowY(0) - camY);
    if (shellTop < H) { ctx.fillStyle = "#060915"; ctx.fillRect(0, shellTop, W, H - shellTop); }
    // tiles (only rows on screen)
    const r0 = Math.max(0, Math.floor((camY + TOP - SURF0) / TILE)), r1 = Math.max(r0, Math.ceil((camY + BOTTOM - SURF0) / TILE));
    ensureRows(r1 + 1);
    if (glitch) {
      const dx = 2 + (L - 8) + Math.sin(t * 37) * 1.5;
      drawTiles(ctx, r0, r1, -dx, "rgba(255,40,90,0.55)", L);
      drawTiles(ctx, r0, r1, dx, "rgba(40,230,255,0.55)", L);
    }
    drawTiles(ctx, r0, r1, 0, null, L);
    // bottom fade so the shell reads as endless
    const fg = ctx.createLinearGradient(0, BOTTOM - 120, 0, BOTTOM); fg.addColorStop(0, "rgba(11,16,32,0)"); fg.addColorStop(1, "rgba(11,16,32,0.9)");
    ctx.fillStyle = fg; ctx.fillRect(0, BOTTOM - 120, W, 120);
    // impact flash
    if (hitFlash > 0 && flashRow >= 0) {
      ctx.globalAlpha = hitFlash * 0.6; ctx.fillStyle = C.white; ctx.fillRect(0, rowY(flashRow) - camY - 3, W, 6); ctx.globalAlpha = 1;
    }
    // timing ring on the landing point
    const sy = surfaceY() - camY, tTo = timeToImpact(), inWin = tTo <= WINDOW || (tSince <= WINDOW && !impactUsed);
    const ringR = 26 + 110 * B.clamp(tTo / 0.55, 0, 1), pulse = 1 + Math.sin(t * 9) * 0.08;
    ctx.lineWidth = 3; ctx.strokeStyle = B.withAlpha(C.cyan, 0.75); ctx.beginPath(); ctx.arc(BX, sy, 26 * pulse, 0, B.TAU); ctx.stroke();
    ctx.lineWidth = 2; ctx.strokeStyle = B.withAlpha(inWin ? C.white : C.cyan, inWin ? 0.95 : 0.35); ctx.beginPath(); ctx.arc(BX, sy, ringR, 0, B.TAU); ctx.stroke();
    if (inWin) g.glowCircle(BX, sy, 8, C.white, 16);
    // Bonko
    const mood = sadT > 0 ? "sad" : L >= 6 ? "wow" : "grin", sq = vy > 0 ? 1 + Math.min(0.12, vy / 8000) : 1 - Math.min(0.08, -vy / 12000);
    g.drawMascot(BX, by - camY, BR, { mood, ring: true, look: [0.2, 0.8], squash: sq });
    // power meter: one orange dot per doubling, right side
    for (let i = 0; i < MAX_LP; i++) {
      const y = 820 - i * 24, on = i < L, last = i === L - 1;
      ctx.fillStyle = on ? C.orange : "rgba(255,255,255,0.12)"; ctx.beginPath(); ctx.arc(W - 22, y, on ? 7 + (last ? Math.sin(t * 10) * 1.5 : 0) : 5, 0, B.TAU); ctx.fill();
      if (on && (last || L >= MAX_LP)) g.glowCircle(W - 22, y, 7, C.orange2, 14);
    }
    // depth pictogram bar, left side
    const bx = 16, by0 = 130, bh = 690, frac = B.clamp(maxDepth / 160, 0, 1);
    ctx.fillStyle = "rgba(255,255,255,0.1)"; ctx.beginPath(); ctx.roundRect(bx - 4, by0, 8, bh, 4); ctx.fill();
    if (frac > 0) {
      const gr = ctx.createLinearGradient(0, by0, 0, by0 + bh); gr.addColorStop(0, C.cyan); gr.addColorStop(0.5, C.purple); gr.addColorStop(1, C.pink);
      ctx.fillStyle = gr; ctx.beginPath(); ctx.roundRect(bx - 4, by0, 8, bh * frac, 4); ctx.fill();
    }
    const curFrac = B.clamp(surfaceRow() / 160, 0, 1);
    ctx.fillStyle = C.orange; ctx.beginPath(); ctx.moveTo(bx + 8, by0 + bh * curFrac); ctx.lineTo(bx + 16, by0 + bh * curFrac - 6); ctx.lineTo(bx + 16, by0 + bh * curFrac + 6); ctx.fill();
    // timer bar
    const tf = B.clamp(timeLeft / RUN_TIME, 0, 1), low = timeLeft < 8;
    ctx.fillStyle = "rgba(255,255,255,0.12)"; ctx.beginPath(); ctx.roundRect(40, 66, W - 80, 10, 5); ctx.fill();
    ctx.fillStyle = low ? B.withAlpha(C.red, 0.7 + Math.sin(t * 6) * 0.3) : C.cyan; ctx.beginPath(); ctx.roundRect(40, 66, (W - 80) * tf, 10, 5); ctx.fill();
    // hint
    if (hintOn && t < 5) {
      ctx.globalAlpha = 0.6 + Math.sin(t * 5) * 0.3; ctx.fillStyle = C.white; ctx.font = "800 22px Nunito"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText("Tap the instant Bonko lands.", W / 2, 110); ctx.globalAlpha = 1;
    }
  }

  function pointer(e, g) {
    if (e.type !== "down" || over) return;
    if (pendingHit) return; // already armed for this landing
    if (!impactUsed && tSince <= WINDOW) { impactUsed = true; doHit(g); return; } // just after landing
    if (timeToImpact() <= WINDOW && vy > 0) { pendingHit = true; return; }           // just before landing
    fail(g);
  }

  window.__powerDebug = { timeToImpact, get power() { return power; }, get timeLeft() { return timeLeft; }, get depth() { return surfaceRow(); }, get tSince() { return tSince; } };

  B.createGame({
    id: "power", howto: "Tap the instant Bonko lands. Every PERFECT doubles his power!", init, update, draw, pointer,
    onContinue(g) { over = false; timeLeft = 15; pendingHit = false; g.floatText(W / 2, H / 2, "+15s", C.cyan, 48); },
  });
})();
