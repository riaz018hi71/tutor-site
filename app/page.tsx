import { supabase } from '@/lib/supabase'
import { Suggestion } from '@/lib/types'
import Link from 'next/link'
import Image from 'next/image'

export const revalidate = 0

async function getSuggestions(): Promise<Suggestion[]> {
  const { data, error } = await supabase
    .from('suggestions')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    console.error(error)
    return []
  }
  return data as Suggestion[]
}

export default async function HomePage() {
  const suggestions = await getSuggestions()

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100">
      <nav className="sticky top-0 z-50 border-b border-neutral-800 bg-neutral-950/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-fuchsia-500 font-black text-white">
              T
            </span>
            <span className="text-xl font-bold tracking-tight text-white">Tutor</span>
          </Link>
          <div className="hidden gap-8 text-sm font-medium text-neutral-300 md:flex">
            <Link href="/" className="transition-colors hover:text-white">Home</Link>
            <a href="#browse" className="transition-colors hover:text-white">See ALL</a>
            <Link href="/admin/dashboard" className="transition-colors hover:text-white">Admin</Link>
          </div>
        </div>
      </nav>

      <section className="mx-auto max-w-7xl px-6 py-20 text-center">
        <h1 className="bg-gradient-to-br from-white to-neutral-400 bg-clip-text text-4xl font-black tracking-tight text-transparent sm:text-6xl">
          Learn faster with premium digital guides
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-neutral-400">
          Curated notes and resources — pick a topic and get instant access after payment confirmation.
        </p>
      </section>

      <section id="browse" className="mx-auto max-w-7xl px-6 pb-24">
        {suggestions.length === 0 ? (
          <p className="text-center text-neutral-500">No suggestions available yet.</p>
        ) : (
          <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {suggestions.map((item) => (
              <Link
                key={item.id}
                href={`/suggestions/${item.id}`}
                className="group relative overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-900 transition-all duration-300 ease-out hover:-translate-y-2 hover:shadow-2xl hover:shadow-indigo-500/10"
              >
                <div className="relative h-48 w-full overflow-hidden bg-neutral-800">
                  {item.cover_image_url ? (
                    <Image
                      src={item.cover_image_url}
                      alt={item.title}
                      fill
                      className="object-cover transition-transform duration-500 ease-out group-hover:scale-110"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-neutral-600">
                      No Cover
                    </div>
                  )}
                  <span className="absolute left-3 top-3 rounded-full bg-indigo-500/90 px-3 py-1 text-xs font-semibold text-white shadow-lg backdrop-blur">
                    {item.topic}
                  </span>
                </div>
                <div className="p-5">
                  <h3 className="line-clamp-1 text-lg font-semibold text-white">{item.title}</h3>
                  <p className="mt-2 line-clamp-2 text-sm text-neutral-400">{item.preview_content}</p>
                  <div className="mt-4 flex items-center justify-between">
                    <span className="text-xl font-bold text-indigo-400">৳{item.price}</span>
                    <span className="rounded-lg border border-neutral-700 px-3 py-1.5 text-xs font-medium text-neutral-300 transition-colors group-hover:border-indigo-500 group-hover:text-white">
                      View Details →
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </main>
  )
}