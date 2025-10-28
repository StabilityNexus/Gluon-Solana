import { useEffect, useMemo, useState } from 'react'
import { PublicKey } from '@solana/web3.js'
import { getAccount, getMint } from '@solana/spl-token'
import { useConnection } from '@solana/wallet-adapter-react'
import { useStablecoinProgram } from './useStablecoinProgram'

export type ReactorData = {
  address: PublicKey
  vaultName: string
  baseMint: PublicKey
  neutronMint: PublicKey
  protonMint: PublicKey
  baseVault: PublicKey
  treasuryAuthority: PublicKey
  treasuryBaseAccount: PublicKey
  priceFeedId: string
  fissionFeeWad: bigint
  fusionFeeWad: bigint
  targetReserveRatioWad: bigint  // kept for legacy/UI
  rStarWad: bigint  // critical reserve ratio r* (Gluon Z)
  baseDecimals: number
  neutronDecimals: number
  protonDecimals: number
  reserveTokens: bigint
  neutronSupply: bigint
  protonSupply: bigint
}

type ReactorDataState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; data: ReactorData }
  | { status: 'error'; error: Error }

export function useReactorData(address: string | null | undefined, refreshKey = 0) {
  const { connection } = useConnection()
  const { program } = useStablecoinProgram()
  const [state, setState] = useState<ReactorDataState>({ status: 'idle' })

  useEffect(() => {
    if (!address) {
      setState({ status: 'idle' })
      return
    }

    let cancelled = false
    let reactorPk: PublicKey
    
    try {
      reactorPk = new PublicKey(address)
    } catch (error) {
      console.error('Invalid reactor address', error)
      setState({ status: 'error', error: new Error('Invalid reactor address') })
      return
    }

    async function load() {
      try {
        setState({ status: 'loading' })

        const account = await program.account.reactor.fetch(reactorPk)

        const [baseMintInfo, baseVaultAccount, neutronMintInfo, protonMintInfo] = await Promise.all([
          getMint(connection, account.baseMint),
          getAccount(connection, account.baseVault),
          getMint(connection, account.neutronMint),
          getMint(connection, account.protonMint),
        ])

        if (cancelled) {
          return
        }

        setState({
          status: 'ready',
          data: {
            address: reactorPk,
            vaultName: account.vaultName,
            baseMint: account.baseMint,
            neutronMint: account.neutronMint,
            protonMint: account.protonMint,
            baseVault: account.baseVault,
            treasuryAuthority: account.treasuryAuthority,
            treasuryBaseAccount: account.treasuryBaseAccount,
            priceFeedId: (() => {
              try {
                const pk = new PublicKey(account.priceFeedId as string | Uint8Array | PublicKey)
                return pk.toBase58()
              } catch {
                return ''
              }
            })(),
            fissionFeeWad: BigInt(account.fissionFeeWad.toString()),
            fusionFeeWad: BigInt(account.fusionFeeWad.toString()),
            targetReserveRatioWad: BigInt(account.targetReserveRatioWad.toString()),
            rStarWad: BigInt(account.rStarWad.toString()),
            baseDecimals: baseMintInfo.decimals,
            neutronDecimals: neutronMintInfo.decimals,
            protonDecimals: protonMintInfo.decimals,
            reserveTokens: baseVaultAccount.amount,
            neutronSupply: neutronMintInfo.supply,
            protonSupply: protonMintInfo.supply,
          },
        })
      } catch (error) {
        console.error('Failed to load reactor data', error)
        if (!cancelled) {
          setState({
            status: 'error',
            error: error instanceof Error ? error : new Error('Unknown error'),
          })
        }
      }
    }

    load()

    return () => {
      cancelled = true
    }
  }, [address, connection, program, refreshKey])

  return useMemo(() => state, [state])
}
