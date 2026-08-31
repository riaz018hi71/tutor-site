import { supabase } from '@/lib/supabase'
import { Suggestion } from '@/lib/types'
import { notFound } from 'next/navigation'
import Image from 'next/image'
import PaymentForm from '@/components/PaymentForm'

async function getSuggestion(id: string): Promise<Suggestion | null> {
  const { data, error } = await supabase.from('suggestions').select('*').eq('id', id).single()
  if (error || !data) return null
  return data as Suggestion
}

export default async function SuggestionDetailPage({ params }: { params: { id: string } }) {
  const suggestion = await getSuggestion(params.id)
  if (!suggestion) notFound()

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="mx-auto max-w-5xl px-6 py-16">
        <div className="grid gap-10 md:grid-cols-2">
          <div className="overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-900">
            <div className="relative h-72 w-full">
              {suggestion.cover_image_url ? (
                <Image src={suggestion.cover_image_url} alt={suggestion.title} fill className="object-cover" />
              ) : (
                <div className="flex h-full items-center justify-center text-neutral-600">No Cover</div>
              )}
            </div>
          </div>

          <div>
            <span className="inline-block rounded-full bg-indigo-500/90 px-3 py-1 text-xs font-semibold text-white">
              {suggestion.topic}
            </span>
            <h1 className="mt-4 text-3xl font-black text-white">{suggestion.title}</h1>
            <p className="mt-3 text-3xl font-bold text-indigo-400">৳{suggestion.price}</p>

            <div className="mt-6 rounded-xl border border-neutral-800 bg-neutral-900 p-5">
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-400">
                Preview / Table of Contents
              </h2>
              <p className="whitespace-pre-line text-sm leading-relaxed text-neutral-300">
                {suggestion.preview_content || 'No preview available.'}
              </p>
            </div>
          </div>
        </div>

        <div className="mt-16">
          <PaymentForm suggestionId={suggestion.id} price={suggestion.price} />
        </div>
      </div>
    </main>
  )
}