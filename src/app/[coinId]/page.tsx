import InteractionClient from './InteractionClient'
import { Suspense } from 'react'

export async function generateStaticParams() {
  return [{ coinId: 'c' }]
}

// Enable dynamic routing for contract addresses not in generateStaticParams
export const dynamicParams = true

export default async function CoinDetailPage({ params }: { params: Promise<{ coinId: string }> }) {
  const { coinId } = await params

  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen">Loading...</div>}>
      <InteractionClient coinId={coinId} />
    </Suspense>
  )
}
