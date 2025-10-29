// Here we export some useful types and functions for interacting with the Anchor program.
import { AnchorProvider, Program } from '@coral-xyz/anchor'
import { Cluster, PublicKey } from '@solana/web3.js'
import StablecoinIDL from '../target/idl/stablecoin.json'
import type { Stablecoin } from '../target/types/stablecoin'

// Re-export the generated IDL and type
export { Stablecoin, StablecoinIDL }

// The programId is imported from the program IDL.
export const STABLECOIN_PROGRAM_ID = new PublicKey(StablecoinIDL.address)

// This is a helper function to get the Stablecoin Anchor program.
export function getStablecoinProgram(provider: AnchorProvider, address?: PublicKey): Program<Stablecoin> {
  return new Program(
    { ...StablecoinIDL, address: address ? address.toBase58() : StablecoinIDL.address } as Stablecoin,
    provider
  )
}

// This is a helper function to get the program ID for the Stablecoin program depending on the cluster.
export function getStablecoinProgramId(cluster: Cluster) {
  switch (cluster) {
    case 'devnet':
      return new PublicKey('2JKDPiVwn2yf2zGw8rqX5hVLv3NUdmfLjcQBsFNbDwn1')
    case 'testnet':
    case 'mainnet-beta':
    default:
      return STABLECOIN_PROGRAM_ID
  }
}
