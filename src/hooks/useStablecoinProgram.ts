'use client'

import { useMemo } from 'react'
import { AnchorProvider, Wallet } from '@coral-xyz/anchor'
import { PublicKey } from '@solana/web3.js'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { getStablecoinProgram, getStablecoinProgramIdForCluster } from '@/lib/stablecoin-program'
import { useSolanaCluster } from '@/providers/WalletProvider'

export function useStablecoinProgram() {
  const { connection } = useConnection()
  const walletAdapter = useWallet()
  const { cluster } = useSolanaCluster()

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

  const programId = useMemo(() => getStablecoinProgramIdForCluster(cluster), [cluster])

  const program = useMemo(() => getStablecoinProgram(provider, programId), [provider, programId])

  return { program, provider, walletAdapter, cluster, programId }
}
