// ============================================================
// EngLand CRM — подключение к Supabase
// ============================================================
// ВАЖНО: впиши сюда свои значения из Supabase
// (Project Settings -> API -> Project URL и anon public key)
// ============================================================

const SUPABASE_URL = "https://nafbhichchrigtmxceoi.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_JX9fsvUyWOmCqXfddfVozQ_kCQqCMd0";

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
