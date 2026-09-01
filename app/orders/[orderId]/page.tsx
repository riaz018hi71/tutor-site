'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'

const PDF_BUCKET = 'suggestions-pdf'

// ------------------------------------------------------------------
// 🧠 বুলেটপ্রুফ পাথ পার্সার (বাকি সব পেজের মতোই)
// ------------------------------------------------------------------
function extractStoragePath(rawPath: string | null | undefined, bucketName: string): string | null {
  if (!rawPath) return null
  let path = rawPath.trim()

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

  if (/%[0-9A-Fa-f]{2}/.test(path)) {
    try {
      path = decodeURIComponent(path)
    } catch {
      // ম্যালফর্মড এনকোডিং হলে original path-ই ব্যবহার করো
    }
  }

  return path.trim() || null
}

export default function OrderStatusPage() {
  const params = useParams() as any
  const orderId = params?.orderId

  // 👇 ইচ্ছাকৃতভাবে `any` — TS বিল্ড কখনো এই কারণে ফেল করবে না
  const [order, setOrder] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [linkCopied, setLinkCopied] = useState(false)

  // ------------------------------------------------------------------
  // 🔎 এই পেজটা localStorage-এর উপর নির্ভর করে না — সরাসরি URL-এর
  // orderId দিয়ে Supabase থেকে খোঁজে। তাই যেকোনো ডিভাইস/ব্রাউজার থেকে
  // এই লিংক খুললেই একই ফলাফল দেখাবে।
  // ------------------------------------------------------------------
  const fetchOrder = async () => {
    if (!orderId) return
    setLoading(true)
    setNotFound(false)

    const { data, error } = await supabase
      .from('orders')
      .select('*, suggestions(*)')
      .eq('id', orderId)
      .single()

    if (error || !data) {
      setOrder(null)
      setNotFound(true)
      setLoading(false)
      return
    }

    setOrder(data)
    setLoading(false)
  }

  useEffect(() => {
    fetchOrder()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId])

  const handleRefresh = async () => {
    setRefreshing(true)
    await fetchOrder()
    setRefreshing(false)
  }

  // ------------------------------------------------------------------
  // 🔗 এই পেজের নিজস্ব লিংক কপি করার সুবিধা — কাস্টমার চাইলে অন্য কাউকে/
  // ডিভাইসে শেয়ার করার জন্য সহজেই কপি করতে পারে
  // ------------------------------------------------------------------
  const handleCopyLink = async () => {
    if (typeof window === 'undefined') return
    const url = window.location.href

    try {
      await navigator.clipboard.writeText(url)
      setLinkCopied(true)
      setTimeout(() => setLinkCopied(false), 2000)
    } catch {
      window.prompt('এই লিংকটি কপি করুন:', url)
    }
  }

  // ------------------------------------------------------------------
  // 📥 সিকিউর ১-টাইম ডাউনলোড (PaymentForm-এর মতোই একই লজিক)
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

    setDownloading(false)
    // ✅ ডাউনলোড শেষ — এই পেজে অর্ডারের তাজা অবস্থা আবার লোড করো (Used দেখাবে)
    await fetchOrder()
  }

  // ------------------------------------------------------------------
  // 🖼️ রেন্ডার
  // ------------------------------------------------------------------

  if (loading) {
    return (
      <main className="min-h-screen bg-neutral-950 flex items-center justify-center px-6 py-16 text-neutral-100">
        <p className="text-sm text-neutral-400 font-mono">লোড হচ্ছে...</p>
      </main>
    )
  }

  if (notFound || !order) {
    return (
      <main className="min-h-screen bg-neutral-950 flex items-center justify-center px-6 py-16 text-neutral-100">
        <div className="w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-900 p-8 text-center">
          <h1 className="text-xl font-bold text-red-400">অর্ডারটি খুঁজে পাওয়া যায়নি!</h1>
          <p className="mt-2 text-sm text-neutral-400">
            লিংকটি সঠিক কিনা যাচাই করুন, অথবা অ্যাডমিনের সাথে যোগাযোগ করুন।
          </p>
          <Link
            href="/"
            className="mt-6 inline-flex items-center gap-2 rounded-lg border border-neutral-700 bg-neutral-800 px-5 py-2.5 text-sm font-semibold text-white transition-all hover:bg-neutral-700 hover:border-neutral-500"
          >
            🏠 হোমপেজে যান
          </Link>
        </div>
      </main>
    )
  }

  const status: string = order?.status
  const alreadyDownloaded: boolean = Boolean(order?.has_downloaded)

  return (
    <main className="min-h-screen bg-neutral-950 flex items-center justify-center px-6 py-16 text-neutral-100">
      <div className="w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-900 p-8 text-center shadow-2xl">
        <h1 className="text-2xl font-black text-white">Tutor - অর্ডার স্ট্যাটাস</h1>
        <p className="mt-2 text-xs text-neutral-400">অর্ডার আইডি: {order.id}</p>

        <div className="mt-6 border-t border-b border-neutral-800 py-4 text-left space-y-2">
          <p className="text-sm text-neutral-300">
            <span className="text-neutral-500 font-medium">সাজেশন:</span> {order.suggestions?.title ?? '—'}
          </p>
          <p className="text-sm text-neutral-300">
            <span className="text-neutral-500 font-medium">কাস্টমার নাম:</span> {order.customer_name}
          </p>
        </div>

        {/* 🔗 এই পেজের লিংক — বুকমার্ক/সেভ/শেয়ার করার জন্য */}
        <div className="mt-4 rounded-lg border border-neutral-800 bg-neutral-950 p-3 text-left">
          <p className="text-xs text-neutral-500">
            📌 এই লিংকটি সেভ করে রাখুন — যেকোনো সময়, যেকোনো ডিভাইস থেকে এখানে ফিরে এসে স্ট্যাটাস চেক করতে পারবেন।
          </p>
          <button
            type="button"
            onClick={handleCopyLink}
            className="mt-2 w-full rounded-md bg-neutral-800 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-neutral-700"
          >
            {linkCopied ? '✅ লিংক কপি হয়েছে' : '📋 এই পেজের লিংক কপি করুন'}
          </button>
        </div>

        <div className="mt-8">
          {status === 'Pending' ? (
            <div className="space-y-4">
              <div className="rounded-lg bg-amber-500/10 p-4 text-sm text-amber-400 font-medium">
                ⏳ আপনার পেমেন্টটি যাচাই করা হচ্ছে। অ্যাডমিন অ্যাপ্রুভ করার পর এই পেজ থেকেই ডাউনলোড করতে পারবেন।
              </div>
              <button
                type="button"
                onClick={handleRefresh}
                disabled={refreshing}
                className="w-full rounded-lg border border-amber-700 bg-amber-500/10 px-5 py-2.5 text-sm font-semibold text-amber-300 transition-colors hover:bg-amber-500/20 disabled:opacity-60"
              >
                {refreshing ? 'চেক করা হচ্ছে...' : '🔄 স্ট্যাটাস রিফ্রেশ করুন'}
              </button>
            </div>
          ) : status === 'Success' && !alreadyDownloaded ? (
            <div className="space-y-3">
              <button
                type="button"
                onClick={handleSecureDownload}
                disabled={downloading}
                className="w-full rounded-lg bg-indigo-600 py-3 text-sm font-semibold text-white shadow-lg transition-all hover:bg-indigo-500 disabled:opacity-50"
              >
                {downloading ? 'লিংক তৈরি হচ্ছে...' : '📥 ১-টাইম ডাউনলোড করুন'}
              </button>
              <p className="text-xs text-neutral-500">
                লিংকটি ৫ মিনিটের জন্য বৈধ থাকবে এবং একবারই ব্যবহার করা যাবে।
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-lg bg-red-500/10 p-4 text-sm text-red-400 font-medium">
                🔒 আপনি অলরেডি ১ বার ফাইলটি ডাউনলোড করে ফেলেছেন। আপনার সিকিউর লিংকটি এক্সপায়ার হয়ে গেছে।
              </div>
              <p className="text-xs text-neutral-500">
                ২য় বার ডাউনলোড করতে হলে দয়া করে পুনরায় পেমেন্ট করে নতুন অর্ডার সাবমিট করুন।
              </p>
            </div>
          )}
        </div>

        <Link
          href="/"
          className="mt-6 inline-flex items-center gap-2 rounded-lg border border-neutral-700 bg-neutral-800 px-5 py-2.5 text-sm font-semibold text-white transition-all hover:bg-neutral-700 hover:border-neutral-500"
        >
          🏠 হোমপেজে যান
        </Link>
      </div>
    </main>
  )
}
