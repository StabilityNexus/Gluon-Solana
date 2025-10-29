"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { PublicKey } from "@solana/web3.js"
import { useConnection } from "@solana/wallet-adapter-react"
import {
  getAccount,
  getMint,
  TokenAccountNotFoundError,
  TokenInvalidAccountOwnerError
} from "@solana/spl-token"
import {
  Search,
  ExternalLink,
  RefreshCcw,
  Activity,
  AlertTriangle,
  ArrowRight,
  Rocket,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import LightRays from "@/components/LightRays"
import Shuffle from "@/components/Shuffle"
import TargetCursor from "@/components/TargetCursor"

import { useStablecoinProgram } from "@/hooks/useStablecoinProgram"
import { formatTokenAmount, wadToDecimalString, wadToPercentString } from "@/utils/amount"

type ReactorSummary = {
  address: PublicKey
  vaultName: string
  baseMint: PublicKey
  baseDecimals: number
  baseVault: PublicKey
  reserve: bigint
  neutronMint: PublicKey
  neutronDecimals: number
  neutronSupply: bigint
  protonMint: PublicKey
  protonDecimals: number
  protonSupply: bigint
  priceFeedId: string
  fissionFee: bigint
  fusionFee: bigint
  targetReserveRatio: bigint
}

const containerFontStyle = {
  fontFamily: "'Space Mono', 'Syne', 'Orbitron', 'Courier New', monospace",
  fontWeight: 500
}

const searchInputClasses =
  "pl-12 h-12 bg-transparent border border-white/30 focus:border-white/50 hover:border-white/40 rounded-none tracking-[0.2em] uppercase text-[11px] text-white placeholder:text-white/40 transition-all duration-200"

async function safeGetAccount(connection: ReturnType<typeof useConnection>["connection"], address: PublicKey) {
  try {
    return await getAccount(connection, address)
  } catch (error) {
    if (error instanceof TokenAccountNotFoundError || error instanceof TokenInvalidAccountOwnerError) {
      return null
    }
    throw error
  }
}

async function safeGetMint(connection: ReturnType<typeof useConnection>["connection"], address: PublicKey) {
  try {
    return await getMint(connection, address)
  } catch (error) {
    if (error instanceof TokenAccountNotFoundError || error instanceof TokenInvalidAccountOwnerError) {
      return null
    }
    throw error
  }
}

function normalizePriceFeedId(value: unknown): string {
  if (typeof value === "string") {
    return value
  }
  if (value instanceof Uint8Array) {
    return `0x${Array.from(value).map((byte) => byte.toString(16).padStart(2, "0")).join("")}`
  }
  if (Array.isArray(value)) {
    return `0x${value
      .map((byte) => Number(byte)
        .toString(16)
        .padStart(2, "0"))
      .join("")}`
  }
  return ""
}

export default function ExplorerPage() {
  const { program } = useStablecoinProgram()
  const { connection } = useConnection()

  const [reactors, setReactors] = useState<ReactorSummary[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [searchTerm, setSearchTerm] = useState("")

  const loadReactors = useMemo(
    () => async () => {
      setIsLoading(true)
      setError(null)
      try {
        const accounts = await program.account.reactor.all()

        const summaries: ReactorSummary[] = await Promise.all(
          accounts.map(async ({ publicKey, account }) => {
            const baseVaultAccount = await safeGetAccount(connection, account.baseVault)
            const neutronMintInfo = await safeGetMint(connection, account.neutronMint)
            const protonMintInfo = await safeGetMint(connection, account.protonMint)

            const priceFeedId = normalizePriceFeedId(account.priceFeedId)

            return {
              address: publicKey,
              vaultName: account.vaultName,
              baseMint: account.baseMint,
              baseDecimals: account.baseDecimals,
              baseVault: account.baseVault,
              reserve: baseVaultAccount?.amount ?? 0n,
              neutronMint: account.neutronMint,
              neutronDecimals: account.neutronDecimals,
              neutronSupply: neutronMintInfo?.supply ?? 0n,
              protonMint: account.protonMint,
              protonDecimals: account.protonDecimals,
              protonSupply: protonMintInfo?.supply ?? 0n,
              priceFeedId,
              fissionFee: BigInt(account.fissionFeeWad.toString()),
              fusionFee: BigInt(account.fusionFeeWad.toString()),
              targetReserveRatio: BigInt(account.targetReserveRatioWad.toString())
            }
          })
        )

        setReactors(summaries)
      } catch (err) {
        console.error("Failed to load reactors", err)
        setError(err instanceof Error ? err : new Error("Unknown error loading reactors"))
      } finally {
        setIsLoading(false)
      }
    },
    [connection, program]
  )

  useEffect(() => {
    loadReactors()
  }, [loadReactors])

  const filteredReactors = useMemo(() => {
    if (!searchTerm) {
      return reactors
    }
    const lower = searchTerm.toLowerCase()
    return reactors.filter(
      (reactor) =>
        reactor.address.toBase58().toLowerCase().includes(lower) ||
        reactor.vaultName.toLowerCase().includes(lower)
    )
  }, [reactors, searchTerm])

  return (
    <div
      className="min-h-screen text-white"
      style={containerFontStyle}
    >
      <TargetCursor spinDuration={2} hideDefaultCursor={false} />
      <LightRays
        raysOrigin="top-center"
        raysColor="#F7F7F7"
        raysSpeed={1.5}
        lightSpread={0.8}
        rayLength={1.2}
        followMouse={true}
        mouseInfluence={0.1}
        noiseAmount={0.1}
        distortion={0.05}
        className="fixed inset-0"
      />

      <div className="relative z-10 px-4 py-12 sm:px-8">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-10">
          <header className="space-y-6 text-center">
            <Shuffle
              text="Solana Reactor Explorer"
              tag="h1"
              className="text-4xl sm:text-5xl font-semibold"
              shuffleDirection="right"
              duration={0.35}
              animationMode="evenodd"
              shuffleTimes={1}
              ease="power3.out"
              stagger={0.03}
              threshold={0.1}
              triggerOnce
              respectReducedMotion
            />
            <div className="mx-auto mt-6 flex w-full max-w-3xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between bg-transparent">
              <div className="relative w-full">
                <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
                <Input
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Search by reactor address or vault name..."
                  className={searchInputClasses}
                />
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={loadReactors}
                disabled={isLoading}
                className="h-12 rounded-none border border-white/40 bg-transparent px-6 font-semibold uppercase tracking-[0.3em] text-xs text-white transition hover:bg-white/10"
              >
                <RefreshCcw className="mr-2 h-4 w-4" />
                Refresh
              </Button>
            </div>
          </header>

          {error && (
            <div className="border border-red-500/30 bg-red-500/10 px-6 py-8 text-left">
              <div className="flex items-center gap-3 text-red-300">
                <AlertTriangle className="h-5 w-5" />
                <span className="text-xs uppercase tracking-[0.3em]">Unable to load reactors</span>
              </div>
              <p className="mt-3 font-mono text-sm text-red-200">{error.message}</p>
            </div>
          )}

          {isLoading ? (
            <div className="flex min-h-[280px] flex-col items-center justify-center gap-4 text-white/60">
              <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-white/50" />
              <p className="text-xs uppercase tracking-[0.3em]">Scanning on-chain for reactors</p>
            </div>
          ) : filteredReactors.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-5 border border-dashed border-white/30 bg-black/40 px-8 py-16 text-center">
              <Activity className="h-10 w-10 text-white/50" />
              <p className="text-sm uppercase tracking-[0.3em] text-white/50">
                {searchTerm
                  ? "No reactors match your search."
                  : "No reactors found on this cluster yet."}
              </p>
              <div className="flex flex-col items-center gap-2 text-xs uppercase tracking-[0.3em] text-white/40">
                <div className="flex items-center gap-2">
                  <ArrowRight className="h-3 w-3" />
                  <span>Deploy your first reactor from the Create page</span>
                </div>
                {searchTerm ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="rounded-none border border-white/20 bg-white/10 text-white hover:bg-white/20"
                    onClick={() => setSearchTerm("")}
                  >
                    Clear search
                  </Button>
                ) : (
                  <Link href="/create">
                    <Button className="rounded-none bg-white text-black hover:bg-white/90">
                      <Rocket className="mr-2 h-4 w-4" />
                      Deploy Reactor
                    </Button>
                  </Link>
                )}
              </div>
            </div>
          ) : (
            <div className="grid gap-8 md:grid-cols-2 xl:grid-cols-3">
              {filteredReactors.map((reactor) => (
                <ReactorCard key={reactor.address.toBase58()} reactor={reactor} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

type ReactorCardProps = {
  reactor: ReactorSummary
}

function ReactorCard({ reactor }: ReactorCardProps) {
  const address = reactor.address.toBase58()
  return (
    <div className="cursor-target border border-white/25 border-big-dashed bg-[#090B11]/85 px-6 py-6 shadow-[0_0_40px_rgba(0,0,0,0.45)] transition hover:border-white/40">
      <header className="space-y-3">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold tracking-wide text-white">{reactor.vaultName}</h2>
          </div>
        </div>

        <div className="flex items-center gap-4 text-xs uppercase tracking-[0.3em]">
          <span className="flex items-center gap-2 text-yellow-400">
            <span className="inline-block h-2 w-2 bg-yellow-400" />
            Neutron
          </span>
          <span className="text-white/40">|</span>
          <span className="flex items-center gap-2 text-red-400">
            <span className="inline-block h-2 w-2 bg-red-400" />
            Proton
          </span>
        </div>
      </header>

      <div className="mt-6 space-y-2 text-[11px] uppercase tracking-[0.2em] text-white/55">
        <StatRow label="Reserve" value={formatTokenAmount(reactor.reserve, reactor.baseDecimals)} />
        <StatRow
          label="Neutron Supply"
          value={formatTokenAmount(reactor.neutronSupply, reactor.neutronDecimals)}
        />
        <StatRow
          label="Proton Supply"
          value={formatTokenAmount(reactor.protonSupply, reactor.protonDecimals)}
        />
        <StatRow label="Critical Reserve Ratio" value={`${wadToDecimalString(reactor.targetReserveRatio)}×`} />
        <StatRow
          label="Fees (Fission/Fusion)"
          value={`${wadToPercentString(reactor.fissionFee)} / ${wadToPercentString(reactor.fusionFee)}`}
        />
      </div>

      <Link href={`/c?coin=${address}`} className="mt-6 block">
        <Button className="w-full rounded-none bg-white text-black hover:bg-white/90">
          <ExternalLink className="mr-2 h-4 w-4" />
          Interact
        </Button>
      </Link>
    </div>
  )
}

type StatRowProps = {
  label: string
  value: string
}

function StatRow({ label, value }: StatRowProps) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-white/45">{label}</span>
      <span className="font-semibold tracking-[0.05em] text-white/85 text-[11px]">{value}</span>
    </div>
  )
}
