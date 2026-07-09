/**
 * lib/imageUpload.js
 * رفع الصورة النهائية (بعد معالجة الذكاء الاصطناعي) إلى Supabase Storage
 * بدل حفظها base64 مباشرة في عمود products.image.
 *
 * ⚠️ يتطلب وجود bucket باسم "products" في Supabase Storage (public).
 * نفس الـ bucket المستخدم من لوحة الإدارة — الصور من التطبيقين تصير بمكان واحد.
 */
import { supabase } from './supabase.js'

/**
 * رفع Blob صورة إلى Supabase Storage وإرجاع الرابط العام
 * @param {Blob} blob
 * @param {string} [bucket='products']
 * @returns {Promise<string>}
 */
export async function uploadImageBlob(blob, bucket = 'products') {
  if (!blob) return null
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}.png`
  const { data, error } = await supabase.storage.from(bucket).upload(filename, blob, {
    contentType: 'image/png',
    upsert: false,
  })
  if (error) throw new Error('فشل رفع الصورة: ' + error.message)
  const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(data.path)
  return urlData.publicUrl
}

/** تحويل canvas إلى Blob (Promise wrapper حول canvas.toBlob) */
export function canvasToBlob(canvas, type = 'image/png', quality = 0.9) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality))
}
