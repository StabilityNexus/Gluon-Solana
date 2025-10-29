import { AnchorProvider, Program } from '@coral-xyz/anchor'
import { PublicKey } from '@solana/web3.js'
import StablecoinIDL from '../../anchor/target/idl/stablecoin.json'
import type { Stablecoin } from '../../anchor/target/types/stablecoin'
import { DEFAULT_CLUSTER, type SolanaCluster } from './cluster'

const PROGRAM_IDS: Record<SolanaCluster, PublicKey> = {
  localnet: new PublicKey('2JKDPiVwn2yf2zGw8rqX5hVLv3NUdmfLjcQBsFNbDwn1'),
  devnet: new PublicKey('2JKDPiVwn2yf2zGw8rqX5hVLv3NUdmfLjcQBsFNbDwn1'),
  testnet: new PublicKey('2JKDPiVwn2yf2zGw8rqX5hVLv3NUdmfLjcQBsFNbDwn1'),
  'mainnet-beta': new PublicKey('BaLj5dEV9zfzXbdUDDDfNsZHzYvgE7KeByTAkekwTows'),
}

export const STABLECOIN_PROGRAM_IDS = PROGRAM_IDS

export const DEFAULT_STABLECOIN_CLUSTER: SolanaCluster = DEFAULT_CLUSTER

export const STABLECOIN_PROGRAM_ID = PROGRAM_IDS[DEFAULT_STABLECOIN_CLUSTER]

export function getStablecoinProgram(
  provider: AnchorProvider,
  programId: PublicKey = STABLECOIN_PROGRAM_ID,
) {
  return new Program<Stablecoin>(
    { ...StablecoinIDL, address: programId.toBase58() } as Stablecoin,
    provider,
  )
}

export function getStablecoinProgramIdForCluster(cluster: SolanaCluster): PublicKey {
  return PROGRAM_IDS[cluster]
}
