import React, { useState, useEffect, useRef } from 'react'
import { supabase } from './lib/supabase.js'

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
  const [toast, setToast] = useState(null)
  const fileInputRef = useRef(null)
  const cameraInputRef = useRef(null)

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
  }

  const save = async () => {
    if (!form.name.trim()) { showToast('⚠️ اسم المنتج مطلوب', 'error'); return }
    if (!form.price) { showToast('⚠️ السعر مطلوب', 'error'); return }
    if (!finalImage) { showToast('⚠️ عالج الصورة أولاً قبل الحفظ', 'error'); return }

    setSaving(true)
    try {
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
        image: finalImage,
        brand_id: form.brand_id ? parseInt(form.brand_id) : null,
        disabled: false,
        created_at: new Date().toISOString(),
      }
      const { data: inserted, error } = await supabase.from('products').insert(row).select('id').single()
      if (error) throw error

      // ربط الفئة إن اختيرت
      if (form.category_id && inserted?.id) {
        const { error: catErr } = await supabase.from('product_categories').insert({
          product_id: inserted.id, category_id: parseInt(form.category_id),
        })
        if (catErr) console.error('⚠️ خطأ ربط الفئة (المنتج حُفظ رغم ذلك):', catErr)
      }

      showToast('✅ تم حفظ المنتج بنجاح!')
      resetAll()
    } catch (err) {
      console.error('❌ خطأ حفظ المنتج:', err)
      showToast('❌ فشل الحفظ: ' + err.message, 'error')
    }
    setSaving(false)
  }

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', paddingBottom: 40 }}>
      {toast && <Toast {...toast} onDone={() => setToast(null)} />}

      <div style={{ background: 'linear-gradient(135deg,#1B5E20,#2E7D32)', color: 'white', padding: '22px 20px', textAlign: 'center' }}>
        <div style={{ fontSize: 22, fontWeight: 900 }}>📦 نقاء — إدخال المنتجات</div>
        <div style={{ fontSize: 12.5, opacity: .85, marginTop: 4 }}>أدخل بيانات المنتج مع صورة بخلفية بيضاء تلقائية</div>
      </div>

      <div style={{ padding: 18 }}>
        {/* ── قسم الصورة ── */}
        <div style={{ background: 'white', borderRadius: 18, padding: 16, marginBottom: 16, boxShadow: '0 2px 10px rgba(0,0,0,.06)' }}>
          <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 12 }}>📷 صورة المنتج</div>

          {!rawImage ? (
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

              {processing && (
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
          <Field label="SKU (اختياري)"><input style={inputStyle} value={form.sku} onChange={F('sku')} placeholder="رمز المنتج" /></Field>

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
            {saving ? '⏳ جارِ الحفظ...' : '💾 حفظ المنتج'}
          </button>
        </div>
      </div>
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
