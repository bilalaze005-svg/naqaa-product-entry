/**
 * Supabase client — نفس إعدادات تطبيقات نقاء الثلاثة الأخرى
 * الإعدادات في .env.local (VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY)
 */
import { createClient } from '@supabase/supabase-js'

const URL = import.meta.env.VITE_SUPABASE_URL
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!URL || !KEY) {
  console.error('❌ أضف VITE_SUPABASE_URL و VITE_SUPABASE_ANON_KEY في .env.local')
}

export const supabase = createClient(URL, KEY, {
  auth: { autoRefreshToken: true, persistSession: true },
})
