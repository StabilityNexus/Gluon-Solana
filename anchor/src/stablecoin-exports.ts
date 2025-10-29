// Here we export some useful types and functions for interacting with the Anchor program.
import { AnchorProvider, Program } from '@coral-xyz/anchor'
import { Cluster, PublicKey } from '@solana/web3.js'
import StablecoinIDL from '../target/idl/stablecoin.json'
import type { Stablecoin } from '../target/types/stablecoin'

// Re-export the generated IDL and type
export { Stablecoin, StablecoinIDL }

const DEVNET_PROGRAM_ID = new PublicKey('2JKDPiVwn2yf2zGw8rqX5hVLv3NUdmfLjcQBsFNbDwn1')
const MAINNET_PROGRAM_ID = new PublicKey('BaLj5dEV9zfzXbdUDDDfNsZHzYvgE7KeByTAkekwTows')

export const STABLECOIN_PROGRAM_IDS: Record<Cluster, PublicKey> = {
  devnet: DEVNET_PROGRAM_ID,
  testnet: DEVNET_PROGRAM_ID,
  'mainnet-beta': MAINNET_PROGRAM_ID,
}

export const STABLECOIN_PROGRAM_ID = new PublicKey(StablecoinIDL.address)

// This is a helper function to get the Stablecoin Anchor program.
export function getStablecoinProgram(provider: AnchorProvider, address?: PublicKey): Program<Stablecoin> {
  const programAddress = address ?? STABLECOIN_PROGRAM_ID
  return new Program(
    { ...StablecoinIDL, address: programAddress.toBase58() } as Stablecoin,
    provider
  )
}

// This is a helper function to get the program ID for the Stablecoin program depending on the cluster.
export function getStablecoinProgramId(cluster: Cluster) {
  return STABLECOIN_PROGRAM_IDS[cluster] ?? STABLECOIN_PROGRAM_ID
}

export function getStablecoinProgramForCluster(
  provider: AnchorProvider,
  cluster: Cluster,
): Program<Stablecoin> {
  return getStablecoinProgram(provider, getStablecoinProgramId(cluster))
}
