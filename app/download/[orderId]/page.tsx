'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useParams } from 'next/navigation'

export default function CustomerDownloadPage() {
  const params = useParams() as any // 👈 টাইপস্ক্রিপ্ট এরর দূর করতে explicit type দেওয়া হলো
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
    const { data, error } = await supabase
      .from('orders')
      .select('*, suggestions(*)')
      .eq('id', orderId)
      .single()

    if (!error && data) {
      setOrder(data)
    }
    setLoading(false)
  }

  const handleSecureDownload = async () => {
    if (!order) return
    
    if (order.has_downloaded || order.status === 'Used') {
      alert('দুঃখিত! আপনি অলরেডি ১ বার ফাইলটি ডাউনলোড করে ফেলেছেন। পুনরায় ডাউনলোড করতে নতুন করে পেমেন্ট করতে হবে।')
      return
    }

    setDownloading(true)

    // 🔒 এখানে ৩০ নম্বর লাইনের এররটি সম্পূর্ণ ফিক্স করা হয়েছে
    const { data, error } = await supabase
      .storage
      .from('suggestions-pdf')
      .createSignedUrl((order.suggestions as any)?.pdf_url || '', 120)

    if (error || !data) {
      alert('ডাউনলোড লিংক তৈরি করা যায়নি। অনুগ্রহ করে অ্যাডমিনের সাথে যোগাযোগ করুন।')
      setDownloading(false)
      return
    }

    await supabase
      .from('orders')
      .update({ has_downloaded: true, status: 'Used' })
      .eq('id', orderId)

    setDownloading(false)
    window.open(data.signedUrl, '_blank')
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
        অর্ডারটি খুঁজে পাওয়া যায়নি!
      </div>
    )
  }

  return (
    <main className="min-h-screen bg-neutral-950 flex items-center justify-center px-6 py-16 text-neutral-100">
      <div className="w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-900 p-8 shadow-2xl text-center">
        <h1 className="text-2xl font-black text-white">Tutor - ডাউনলোড সেন্টার</h1>
        <p className="mt-2 text-xs text-neutral-400">অর্ডার আইডি: {order.id}</p>

        <div className="mt-6 border-t border-b border-neutral-800 py-4 text-left space-y-2">
          <p className="text-sm text-neutral-300"><span className="text-neutral-500 font-medium">কাস্টমার নাম:</span> {order.customer_name}</p>
          <p className="text-sm text-neutral-300"><span className="text-neutral-500 font-medium">সাজেশন:</span> {(order.suggestions as any)?.title}</p>
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
              ⏳ আপনার পেমেন্টটি যাচাই করা হচ্ছে। অ্যাডমিন অ্যাপ্রুভ করার পর এই পেজ থেকেই যেকোনো সময় ডাউনলোড করতে পারবেন।
            </div>
          ) : order.status === 'Success' && !order.has_downloaded ? (
            <button
              onClick={handleSecureDownload}
              disabled={downloading}
              className="w-full rounded-lg bg-indigo-600 py-3 text-sm font-semibold text-white shadow-lg transition-all hover:bg-indigo-500 disabled:opacity-50"
            >
              {downloading ? 'লিংক তৈরি হচ্ছে...' : '📥 ১-টাইম ডাউনলোড করুন (প্রিন্ট ফাইল)'}
            </button>
          ) : (
            <div className="space-y-4">
              <div className="rounded-lg bg-red-500/10 p-4 text-sm text-red-400 font-medium">
                🔒 আপনি অলরেডি ১ বার ফাইলটি ডাউনলোড করে ফেলেছেন। আপনার সিকিউর লিংকটি এক্সপায়ার হয়ে গেছে।
              </div>
              <p className="text-xs text-neutral-500">
                ২য় বার ডাউনলোড করতে হলে দয়া করে পুনরায় পেমেন্ট করে নতুন অর্ডার সাবমিট করুন।
              </p>
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
