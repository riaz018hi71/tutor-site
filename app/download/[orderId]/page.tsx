'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useParams } from 'next/navigation'

const PDF_BUCKET = 'suggestions-pdf'

/**
 * 🧠 বুলেটপ্রুফ পাথ পার্সার (অ্যাডমিন ড্যাশবোর্ডের মতোই)
 * order.suggestions.pdf_url এ যা-ই থাকুক না কেন (ফুল পাবলিক URL, সাইনড URL,
 * এনকোডেড পাথ, বা স্পেস/বাংলা অক্ষরসহ raw পাথ) — এই ফাংশন সবসময়
 * Supabase Storage-এর জন্য valid, decoded relative path রিটার্ন করবে।
 */
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

export default function CustomerDownloadPage() {
  const params = useParams() as any // 👈 টাইপস্ক্রিপ্ট এরর দূর করতে explicit type দেওয়া হলো
  const orderId = params?.orderId

  const [order, setOrder] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [downloading, setDownloading] = useState(false)

  useEffect(() => {
    if (orderId) {
      fetchOrderDetails()
    }
  }, [orderId])

  const fetchOrderDetails = async () => {
    setLoading(true)
    
    // 💡 রিলেশন অবজেক্ট এবং অ্যারে দুই ফরম্যাটই হ্যান্ডেল করার জন্য কুয়েরি
    const { data, error } = await supabase
      .from('orders')
      .select('*, suggestions(*)')
      .eq('id', orderId)
      .single()

    if (!error && data) {
      setOrder(data)
    } else {
      console.error("Order fetching error:", error)
    }
    setLoading(false)
  }

  // 🧠 হেল্পার ফাংশন: suggestions অবজেক্ট বা অ্যারে যাই হোক না কেন সঠিকভাবে ডাটা বের করবে
  const getSuggestionData = () => {
    if (!order || !order.suggestions) return null;
    
    // যদি সুপাবেস অ্যারে ফরম্যাটে ডাটা পাঠায়
    if (Array.isArray(order.suggestions)) {
      return order.suggestions[0] || null;
    }
    
    // যদি ডিরেক্ট অবজেক্ট ফরম্যাটে পাঠায়
    return order.suggestions;
  }

  const handleSecureDownload = async () => {
    if (!order) return

    if (order.has_downloaded || order.status === 'Used') {
      alert('দুঃখিত! আপনি অলরেডি ১ বার ফাইলটি ডাউনলোড করে ফেলেছেন। পুনরায় ডাউনলোড করতে নতুন করে পেমেন্ট করতে হবে।')
      return
    }

    const suggestion = getSuggestionData()
    const rawPath = suggestion?.pdf_url

    if (!rawPath) {
      alert('ফাইল খুঁজে পাওয়া যায়নি! অনুগ্রহ করে অ্যাডমিনের সাথে যোগাযোগ করুন।')
      console.log('Debug - Entire Order Object:', order)
      return
    }

    const cleanedPath = extractStoragePath(rawPath, PDF_BUCKET)

    if (!cleanedPath) {
      alert('ফাইলের পাথ পার্স করা যায়নি! অনুগ্রহ করে অ্যাডমিনের সাথে যোগাযোগ করুন।')
      return
    }

    setDownloading(true)

    // 🔒 এখন robust path-এর উপর ভিত্তি করে সিকিউর সাইনড URL তৈরি হয়
    const { data, error } = await supabase
      .storage
      .from(PDF_BUCKET)
      .createSignedUrl(cleanedPath, 300) // ৫ মিনিট (৩০০ সেকেন্ড) ভ্যালিডিটি দেওয়া হলো যেন কাস্টমার আরামে ডাউনলোড করতে পারে

    if (error || !data) {
      console.error('Supabase Storage Error:', error, '| Path used:', cleanedPath, '| Raw value:', rawPath)
      alert('ডাউনলোড লিংক তৈরি করা যায়নি। অনুগ্রহ করে অ্যাডমিনের সাথে যোগাযোগ করুন।')
      setDownloading(false)
      return
    }

    // 🔄 ডাটাবেজ আপডেট এবং স্ট্যাটাস চেঞ্জ
    const { error: updateError } = await supabase
      .from('orders')
      .update({ has_downloaded: true, status: 'Used' })
      .eq('id', orderId)

    if (updateError) {
      console.error('Order update error:', updateError)
    }

    setDownloading(false)
    
    // 🌍 নতুন ট্যাবে সিকিউর ডাউনলোড লিংক ওপেন করা
    window.open(data.signedUrl, '_blank')
    
    // পেজ রিফ্রেশ করে বাটন লক করে দেওয়া
    fetchOrderDetails()
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-950 text-indigo-400 font-mono">
        লোড হচ্ছে...
      </div>
    )
  }

  if (!order) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-950 text-red-400 font-bold">
        অর্ডারটি খুঁজে পাওয়া যায়নি!
      </div>
    )
  }

  const currentSuggestion = getSuggestionData();

  return (
    <main className="min-h-screen bg-neutral-950 flex items-center justify-center px-6 py-16 text-neutral-100">
      <div className="w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-900 p-8 shadow-2xl text-center">
        <h1 className="text-2xl font-black text-white">Tutor - ডাউনলোড সেন্টার</h1>
        <p className="mt-2 text-xs text-neutral-400">অর্ডার আইডি: {order.id}</p>

        <div className="mt-6 border-t border-b border-neutral-800 py-4 text-left space-y-2">
          <p className="text-sm text-neutral-300"><span className="text-neutral-500 font-medium">কাস্টমার নাম:</span> {order.customer_name}</p>
          <p className="text-sm text-neutral-300"><span className="text-neutral-500 font-medium">সাজেশন:</span> {currentSuggestion?.title || 'রিলেশন লোড হয়নি'}</p>
          <p className="text-sm text-neutral-300">
            <span className="text-neutral-500 font-medium">পেমেন্ট স্টেটাস:</span>{' '}
            <span className={`font-bold ${order.status === 'Success' ? 'text-emerald-400' : order.status === 'Used' ? 'text-red-400' : 'text-amber-400'}`}>
              {order.status === 'Success' ? 'Approved (ডাউনলোড করা যাবে)' : order.status === 'Used' ? 'Downloaded (লকড)' : 'Pending (যাচাই চলছে)'}
            </span>
          </p>
        </div>

        <div className="mt-8">
          {order.status === 'Pending' ? (
            <div className="rounded-lg bg-amber-500/10 p-4 text-sm text-amber-400 font-medium">
              ⏳ আপনার পেমেন্টটি যাচাই করা হচ্ছে। অ্যাডমিন অ্যাপ্রুভ করার পর এই পেজ থেকেই যেকোনো সময় ডাউনলোড করতে পারবেন।
            </div>
          ) : order.status === 'Success' && !order.has_downloaded ? (
            <button
              type="button"
              onClick={handleSecureDownload}
              disabled={downloading}
              className="w-full rounded-lg bg-indigo-600 py-3 text-sm font-semibold text-white shadow-lg transition-all hover:bg-indigo-500 disabled:opacity-50"
            >
              {downloading ? 'লিংক তৈরি হচ্ছে...' : '📥 ১-টাইম ডাউনলোড করুন (প্রিন্ট ফাইল)'}
            </button>
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
      </div>
    </main>
  )
}
