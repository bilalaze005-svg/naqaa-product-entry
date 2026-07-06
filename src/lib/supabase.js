/**
 * Supabase client — نفس إعدادات تطبيقات نقاء الثلاثة الأخرى
 * الإعدادات في .env.local (VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY)
 */
import { createClient } from '@supabase/supabase-js'

const URL = import.meta.env.VITE_SUPABASE_URL
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

export const configError = (!URL || !KEY)
  ? '⚠️ إعدادات الاتصال ناقصة: أضف VITE_SUPABASE_URL و VITE_SUPABASE_ANON_KEY بإعدادات Vercel (Environment Variables) ثم أعد النشر (Redeploy).'
  : null

if (configError) console.error(configError)

// ✅ عميل وهمي بديل إذا الإعدادات ناقصة — يمنع انهيار كامل الصفحة (صفحة بيضاء)
export const supabase = configError
  ? { from: () => ({ select: () => ({ order: () => Promise.resolve({ data: [], error: { message: configError } }) }) }) }
  : createClient(URL, KEY, {
      auth: { autoRefreshToken: true, persistSession: true },
    })

