/* Edge Runner — a rotating polygon loses every edge Bonko hits. Tap to steer out through a gap before
   the timer runs out; when it does, the remaining edges snap shut. Follows the plinko reference structure. */
(function () {
  const B = window.Bonko, C = B.COLORS, W = B.W, H = B.H;
  const CX = 270, CY = 520, R = 220, BALL_R = 17, STROKE = 10, HALF = STROKE / 2, MIN_D = BALL_R + HALF;
  const GRAV = 900, REST = 0.9, ROT = 0.35, TAP_V = 650, TAP_CAP = 1100, SPEED_CAP = 1500, SUBSTEPS = 8;
  const REGROW = 2.2, OPEN_T = 0.3, KICK = 550, HOLD_GAP = 0.2, TWEEN_T = 0.3, SNAP_T = 0.6;
  const BAR_X = 30, BAR_Y = 66, BAR_H = 10;

  let level, N, edges, ang, dir, polyR, ball, timer, timerMax, deleted, trail, trailT, hint;
  let phase, tween, tweenFrom, holding, holdT, continueHelp, moodT, snapCracked, hitThisStep;
  const lastHole = { x: 0, y: 0 };
  // scratch vectors (no per-frame allocation in the hot loop)
  const vA = { x: 0, y: 0 }, vB = { x: 0, y: 0 };

  const levelN = (lv) => Math.min(24, 12 + (lv - 1) * 2);
  const levelTime = (lv) => Math.max(8, 14 - (lv - 1) * (6 / 9));
  const hueOf = (i) => (i * 360) / N;
  const sector = () => B.TAU / N;
  // fraction of the edge regrown from EACH end (0 = full gap, 0.5 = closed). Fully open for OPEN_T, then a sqrt ease
  // (closes fast at first, slow at the end) so a hole is narrower than Bonko by the time a free bounce returns to it.
  const growFrac = (e) => (e.t > REGROW - OPEN_T ? 0 : Math.sqrt((REGROW - OPEN_T - e.t) / (REGROW - OPEN_T)) * 0.5);

  function makeEdges(n) {
    const arr = [];
    for (let i = 0; i < n; i++) arr.push({ alive: true, t: 0 });
    return arr;
  }
  function vertex(i, out, r) {
    const a = ang + i * sector();
    out.x = CX + Math.cos(a) * (r === undefined ? polyR : r); out.y = CY + Math.sin(a) * (r === undefined ? polyR : r);
    return out;
  }
  function newPolygon(lv) {
    level = lv; N = levelN(lv); edges = makeEdges(N); dir = lv % 2 === 1 ? 1 : -1; timerMax = levelTime(lv); timer = timerMax;
  }
  function init(g) {
    ang = 0; polyR = R; deleted = 0; trail = []; trailT = 0; hint = 1; holding = false; holdT = 0; continueHelp = false; moodT = 0; snapCracked = false;
    ball = { x: CX, y: CY - 40, vx: 0, vy: 0, rot: 0, mood: "grin" };
    newPolygon(1); phase = "play"; tween = 0;
    g.dbg = () => ({ level, phase, N, timer: +timer.toFixed(2), alive: edges.filter((e) => e.alive).length, deleted, x: Math.round(ball.x), y: Math.round(ball.y), vx: Math.round(ball.vx), vy: Math.round(ball.vy), polyR: Math.round(polyR), hole: { x: Math.round(lastHole.x), y: Math.round(lastHole.y) } });
  }

  // ---- gameplay events ----
  function edgeMid(i, out) {
    vertex(i, vA); vertex(i + 1, vB); out.x = (vA.x + vB.x) / 2; out.y = (vA.y + vB.y) / 2; return out;
  }
  function shatterEdge(i, g, n) {
    const m = edgeMid(i, vA);
    g.particles.burst(m.x, m.y, { n: n || 6, speed: 260, life: 0.65, size: 7, color: B.hsv(hueOf(i), 0.85, 1), gravity: 500, shape: "square" });
  }
  function deleteEdge(i, g, silent) {
    const e = edges[i]; e.alive = false; e.t = REGROW;
    shatterEdge(i, g);
    if (silent) return;
    deleted++; const m = edgeMid(i, vA); lastHole.x = m.x; lastHole.y = m.y; hitThisStep = true;
    g.sfx.crack(); g.sfx.note(Math.min(2 + deleted, 16), { vel: 0.4, dur: 0.3 });
    g.shake(5); g.haptic(10); g.addScore(10, m.x, m.y, B.hsv(hueOf(i), 0.5, 1));
  }
  function impulse(g, tx, ty) {
    let dx = tx - ball.x, dy = ty - ball.y; const d = Math.hypot(dx, dy);
    if (d < 1) { dx = 0; dy = -1; } else { dx /= d; dy /= d; }
    ball.vx += dx * TAP_V; ball.vy += dy * TAP_V;
    const s = Math.hypot(ball.vx, ball.vy); if (s > TAP_CAP) { ball.vx *= TAP_CAP / s; ball.vy *= TAP_CAP / s; }
    trailT = 0.35; hint = 0; g.sfx.whoosh(); g.haptic(6);
    g.particles.burst(ball.x - dx * BALL_R, ball.y - dy * BALL_R, { n: 5, speed: 160, life: 0.3, size: 3, color: C.cyan });
  }
  function escape(g) {
    const gain = 100 * level;
    g.addScore(gain, ball.x, ball.y, C.yellow); g.sfx.note(Math.min(6 + level, 16), { kind: "bell", vel: 0.55, dur: 0.6 });
    g.particles.ring(ball.x, ball.y, { color: C.cyan, grow: 650, width: 6 }); g.shake(10); g.haptic([20, 20, 40]);
    ball.mood = "wow"; moodT = 1.2;
    for (let i = 0; i < N; i++) if (edges[i].alive || growFrac(edges[i]) > 0) shatterEdge(i, g, 6);
    newPolygon(level + 1); g.floatText(W / 2, 220, "LEVEL " + level, C.cyan, 44);
    startTween();
  }
  function startTween() {
    phase = "respawn"; tween = 0; tweenFrom = { x: ball.x, y: ball.y }; ball.vx = 0; ball.vy = 0; holding = false; polyR = 0; trail.length = 0;
  }
  function snapShut(g) {
    phase = "snap"; tween = 0; tweenFrom = { x: ball.x, y: ball.y }; ball.vx = 0; ball.vy = 0; holding = false;
    for (const e of edges) { e.alive = true; e.t = 0; }
    ball.mood = "sad"; g.sfx.crack(); g.shake(6); snapCracked = false;
  }

  // ---- physics ----
  // reflect off an inward normal (dot = v·n, negative when approaching) and guarantee a minimum outgoing speed
  function bounce(nx, ny, dot) {
    ball.vx -= (1 + REST) * dot * nx; ball.vy -= (1 + REST) * dot * ny;
    const vn = ball.vx * nx + ball.vy * ny; if (vn < KICK) { ball.vx += (KICK - vn) * nx; ball.vy += (KICK - vn) * ny; }
  }
  function collideSegment(ax, ay, bx, by, g, edgeIdx) {
    const abx = bx - ax, aby = by - ay, len2 = abx * abx + aby * aby;
    let t = len2 > 0 ? ((ball.x - ax) * abx + (ball.y - ay) * aby) / len2 : 0; t = t < 0 ? 0 : t > 1 ? 1 : t;
    const px = ax + abx * t, py = ay + aby * t, dx = ball.x - px, dy = ball.y - py, d = Math.hypot(dx, dy);
    if (d >= MIN_D || d === 0) return false;
    const nx = dx / d, ny = dy / d, dot = ball.vx * nx + ball.vy * ny;
    ball.x = px + nx * MIN_D; ball.y = py + ny * MIN_D;
    if (dot < 0) { bounce(nx, ny, dot); if (!hitThisStep) deleteEdge(edgeIdx, g); return true; }
    return false;
  }
  function step(h, g) {
    hitThisStep = false; ball.vy += GRAV * h;
    const sp = Math.hypot(ball.vx, ball.vy); if (sp > SPEED_CAP) { ball.vx *= SPEED_CAP / sp; ball.vy *= SPEED_CAP / sp; }
    ball.x += ball.vx * h; ball.y += ball.vy * h; ball.rot += ball.vx * h * 0.015;

    // 1) sector test against the edge Bonko is radially under: anti-tunnel + escape detection
    const sec = sector(); let a = Math.atan2(ball.y - CY, ball.x - CX) - ang; a = ((a % B.TAU) + B.TAU) % B.TAU;
    const idx = Math.min(N - 1, Math.floor(a / sec)), e = edges[idx];
    const na = ang + (idx + 0.5) * sec, nx = Math.cos(na), ny = Math.sin(na), apothem = R * Math.cos(Math.PI / N);
    const sd = (ball.x - CX) * nx + (ball.y - CY) * ny - apothem; // signed distance of the centre to the edge line (outward +)
    if (e.alive) {
      if (sd > -MIN_D && sd < 6) {
        ball.x -= nx * (sd + MIN_D); ball.y -= ny * (sd + MIN_D);
        const dot = ball.vx * nx + ball.vy * ny;
        if (dot > 0) { bounce(-nx, -ny, -dot); deleteEdge(idx, g); }
      }
    } else if (sd > MIN_D || Math.hypot(ball.x - CX, ball.y - CY) > R + BALL_R + 12) { escape(g); return true; }

    // 2) capsule collisions with every solid (or partially regrown) edge — handles corners
    for (let i = 0; i < N; i++) {
      const ed = edges[i];
      if (ed.alive) { vertex(i, vA); vertex(i + 1, vB); if (collideSegment(vA.x, vA.y, vB.x, vB.y, g, i)) { } }
      else if (growFrac(ed) > 0) {
        const k = growFrac(ed); vertex(i, vA); vertex(i + 1, vB);
        const mx = vA.x + (vB.x - vA.x) * k, my = vA.y + (vB.y - vA.y) * k, mx2 = vB.x + (vA.x - vB.x) * k, my2 = vB.y + (vA.y - vB.y) * k;
        if (collideSegment(vA.x, vA.y, mx, my, g, i)) continue;
        collideSegment(vB.x, vB.y, mx2, my2, g, i);
      }
    }
    return false;
  }

  function update(dt, g) {
    ang += dir * ROT * dt;
    if (moodT > 0) { moodT -= dt; if (moodT <= 0 && ball.mood === "wow") ball.mood = "grin"; }
    for (let i = trail.length - 1; i >= 0; i--) { trail[i].life -= dt; if (trail[i].life <= 0) trail.splice(i, 1); }
    if (trailT > 0) { trailT -= dt; trail.push({ x: ball.x, y: ball.y, life: 0.3 }); if (trail.length > 14) trail.shift(); }

    if (phase === "play") {
      for (const e of edges) if (!e.alive) { e.t -= dt; if (e.t <= 0) { e.alive = true; e.t = 0; } }
      if (holding) { holdT += dt; if (holdT >= HOLD_GAP) { holdT = 0; impulse(g, g.pointer.x, g.pointer.y); } }
      timer -= dt;
      if (timer <= 0) { timer = 0; snapShut(g); return; }
      const hh = dt / SUBSTEPS;
      for (let s = 0; s < SUBSTEPS; s++) if (step(hh, g)) break;
    } else if (phase === "respawn") {
      tween += dt; const k = Math.min(1, tween / TWEEN_T), ease = 1 - (1 - k) * (1 - k);
      ball.x = B.lerp(tweenFrom.x, CX, ease); ball.y = B.lerp(tweenFrom.y, CY, ease); polyR = R * ease;
      if (k >= 1) {
        polyR = R; phase = "play"; timer = timerMax;
        if (continueHelp) {
          continueHelp = false; let n = 0, guard = 0;
          while (n < 3 && guard++ < 50) { const i = B.randi(0, N - 1); if (edges[i].alive) { deleteEdge(i, g, true); n++; } }
          g.sfx.crack();
        }
      }
    } else if (phase === "snap") {
      tween += dt; const k = Math.min(1, tween / SNAP_T), ease = k * k;
      polyR = B.lerp(R, 60, ease); ball.x = B.lerp(tweenFrom.x, CX, ease); ball.y = B.lerp(tweenFrom.y, CY, ease);
      if (k >= 0.5 && !snapCracked) { snapCracked = true; g.sfx.thud(); g.shake(8); }
      if (k >= 1) { phase = "over"; g.sfx.crack(); g.gameOver({ delay: 500 }); }
    }
  }

  // ---- drawing ----
  function strokeSeg(ctx, ax, ay, bx, by, color, glowColor) {
    ctx.lineCap = "round";
    ctx.strokeStyle = glowColor; ctx.lineWidth = STROKE + 14; ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
    ctx.strokeStyle = color; ctx.lineWidth = STROKE; ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
  }
  function draw(ctx, g) {
    // faint vertex guide so the gaps read as holes in a shape
    ctx.strokeStyle = B.withAlpha(C.white, 0.06); ctx.lineWidth = 1; ctx.setLineDash([4, 10]); ctx.beginPath(); ctx.arc(CX, CY, polyR, 0, B.TAU); ctx.stroke(); ctx.setLineDash([]);
    // edges
    for (let i = 0; i < N; i++) {
      const e = edges[i], hue = hueOf(i), col = B.hsv(hue, 0.8, 1), glow = B.hsv(hue, 0.9, 1, 0.22);
      vertex(i, vA); vertex(i + 1, vB);
      if (e.alive) strokeSeg(ctx, vA.x, vA.y, vB.x, vB.y, col, glow);
      else if (growFrac(e) > 0) {
        const k = growFrac(e);
        strokeSeg(ctx, vA.x, vA.y, vA.x + (vB.x - vA.x) * k, vA.y + (vB.y - vA.y) * k, col, glow);
        strokeSeg(ctx, vB.x, vB.y, vB.x + (vA.x - vB.x) * k, vB.y + (vA.y - vB.y) * k, col, glow);
      } else { // gap stubs at the vertices
        ctx.fillStyle = B.hsv(hue, 0.6, 0.9, 0.5); ctx.beginPath(); ctx.arc(vA.x, vA.y, HALF, 0, B.TAU); ctx.fill(); ctx.beginPath(); ctx.arc(vB.x, vB.y, HALF, 0, B.TAU); ctx.fill();
      }
    }
    // trail
    for (const t of trail) { const k = t.life / 0.3; ctx.fillStyle = B.withAlpha(C.orange, k * 0.45); ctx.beginPath(); ctx.arc(t.x, t.y, BALL_R * k * 0.8, 0, B.TAU); ctx.fill(); }
    // Bonko
    const sp = Math.hypot(ball.vx, ball.vy), lx = sp > 1 ? ball.vx / sp : 0, ly = sp > 1 ? ball.vy / sp : 0.3;
    g.drawMascot(ball.x, ball.y, BALL_R, { mood: ball.mood, rot: ball.rot, look: [lx, ly], ring: true });
    // timer bar
    const frac = timerMax > 0 ? B.clamp(timer / timerMax, 0, 1) : 0, bw = W - BAR_X * 2, low = frac < 0.25 && phase === "play";
    ctx.fillStyle = B.withAlpha(C.white, 0.1); ctx.beginPath(); ctx.roundRect(BAR_X, BAR_Y, bw, BAR_H, 5); ctx.fill();
    if (frac > 0) {
      const pulse = low ? 0.65 + Math.sin(g.time * 9) * 0.3 : 1;
      ctx.fillStyle = B.withAlpha(C.cyan, pulse); ctx.beginPath(); ctx.roundRect(BAR_X, BAR_Y, Math.max(BAR_H, bw * frac), BAR_H, 5); ctx.fill();
      g.glowCircle(BAR_X + bw * frac, BAR_Y + BAR_H / 2, 3, B.withAlpha(C.cyan, 0.8 * pulse), 14);
    }
    // level pictogram: dots top-left
    for (let i = 0; i < Math.min(level, 14); i++) { ctx.fillStyle = C.orange; ctx.beginPath(); ctx.arc(32 + i * 17, 46, 5.5, 0, B.TAU); ctx.fill(); }
    // hint
    if (hint > 0 && g.time < 4 && phase === "play") {
      ctx.globalAlpha = 0.6 + Math.sin(g.time * 5) * 0.3; ctx.fillStyle = C.white; ctx.font = "800 19px Nunito"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText("Every bounce deletes an edge. Tap to steer out.", W / 2, 110); ctx.globalAlpha = 1;
    }
  }

  function pointer(e, g) {
    if (phase !== "play") return;
    if (e.key) { impulse(g, CX, CY); return; }
    if (e.type === "down") { holding = true; holdT = 0; impulse(g, e.x, e.y); }
    else if (e.type === "up") holding = false;
  }

  B.createGame({
    id: "edges", howto: "Every bounce deletes an edge. Tap to steer Bonko out through a gap before time runs out!", init, update, draw, pointer,
    onContinue(g) {
      continueHelp = true; ball.mood = "grin"; startTween(); g.floatText(W / 2, H / 2, "+TIME", C.green, 48);
    },
  });
})();
