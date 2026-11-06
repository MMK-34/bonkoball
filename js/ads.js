/* =====================================================================
   BONKO ADS — Google AdSense + H5 Games Ads (Ad Placement API).
   With an empty adsenseClient everything is a silent no-op, so the
   site works locally and before approval. Rewarded "continue" is only
   offered when the ad SDK reported that a rewarded ad is ready.
   ===================================================================== */
(function () {
  "use strict";
  const CFG = window.BONKO_CONFIG || {};
  const enabled = !!CFG.adsenseClient;
  let ready = false, rewardReady = false, showReward = null, lastInterstitial = 0;

  function loadSdk() {
    if (!enabled || document.getElementById("adsense-sdk")) return;
    const s = document.createElement("script");
    s.id = "adsense-sdk"; s.async = true; s.crossOrigin = "anonymous";
    s.dataset.adFrequencyHint = "30s";
    s.src = "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=" + CFG.adsenseClient;
    document.head.appendChild(s);
    window.adsbygoogle = window.adsbygoogle || [];
    window.adBreak = window.adConfig = function (o) { window.adsbygoogle.push(o); };
    window.adConfig({
      preloadAdBreaks: "on", sound: "on",
      onReady: () => { ready = true; },
    });
    // Ask for a rewarded ad early so "continue" can be offered.
    prepareReward();
  }

  function prepareReward() {
    if (!enabled) return;
    window.adBreak({
      type: "reward", name: "continue",
      beforeReward: (fn) => { rewardReady = true; showReward = fn; },
      adDismissed: () => { rewardReady = false; showReward = null; if (pending) { pending.no(); pending = null; } setTimeout(prepareReward, 1000); },
      adViewed: () => { rewardReady = false; showReward = null; if (pending) { pending.yes(); pending = null; } setTimeout(prepareReward, 1000); },
      beforeAd: pauseAll, afterAd: resumeAll,
    });
  }
  let pending = null;

  function pauseAll() { document.body.classList.add("ad-playing"); }
  function resumeAll() { document.body.classList.remove("ad-playing"); }

  window.BonkoAds = {
    get enabled() { return enabled; },
    interstitial(done) {
      const now = Date.now();
      if (!enabled || now - lastInterstitial < 60000) { done && done(); return; }
      lastInterstitial = now;
      window.adBreak({ type: "next", name: "between_games", beforeAd: pauseAll, afterAd: () => { resumeAll(); done && done(); } });
    },
    rewardedAvailable() { return enabled && rewardReady && !!showReward; },
    rewarded(yes, no) {
      if (!this.rewardedAvailable()) { no && no(); return; }
      pending = { yes, no }; showReward();
    },
    banner(el) {
      if (!el) return;
      if (!enabled || !CFG.adSlotBanner) { el.classList.add("ad-empty"); return; }
      const ins = document.createElement("ins");
      ins.className = "adsbygoogle"; ins.style.display = "block";
      ins.dataset.adClient = CFG.adsenseClient; ins.dataset.adSlot = CFG.adSlotBanner;
      ins.dataset.adFormat = "auto"; ins.dataset.fullWidthResponsive = "true";
      el.appendChild(ins);
      try { (window.adsbygoogle = window.adsbygoogle || []).push({}); } catch (e) { }
    },
  };
  loadSdk();

  // Optional GA4
  if (CFG.ga4) {
    const s = document.createElement("script"); s.async = true; s.src = "https://www.googletagmanager.com/gtag/js?id=" + CFG.ga4; document.head.appendChild(s);
    window.dataLayer = window.dataLayer || []; function gtag() { dataLayer.push(arguments); } window.gtag = gtag;
    gtag("js", new Date()); gtag("config", CFG.ga4);
  }
})();
