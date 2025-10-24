import { AnchorProvider, Program } from '@coral-xyz/anchor'
import { PublicKey } from '@solana/web3.js'
import StablecoinIDL from '../../anchor/target/idl/stablecoin.json'
import type { Stablecoin } from '../../anchor/target/types/stablecoin'

export const STABLECOIN_PROGRAM_ID = new PublicKey(StablecoinIDL.address)

export function getStablecoinProgram(
  provider: AnchorProvider,
  programId: PublicKey = STABLECOIN_PROGRAM_ID,
) {
  return new Program<Stablecoin>(
    { ...StablecoinIDL, address: programId.toBase58() } as Stablecoin,
    provider,
  )
}
