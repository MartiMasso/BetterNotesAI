import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL is missing (env not loaded)");
}
if (!supabaseAnonKey) {
  throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY is missing (env not loaded)");
}

// Logs útiles (NO imprime la key entera)
console.log("[supabase] url =", supabaseUrl);
console.log("[supabase] anonKey length =", supabaseAnonKey.length);
console.log("[supabase] anonKey starts =", supabaseAnonKey.slice(0, 12));

export const supabase = createClient(supabaseUrl, supabaseAnonKey);