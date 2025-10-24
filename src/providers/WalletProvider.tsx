'use client'

import React, { ReactNode, useMemo } from 'react'
import { clusterApiUrl } from '@solana/web3.js'
import { ConnectionProvider, WalletProvider as SolanaWalletProvider } from '@solana/wallet-adapter-react'
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base'
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui'
import { useStandardWalletAdapters } from '@solana/wallet-standard-wallet-adapter-react'

type Props = {
  children: ReactNode
}

const LOCALNET_RPC = 'http://127.0.0.1:8899'

export function WalletProvider({ children }: Props) {
  const network =
    (process.env.NEXT_PUBLIC_SOLANA_NETWORK as WalletAdapterNetwork | undefined) ??
    WalletAdapterNetwork.Devnet

  const endpoint =
    process.env.NEXT_PUBLIC_SOLANA_RPC_URL ||
    (network === WalletAdapterNetwork.Devnet ? clusterApiUrl(network) : LOCALNET_RPC)

  const configuredWallets = useMemo(() => [], [])
  const wallets = useStandardWalletAdapters(configuredWallets)

  return (
    <ConnectionProvider endpoint={endpoint}>
      <SolanaWalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </SolanaWalletProvider>
    </ConnectionProvider>
  )
}
