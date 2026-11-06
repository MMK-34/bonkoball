/* =====================================================================
   BONKO ONLINE — player name, leaderboard and live presence.
   Backend: Supabase (free tier). With an empty supabaseUrl in config.js
   everything falls back to localStorage so the site still works.
   SQL to create the table lives in supabase.sql next to this site.
   ===================================================================== */
(function () {
  "use strict";
  const CFG = window.BONKO_CONFIG || {};
  const enabled = !!(CFG.supabaseUrl && CFG.supabaseKey);
  const store = {
    get(k, d) { try { const v = localStorage.getItem("bonko." + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem("bonko." + k, JSON.stringify(v)); } catch (e) { } },
  };
  let sb = null, sbReady = null, lobby = null, presenceCb = [], presenceState = {};
  const dayKey = () => new Date().toISOString().slice(0, 10); // UTC day, same for everyone
  const dayIndex = () => Math.floor(Date.now() / 86400000);
  const clientId = (() => { let id = store.get("cid"); if (!id) { id = Math.random().toString(36).slice(2, 10); store.set("cid", id); } return id; })();

  function loadSdk() {
    if (!enabled) return Promise.resolve(null);
    if (sbReady) return sbReady;
    sbReady = new Promise((resolve) => {
      const s = document.createElement("script");
      s.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.4/dist/umd/supabase.js";
      s.onload = () => { try { sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey); } catch (e) { sb = null; } resolve(sb); };
      s.onerror = () => resolve(null);
      document.head.appendChild(s);
    });
    return sbReady;
  }

  const cleanName = (n) => String(n || "").replace(/[^\w\s\-\.çğıöşüÇĞİÖŞÜ]/g, "").trim().slice(0, 16);
  const randomName = () => "Bonko" + Math.floor(100 + Math.random() * 900);

  const Online = {
    enabled, dayKey, dayIndex, clientId,
    get name() { return store.get("name", ""); },
    setName(n) { n = cleanName(n); if (!n) return false; store.set("name", n); return true; },
    ensureName() { if (!this.name) store.set("name", randomName()); return this.name; },

    // Game of the day: deterministic rotation so every visitor sees the same game.
    gameOfTheDay() {
      const list = window.BONKO_GAMES || []; if (!list.length) return null;
      return list[dayIndex() % list.length];
    },

    // ---- scores ----
    async submitScore(game, score) {
      score = Math.max(0, Math.floor(score)); if (!score) return;
      const name = this.ensureName();
      // local fallback (also used as a cache when online)
      const key = "lb." + game + "." + dayKey(); const local = store.get(key, []);
      local.push({ name, score, cid: clientId, t: Date.now() }); local.sort((a, b) => b.score - a.score); store.set(key, local.slice(0, 50));
      const all = store.get("lb." + game, []); all.push({ name, score, cid: clientId, t: Date.now() }); all.sort((a, b) => b.score - a.score); store.set("lb." + game, all.slice(0, 50));
      const client = await loadSdk(); if (!client) return;
      try { await client.from("scores").insert({ game, name, score, cid: clientId, day: dayKey() }); } catch (e) { }
    },
    async top(game, { today = true, limit = 10 } = {}) {
      const client = await loadSdk();
      if (client) {
        try {
          let q = client.from("scores").select("name,score,cid,day").eq("game", game).order("score", { ascending: false }).limit(limit);
          if (today) q = q.eq("day", dayKey());
          const { data, error } = await q; if (!error && data) return data;
        } catch (e) { }
      }
      return (store.get(today ? "lb." + game + "." + dayKey() : "lb." + game, [])).slice(0, limit);
    },
    async rankOf(game, score, today = true) {
      const client = await loadSdk();
      if (client) {
        try {
          let q = client.from("scores").select("id", { count: "exact", head: true }).eq("game", game).gt("score", score);
          if (today) q = q.eq("day", dayKey());
          const { count, error } = await q; if (!error && count !== null) return count + 1;
        } catch (e) { }
      }
      const l = store.get(today ? "lb." + game + "." + dayKey() : "lb." + game, []); return l.filter((r) => r.score > score).length + 1;
    },

    // ---- presence (who is playing right now) ----
    async join(game) {
      const client = await loadSdk(); if (!client) return;
      const name = this.ensureName();
      try {
        lobby = client.channel("lobby", { config: { presence: { key: clientId } } });
        lobby.on("presence", { event: "sync" }, () => { presenceState = lobby.presenceState(); presenceCb.forEach((f) => f(Online.players())); });
        lobby.subscribe(async (status) => { if (status === "SUBSCRIBED") await lobby.track({ name, game: game || "hub", at: Date.now() }); });
      } catch (e) { }
    },
    players() {
      const out = [];
      for (const k in presenceState) { const p = presenceState[k][0]; if (p) out.push({ name: p.name, game: p.game, me: k === clientId }); }
      return out;
    },
    onPlayers(cb) { presenceCb.push(cb); cb(this.players()); },
  };
  window.BonkoOnline = Online;
})();
