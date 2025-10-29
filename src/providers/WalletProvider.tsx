'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { clusterApiUrl } from '@solana/web3.js'
import {
  ConnectionProvider,
  WalletProvider as SolanaWalletProvider,
  useWallet,
} from '@solana/wallet-adapter-react'
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base'
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui'
import { useStandardWalletAdapters } from '@solana/wallet-standard-wallet-adapter-react'

import {
  DEFAULT_CLUSTER,
  type SolanaCluster,
  walletNetworkToCluster,
} from '@/lib/cluster'

type Props = {
  children: ReactNode
}

type ClusterContextValue = {
  cluster: SolanaCluster
  endpoint: string
  setCluster: (cluster: SolanaCluster) => void
}

const LOCALNET_RPC = 'http://127.0.0.1:8899'

const ClusterContext = createContext<ClusterContextValue | undefined>(undefined)

export function useSolanaCluster() {
  const context = useContext(ClusterContext)
  if (!context) {
    throw new Error('useSolanaCluster must be used within WalletProvider')
  }
  return context
}

function resolveEndpoint(cluster: SolanaCluster): string {
  if (cluster === 'localnet') {
    return (
      process.env.NEXT_PUBLIC_SOLANA_LOCALNET_RPC_URL ??
      process.env.NEXT_PUBLIC_SOLANA_RPC_URL ??
      LOCALNET_RPC
    )
  }

  const clusterSpecific =
    (cluster === 'devnet' && process.env.NEXT_PUBLIC_SOLANA_DEVNET_RPC_URL) ||
    (cluster === 'testnet' && process.env.NEXT_PUBLIC_SOLANA_TESTNET_RPC_URL) ||
    (cluster === 'mainnet-beta' && process.env.NEXT_PUBLIC_SOLANA_MAINNET_RPC_URL)

  if (clusterSpecific) {
    return clusterSpecific
  }

  if (process.env.NEXT_PUBLIC_SOLANA_RPC_URL) {
    return process.env.NEXT_PUBLIC_SOLANA_RPC_URL
  }

  switch (cluster) {
    case 'mainnet-beta':
      return clusterApiUrl(WalletAdapterNetwork.Mainnet)
    case 'testnet':
      return clusterApiUrl(WalletAdapterNetwork.Testnet)
    case 'devnet':
      return clusterApiUrl(WalletAdapterNetwork.Devnet)
    default:
      return LOCALNET_RPC
  }
}

function WalletClusterSynchronizer() {
  const { wallet } = useWallet()
  const { cluster, setCluster } = useSolanaCluster()

  const syncClusterFromNetwork = useCallback(
    (network?: string | null) => {
      const resolved = walletNetworkToCluster(network)
      if (resolved && resolved !== cluster) {
        setCluster(resolved)
      }
    },
    [cluster, setCluster],
  )

  useEffect(() => {
    const adapter = wallet?.adapter as
      | (typeof wallet.adapter & {
          network?: string
          on?: (event: string, listener: (...args: unknown[]) => void) => void
          off?: (event: string, listener: (...args: unknown[]) => void) => void
        })
      | undefined

    if (!adapter) {
      return
    }

    // Sync immediately with the adapter's reported network, if available.
    syncClusterFromNetwork(adapter.network)

    const handleConnect = () => syncClusterFromNetwork(adapter.network)
    const handleReadyState = () => syncClusterFromNetwork(adapter.network)

    adapter.on?.('connect', handleConnect)
    adapter.on?.('readyStateChange', handleReadyState)

    return () => {
      adapter.off?.('connect', handleConnect)
      adapter.off?.('readyStateChange', handleReadyState)
    }
  }, [wallet, syncClusterFromNetwork])

  return null
}

export function WalletProvider({ children }: Props) {
  const [cluster, setClusterState] = useState<SolanaCluster>(DEFAULT_CLUSTER)

  const setCluster = useCallback(
    (nextCluster: SolanaCluster) => {
      setClusterState((previous) => (previous === nextCluster ? previous : nextCluster))
    },
    [],
  )

  const endpoint = useMemo(() => resolveEndpoint(cluster), [cluster])

  const configuredWallets = useMemo(() => [], [])
  const wallets = useStandardWalletAdapters(configuredWallets)

  const contextValue = useMemo<ClusterContextValue>(
    () => ({
      cluster,
      endpoint,
      setCluster,
    }),
    [cluster, endpoint, setCluster],
  )

  return (
    <ClusterContext.Provider value={contextValue}>
      <ConnectionProvider endpoint={endpoint}>
        <SolanaWalletProvider wallets={wallets} autoConnect>
          <WalletClusterSynchronizer />
          <WalletModalProvider>{children}</WalletModalProvider>
        </SolanaWalletProvider>
      </ConnectionProvider>
    </ClusterContext.Provider>
  )
}
