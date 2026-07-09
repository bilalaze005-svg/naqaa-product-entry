import React, { useState, useEffect, useRef } from 'react'
import { supabase, configError } from './lib/supabase.js'
import { uploadImageBlob, toWebP } from './lib/imageUpload.js'

// ── مكوّن قارئ الباركود بالكاميرا (نفس أسلوب لوحة الإدارة) ──
function BarcodeScanner({ onDetected, onClose }) {
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const [error, setError] = useState('')
  const [manualCode, setManualCode] = useState('')

  useEffect(() => {
    startCamera()
    return () => stopCamera()
  }, [])

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
  }

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
      })
      streamRef.current = stream
      if (videoRef.current) videoRef.current.srcObject = stream

      if ('BarcodeDetector' in window) {
        const detector = new window.BarcodeDetector({ formats: ['ean_13', 'ean_8', 'code_128', 'code_39', 'qr_code', 'upc_a', 'upc_e'] })
        const scan = async () => {
          if (!videoRef.current || !streamRef.current) return
          try {
            const barcodes = await detector.detect(videoRef.current)
            if (barcodes.length > 0) {
              stopCamera()
              onDetected(barcodes[0].rawValue)
              return
            }
          } catch {}
          if (streamRef.current) setTimeout(scan, 300)
        }
        videoRef.current.addEventListener('play', () => setTimeout(scan, 500))
      } else {
        setError('المتصفح لا يدعم قراءة الباركود التلقائية — استخدم Chrome على Android أو أدخل الرقم يدوياً')
      }
    } catch (err) {
      setError('تعذّر فتح الكاميرا: ' + err.message)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.85)', zIndex: 99999, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: 'white', borderRadius: 20, padding: 24, width: 360, maxWidth: '95vw' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ fontWeight: 800, fontSize: 17, margin: 0 }}>📷 مسح الباركود</h3>
          <button onClick={() => { stopCamera(); onClose() }} style={{ background: '#fee2e2', border: 'none', borderRadius: '50%', width: 32, height: 32, cursor: 'pointer', fontSize: 16, color: '#dc2626' }}>✕</button>
        </div>

        <div style={{ position: 'relative', borderRadius: 14, overflow: 'hidden', background: '#000', marginBottom: 16 }}>
          <video ref={videoRef} autoPlay playsInline muted style={{ width: '100%', height: 220, objectFit: 'cover', display: 'block' }} />
          <div style={{ position: 'absolute', top: '50%', left: '10%', right: '10%', height: 2, background: '#ef4444', boxShadow: '0 0 8px #ef4444', animation: 'scan-line 1.5s ease-in-out infinite alternate' }} />
          <div style={{ position: 'absolute', inset: 0, border: '3px solid rgba(255,255,255,.3)', borderRadius: 14, pointerEvents: 'none' }} />
          <style>{`@keyframes scan-line { from { top: 30% } to { top: 70% } }`}</style>
        </div>

        {error ? (
          <div style={{ background: '#fff1f2', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#dc2626', marginBottom: 14 }}>⚠️ {error}</div>
        ) : (
          <div style={{ textAlign: 'center', fontSize: 13, color: '#64748b', marginBottom: 14 }}>
            🔍 وجّه الكاميرا نحو الباركود... سيُقرأ تلقائياً
          </div>
        )}

        <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 14 }}>
          <label style={{ fontSize: 12, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 6 }}>أو أدخل الباركود يدوياً:</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input style={{ ...inputStyle, flex: 1, fontSize: 15 }}
              value={manualCode} onChange={e => setManualCode(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && manualCode.trim()) { stopCamera(); onDetected(manualCode.trim()) } }}
              placeholder="اكتب الرقم + Enter" />
            <button style={{ padding: '8px 16px', borderRadius: 12, border: 'none', background: '#2E7D32', color: 'white', fontWeight: 800, cursor: 'pointer' }}
              onClick={() => { if (manualCode.trim()) { stopCamera(); onDetected(manualCode.trim()) } }}>
              ✅
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

const EMPTY_FORM = {
  name: '', price: '', cost_price: '', carton_price: '', units: '',
  stock: '0', min_stock: '5', sku: '', description: '',
  category_id: '', brand_id: '',
}

function Toast({ msg, type, onDone }) {
  useEffect(() => { const t = setTimeout(onDone, 2800); return () => clearTimeout(t) }, [])
  return (
    <div style={{
      position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
      background: type === 'error' ? '#DC2626' : '#059669', color: 'white',
      padding: '12px 22px', borderRadius: 30, fontWeight: 800, fontSize: 14,
      boxShadow: '0 6px 20px rgba(0,0,0,.2)', zIndex: 9999, maxWidth: '90vw', textAlign: 'center'
    }}>
      {msg}
    </div>
  )
}

export default function App() {
  const [form, setForm] = useState(EMPTY_FORM)
  const [categories, setCategories] = useState([])
  const [brands, setBrands] = useState([])
  const [rawImage, setRawImage] = useState(null)      // الصورة الأصلية (قبل المعالجة)
  const [finalImage, setFinalImage] = useState(null)  // الصورة النهائية بعد إزالة الخلفية
  const [processing, setProcessing] = useState(false)
  const [progressMsg, setProgressMsg] = useState('')
  const [saving, setSaving] = useState(false)
  const [showScanner, setShowScanner] = useState(false)
  const [toast, setToast] = useState(null)
  const fileInputRef = useRef(null)
  const cameraInputRef = useRef(null)

  // ── بحث وتعديل منتج موجود ──
  const [mode, setMode] = useState('form')          // 'form' | 'search'
  const [editingId, setEditingId] = useState(null)  // معرّف المنتج الجاري تعديله، null = إضافة جديدة
  const [existingImageUrl, setExistingImageUrl] = useState(null) // صورة المنتج الحالية (وقت التعديل، قبل اختيار صورة جديدة)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searching, setSearching] = useState(false)

  const showToast = (msg, type = 'ok') => setToast({ msg, type })

  useEffect(() => {
    supabase.from('categories').select('id,name').order('name').then(({ data, error }) => {
      if (error) { console.error(error); return }
      setCategories(data || [])
    })
    supabase.from('brands').select('id,name').order('name').then(({ data, error }) => {
      if (error) { console.error(error); return }
      setBrands(data || [])
    })
  }, [])

  // ── بحث مؤجل (debounce) عن منتجات مطابقة للاسم أو الباركود ──
  useEffect(() => {
    if (mode !== 'search' || !searchQuery.trim()) { setSearchResults([]); return }
    const timer = setTimeout(async () => {
      setSearching(true)
      try {
        const q = searchQuery.trim()
        const like = `%${q}%`
        const { data, error } = await supabase
          .from('products')
          .select('id,name,sku,price,stock,image')
          .or(`name.ilike.${like},sku.ilike.${like}`)
          .order('name')
          .limit(15)
        if (error) throw error
        setSearchResults(data || [])
      } catch (err) {
        console.error('❌ خطأ البحث:', err)
        showToast('❌ خطأ في البحث: ' + err.message, 'error')
      } finally {
        setSearching(false)
      }
    }, 400)
    return () => clearTimeout(timer)
  }, [searchQuery, mode])

  // ── تحميل بيانات منتج مختار للتعديل ──
  const selectProduct = async (p) => {
    setSearching(true)
    try {
      const { data: full, error } = await supabase.from('products').select('*').eq('id', p.id).single()
      if (error) throw error
      const { data: catLinks } = await supabase.from('product_categories').select('category_id').eq('product_id', p.id).limit(1)

      setForm({
        name: full.name || '',
        price: full.price ?? '',
        cost_price: full.cost_price ?? '',
        carton_price: full.carton_price ?? '',
        units: full.units ?? '',
        stock: String(full.stock ?? '0'),
        min_stock: String(full.min_stock ?? '5'),
        sku: full.sku || '',
        description: full.description || '',
        category_id: catLinks?.[0]?.category_id ? String(catLinks[0].category_id) : '',
        brand_id: full.brand_id ? String(full.brand_id) : '',
      })
      setEditingId(full.id)
      setExistingImageUrl(full.image || null)
      setRawImage(null)
      setFinalImage(null)
      setMode('form')
      showToast('✅ تم تحميل بيانات المنتج — عدّل ما تريد ثم احفظ')
    } catch (err) {
      console.error('❌ خطأ تحميل المنتج:', err)
      showToast('❌ خطأ تحميل بيانات المنتج: ' + err.message, 'error')
    } finally {
      setSearching(false)
    }
  }

  const F = (key) => (e) => setForm(f => ({ ...f, [key]: e.target.value }))

  // ── التقاط/اختيار صورة ──
  const onFile = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setFinalImage(null)
    const reader = new FileReader()
    reader.onload = ev => setRawImage(ev.target.result)
    reader.readAsDataURL(file)
    e.target.value = '' // يسمح بإعادة اختيار نفس الملف لاحقاً
  }

  // ── معالجة الصورة: إزالة الخلفية بالذكاء الاصطناعي + خلفية بيضاء + علامة نقاء ──
  const processImage = async () => {
    if (!rawImage) return
    setProcessing(true)
    setProgressMsg('⏳ جارِ تحميل نموذج الذكاء الاصطناعي (أول مرة فقط، قد يستغرق دقيقة)...')
    try {
      const { removeBackground } = await import('@imgly/background-removal')

      setProgressMsg('🧠 جارِ إزالة الخلفية...')
      const cutoutBlob = await removeBackground(rawImage, {
        progress: (key, current, total) => {
          if (total) setProgressMsg(`🧠 جارِ المعالجة... ${Math.round((current / total) * 100)}%`)
        },
      })

      setProgressMsg('🎨 جارِ تركيب الخلفية البيضاء...')
      const cutoutUrl = URL.createObjectURL(cutoutBlob)
      const cutoutImg = await loadImage(cutoutUrl)

      const SIZE = 1000
      const canvas = document.createElement('canvas')
      canvas.width = SIZE
      canvas.height = SIZE
      const ctx = canvas.getContext('2d')

      // خلفية بيضاء
      ctx.fillStyle = 'white'
      ctx.fillRect(0, 0, SIZE, SIZE)

      // ✅ علامة "نقاء" مائية متكررة على كامل الخلفية
      ctx.save()
      ctx.fillStyle = 'rgba(46, 125, 50, 0.10)'  // أخضر فاتح جداً شفاف
      ctx.font = 'bold 42px Tajawal, sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.translate(SIZE / 2, SIZE / 2)
      ctx.rotate(-Math.PI / 8)
      ctx.translate(-SIZE / 2, -SIZE / 2)
      for (let y = -100; y < SIZE + 200; y += 130) {
        for (let x = -100; x < SIZE + 200; x += 260) {
          ctx.fillText('نقاء', x, y)
        }
      }
      ctx.restore()

      // شعار واضح أسفل الصورة
      ctx.fillStyle = 'rgba(46, 125, 50, 0.55)'
      ctx.font = 'bold 30px Tajawal, sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText('نقاء', SIZE / 2, SIZE - 36)

      // رسم المنتج (مُفرَّغ الخلفية) في المنتصف بحجم مناسب مع هامش
      const PAD = 90
      const maxW = SIZE - PAD * 2
      const maxH = SIZE - PAD * 2
      const ratio = Math.min(maxW / cutoutImg.width, maxH / cutoutImg.height)
      const drawW = cutoutImg.width * ratio
      const drawH = cutoutImg.height * ratio
      ctx.drawImage(cutoutImg, (SIZE - drawW) / 2, (SIZE - drawH) / 2 - 20, drawW, drawH)

      const finalDataUrl = canvas.toDataURL('image/png')
      setFinalImage(finalDataUrl)
      URL.revokeObjectURL(cutoutUrl)
      showToast('✅ تمت معالجة الصورة بنجاح')
    } catch (err) {
      console.error('❌ خطأ معالجة الصورة:', err)
      showToast('❌ فشلت معالجة الصورة: ' + err.message, 'error')
    }
    setProcessing(false)
    setProgressMsg('')
  }

  const loadImage = (src) => new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })

  const resetAll = () => {
    setForm(EMPTY_FORM)
    setRawImage(null)
    setFinalImage(null)
    setEditingId(null)
    setExistingImageUrl(null)
  }

  const save = async () => {
    if (!form.name.trim()) { showToast('⚠️ اسم المنتج مطلوب', 'error'); return }
    if (!form.price) { showToast('⚠️ السعر مطلوب', 'error'); return }
    // ✅ معالجة الصورة اختيارية الآن — نستخدم النسخة المعالجة إن وُجدت، وإلا الأصلية، وإلا بدون صورة

    setSaving(true)
    try {
      // رفع الصورة إلى Supabase Storage (بصيغة WebP مضغوطة) بدل حفظها base64 مباشرة في الجدول.
      // عند التعديل بدون اختيار صورة جديدة، تبقى صورة المنتج الحالية (existingImageUrl) كما هي.
      let imageUrl = editingId ? existingImageUrl : null
      const sourceImage = finalImage || rawImage
      if (sourceImage) {
        setProgressMsg('🖼️ جارِ تحويل الصورة إلى WebP...')
        const webpBlob = await toWebP(sourceImage)
        setProgressMsg('⏳ جارِ رفع الصورة...')
        imageUrl = await uploadImageBlob(webpBlob)
        setProgressMsg('')
      }

      const row = {
        name: form.name.trim(),
        price: parseFloat(form.price) || 0,
        cost_price: form.cost_price ? parseFloat(form.cost_price) : null,
        carton_price: form.carton_price ? parseFloat(form.carton_price) : null,
        units: form.units ? parseInt(form.units) : null,
        stock: parseInt(form.stock) || 0,
        min_stock: parseInt(form.min_stock) || 5,
        sku: form.sku.trim() || null,
        description: form.description.trim() || null,
        image: imageUrl,
        brand_id: form.brand_id ? parseInt(form.brand_id) : null,
      }

      let productId = editingId
      if (editingId) {
        const { error } = await supabase.from('products').update(row).eq('id', editingId)
        if (error) throw error
      } else {
        row.disabled = false
        row.created_at = new Date().toISOString()
        const { data: inserted, error } = await supabase.from('products').insert(row).select('id').single()
        if (error) throw error
        productId = inserted?.id
      }

      // ربط الفئة — نحذف الربط القديم دائماً (سواء إضافة أو تعديل) ثم نربط الفئة الجديدة إن اختيرت
      if (productId) {
        const { error: delCatErr } = await supabase.from('product_categories').delete().eq('product_id', productId)
        if (delCatErr) console.error('⚠️ خطأ حذف ربط الفئة القديم:', delCatErr)
        if (form.category_id) {
          const { error: catErr } = await supabase.from('product_categories').insert({
            product_id: productId, category_id: parseInt(form.category_id),
          })
          if (catErr) console.error('⚠️ خطأ ربط الفئة (المنتج حُفظ رغم ذلك):', catErr)
        }
      }

      showToast(editingId ? '✅ تم حفظ التعديلات بنجاح!' : '✅ تم حفظ المنتج بنجاح!')
      resetAll()
    } catch (err) {
      console.error('❌ خطأ حفظ المنتج:', err)
      showToast('❌ فشل الحفظ: ' + err.message, 'error')
      setProgressMsg('')
    }
    setSaving(false)
  }

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', paddingBottom: 40 }}>
      {toast && <Toast {...toast} onDone={() => setToast(null)} />}

      {configError && (
        <div style={{ background: '#FEF3C7', color: '#92400E', padding: '14px 18px', fontSize: 13, fontWeight: 700, textAlign: 'center', lineHeight: 1.6 }}>
          {configError}
        </div>
      )}

      <div style={{ background: 'linear-gradient(135deg,#1B5E20,#2E7D32)', color: 'white', padding: '22px 20px', textAlign: 'center' }}>
        <div style={{ fontSize: 22, fontWeight: 900 }}>📦 نقاء — إدخال المنتجات</div>
        <div style={{ fontSize: 12.5, opacity: .85, marginTop: 4 }}>أدخل بيانات المنتج مع صورة بخلفية بيضاء تلقائية</div>
      </div>

      <div style={{ padding: '14px 18px 0' }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setMode('form')}
            style={{ flex: 1, padding: '10px 8px', borderRadius: 14, border: 'none', fontWeight: 800, fontSize: 13,
              background: mode === 'form' ? '#2E7D32' : '#F1F5F9', color: mode === 'form' ? 'white' : '#475569', cursor: 'pointer' }}>
            {editingId ? '✏️ تعديل المنتج' : '➕ منتج جديد'}
          </button>
          <button onClick={() => setMode('search')}
            style={{ flex: 1, padding: '10px 8px', borderRadius: 14, border: 'none', fontWeight: 800, fontSize: 13,
              background: mode === 'search' ? '#2E7D32' : '#F1F5F9', color: mode === 'search' ? 'white' : '#475569', cursor: 'pointer' }}>
            🔍 بحث وتعديل
          </button>
        </div>
      </div>

      {mode === 'search' && (
        <div style={{ padding: 18 }}>
          <div style={{ background: 'white', borderRadius: 18, padding: 16, boxShadow: '0 2px 10px rgba(0,0,0,.06)' }}>
            <input
              autoFocus
              style={inputStyle}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="🔍 اكتب اسم المنتج أو الباركود..."
            />

            {searching && (
              <div style={{ textAlign: 'center', padding: 20, color: '#94a3b8', fontSize: 13 }}>⏳ جارِ البحث...</div>
            )}

            {!searching && searchQuery.trim() && searchResults.length === 0 && (
              <div style={{ textAlign: 'center', padding: 20, color: '#94a3b8', fontSize: 13 }}>لا توجد نتائج مطابقة</div>
            )}

            <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {searchResults.map((p) => (
                <button key={p.id} onClick={() => selectProduct(p)}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 10, borderRadius: 14, border: '1.5px solid #E2E8F0', background: '#FAFAFA', cursor: 'pointer', textAlign: 'right', fontFamily: 'inherit' }}>
                  {p.image ? (
                    <img src={p.image} alt="" style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 10, flexShrink: 0 }} />
                  ) : (
                    <div style={{ width: 44, height: 44, borderRadius: 10, background: '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>📦</div>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 800, fontSize: 13.5, color: '#0F172A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</div>
                    <div style={{ fontSize: 11.5, color: '#94a3b8', marginTop: 2 }}>
                      {p.price} دج · مخزون {p.stock ?? 0} {p.sku ? `· ${p.sku}` : ''}
                    </div>
                  </div>
                  <span style={{ fontSize: 18 }}>›</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {mode === 'form' && (
      <div style={{ padding: 18 }}>
        {editingId && (
          <div style={{ background: '#EEF4FF', color: '#1565C0', borderRadius: 14, padding: '10px 14px', marginBottom: 16, fontSize: 13, fontWeight: 700, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>✏️ تعديل: {form.name || 'منتج'}</span>
            <button onClick={resetAll} style={{ background: 'none', border: 'none', color: '#1565C0', fontWeight: 900, cursor: 'pointer', fontSize: 13, textDecoration: 'underline' }}>
              إلغاء / منتج جديد
            </button>
          </div>
        )}

        {/* ── قسم الصورة ── */}
        <div style={{ background: 'white', borderRadius: 18, padding: 16, marginBottom: 16, boxShadow: '0 2px 10px rgba(0,0,0,.06)' }}>
          <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 12 }}>📷 صورة المنتج</div>

          {!rawImage && existingImageUrl ? (
            <div>
              <img src={existingImageUrl} alt="" style={{ width: '100%', height: 180, objectFit: 'contain', borderRadius: 12, background: '#F8FAFC', marginBottom: 10 }} />
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => fileInputRef.current?.click()}
                  style={{ flex: 1, padding: '12px 8px', borderRadius: 14, border: '2px dashed #CBD5E1', background: '#F8FAFC', fontWeight: 800, fontSize: 12.5, color: '#475569', cursor: 'pointer' }}>
                  📁 تغيير من الجهاز
                </button>
                <button onClick={() => cameraInputRef.current?.click()}
                  style={{ flex: 1, padding: '12px 8px', borderRadius: 14, border: '2px dashed #86EFAC', background: '#F0FDF4', fontWeight: 800, fontSize: 12.5, color: '#166534', cursor: 'pointer' }}>
                  📸 تغيير بالكاميرا
                </button>
                <input ref={fileInputRef} type="file" accept="image/*" onChange={onFile} style={{ display: 'none' }} />
                <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" onChange={onFile} style={{ display: 'none' }} />
              </div>
            </div>
          ) : !rawImage ? (
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => fileInputRef.current?.click()}
                style={{ flex: 1, padding: '18px 8px', borderRadius: 14, border: '2px dashed #CBD5E1', background: '#F8FAFC', fontWeight: 800, fontSize: 13, color: '#475569', cursor: 'pointer' }}>
                📁<br />من الجهاز
              </button>
              <button onClick={() => cameraInputRef.current?.click()}
                style={{ flex: 1, padding: '18px 8px', borderRadius: 14, border: '2px dashed #86EFAC', background: '#F0FDF4', fontWeight: 800, fontSize: 13, color: '#166534', cursor: 'pointer' }}>
                📸<br />التقاط بالكاميرا
              </button>
              <input ref={fileInputRef} type="file" accept="image/*" onChange={onFile} style={{ display: 'none' }} />
              <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" onChange={onFile} style={{ display: 'none' }} />
            </div>
          ) : (
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: finalImage ? '1fr 1fr' : '1fr', gap: 10, marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 700, marginBottom: 4, textAlign: 'center' }}>الأصلية</div>
                  <img src={rawImage} alt="" style={{ width: '100%', height: 160, objectFit: 'contain', borderRadius: 12, background: '#F1F5F9' }} />
                </div>
                {finalImage && (
                  <div>
                    <div style={{ fontSize: 11, color: '#059669', fontWeight: 700, marginBottom: 4, textAlign: 'center' }}>✅ بعد المعالجة</div>
                    <img src={finalImage} alt="" style={{ width: '100%', height: 160, objectFit: 'contain', borderRadius: 12, border: '1.5px solid #6EE7B7' }} />
                  </div>
                )}
              </div>

              {(processing || saving) && progressMsg && (
                <div style={{ textAlign: 'center', fontSize: 12.5, color: '#1565C0', fontWeight: 700, marginBottom: 10, background: '#EEF4FF', borderRadius: 10, padding: 10 }}>
                  {progressMsg}
                </div>
              )}

              <div style={{ display: 'flex', gap: 8 }}>
                {!finalImage && (
                  <button disabled={processing} onClick={processImage}
                    style={{ flex: 2, padding: 12, borderRadius: 14, border: 'none', fontWeight: 900, fontSize: 13,
                      background: processing ? '#E2E8F0' : '#2E7D32', color: 'white', cursor: processing ? 'default' : 'pointer' }}>
                    {processing ? '⏳ جارِ المعالجة...' : '✨ إزالة الخلفية تلقائياً'}
                  </button>
                )}
                <button onClick={() => { setRawImage(null); setFinalImage(null) }}
                  style={{ flex: 1, padding: 12, borderRadius: 14, border: 'none', fontWeight: 800, fontSize: 13, background: '#F1F5F9', color: '#475569', cursor: 'pointer' }}>
                  إعادة الاختيار
                </button>
              </div>
              {!finalImage && !processing && (
                <div style={{ textAlign: 'center', fontSize: 11.5, color: '#94a3b8', marginTop: 8 }}>
                  المعالجة اختيارية — تقدر تحفظ المنتج بالصورة الأصلية مباشرة بدون معالجة
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── بيانات المنتج ── */}
        <div style={{ background: 'white', borderRadius: 18, padding: 16, boxShadow: '0 2px 10px rgba(0,0,0,.06)' }}>
          <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 12 }}>📝 بيانات المنتج</div>

          <Field label="اسم المنتج *"><input style={inputStyle} value={form.name} onChange={F('name')} placeholder="مثال: ماء اشمول 1.5 لتر" /></Field>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Field label="السعر (بالوحدة) *"><input type="number" style={inputStyle} value={form.price} onChange={F('price')} placeholder="50" /></Field>
            <Field label="سعر التكلفة"><input type="number" style={inputStyle} value={form.cost_price} onChange={F('cost_price')} placeholder="40" /></Field>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Field label="سعر الكرتون"><input type="number" style={inputStyle} value={form.carton_price} onChange={F('carton_price')} placeholder="2000" /></Field>
            <Field label="عدد القطع/كرتون"><input type="number" style={inputStyle} value={form.units} onChange={F('units')} placeholder="12" /></Field>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Field label="المخزون الحالي"><input type="number" style={inputStyle} value={form.stock} onChange={F('stock')} /></Field>
            <Field label="الحد الأدنى للتنبيه"><input type="number" style={inputStyle} value={form.min_stock} onChange={F('min_stock')} /></Field>
          </div>
          <Field label="الباركود / SKU (اختياري)">
            <div style={{ display: 'flex', gap: 8 }}>
              <input style={inputStyle} value={form.sku} onChange={F('sku')} placeholder="اكتب يدوياً أو امسح بالكاميرا" />
              <button type="button" onClick={() => setShowScanner(true)}
                style={{ padding: '0 16px', borderRadius: 12, border: 'none', background: '#EEF4FF', color: '#1565C0', fontWeight: 800, cursor: 'pointer', flexShrink: 0 }}>
                📷 مسح
              </button>
            </div>
          </Field>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Field label="الفئة (اختياري)">
              <select style={inputStyle} value={form.category_id} onChange={F('category_id')}>
                <option value="">— بدون —</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
            <Field label="الماركة (اختياري)">
              <select style={inputStyle} value={form.brand_id} onChange={F('brand_id')}>
                <option value="">— بدون —</option>
                {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </Field>
          </div>

          <Field label="الوصف (اختياري)">
            <textarea style={{ ...inputStyle, minHeight: 70, resize: 'vertical' }} value={form.description} onChange={F('description')} placeholder="تفاصيل إضافية عن المنتج" />
          </Field>

          <button disabled={saving} onClick={save}
            style={{ width: '100%', marginTop: 8, padding: 14, borderRadius: 16, border: 'none', fontWeight: 900, fontSize: 15,
              background: saving ? '#E2E8F0' : '#DC2626', color: 'white', cursor: saving ? 'default' : 'pointer' }}>
            {saving ? '⏳ جارِ الحفظ...' : (editingId ? '💾 حفظ التعديلات' : '💾 حفظ المنتج')}
          </button>
        </div>
      </div>
      )}

      {showScanner && (
        <BarcodeScanner
          onDetected={(code) => { setForm(f => ({ ...f, sku: code })); setShowScanner(false); showToast('✅ تم قراءة الباركود: ' + code) }}
          onClose={() => setShowScanner(false)}
        />
      )}
    </div>
  )
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ fontSize: 12.5, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 5 }}>{label}</label>
      {children}
    </div>
  )
}

const inputStyle = {
  width: '100%', padding: '10px 12px', borderRadius: 12, border: '1.5px solid #E2E8F0',
  fontSize: 14, fontFamily: 'inherit', background: '#FAFAFA', outline: 'none',
}
