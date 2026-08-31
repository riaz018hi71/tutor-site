'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'

// 🔧 Replace with your real personal payment details
const PAYMENT_DETAILS = {
  bKash: { number: '01XXXXXXXXX', type: 'Personal' },
  Nagad: { number: '01XXXXXXXXX', type: 'Personal' },
  Bank: {
    accountName: 'Your Name',
    accountNumber: 'XXXXXXXXXXXX',
    bankName: 'Your Bank',
    branch: 'Your Branch',
  },
}

export default function PaymentForm({ suggestionId, price }: { suggestionId: string; price: number }) {
  const [method, setMethod] = useState<'bKash' | 'Nagad' | 'Bank'>('bKash')
  const [form, setForm] = useState({ name: '', email: '', phone: '', senderNumber: '', trxId: '' })
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setStatus('loading')
    setErrorMsg('')

    const { error } = await supabase.from('orders').insert({
      suggestion_id: suggestionId,
      customer_name: form.name,
      customer_email: form.email,
      customer_phone: form.phone,
      payment_method: method,
      sender_number: form.senderNumber,
      trx_id: form.trxId,
      status: 'Pending',
    })

    if (error) {
      setStatus('error')
      setErrorMsg(error.message)
      return
    }

    setStatus('success')
    setForm({ name: '', email: '', phone: '', senderNumber: '', trxId: '' })
  }

  if (status === 'success') {
    return (
      <div className="rounded-2xl border border-emerald-800 bg-emerald-950/40 p-8 text-center">
        <h3 className="text-xl font-bold text-emerald-400">Order submitted!</h3>
        <p className="mt-2 text-sm text-emerald-200">
          We'll verify your transaction and unlock your download shortly.
        </p>
      </div>
    )
  }

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

        {status === 'error' && <p className="col-span-full text-sm text-red-400">{errorMsg}</p>}

        <button type="submit" disabled={status === 'loading'}
          className="col-span-full rounded-lg bg-indigo-600 py-3 text-sm font-semibold text-white transition-colors hover:bg-indigo-500 disabled:opacity-60">
          {status === 'loading' ? 'Submitting...' : 'Submit Order'}
        </button>
      </form>
    </div>
  )
}