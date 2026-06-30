// ============================================================
// EngLand CRM — подключение к Supabase
// ============================================================
// ВАЖНО: впиши сюда свои значения из Supabase
// (Project Settings -> API -> Project URL и anon public key)
// ============================================================

const SUPABASE_URL = "ВСТАВЬ_СЮДА_PROJECT_URL"; // например: https://abcdefgh.supabase.co
const SUPABASE_ANON_KEY = "ВСТАВЬ_СЮДА_ANON_KEY";

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
