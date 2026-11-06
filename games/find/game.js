/* Find Bonko — cup shuffle. Watch where Bonko hides, cups swap faster every round, tap his cup.
   Follows the Bonko game contract (see GAME_CONTRACT.md); structure copied from games/plinko/game.js. */
(function () {
  const B = window.Bonko, C = B.COLORS, W = B.W, H = B.H;
  const TABLE = 580, LIFT_PX = 95, BONKO_R = 26, SHOW_T = 0.8, DROP_T = 0.35, LIFT_T = 0.3, WIN_T = 0.75, REVEAL_T = 1.15, GAP_T = 0.05;
  const HUES = [200, 330, 50, 130, 280];
  // phases: show -> drop -> shuffle -> pick -> lift -> win | reveal -> (next round | game over)
  let cups = [], round, lives, streak, phase, pt, swaps, swapIdx, swapA, swapB, swapDur, picked, bonkoCup, grumpoCup, bonkoMood, grumpoMood, noteIdx, overCalled, hint, tableGlow;

  function layout(n) {
    const spacing = n <= 3 ? 150 : n === 4 ? 120 : 100, bw = spacing * 0.8;
    return { spacing, bw, tw: bw * 0.68, ch: bw * 1.08, x: (i) => W / 2 + (i - (n - 1) / 2) * spacing };
  }
  function startRound(g) {
    const n = round >= 8 ? 5 : round >= 4 ? 4 : 3, L = layout(n);
    cups = [];
    for (let i = 0; i < n; i++) cups.push({ slot: i, x: L.x(i), y: 0, lift: 0, hue: HUES[i % HUES.length], glow: 0, L });
    bonkoCup = cups[Math.floor(n / 2)]; bonkoCup.lift = 1;
    grumpoCup = null;
    if (round >= 5) { const others = cups.filter((c) => c !== bonkoCup); grumpoCup = others[B.randi(0, others.length - 1)]; grumpoCup.lift = 1; }
    swaps = 3 + round; swapIdx = 0; swapDur = Math.max(0.14, 0.45 * Math.pow(0.88, round - 1));
    phase = "show"; pt = 0; picked = null; bonkoMood = "grin"; grumpoMood = "angry"; tableGlow = 1;
    if (g && g.time > 0) g.sfx.pop(2);
  }
  function init(g) {
    round = 1; lives = 3; streak = 0; noteIdx = 0; overCalled = false; hint = 1;
    startRound(g);
  }
  function ease(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }
  function pickSwap() {
    const n = cups.length; let a = B.randi(0, n - 1), b = B.randi(0, n - 2); if (b >= a) b++;
    swapA = cups.find((c) => c.slot === a); swapB = cups.find((c) => c.slot === b);
    swapA.fromX = swapA.x; swapA.toX = swapA.L.x(b); swapB.fromX = swapB.x; swapB.toX = swapB.L.x(a);
    swapA.slot = b; swapB.slot = a;
  }
  function update(dt, g) {
    pt += dt;
    for (const c of cups) c.glow *= 0.88;
    tableGlow *= 0.95;
    if (phase === "show") {
      if (pt >= SHOW_T) { phase = "drop"; pt = 0; g.sfx.whoosh(); }
    } else if (phase === "drop") {
      const k = 1 - B.clamp(pt / DROP_T, 0, 1);
      for (const c of cups) c.lift = c.lift > 0 ? Math.min(c.lift, k) : 0;
      if (pt >= DROP_T) { for (const c of cups) c.lift = 0; phase = "shuffle"; pt = -0.12; g.sfx.thud(0.25); g.haptic(10); }
    } else if (phase === "shuffle") {
      if (pt < 0) return;
      if (swapIdx >= swaps) { phase = "pick"; pt = 0; return; }
      if (!swapA) { pickSwap(); g.sfx.tick(); }
      const t = B.clamp(pt / swapDur, 0, 1), e = ease(t), s = Math.sin(Math.PI * t);
      swapA.x = B.lerp(swapA.fromX, swapA.toX, e); swapA.y = -s * 55;
      swapB.x = B.lerp(swapB.fromX, swapB.toX, e); swapB.y = s * 28;
      if (t >= 1) {
        swapA.x = swapA.toX; swapB.x = swapB.toX; swapA.y = swapB.y = 0; swapA = swapB = null; swapIdx++; pt = -GAP_T;
      }
    } else if (phase === "pick") {
      // waiting for the tap
    } else if (phase === "lift") {
      picked.lift = B.clamp(pt / LIFT_T, 0, 1);
      if (pt >= LIFT_T) {
        pt = 0;
        if (picked === bonkoCup) {
          const bonus = streak >= 3, gain = Math.round(100 * round * (bonus ? 1.5 : 1));
          streak++; phase = "win"; bonkoMood = "grin"; picked.glow = 1;
          g.addScore(gain, picked.x, TABLE - 150, B.hsv(picked.hue, 0.5, 1));
          if (bonus) g.floatText(W / 2, 260, `STREAK x${streak}`, C.yellow, 40);
          g.sfx.note(noteIdx++, { vel: 0.6, dur: 0.45, kind: "bell" }); g.haptic([20, 20, 40]);
          g.particles.burst(picked.x, TABLE - 40, { n: 36, speed: 380, life: 0.9, size: 5, color: [B.hsv(picked.hue, 0.7, 1), C.orange, C.cyan, C.yellow], gravity: 500 });
          g.particles.ring(picked.x, TABLE - 40, { color: B.hsv(picked.hue, 0.5, 1), grow: 420, width: 4 });
          g.shake(5);
        } else {
          phase = "reveal"; lives--; streak = 0; noteIdx = Math.max(0, noteIdx - 2); bonkoMood = "sad";
          if (picked === grumpoCup) { grumpoMood = "dizzy"; g.particles.burst(picked.x, TABLE - 40, { n: 18, speed: 240, life: 0.6, size: 5, color: [C.grey, C.purple], shape: "square", gravity: 500 }); }
          g.sfx.crack(); g.shake(14); g.haptic([60, 30, 60]);
          g.floatText(picked.x, TABLE - 150, "✕", C.red, 48);
        }
      }
    } else if (phase === "win") {
      if (pt >= WIN_T) { round++; startRound(g); }
    } else if (phase === "reveal") {
      bonkoCup.lift = Math.min(1, bonkoCup.lift + dt / LIFT_T);
      if (pt >= REVEAL_T) {
        if (lives <= 0) { if (!overCalled) { overCalled = true; g.gameOver({ delay: 500 }); } }
        else startRound(g);
      }
    }
  }
  function drawCup(ctx, c, t) {
    const { bw, tw, ch } = c.L, base = TABLE + c.y - c.lift * LIFT_PX, r = bw * 0.12;
    const col = B.hsv(c.hue, 0.75, 0.95), dark = B.hsv(c.hue, 0.85, 0.55), light = B.hsv(c.hue, 0.35, 1);
    // shadow on the table
    const sh = 1 - c.lift * 0.6 - Math.max(0, -c.y) / 120;
    ctx.fillStyle = `rgba(0,0,0,${0.35 * B.clamp(sh, 0, 1)})`; ctx.beginPath(); ctx.ellipse(c.x, TABLE + 6, bw * 0.55 * (1 + c.lift * 0.15), 11, 0, 0, B.TAU); ctx.fill();
    ctx.save(); ctx.translate(c.x, base);
    ctx.shadowColor = B.hsv(c.hue, 0.8, 1); ctx.shadowBlur = 18 + c.glow * 30 + Math.sin(t * 3 + c.hue) * 3;
    const grad = ctx.createLinearGradient(-bw / 2, 0, bw / 2, 0);
    grad.addColorStop(0, dark); grad.addColorStop(0.35, col); grad.addColorStop(0.5, light); grad.addColorStop(0.7, col); grad.addColorStop(1, dark);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(-tw / 2 + r, -ch); ctx.lineTo(tw / 2 - r, -ch);
    ctx.arcTo(tw / 2, -ch, bw / 2, 0, r);
    ctx.arcTo(bw / 2, 0, -bw / 2, 0, r);
    ctx.arcTo(-bw / 2, 0, -tw / 2, -ch, r);
    ctx.arcTo(-tw / 2, -ch, tw / 2, -ch, r);
    ctx.closePath(); ctx.fill();
    ctx.shadowBlur = 0;
    // rim + band
    ctx.fillStyle = B.hsv(c.hue, 0.55, 1, 0.9); ctx.beginPath(); ctx.roundRect(-bw / 2 - 4, -14, bw + 8, 14, 7); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.18)"; ctx.beginPath(); ctx.roundRect(-tw / 2 + 6, -ch + 12, tw * 0.25, ch - 36, 6); ctx.fill();
    if (c.glow > 0.05) { ctx.fillStyle = `rgba(255,255,255,${c.glow * 0.5})`; ctx.beginPath(); ctx.roundRect(-tw / 2, -ch, tw, ch, r); ctx.fill(); }
    ctx.restore();
  }
  function draw(ctx, g) {
    const t = g.time;
    // table
    ctx.fillStyle = B.withAlpha(C.cyan, 0.12 + tableGlow * 0.25); ctx.beginPath(); ctx.roundRect(30, TABLE + 2, W - 60, 10, 5); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.04)"; ctx.fillRect(0, TABLE + 12, W, 140);
    // hidden characters (drawn before the cups so a lowered cup covers them)
    if (bonkoCup && bonkoCup.lift > 0.02) g.drawMascot(bonkoCup.x, TABLE - BONKO_R - 2, BONKO_R, { mood: bonkoMood, ring: true, look: [0, 0.6], squash: 1 + Math.sin(t * 7) * 0.04 });
    if (grumpoCup && grumpoCup.lift > 0.02) g.drawGrumpo(grumpoCup.x, TABLE - 24, 46, { mood: grumpoMood, rot: grumpoMood === "dizzy" ? Math.sin(t * 9) * 0.25 : 0 });
    // cups: the one rising over an arc is behind, the one dipping under is in front
    const order = cups.slice().sort((a, b) => a.y - b.y);
    for (const c of order) drawCup(ctx, c, t);
    // lives (orange dots, top-left of the play zone)
    for (let i = 0; i < 3; i++) { ctx.fillStyle = i < lives ? C.orange : B.withAlpha(C.grey2, 0.5); ctx.beginPath(); ctx.arc(32 + i * 24, 170, 8, 0, B.TAU); ctx.fill(); if (i < lives) g.glowCircle(32 + i * 24, 170, 8, B.withAlpha(C.orange, 0.5), 14); }
    // round pips + swap progress (bottom of the zone)
    const n = Math.min(swaps, 24), pw = Math.min(16, (W - 80) / n);
    for (let i = 0; i < n; i++) {
      const lit = i < swapIdx, x = W / 2 + (i - (n - 1) / 2) * pw;
      ctx.fillStyle = lit ? B.hsv(190 + i * 6, 0.7, 1) : B.withAlpha(C.grey2, 0.35); ctx.beginPath(); ctx.arc(x, 760, lit ? 5 : 3.5, 0, B.TAU); ctx.fill();
    }
    ctx.fillStyle = B.withAlpha(C.white, 0.55); ctx.font = "900 20px Nunito"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("R" + round, W / 2, 790);
    if (phase === "pick") { ctx.globalAlpha = 0.5 + Math.sin(t * 6) * 0.3; ctx.fillStyle = C.cyan; ctx.font = "900 34px Nunito"; ctx.fillText("?", W / 2, 300); ctx.globalAlpha = 1; }
    if (hint > 0 && t < 4) { ctx.globalAlpha = 0.6 + Math.sin(t * 5) * 0.3; ctx.fillStyle = C.white; ctx.font = "800 22px Nunito"; ctx.fillText("Watch the cup. Tap where Bonko is.", W / 2, 215); ctx.globalAlpha = 1; }
  }
  function pointer(e, g) {
    if (e.type !== "down" || phase !== "pick") return;
    let hit = null;
    if (e.key) hit = cups.find((c) => c.slot === Math.floor(cups.length / 2));
    else for (const c of cups) if (Math.abs(e.x - c.x) < c.L.spacing / 2 && e.y > TABLE - c.L.ch - 50 && e.y < TABLE + 50) hit = c;
    if (!hit) return;
    picked = hit; phase = "lift"; pt = 0; hint = 0; g.sfx.whoosh(); g.haptic(8);
  }
  B.createGame({
    id: "find", howto: "Watch where Bonko hides, then tap his cup. Cups shuffle faster every round!", init, update, draw, pointer,
    onContinue(g) { lives = 3; overCalled = false; g.floatText(W / 2, H / 2, "+3 LIVES", C.green, 48); startRound(g); },
  });
  window.__findDebug = () => ({ phase, round, lives, streak, swaps, swapIdx, cups, bonkoCup, grumpoCup }); // test hook
})();
