import { useEffect, useMemo, useState } from 'react'
import { PublicKey } from '@solana/web3.js'
import { getAccount, getMint } from '@solana/spl-token'
import { useConnection } from '@solana/wallet-adapter-react'
import { useStablecoinProgram } from './useStablecoinProgram'

export type ReactorData = {
  address: PublicKey
  vaultName: string
  baseAssetName: string
  baseAssetSymbol: string
  peggedAssetName: string
  peggedAssetSymbol: string
  baseMint: PublicKey
  neutronMint: PublicKey
  protonMint: PublicKey
  baseVault: PublicKey
  treasuryBaseAccount: PublicKey
  priceFeedId: string
  fissionFeeWad: bigint
  fusionFeeWad: bigint
  criticalReserveRatioWad: bigint
  rStarWad: bigint
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

function normalizePriceFeedId(value: unknown): string {
  if (typeof value === 'string') {
    return value
  }
  if (value instanceof Uint8Array) {
    return `0x${Array.from(value).map((byte) => byte.toString(16).padStart(2, '0')).join('')}`
  }
  if (Array.isArray(value)) {
    return `0x${value
      .map((byte) => Number(byte)
        .toString(16)
        .padStart(2, '0'))
      .join('')}`
  }
  return ''
}

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
            baseAssetName: account.baseAssetName,
            baseAssetSymbol: account.baseAssetSymbol,
            peggedAssetName: account.peggedAssetName,
            peggedAssetSymbol: account.peggedAssetSymbol,
            baseMint: account.baseMint,
            neutronMint: account.neutronMint,
            protonMint: account.protonMint,
            baseVault: account.baseVault,
            treasuryBaseAccount: account.treasuryBaseAccount,
            priceFeedId: normalizePriceFeedId(account.priceFeedId),
            fissionFeeWad: BigInt(account.fissionFeeWad.toString()),
            fusionFeeWad: BigInt(account.fusionFeeWad.toString()),
            criticalReserveRatioWad: BigInt(account.criticalReserveRatioWad.toString()),
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
