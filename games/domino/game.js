/* Domino Chain — draw a path with one finger, tap GO, watch the rainbow cascade topple.
   Top-down view. Dominoes are placed along the drawn path; Bonko rolls into the first one. */
(function () {
  const B = window.Bonko, C = B.COLORS, W = B.W, H = B.H;
  const DW = 14, DL = 36, DH = 46;                 // domino thickness (along path), width, fake-3D height
  const STEP = 26, MIN_D = 22, MAX_N = 300, LINK = 40;
  const TRIG_D = 34, TRIG_COS = Math.cos((75 * Math.PI) / 180), FALL_T = 0.12, HALF = Math.PI / 2;
  const GO = { x: 270, y: 870, r: 48 }, IDLE_GO = 25, ROLL_T = 0.4, END_T = 0.8, BONKO_R = 22;
  let doms, phase, idle, hint, stroke, bonko, roll, falling, fallen, lastFall, mood, done;

  function init(g) {
    doms = []; phase = "draw"; idle = 0; hint = 1; stroke = null; falling = []; fallen = 0; lastFall = 0; mood = "grin"; done = false;
    bonko = { x: W / 2, y: 300, rot: 0, sx: 0, sy: 0, tx: 0, ty: 0 }; roll = 0;
  }

  // ---------- drawing phase ----------
  function tooClose(x, y) {
    for (let i = 0; i < doms.length; i++) { const d = doms[i], dx = d.x - x, dy = d.y - y; if (dx * dx + dy * dy < MIN_D * MIN_D) return true; }
    return false;
  }
  function place(x, y, dir, g) {
    if (doms.length >= MAX_N) return;
    x = B.clamp(x, 12, W - 12); y = B.clamp(y, 72, H - 58);
    if (tooClose(x, y)) return;
    const i = doms.length, last = doms[i - 1];
    const linked = i === 0 || stroke.n > 0 || (last && B.dist(last.x, last.y, x, y) <= LINK);
    doms.push({ x, y, dir, hue: (i * 7) % 360, a: 0, st: 0, fd: dir, trig: false, linked, born: g.time });
    stroke.n++; hint = 0;
    if (i === 0) { bonko.x = x - Math.cos(dir) * 56; bonko.y = y - Math.sin(dir) * 56; }
    g.sfx.tick();
    if (i === MAX_N - 1) { g.floatText(x, y - 40, "MAX!", C.yellow, 30); g.haptic(15); }
  }
  function pointer(e, g) {
    idle = 0;
    if (phase !== "draw") return;
    if (e.type === "down") {
      if (e.key || B.dist(e.x, e.y, GO.x, GO.y) <= GO.r + 12) { if (doms.length) startRun(g); return; }
      stroke = { px: e.x, py: e.y, acc: 0, n: 0, first: true };
    } else if (e.type === "move" && stroke && g.pointer.down) {
      const dx = e.x - stroke.px, dy = e.y - stroke.py, L = Math.hypot(dx, dy);
      if (L < 2) return;
      const dir = Math.atan2(dy, dx), ux = dx / L, uy = dy / L;
      if (stroke.first) { stroke.first = false; place(stroke.px, stroke.py, dir, g); stroke.acc = 0; }
      // interpolate between pointer samples so fast fingers leave no gaps > STEP
      let t = 0;
      while (stroke.acc + (L - t) >= STEP) { t += STEP - stroke.acc; stroke.acc = 0; place(stroke.px + ux * t, stroke.py + uy * t, dir, g); }
      stroke.acc += L - t;
      stroke.px = e.x; stroke.py = e.y;
    } else if (e.type === "up") { stroke = null; }
  }

  // ---------- run ----------
  function startRun(g) {
    phase = "roll"; roll = 0; stroke = null;
    const d0 = doms[0];
    bonko.sx = bonko.x; bonko.sy = bonko.y;
    bonko.tx = d0.x - Math.cos(d0.dir) * (DW / 2 + BONKO_R - 4); bonko.ty = d0.y - Math.sin(d0.dir) * (DW / 2 + BONKO_R - 4);
    g.sfx.whoosh(); g.haptic(10);
  }
  function knock(j, fx, fy, g) {
    const d = doms[j]; d.st = 1; d.a = 0; d.fd = Math.atan2(d.y - fy, d.x - fx); d.trig = false; falling.push(j);
    fallen++; lastFall = g.time;
    g.addScore(10);
    if (fallen % 5 === 0) g.floatText(d.x, d.y - 30, "+50", B.hsv(d.hue, 0.5, 1), 26);
    let k = Math.floor(fallen / 2); if (k > 24) k = 20 + (fallen % 5);
    g.sfx.note(k, { vel: 0.32, dur: 0.3 });
    g.particles.burst(d.x, d.y, { n: 3, speed: 140, life: 0.3, size: 3, color: B.hsv(d.hue, 0.5, 1), gravity: 200 });
    if (fallen % 25 === 0) {
      g.shake(6); g.particles.ring(d.x, d.y, { color: B.hsv(d.hue, 0.6, 1), grow: 420, width: 5 }); g.haptic(20);
      g.floatText(d.x, d.y - 54, fallen + "!", C.yellow, 36);
    } else if (fallen % 5 === 0) g.haptic(6);
  }
  function tryKnock(i, g) {
    const d = doms[i], cx = Math.cos(d.fd), cy = Math.sin(d.fd);
    for (let j = 0; j < doms.length; j++) {
      if (j === i) continue;
      const o = doms[j]; if (o.st !== 0) continue;
      const dx = o.x - d.x, dy = o.y - d.y, L = Math.hypot(dx, dy);
      if (L > TRIG_D || L < 0.001) continue;
      if ((dx * cx + dy * cy) / L < TRIG_COS) continue;   // angle between fall direction and chain direction must be < 75°
      knock(j, d.x, d.y, g);
    }
  }
  function finish(g) {
    if (done) return; done = true; phase = "done";
    const all = fallen === doms.length;
    if (all) {
      mood = "wow"; g.addScore(5 * fallen, W / 2, 300, C.yellow); g.shake(10);
      [8, 10, 12, 15].forEach((k) => g.sfx.note(k, { kind: "bell", vel: 0.4, dur: 0.8 }));
      g.particles.burst(bonko.x, bonko.y, { n: 40, speed: 420, color: [C.orange, C.cyan, C.yellow, C.pink], life: 1 });
      g.floatText(W / 2, 240, "PERFECT!", C.yellow, 46);
    } else { mood = "sad"; g.sfx.thud(0.4); }
    g.gameOver({ win: all, delay: all ? 1000 : 700 });
  }
  function update(dt, g) {
    idle += dt;
    if (phase === "draw") { if (idle >= IDLE_GO && doms.length) startRun(g); return; }
    if (phase === "roll") {
      roll += dt; const t = Math.min(1, roll / ROLL_T), e = t * t;
      bonko.x = B.lerp(bonko.sx, bonko.tx, e); bonko.y = B.lerp(bonko.sy, bonko.ty, e); bonko.rot += dt * 16;
      if (t >= 1) { phase = "cascade"; g.sfx.pop(0); g.haptic(12); knock(0, bonko.x, bonko.y, g); g.particles.burst(bonko.x, bonko.y, { n: 10, speed: 200, color: C.orange, life: 0.4 }); }
      return;
    }
    if (phase === "cascade") {
      for (let n = falling.length - 1; n >= 0; n--) {
        const i = falling[n], d = doms[i];
        d.a += (dt * HALF) / FALL_T;
        if (!d.trig && d.a >= HALF / 2) { d.trig = true; tryKnock(i, g); }
        if (d.a >= HALF) { d.a = HALF; d.st = 2; falling.splice(n, 1); }
      }
      if (falling.length === 0 && g.time - lastFall >= END_T) finish(g);
    }
  }

  // ---------- drawing ----------
  function drawDom(ctx, d) {
    ctx.save(); ctx.translate(d.x, d.y);
    if (d.st === 0) {
      ctx.rotate(d.dir);
      ctx.fillStyle = B.hsv(d.hue, 0.6, 1, 0.2); ctx.beginPath(); ctx.roundRect(-DW / 2 - 4, -DL / 2 - 4, DW + 8, DL + 8, 7); ctx.fill();
      ctx.fillStyle = B.hsv(d.hue, 0.75, 1); ctx.beginPath(); ctx.roundRect(-DW / 2, -DL / 2, DW, DL, 4); ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.4)"; ctx.fillRect(-DW / 2 + 2, -DL / 2 + 3, 3, DL - 6);
    } else {
      ctx.rotate(d.fd);
      const s = Math.sin(d.a), c = Math.cos(d.a);
      const x0 = DW / 2 - DW * c, x1 = DW / 2 + DH * s, len = Math.max(2, x1 - x0);   // pivot = front base edge
      ctx.fillStyle = "rgba(0,0,0,0.28)"; ctx.beginPath(); ctx.roundRect(x0 + 3, -DL / 2 + 3, len, DL, 4); ctx.fill();
      ctx.fillStyle = B.hsv(d.hue, 0.7, 1 - 0.45 * s); ctx.beginPath(); ctx.roundRect(x0, -DL / 2, len, DL, 4); ctx.fill();
      ctx.fillStyle = B.hsv(d.hue, 0.8, 0.35); ctx.fillRect(x0, -DL / 2, 3, DL);
      if (d.st === 1) { ctx.fillStyle = B.hsv(d.hue, 0.3, 1, 0.5 * (1 - d.a / HALF)); ctx.beginPath(); ctx.roundRect(x0 - 3, -DL / 2 - 3, len + 6, DL + 6, 6); ctx.fill(); }
    }
    ctx.restore();
  }
  function draw(ctx, g) {
    // faint path connector between linked dominoes
    if (doms.length > 1) {
      ctx.strokeStyle = "rgba(255,255,255,0.08)"; ctx.lineWidth = 6; ctx.lineCap = "round"; ctx.beginPath();
      for (let i = 1; i < doms.length; i++) { if (!doms[i].linked) continue; ctx.moveTo(doms[i - 1].x, doms[i - 1].y); ctx.lineTo(doms[i].x, doms[i].y); }
      ctx.stroke();
    }
    // fallen first, then falling, then standing (standing must stay on top)
    for (let i = 0; i < doms.length; i++) if (doms[i].st === 2) drawDom(ctx, doms[i]);
    for (let i = 0; i < doms.length; i++) if (doms[i].st === 1) drawDom(ctx, doms[i]);
    for (let i = 0; i < doms.length; i++) if (doms[i].st === 0) drawDom(ctx, doms[i]);

    // GO circle (drawing phase only)
    if (phase === "draw") {
      const ready = doms.length > 0, pulse = ready ? 1 + Math.sin(g.time * 5) * 0.06 : 1, r = GO.r * pulse;
      ctx.globalAlpha = ready ? 1 : 0.45;
      g.glowCircle(GO.x, GO.y, r, C.orange, ready ? 34 : 10);
      ctx.fillStyle = C.orange; ctx.beginPath(); ctx.arc(GO.x, GO.y, r, 0, B.TAU); ctx.fill();
      ctx.fillStyle = C.orange2 || "#FFB347"; ctx.beginPath(); ctx.arc(GO.x - r * 0.18, GO.y - r * 0.22, r * 0.55, 0, B.TAU); ctx.fill();
      ctx.fillStyle = C.orange; ctx.beginPath(); ctx.arc(GO.x - r * 0.1, GO.y - r * 0.12, r * 0.5, 0, B.TAU); ctx.fill();
      ctx.fillStyle = C.white; ctx.font = "900 34px Nunito"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("GO", GO.x, GO.y + 2);
      if (ready && idle > IDLE_GO - 10) { // auto-start countdown ring
        ctx.strokeStyle = C.cyan; ctx.lineWidth = 5; ctx.lineCap = "round"; ctx.beginPath();
        ctx.arc(GO.x, GO.y, r + 8, -HALF, -HALF + B.TAU * ((idle - (IDLE_GO - 10)) / 10)); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    // Bonko
    if (doms.length === 0) {
      const by = 300 + Math.sin(g.time * 3) * 6;
      g.drawMascot(W / 2, by, BONKO_R, { ring: true, look: [0, 0.6], squash: 1 + Math.sin(g.time * 6) * 0.04 });
    } else {
      const d0 = doms[0], lx = B.clamp((d0.x - bonko.x) / 60, -1, 1), ly = B.clamp((d0.y - bonko.y) / 60, -1, 1);
      g.drawMascot(bonko.x, bonko.y, BONKO_R, { mood, ring: true, rot: bonko.rot, look: [lx, ly], squash: phase === "draw" ? 1 + Math.sin(g.time * 6) * 0.04 : 1 });
    }

    // placed-dominoes bar (bottom-left), fills to MAX_N; fallen shown in white on top
    const bx = 20, by = H - 54, bw = 130, bh = 8;
    ctx.fillStyle = "rgba(255,255,255,0.12)"; ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 4); ctx.fill();
    if (doms.length) {
      ctx.fillStyle = B.hsv(((doms.length - 1) * 7) % 360, 0.7, 1); ctx.beginPath(); ctx.roundRect(bx, by, Math.max(bh, (bw * doms.length) / MAX_N), bh, 4); ctx.fill();
      if (fallen) { ctx.fillStyle = C.white; ctx.beginPath(); ctx.roundRect(bx, by, Math.max(bh, (bw * fallen) / MAX_N), bh, 4); ctx.fill(); }
    }
    for (let i = 0; i < 3; i++) { ctx.fillStyle = "rgba(255,255,255,0.25)"; ctx.fillRect(bx + 16 + i * 10, by - 12, 4, 8); } // tiny domino pictogram

    if (hint > 0 && phase === "draw" && g.time < 6) {
      ctx.globalAlpha = 0.6 + Math.sin(g.time * 5) * 0.3; ctx.fillStyle = C.white; ctx.font = "800 22px Nunito"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText("Draw a path with your finger, then tap GO.", W / 2, 78); ctx.globalAlpha = 1;
    }
  }

  B.createGame({ id: "domino", howto: "Draw a path with your finger, then tap GO. Topple every domino!", init, update, draw, pointer });
})();
