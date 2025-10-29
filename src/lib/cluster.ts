export type SolanaCluster = 'localnet' | 'devnet' | 'testnet' | 'mainnet-beta'

export function normalizeCluster(value?: string | null): SolanaCluster {
  switch (value?.toLowerCase()) {
    case 'mainnet':
    case 'mainnetbeta':
    case 'mainnet-beta':
      return 'mainnet-beta'
    case 'testnet':
      return 'testnet'
    case 'localnet':
    case 'localhost':
      return 'localnet'
    case 'devnet':
    default:
      return 'devnet'
  }
}

export function walletNetworkToCluster(network?: string | null): SolanaCluster | null {
  if (!network) {
    return null
  }
  return normalizeCluster(network)
}

export const DEFAULT_CLUSTER: SolanaCluster = normalizeCluster(
  process.env.NEXT_PUBLIC_SOLANA_NETWORK ?? undefined,
)
