// ======================================================================
//  BONKOBALL SITE CONFIG — edit this file only.
//  Leave adsenseClient empty while testing: ads are then silently skipped.
// ======================================================================
window.BONKO_CONFIG = {
  siteUrl: "https://bonkoball.com",          // your final domain (used in share text + sitemap)
  siteName: "Bonkoball",
  instagram: "https://instagram.com/bonkoball",
  youtube: "https://youtube.com/@bonkoball",
  tiktok: "https://tiktok.com/@bonkoball",

  // --- Google AdSense (H5 Games Ads) ---
  // 1) Get approved at adsense.google.com  2) paste your publisher id below  3) create one display ad unit and paste its slot id
  adsenseClient: "",            // e.g. "ca-pub-1234567890123456"
  adSlotBanner: "",             // display ad unit slot id, e.g. "1234567890"
  interstitialEveryNPlays: 2,   // show an interstitial after every N finished games
  // --- Supabase (free) : live players + name leaderboard ---
  // Create a project at supabase.com, run supabase.sql in its SQL editor, then paste Project URL + anon public key.
  supabaseUrl: "",              // e.g. "https://abcdefgh.supabase.co"
  supabaseKey: "",              // anon public key (safe to publish; the table is protected by row-level policies)
  // --- Analytics (optional) ---
  ga4: "",                      // e.g. "G-XXXXXXXXXX"
};
