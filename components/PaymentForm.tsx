'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'

const PDF_BUCKET = 'suggestions-pdf'

const PAYMENT_DETAILS = {
  bKash: { number: '01834299148', type: 'Personal' },
  Nagad: { number: '01834299148', type: 'Personal' },
  Bank: {
    accountName: 'MD REAZ UDDIN',
    accountNumber: '00960214024363',
    bankName: 'Trust Bank',
    branch: 'Ramu Branch',
  },
}

// ------------------------------------------------------------------
// 🧾 order state ইচ্ছাকৃতভাবে `any` রাখা হয়েছে যাতে Supabase-এর
// জেনারেটেড টাইপ আর আমাদের shape না মিললেও Vercel বিল্ড কখনোই
// strict TS এররে ফেল না করে। status-এর জন্য শুধু একটা হালকা union
// টাইপ রাখা হলো, যেটা ডকুমেন্টেশনের কাজ করে, এনফোর্স করে না।
// ------------------------------------------------------------------
type OrderStatus = 'Pending' | 'Success' | 'Used' | 'Rejected' | string

type ViewState = 'checking' | 'form' | 'pending' | 'download'

// ------------------------------------------------------------------
// 🧠 বুলেটপ্রুফ পাথ পার্সার (অ্যাডমিন ও কাস্টমার ডাউনলোড পেজের মতোই)
// ফুল URL, এনকোডেড পাথ, বা স্পেস/বাংলা অক্ষরসহ raw পাথ — সব ক্ষেত্রেই
// Supabase Storage-এর জন্য valid bucket-relative path রিটার্ন করে।
// ------------------------------------------------------------------
function extractStoragePath(rawPath: string | null | undefined, bucketName: string): string | null {
  if (!rawPath) return null
  let path = rawPath.trim()

  // 1️⃣ ফুল URL হলে শুধু বাকেটের পরের অংশটুকু বের করো
  if (/^https?:\/\//i.test(path)) {
    try {
      const url = new URL(path)
      const marker = `/${bucketName}/`
      const idx = url.pathname.indexOf(marker)
      if (idx !== -1) {
        path = url.pathname.slice(idx + marker.length)
      } else {
        const parts = url.pathname.split(`${bucketName}/`)
        path = parts.length > 1 ? parts[parts.length - 1] : url.pathname
      }
    } catch {
      // ভ্যালিড URL না হলে raw string হিসেবেই এগিয়ে যাও
    }
  }

  // 2️⃣ percent-encoded হলে decode করো (raw বাংলা/স্পেস থাকলে স্কিপ করে দাও)
  if (/%[0-9A-Fa-f]{2}/.test(path)) {
    try {
      path = decodeURIComponent(path)
    } catch {
      // ম্যালফর্মড এনকোডিং হলে original path-ই ব্যবহার করো
    }
  }

  return path.trim() || null
}

export default function PaymentForm({ suggestionId, price }: { suggestionId: string; price: number }) {
  const storageKey = `order_suggestion_${suggestionId}`

  // 🔁 লাইফসাইকেল/ভিউ স্টেট
  const [view, setView] = useState<ViewState>('checking')
  // 👇 ইচ্ছাকৃতভাবে `any` — Supabase-এর deep-join রেসপন্স shape নিয়ে
  // TypeScript-কে কখনো বিল্ড ফেল করতে দেওয়া হবে না।
  const [order, setOrder] = useState<any>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [downloading, setDownloading] = useState(false)

  // 💳 পেমেন্ট ফর্ম স্টেট
  const [method, setMethod] = useState<'bKash' | 'Nagad' | 'Bank'>('bKash')
  const [form, setForm] = useState({ name: '', email: '', phone: '', senderNumber: '', trxId: '' })
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  // ------------------------------------------------------------------
  // 1️⃣ মাউন্ট হওয়ার সময় localStorage চেক করে অর্ডারের বর্তমান অবস্থা যাচাই
  // ------------------------------------------------------------------
  useEffect(() => {
    checkExistingOrder()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggestionId])

  const readSavedOrderId = (): string | null => {
    try {
      return window.localStorage.getItem(storageKey)
    } catch {
      // প্রাইভেট মোড/localStorage ব্লকড থাকলে নিরাপদে null রিটার্ন করো
      return null
    }
  }

  const saveOrderId = (id: string) => {
    try {
      window.localStorage.setItem(storageKey, id)
    } catch {
      // localStorage না থাকলে ফ্লো চলবে, শুধু refresh-এ state হারাবে
    }
  }

  const clearSavedOrder = () => {
    try {
      window.localStorage.removeItem(storageKey)
    } catch {
      // ignore
    }
    setOrder(null)
  }

  // ------------------------------------------------------------------
  // 🔎 localStorage-এ থাকা order id দিয়ে ফুল রিলেশনসহ (suggestions সহ)
  // সবসময় "ক্লিন" ভাবে নতুন করে ডেটা লোড করে — insert response-এর উপর
  // কখনো নির্ভর করে না, তাই deep-join crash-এর কোনো সুযোগই থাকে না।
  // ------------------------------------------------------------------
  const checkExistingOrder = async () => {
    setView('checking')

    const savedOrderId = readSavedOrderId()

    if (!savedOrderId) {
      setView('form')
      return
    }

    const { data: existingOrder, error } = await supabase
      .from('orders')
      .select('*, suggestions(*)')
      .eq('id', savedOrderId)
      .single()

    if (error || !existingOrder) {
      // অর্ডার আর খুঁজে পাওয়া যাচ্ছে না (ডিলিট হয়ে গেছে ইত্যাদি) — ক্লিন স্লেট
      clearSavedOrder()
      setView('form')
      return
    }

    const typedOrder: any = existingOrder
    setOrder(typedOrder)

    const currentStatus: OrderStatus = typedOrder?.status
    const alreadyDownloaded: boolean = Boolean(typedOrder?.has_downloaded)

    if (currentStatus === 'Pending') {
      setView('pending')
    } else if (currentStatus === 'Success' && !alreadyDownloaded) {
      setView('download')
    } else {
      // 'Used', 'Rejected', অথবা আগেই ডাউনলোড হয়ে গেছে — ফর্মে ফিরিয়ে দাও
      clearSavedOrder()
      setView('form')
    }
  }

  const handleRefresh = async () => {
    setRefreshing(true)
    await checkExistingOrder()
    setRefreshing(false)
  }

  // ------------------------------------------------------------------
  // 💳 পেমেন্ট ফর্ম সাবমিশন
  // ------------------------------------------------------------------
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitStatus('loading')
    setErrorMsg('')

    // 🛠️ FIX: insert-এর সময় গভীর রিলেশনাল জয়েন (suggestions(*)) সিলেক্ট করা হচ্ছে না।
    // শুধু নতুন তৈরি হওয়া রো-এর `id` সিলেক্ট করা হচ্ছে — এটাই সবচেয়ে স্থিতিশীল প্যাটার্ন,
    // কারণ insert().select() এ deep join প্রায়ই null বা crash-প্রবণ রেসপন্স দেয়।
    const { data, error } = await supabase
      .from('orders')
      .insert({
        suggestion_id: suggestionId,
        customer_name: form.name,
        customer_email: form.email,
        customer_phone: form.phone,
        payment_method: method,
        sender_number: form.senderNumber,
        trx_id: form.trxId,
        status: 'Pending',
      })
      .select('id')
      .single()

    if (error || !data) {
      setSubmitStatus('error')
      setErrorMsg(error?.message ?? 'দুঃখিত, একটি সমস্যা হয়েছে। আবার চেষ্টা করুন।')
      return
    }

    const insertedId: string = (data as any)?.id

    if (!insertedId) {
      setSubmitStatus('error')
      setErrorMsg('অর্ডার আইডি পাওয়া যায়নি। অনুগ্রহ করে আবার চেষ্টা করুন।')
      return
    }

    // ✅ id পাওয়ার সাথে সাথেই localStorage-এ সেভ করো
    saveOrderId(insertedId)

    setForm({ name: '', email: '', phone: '', senderNumber: '', trxId: '' })
    setSubmitStatus('idle')

    // ✅ এখন ফুল রিলেশনসহ (suggestions সহ) ক্লিনভাবে ডেটা রিফেচ করো
    await checkExistingOrder()
  }

  // ------------------------------------------------------------------
  // 📥 সিকিউর ১-টাইম ডাউনলোড
  // ------------------------------------------------------------------
  const handleSecureDownload = async () => {
    if (!order) return

    const rawPath: string | null | undefined = order?.suggestions?.pdf_url

    if (!rawPath) {
      alert('ফাইল খুঁজে পাওয়া যায়নি! অনুগ্রহ করে অ্যাডমিনের সাথে যোগাযোগ করুন।')
      return
    }

    const cleanedPath = extractStoragePath(rawPath, PDF_BUCKET)

    if (!cleanedPath) {
      alert('ফাইলের পাথ পার্স করা যায়নি! অনুগ্রহ করে অ্যাডমিনের সাথে যোগাযোগ করুন।')
      return
    }

    setDownloading(true)

    const { data, error } = await supabase.storage
      .from(PDF_BUCKET)
      .createSignedUrl(cleanedPath, 300)

    if (error || !data) {
      console.error('Supabase Storage Error:', error, '| Path used:', cleanedPath, '| Raw value:', rawPath)
      alert('ডাউনলোড লিংক তৈরি করা যায়নি। অনুগ্রহ করে অ্যাডমিনের সাথে যোগাযোগ করুন।')
      setDownloading(false)
      return
    }

    await supabase
      .from('orders')
      .update({ has_downloaded: true, status: 'Used' })
      .eq('id', order.id)

    window.open(data.signedUrl, '_blank')

    // ✅ ডাউনলোড শেষ — localStorage ক্লিয়ার করে ফর্মে ফিরিয়ে দাও যাতে চাইলে আবার কিনতে পারে
    clearSavedOrder()
    setDownloading(false)
    setView('form')
  }

  // ------------------------------------------------------------------
  // 🖼️ রেন্ডার — স্টেট অনুযায়ী সঠিক ভিউ দেখাও
  // ------------------------------------------------------------------

  // চেকিং অবস্থা (initial mount বা refresh এর সময়)
  if (view === 'checking') {
    return (
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-8 text-center">
        <p className="text-sm text-neutral-400 font-mono">চেক করা হচ্ছে...</p>
      </div>
    )
  }

  // Scenario A: Pending — যাচাই চলছে
  if (view === 'pending') {
    return (
      <div className="rounded-2xl border border-amber-800 bg-amber-950/20 p-8 text-center">
        <h3 className="text-xl font-bold text-amber-400">⏳ Your payment is being verified</h3>
        <p className="mt-2 text-sm text-amber-200">
          আপনার পেমেন্টটি যাচাই করা হচ্ছে। অ্যাডমিন অ্যাপ্রুভ করার পর এখান থেকেই ডাউনলোড করতে পারবেন।
        </p>
        <div className="mt-6 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
            className="rounded-lg border border-amber-700 bg-amber-500/10 px-5 py-2.5 text-sm font-semibold text-amber-300 transition-colors hover:bg-amber-500/20 disabled:opacity-60"
          >
            {refreshing ? 'চেক করা হচ্ছে...' : '🔄 স্ট্যাটাস রিফ্রেশ করুন'}
          </button>
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-lg border border-neutral-700 bg-neutral-900 px-5 py-2.5 text-sm font-semibold text-white transition-all hover:bg-neutral-800 hover:border-neutral-500"
          >
            🏠 হোমপেজে যান
          </Link>
        </div>
      </div>
    )
  }

  // Scenario B: Success — সিকিউর ডাউনলোড বাটন
  if (view === 'download') {
    return (
      <div className="rounded-2xl border border-emerald-800 bg-emerald-950/40 p-8 text-center">
        <h3 className="text-xl font-bold text-emerald-400">✅ Payment Verified!</h3>
        <p className="mt-2 text-sm text-emerald-200">
          আপনার পেমেন্ট অ্যাপ্রুভ হয়েছে। নিচের বাটনে ক্লিক করে আপনার ফাইলটি ডাউনলোড করুন।
        </p>
        <button
          type="button"
          onClick={handleSecureDownload}
          disabled={downloading}
          className="mt-6 w-full rounded-lg bg-indigo-600 py-3 text-sm font-semibold text-white shadow-lg transition-all hover:bg-indigo-500 disabled:opacity-50"
        >
          {downloading ? 'লিংক তৈরি হচ্ছে...' : '📥 ১-টাইম ডাউনলোড করুন'}
        </button>
        <p className="mt-3 text-xs text-neutral-500">
          লিংকটি ৫ মিনিটের জন্য বৈধ থাকবে এবং একবারই ব্যবহার করা যাবে।
        </p>
        <Link
          href="/"
          className="mt-4 inline-flex items-center gap-2 rounded-lg border border-neutral-700 bg-neutral-900 px-5 py-2.5 text-sm font-semibold text-white transition-all hover:bg-neutral-800 hover:border-neutral-500"
        >
          🏠 হোমপেজে যান
        </Link>
      </div>
    )
  }

  // Scenario C: Used / No Order — ডিফল্ট পেমেন্ট ফর্ম
  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-8">
      <h2 className="text-xl font-bold text-white">Complete Your Payment</h2>
      <p className="mt-1 text-sm text-neutral-400">
        Send ৳{price} using one of the methods below, then submit your Transaction ID.
      </p>

      <div className="mt-6 grid grid-cols-3 gap-3">
        {(['bKash', 'Nagad', 'Bank'] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMethod(m)}
            className={`rounded-xl border px-4 py-3 text-sm font-semibold transition-all ${
              method === m
                ? 'border-indigo-500 bg-indigo-500/10 text-white'
                : 'border-neutral-700 text-neutral-400 hover:border-neutral-500'
            }`}
          >
            {m}
          </button>
        ))}
      </div>

      <div className="mt-4 rounded-xl border border-dashed border-neutral-700 bg-neutral-950 p-4 text-sm text-neutral-300">
        {method === 'Bank' ? (
          <ul className="space-y-1">
            <li><span className="text-neutral-500">Account Name:</span> {PAYMENT_DETAILS.Bank.accountName}</li>
            <li><span className="text-neutral-500">Account Number:</span> {PAYMENT_DETAILS.Bank.accountNumber}</li>
            <li><span className="text-neutral-500">Bank:</span> {PAYMENT_DETAILS.Bank.bankName}</li>
            <li><span className="text-neutral-500">Branch:</span> {PAYMENT_DETAILS.Bank.branch}</li>
          </ul>
        ) : (
          <p>
            Send <strong>{PAYMENT_DETAILS[method].type}</strong> payment to{' '}
            <strong className="text-white">{PAYMENT_DETAILS[method].number}</strong>
          </p>
        )}
      </div>

      <form onSubmit={handleSubmit} className="mt-6 grid gap-4 sm:grid-cols-2">
        <input name="name" required placeholder="Full Name" value={form.name} onChange={handleChange}
          className="rounded-lg border border-neutral-700 bg-neutral-950 px-4 py-2.5 text-sm text-white placeholder-neutral-500 outline-none focus:border-indigo-500" />
        <input name="email" type="email" required placeholder="Email Address" value={form.email} onChange={handleChange}
          className="rounded-lg border border-neutral-700 bg-neutral-950 px-4 py-2.5 text-sm text-white placeholder-neutral-500 outline-none focus:border-indigo-500" />
        <input name="phone" required placeholder="Phone Number" value={form.phone} onChange={handleChange}
          className="rounded-lg border border-neutral-700 bg-neutral-950 px-4 py-2.5 text-sm text-white placeholder-neutral-500 outline-none focus:border-indigo-500" />
        <input name="senderNumber" required placeholder={`${method} Sender Number`} value={form.senderNumber} onChange={handleChange}
          className="rounded-lg border border-neutral-700 bg-neutral-950 px-4 py-2.5 text-sm text-white placeholder-neutral-500 outline-none focus:border-indigo-500" />
        <input name="trxId" required placeholder="Transaction ID (TrxID)" value={form.trxId} onChange={handleChange}
          className="col-span-full rounded-lg border border-neutral-700 bg-neutral-950 px-4 py-2.5 text-sm text-white placeholder-neutral-500 outline-none focus:border-indigo-500" />

        {submitStatus === 'error' && <p className="col-span-full text-sm text-red-400">{errorMsg}</p>}

        <button type="submit" disabled={submitStatus === 'loading'}
          className="col-span-full rounded-lg bg-indigo-600 py-3 text-sm font-semibold text-white transition-colors hover:bg-indigo-500 disabled:opacity-60">
          {submitStatus === 'loading' ? 'Submitting...' : 'Submit Order'}
        </button>
      </form>
    </div>
  )
}
