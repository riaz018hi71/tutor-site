'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Order } from '@/lib/types'
import Link from 'next/link' // 👈 হোমপেজে যাওয়ার জন্য লিংক ইমপোর্ট করা হলো

const PDF_BUCKET = 'suggestions-pdf'

function extractStoragePath(rawPath: string | null | undefined, bucketName: string): string | null {
  if (!rawPath) return null
  let path = rawPath.trim()

  // 1️⃣ যদি এটা একটা ফুল URL হয়, তবে বাকেটের পরের অংশ নিখুঁতভাবে কেটে নাও
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
      // ওল্ড স্কুল ফলব্যাক
    }
  }

  // 2️⃣ ইউআরএল ডিকোড করার পর সামনে-পেছনে হিডেন স্পেস বা %20 ফাঁকা জায়গা ক্লিন করা
  if (/%[0-9A-Fa-f]{2}/.test(path)) {
    try {
      path = decodeURIComponent(path)
    } catch {
      // ইগনোর
    }
  }

  // 💥 মেইন ফিক্স: ডিকোড করা ফাইলের নামের একদম শুরুতে বা শেষে কোনো স্পেস বা স্ল্যাশ থাকলে তা পুরোপুরি মুছে দাও
  path = path.replace(/^[\s/]+|[\s/]+$/g, '')

  return path || null
}


  // 2️⃣ যদি path টা percent-encoded থাকে (%E0%A6%... ইত্যাদি), decode করো।
  //    ইতিমধ্যে raw স্পেস/বাংলা অক্ষর থাকলে (encode করা না থাকলে) স্কিপ করে দাও,
  //    নাহলে "%" চিহ্ন না থাকা string-এ decodeURIComponent ডাকলে সমস্যা নেই,
  //    কিন্তু malformed "%" থাকলে এটা crash করতে পারে — তাই try/catch দিয়ে গার্ড করা।
  if (/%[0-9A-Fa-f]{2}/.test(path)) {
    try {
      path = decodeURIComponent(path)
    } catch {
      // ম্যালফর্মড এনকোডিং হলে original path-ই ব্যবহার করো
    }
  }

  return path.trim() || null
}

export default function AdminDashboardPage() {
  // 🔐 পাসওয়ার্ড ও অথেন্টিকেশন স্টেট সেটআপ
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [form, setForm] = useState({
    title: '', price: '', topic: '', preview_content: '', pdf_url: '', cover_image_url: '',
  })
  const [uploading, setUploading] = useState(false)
  const [orders, setOrders] = useState<Order[]>([])
  const [loadingOrders, setLoadingOrders] = useState(true)

  // 🔑 সিকিউর পাসওয়ার্ড প্রম্পট ফাংশন
  useEffect(() => {
    const password = prompt("অনুগ্রহ করে টিউটর (Tutor) অ্যাডমিন পাসওয়ার্ড দিন:")

    if (password === "Rubel#952J+r@") {
      setIsAuthenticated(true)
      fetchOrders()
    } else {
      alert("ভুল পাসওয়ার্ড! আপনি এই ড্যাশবোর্ডে প্রবেশ করতে পারবেন না।")
      window.location.href = "/"
    }
  }, [])

  const fetchOrders = async () => {
    setLoadingOrders(true)
    const { data, error } = await supabase
      .from('orders')
      .select('*, suggestions(*)')
      .order('created_at', { ascending: false })

    if (!error && data) setOrders(data as Order[])
    setLoadingOrders(false)
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value })
  }

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault()
    setUploading(true)

    const { error } = await supabase.from('suggestions').insert({
      title: form.title,
      price: Number(form.price),
      topic: form.topic,
      preview_content: form.preview_content,
      pdf_url: form.pdf_url,
      cover_image_url: form.cover_image_url,
    })

    setUploading(false)
    if (!error) {
      setForm({ title: '', price: '', topic: '', preview_content: '', pdf_url: '', cover_image_url: '' })
      alert('Suggestion uploaded! It will now appear on the homepage.')
    } else {
      alert(error.message)
    }
  }

  const handleApprove = async (orderId: string) => {
    const { error } = await supabase.from('orders').update({ status: 'Success' }).eq('id', orderId)
    if (!error) fetchOrders()
    else alert(error.message)
  }

  // 🗑️ অর্ডার ডিলিট করার ফাংশন (কনফার্মেশন পপআপসহ)
  const handleDelete = async (orderId: string) => {
    const confirmed = window.confirm("আপনি কি নিশ্চিত এই অর্ডারটি স্থায়ীভাবে ডিলিট করতে চান? এই কাজটি পূর্বাবস্থায় ফেরানো যাবে না।")
    if (!confirmed) return

    const { error } = await supabase.from('orders').delete().eq('id', orderId)
    if (!error) fetchOrders()
    else alert(error.message)
  }

  // 📥 PDF ডাউনলোড লিংক জেনারেট করার ফাংশন — এখন JSX-এর বাইরে, নিজস্ব নামসহ
  const handleDownload = async (order: Order) => {
    const rawPath = order.suggestions?.pdf_url

    if (!rawPath) {
      alert('ফাইল নাম খুঁজে পাওয়া যায়নি!')
      return
    }

    const cleanedPath = extractStoragePath(rawPath, PDF_BUCKET)

    if (!cleanedPath) {
      alert('ফাইলের পাথ পার্স করা যায়নি!')
      return
    }

    const { data, error } = await supabase.storage
      .from(PDF_BUCKET)
      .createSignedUrl(cleanedPath, 60)

    if (data?.signedUrl) {
      window.open(data.signedUrl, '_blank')
    } else {
      console.error('Supabase Storage Error:', error, '| Path used:', cleanedPath, '| Raw value:', rawPath)
      alert('ফাইল ডাউনলোড লিংক তৈরি করা যায়নি! স্টোরেজে ফাইলটি আছে কি না চেক করুন।')
    }
  }

  // 🔒 পাসওয়ার্ড ম্যাচ না হওয়া পর্যন্ত মূল স্ক্রিন পুরোপুরি লক বা হিডেন থাকবে
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-950 font-mono text-lg text-indigo-400">
        অ্যাডমিন প্যানেল ভেরিফাই করা হচ্ছে...
      </div>
    )
  }

  return (
    <main className="min-h-screen bg-neutral-950 px-6 py-16 text-neutral-100">
      <div className="mx-auto max-w-6xl">

        {/* 📋 ড্যাশবোর্ড হেডার এবং হোমপেজে যাওয়ার বাটন */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-neutral-800 pb-6">
          <div>
            <h1 className="text-3xl font-black text-white">Admin Dashboard</h1>
            <p className="mt-1 text-sm text-neutral-500">
              🔐 এই ড্যাশবোর্ডটি এখন পাসওয়ার্ড দ্বারা সম্পূর্ণ সুরক্ষিত।
            </p>
          </div>

          {/* 🏠 হোমপেজে যাওয়ার স্টাইলিশ বাটন */}
          <div className="mt-4 sm:mt-0">
            <Link href="/" className="inline-flex items-center gap-2 rounded-lg border border-neutral-700 bg-neutral-900 px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-neutral-800 hover:border-neutral-500 shadow-md">
              🏠 হোমপেজে যান
            </Link>
          </div>
        </div>

        <section className="mt-10 rounded-2xl border border-neutral-800 bg-neutral-900 p-8 shadow-2xl">
          <h2 className="text-xl font-bold text-white">Upload New Suggestion</h2>
          <form onSubmit={handleUpload} className="mt-6 grid gap-4 sm:grid-cols-2">
            <input name="title" required placeholder="Title" value={form.title} onChange={handleChange}
              className="rounded-lg border border-neutral-700 bg-neutral-950 px-4 py-2.5 text-sm text-white outline-none focus:border-indigo-500" />
            <input name="price" type="number" step="0.01" required placeholder="Price (BDT)" value={form.price} onChange={handleChange}
              className="rounded-lg border border-neutral-700 bg-neutral-950 px-4 py-2.5 text-sm text-white outline-none focus:border-indigo-500" />
            <input name="topic" required placeholder="Topic (e.g. Physics)" value={form.topic} onChange={handleChange}
              className="rounded-lg border border-neutral-700 bg-neutral-950 px-4 py-2.5 text-sm text-white outline-none focus:border-indigo-500" />
            <input name="cover_image_url" placeholder="Cover Image URL" value={form.cover_image_url} onChange={handleChange}
              className="rounded-lg border border-neutral-700 bg-neutral-950 px-4 py-2.5 text-sm text-white outline-none focus:border-indigo-500" />
            <input name="pdf_url" required placeholder="PDF File URL" value={form.pdf_url} onChange={handleChange}
              className="col-span-full rounded-lg border border-neutral-700 bg-neutral-950 px-4 py-2.5 text-sm text-white outline-none focus:border-indigo-500" />
            <textarea name="preview_content" required placeholder="Preview Content / Table of Contents" value={form.preview_content} onChange={handleChange}
              rows={4}
              className="col-span-full rounded-lg border border-neutral-700 bg-neutral-950 px-4 py-2.5 text-sm text-white outline-none focus:border-indigo-500" />
            <button type="submit" disabled={uploading}
              className="col-span-full rounded-lg bg-indigo-600 py-3 text-sm font-semibold text-white transition-colors hover:bg-indigo-500 disabled:opacity-60">
              {uploading ? 'Uploading...' : 'Upload Suggestion'}
            </button>
          </form>
        </section>

        <section className="mt-12">
          <h2 className="text-xl font-bold text-white">Orders</h2>
          <div className="mt-6 overflow-x-auto rounded-2xl border border-neutral-800 shadow-xl">
            <table className="w-full text-left text-sm">
              <thead className="bg-neutral-900 text-neutral-400">
                <tr>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Product</th>
                  <th className="px-4 py-3">Method</th>
                  <th className="px-4 py-3">TrxID</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800 bg-neutral-950">
                {loadingOrders ? (
                  <tr><td colSpan={6} className="px-4 py-6 text-center text-neutral-500">Loading orders...</td></tr>
                ) : orders.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-6 text-center text-neutral-500">No orders yet.</td></tr>
                ) : (
                  orders.map((order) => (
                    <tr key={order.id} className="hover:bg-neutral-900/50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-medium text-white">{order.customer_name}</div>
                        <div className="text-xs text-neutral-500">{order.customer_email}</div>
                        <div className="text-xs text-neutral-500">{order.customer_phone}</div>
                      </td>
                      <td className="px-4 py-3 text-neutral-300">{order.suggestions?.title ?? order.suggestion_id}</td>
                      <td className="px-4 py-3 text-neutral-300">
                        <span className="uppercase text-indigo-400 font-bold text-xs bg-indigo-500/10 px-2 py-0.5 rounded">{order.payment_method}</span>
                        <div className="text-xs text-neutral-500 mt-1">{order.sender_number}</div>
                      </td>
                      <td className="px-4 py-3 font-mono text-yellow-400 font-bold uppercase">{order.trx_id}</td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${
                          order.status === 'Success'
                            ? 'bg-emerald-500/10 text-emerald-400'
                            : order.status === 'Rejected'
                            ? 'bg-red-500/10 text-red-400'
                            : 'bg-amber-500/10 text-amber-400'
                        }`}>
                          {order.status}
                        </span>
                      </td>

                      {/* ✅ Action সেল — Approve/Download আর Delete পুরোপুরি আলাদা, স্বাধীন স্লট */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 flex-nowrap">

                          {/* বাম স্লট: Pending হলে Approve, Success+pdf থাকলে Download, নাহলে ড্যাশ */}
                          <div className="flex-shrink-0">
                            {order.status === 'Pending' ? (
                              <button
                                type="button"
                                onClick={() => handleApprove(order.id)}
                                className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 shadow-md"
                              >
                                Approve
                              </button>
                            ) : order.status === 'Success' && order.suggestions?.pdf_url ? (
                              <button
                                type="button"
                                onClick={() => handleDownload(order)}
                                className="text-xs font-semibold text-indigo-400 underline cursor-pointer bg-transparent border-none p-0"
                              >
                                Download Link
                              </button>
                            ) : (
                              <span className="text-xs text-neutral-600">—</span>
                            )}
                          </div>

                          {/* ডান স্লট: Delete — সবসময়, প্রতিটি রো-তে, আলাদাভাবে রেন্ডার হয় */}
                          <div className="flex-shrink-0">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleDelete(order.id)
                              }}
                              className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-500 shadow-md"
                            >
                              Delete
                            </button>
                          </div>

                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  )
}
