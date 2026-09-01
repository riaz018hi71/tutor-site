'use client'

import { useState } from 'react'
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

type SearchState = 'idle' | 'searching' | 'not_found' | 'found'

export default function MyOrderPage() {
  const [phone, setPhone] = useState('')
  const [trxId, setTrxId] = useState('')

  const [searchState, setSearchState] = useState<SearchState>('idle')
  // 👇 ইচ্ছাকৃতভাবে `any` — TS বিল্ড কখনো এই কারণে ফেল করবে না
  const [order, setOrder] = useState<any>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [downloading, setDownloading] = useState(false)

  // ------------------------------------------------------------------
  // 🔎 কোনো লিংক/আইডি ছাড়াই — শুধু ফোন নম্বর + Trx ID দিয়ে সার্চ।
  // দুটো একসাথে মিলতে হবে, কারণ শুধু ফোন নম্বর দিয়ে খুঁজলে একজন
  // কাস্টমারের একাধিক অর্ডার থাকলে ভুল অর্ডার দেখানোর ঝুঁকি থাকে।
  // ------------------------------------------------------------------
  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault()
    setSearchState('searching')
    setOrder(null)

    const { data, error } = await supabase
      .from('orders')
      .select('*, suggestions(*)')
      .eq('customer_phone', phone.trim())
      .ilike('trx_id', trxId.trim())
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error || !data) {
      setSearchState('not_found')
      return
    }

    setOrder(data)
    setSearchState('found')
  }

  const refetchOrder = async () => {
    if (!order?.id) return
    const { data, error } = await supabase
      .from('orders')
      .select('*, suggestions(*)')
      .eq('id', order.id)
      .single()

    if (!error && data) {
      setOrder(data)
    }
  }

  const handleRefresh = async () => {
    setRefreshing(true)
    await refetchOrder()
    setRefreshing(false)
  }

  const handleSearchAgain = () => {
    setSearchState('idle')
    setOrder(null)
    setPhone('')
    setTrxId('')
  }

  // ------------------------------------------------------------------
  // 📥 সিকিউর ১-টাইম ডাউনলোড (বাকি পেজগুলোর মতোই একই লজিক)
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

    const { error: updateError } = await supabase
      .from('orders')
      .update({ has_downloaded: true, status: 'Used' })
      .eq('id', order.id)

    if (updateError) {
      console.error('❌ Order status update failed:', updateError, '| order.id used:', order.id)
      alert('ফাইল ডাউনলোড হয়েছে, কিন্তু অর্ডারের স্ট্যাটাস আপডেট করা যায়নি। অ্যাডমিনের সাথে যোগাযোগ করুন। (Console-এ error দেখুন)')
    }

    window.open(data.signedUrl, '_blank')

    setDownloading(false)
    await refetchOrder()
  }

  // ------------------------------------------------------------------
  // 🖼️ রেন্ডার
  // ------------------------------------------------------------------

  return (
    <main className="min-h-screen bg-neutral-950 flex items-center justify-center px-6 py-16 text-neutral-100">
      <div className="w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-900 p-8 shadow-2xl">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-black text-white">আমার অর্ডার</h1>
          <Link
            href="/"
            className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-xs font-semibold text-white transition-all hover:bg-neutral-700 hover:border-neutral-500"
          >
            🏠 হোম
          </Link>
        </div>

        {/* ------------------ সার্চ ফর্ম ------------------ */}
        {searchState !== 'found' && (
          <>
            <p className="mt-2 text-sm text-neutral-400">
              অর্ডার করার সময় ব্যবহৃত ফোন নম্বর এবং ট্রানজেকশন আইডি (TrxID) দিন — আপনার অর্ডারের বর্তমান অবস্থা দেখতে পারবেন।
            </p>

            <form onSubmit={handleSearch} className="mt-6 grid gap-4">
              <input
                required
                placeholder="Phone Number"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="rounded-lg border border-neutral-700 bg-neutral-950 px-4 py-2.5 text-sm text-white placeholder-neutral-500 outline-none focus:border-indigo-500"
              />
              <input
                required
                placeholder="Transaction ID (TrxID)"
                value={trxId}
                onChange={(e) => setTrxId(e.target.value)}
                className="rounded-lg border border-neutral-700 bg-neutral-950 px-4 py-2.5 text-sm text-white placeholder-neutral-500 outline-none focus:border-indigo-500"
              />

              {searchState === 'not_found' && (
                <p className="text-sm text-red-400">
                  কোনো অর্ডার খুঁজে পাওয়া যায়নি। ফোন নম্বর ও ট্রানজেকশন আইডি ঠিক আছে কিনা যাচাই করুন।
                </p>
              )}

              <button
                type="submit"
                disabled={searchState === 'searching'}
                className="rounded-lg bg-indigo-600 py-3 text-sm font-semibold text-white transition-colors hover:bg-indigo-500 disabled:opacity-60"
              >
                {searchState === 'searching' ? 'খোঁজা হচ্ছে...' : '🔍 অর্ডার খুঁজুন'}
              </button>
            </form>
          </>
        )}

        {/* ------------------ ফলাফল ------------------ */}
        {searchState === 'found' && order && (
          <>
            <div className="mt-6 border-t border-b border-neutral-800 py-4 text-left space-y-2">
              <p className="text-sm text-neutral-300">
                <span className="text-neutral-500 font-medium">সাজেশন:</span> {order.suggestions?.title ?? '—'}
              </p>
              <p className="text-sm text-neutral-300">
                <span className="text-neutral-500 font-medium">কাস্টমার নাম:</span> {order.customer_name}
              </p>
            </div>

            <div className="mt-6">
              {order.status === 'Pending' ? (
                <div className="space-y-4 text-center">
                  <div className="rounded-lg bg-amber-500/10 p-4 text-sm text-amber-400 font-medium">
                    ⏳ আপনার পেমেন্টটি যাচাই করা হচ্ছে। অ্যাডমিন অ্যাপ্রুভ করার পর এখান থেকেই ডাউনলোড করতে পারবেন।
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
              ) : order.status === 'Success' && !order.has_downloaded ? (
                <div className="space-y-3 text-center">
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
                <div className="space-y-4 text-center">
                  <div className="rounded-lg bg-red-500/10 p-4 text-sm text-red-400 font-medium">
                    🔒 আপনি অলরেডি ১ বার ফাইলটি ডাউনলোড করে ফেলেছেন। আপনার সিকিউর লিংকটি এক্সপায়ার হয়ে গেছে।
                  </div>
                  <p className="text-xs text-neutral-500">
                    ২য় বার ডাউনলোড করতে হলে দয়া করে পুনরায় পেমেন্ট করে নতুন অর্ডার সাবমিট করুন।
                  </p>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={handleSearchAgain}
              className="mt-6 w-full rounded-lg border border-neutral-700 bg-neutral-800 px-5 py-2.5 text-sm font-semibold text-white transition-all hover:bg-neutral-700 hover:border-neutral-500"
            >
              🔍 অন্য অর্ডার খুঁজুন
            </button>
          </>
        )}
      </div>
    </main>
  )
}
