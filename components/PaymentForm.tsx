'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'

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
// 💡 নতুন ডিজাইন: এই কম্পোনেন্টের একমাত্র কাজ হলো পেমেন্ট ফর্ম দেখানো
// এবং সাবমিট হলে অর্ডারটার নিজস্ব স্ট্যাটাস পেজে (/orders/{orderId})
// পাঠিয়ে দেওয়া। Pending/Download/Used — এই তিনটা স্টেটের UI, রিফ্রেশ,
// এবং সিকিউর ডাউনলোড লজিক এখন সম্পূর্ণভাবে app/orders/[orderId]/page.tsx
// এ থাকে। এতে কাস্টমার localStorage-এর উপর নির্ভর না করেই যেকোনো
// সময়, যেকোনো ডিভাইস থেকে (URL bookmark/history দিয়ে) নিজের অর্ডার
// চেক করতে পারবে — কারণ ব্রাউজারের ঠিকানাবারেই তার ট্র্যাকিং লিংকটা
// থাকে।
// ------------------------------------------------------------------
export default function PaymentForm({ suggestionId, price }: { suggestionId: string; price: number }) {
  const router = useRouter()

  const [method, setMethod] = useState<'bKash' | 'Nagad' | 'Bank'>('bKash')
  const [form, setForm] = useState({ name: '', email: '', phone: '', senderNumber: '', trxId: '' })
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitStatus('loading')
    setErrorMsg('')

    // শুধু id সিলেক্ট করা হচ্ছে — deep-join (suggestions(*)) এখানে লাগবে না,
    // কারণ পরের পেজ (/orders/[orderId]) নিজেই সেই ডেটা ক্লিনভাবে ফেচ করবে।
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

    // ✅ সরাসরি এই অর্ডারের নিজস্ব স্ট্যাটাস পেজে পাঠিয়ে দাও —
    // এখন থেকে এটাই কাস্টমারের ঠিকানাবারে থাকবে, যেকোনো সময় ফিরে আসতে পারবে
    router.push(`/orders/${insertedId}`)
  }

  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-8">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-white">Complete Your Payment</h2>
          <p className="mt-1 text-sm text-neutral-400">
            Send ৳{price} using one of the methods below, then submit your Transaction ID.
          </p>
        </div>
        <Link
          href="/"
          className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-neutral-700 bg-neutral-800 px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-neutral-700 hover:border-neutral-500"
        >
          🏠 হোমপেজে যান
        </Link>
      </div>

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
          {submitStatus === 'loading' ? 'Redirecting...' : 'Submit Order'}
        </button>
      </form>
    </div>
  )
}
