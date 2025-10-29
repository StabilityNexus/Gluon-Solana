'use client'

import { useMemo } from 'react'
import { AnchorProvider, Wallet } from '@coral-xyz/anchor'
import { PublicKey } from '@solana/web3.js'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { getStablecoinProgram } from '@/lib/stablecoin-program'

export function useStablecoinProgram() {
  const { connection } = useConnection()
  const walletAdapter = useWallet()

  const anchorWallet = useMemo<Wallet>(() => {
    const fallbackPublicKey = walletAdapter.publicKey ?? PublicKey.default

    return {
      publicKey: fallbackPublicKey,
      signTransaction: async (transaction) => {
        if (!walletAdapter.signTransaction) {
          throw new Error('Wallet not connected')
        }
        return walletAdapter.signTransaction(transaction)
      },
      signAllTransactions: async (transactions) => {
        if (!walletAdapter.signAllTransactions) {
          throw new Error('Wallet not connected')
        }
        return walletAdapter.signAllTransactions(transactions)
      },
    } as Wallet
  }, [walletAdapter])

  const provider = useMemo(
    () => new AnchorProvider(connection, anchorWallet, AnchorProvider.defaultOptions()),
    [connection, anchorWallet],
  )

  const program = useMemo(() => getStablecoinProgram(provider), [provider])

  return { program, provider, walletAdapter }
}
