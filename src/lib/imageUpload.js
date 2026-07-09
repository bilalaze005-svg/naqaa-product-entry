/**
 * lib/imageUpload.js
 * رفع الصورة النهائية إلى Supabase Storage بدل حفظها base64 مباشرة في عمود products.image.
 * الصور تُرفع بصيغة WebP افتراضياً (أخف حجماً بكثير من PNG/JPEG بنفس الجودة تقريباً).
 *
 * ⚠️ يتطلب وجود bucket باسم "products" في Supabase Storage (public).
 * نفس الـ bucket المستخدم من لوحة الإدارة — الصور من التطبيقين تصير بمكان واحد.
 */
import { supabase } from './supabase.js'

const EXT_BY_TYPE = { 'image/webp': 'webp', 'image/png': 'png', 'image/jpeg': 'jpg' }

/**
 * رفع Blob صورة إلى Supabase Storage وإرجاع الرابط العام
 * @param {Blob} blob
 * @param {string} [bucket='products']
 * @returns {Promise<string>}
 */
export async function uploadImageBlob(blob, bucket = 'products') {
  if (!blob) return null
  const ext = EXT_BY_TYPE[blob.type] || 'webp'
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
  const { data, error } = await supabase.storage.from(bucket).upload(filename, blob, {
    contentType: blob.type || 'image/webp',
    upsert: false,
  })
  if (error) throw new Error('فشل رفع الصورة: ' + error.message)
  const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(data.path)
  return urlData.publicUrl
}

/** تحويل canvas إلى Blob (Promise wrapper حول canvas.toBlob) */
export function canvasToBlob(canvas, type = 'image/webp', quality = 0.85) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality))
}

/**
 * تحويل أي صورة (data URL) إلى WebP مضغوط، مع تصغير الأبعاد إن كانت أكبر من الحد الأقصى.
 * يُستخدم كخطوة أخيرة موحّدة قبل الرفع — سواء كانت الصورة معالجة بالذكاء الاصطناعي أو خام مباشرة من الكاميرا.
 * @param {string} dataUrl
 * @param {number} [maxSize=1000]
 * @param {number} [quality=0.85]
 * @returns {Promise<Blob>}
 */
export function toWebP(dataUrl, maxSize = 1000, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      let { width, height } = img
      if (width > maxSize || height > maxSize) {
        const ratio = Math.min(maxSize / width, maxSize / height)
        width = Math.round(width * ratio)
        height = Math.round(height * ratio)
      }
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      canvas.getContext('2d').drawImage(img, 0, 0, width, height)
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('فشل تحويل الصورة إلى WebP'))),
        'image/webp',
        quality
      )
    }
    img.onerror = () => reject(new Error('فشل تحميل الصورة للتحويل'))
    img.src = dataUrl
  })
}
