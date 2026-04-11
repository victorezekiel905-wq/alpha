(function () {
  const SUPABASE_URL = 'https://oyawavhoutlxccshciso.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_m0YLuxaqKcCfnYBefzD_hA_MEJ89-c6';

  if (!window.supabase || typeof window.supabase.createClient !== 'function') {
    console.error('Supabase library failed to load.');
    return;
  }

  const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false
    }
  });

  window.AlphaBankSupabase = {
    url: SUPABASE_URL,
    key: SUPABASE_KEY,
    client
  };
})();
