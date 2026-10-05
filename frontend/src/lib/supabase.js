import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Public (anon / publishable) key only. It is safe in the browser:
// all writes go through the backend, which checks the user's role.
export const supabase = url && key ? createClient(url, key) : null;
