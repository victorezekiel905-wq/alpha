const supabaseUrl = "https://oyawavhoutlxccshciso.supabase.co";
const supabaseKey = "sb_publishable_m0YLuxaqKcCfnYBefzD_hA_MEJ89-c6";

if (window.supabase && typeof window.supabase.createClient === 'function') {
  const supabase = window.supabase.createClient(supabaseUrl, supabaseKey);
  window.supabaseClient = supabase;
  window.AlphaBankSupabase = supabase;
  window.alphaSupabase = supabase;
  console.log('[AlphaBank] Supabase initialized');
} else {
  console.error('[AlphaBank] Supabase library failed to load before supabase.js');
}
