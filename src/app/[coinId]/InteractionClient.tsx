
"use client"

// Polyfill Buffer for browser environment (required by Pyth SDK)
import { Buffer } from "buffer"
if (typeof window !== "undefined") {
  window.Buffer = Buffer
  // Also set on globalThis for libraries that check there
  const globalWithBuffer = globalThis as typeof globalThis & { Buffer?: typeof Buffer }
  globalWithBuffer.Buffer = Buffer

  const bufferProto = Buffer.prototype as Record<string, unknown>
  const ensureBufferAlias = (alias: string, original: string) => {
    if (typeof bufferProto[alias] !== "function" && typeof bufferProto[original] === "function") {
      bufferProto[alias] = bufferProto[original]
    }
  }

  ensureBufferAlias("readUint8", "readUInt8")
  ensureBufferAlias("readUint16BE", "readUInt16BE")
  ensureBufferAlias("readUint16LE", "readUInt16LE")
  ensureBufferAlias("readUint32BE", "readUInt32BE")
  ensureBufferAlias("readUint32LE", "readUInt32LE")
  ensureBufferAlias("readBigUint64BE", "readBigUInt64BE")
  ensureBufferAlias("readBigUint64LE", "readBigUInt64LE")

  // Some SDK utilities operate on Uint8Array instances directly; provide compatible helpers there too.
  const u8Proto = Uint8Array.prototype as unknown as Record<string, unknown>
  const getView = (arr: Uint8Array) => new DataView(arr.buffer, arr.byteOffset, arr.byteLength)
  const ensureTypedArrayMethod = (
    name: string,
    impl: (this: Uint8Array, offset?: number) => unknown
  ) => {
    if (typeof u8Proto[name] !== "function") {
      Object.defineProperty(u8Proto, name, {
        value: impl,
        writable: true,
        configurable: true
      })
    }
  }

  ensureTypedArrayMethod("readUint8", function (this: Uint8Array, offset: number = 0) {
    return getView(this).getUint8(offset)
  })
  ensureTypedArrayMethod("readUInt8", function (this: Uint8Array, offset: number = 0) {
    return getView(this).getUint8(offset)
  })
  ensureTypedArrayMethod("readUint16BE", function (this: Uint8Array, offset: number = 0) {
    return getView(this).getUint16(offset, false)
  })
  ensureTypedArrayMethod("readUint16LE", function (this: Uint8Array, offset: number = 0) {
    return getView(this).getUint16(offset, true)
  })
  ensureTypedArrayMethod("readUInt16BE", function (this: Uint8Array, offset: number = 0) {
    return getView(this).getUint16(offset, false)
  })
  ensureTypedArrayMethod("readUInt16LE", function (this: Uint8Array, offset: number = 0) {
    return getView(this).getUint16(offset, true)
  })
  ensureTypedArrayMethod("readUint32BE", function (this: Uint8Array, offset: number = 0) {
    return getView(this).getUint32(offset, false)
  })
  ensureTypedArrayMethod("readUint32LE", function (this: Uint8Array, offset: number = 0) {
    return getView(this).getUint32(offset, true)
  })
  ensureTypedArrayMethod("readUInt32BE", function (this: Uint8Array, offset: number = 0) {
    return getView(this).getUint32(offset, false)
  })
  ensureTypedArrayMethod("readUInt32LE", function (this: Uint8Array, offset: number = 0) {
    return getView(this).getUint32(offset, true)
  })
  if (typeof DataView.prototype.getBigUint64 === "function") {
    ensureTypedArrayMethod("readBigUint64BE", function (this: Uint8Array, offset: number = 0) {
      return getView(this).getBigUint64(offset, false)
    })
    ensureTypedArrayMethod("readBigUint64LE", function (this: Uint8Array, offset: number = 0) {
      return getView(this).getBigUint64(offset, true)
    })
    ensureTypedArrayMethod("readBigUInt64BE", function (this: Uint8Array, offset: number = 0) {
      return getView(this).getBigUint64(offset, false)
    })
    ensureTypedArrayMethod("readBigUInt64LE", function (this: Uint8Array, offset: number = 0) {
      return getView(this).getBigUint64(offset, true)
    })
  }
}

import { useCallback, useEffect, useMemo, useState } from "react"
import { useParams, useSearchParams } from "next/navigation"
import { utils } from "@coral-xyz/anchor"
import {
  createAssociatedTokenAccountInstruction,
  getAccount,
  getAssociatedTokenAddressSync,
  TokenAccountNotFoundError,
  TokenInvalidAccountOwnerError,
  TOKEN_PROGRAM_ID
} from "@solana/spl-token"
import {
  ComputeBudgetProgram,
  PublicKey,
  Transaction,
  type TransactionInstruction
} from "@solana/web3.js"
import { useWallet, useConnection } from "@solana/wallet-adapter-react"
import { useWalletModal } from "@solana/wallet-adapter-react-ui"
import { PythSolanaReceiver, type InstructionWithEphemeralSigners } from "@pythnetwork/pyth-solana-receiver"
import type { Wallet } from "@coral-xyz/anchor"
import { toast } from "sonner"
import {
  Activity,
  AlertTriangle,
  ArrowLeftRight,
  Copy,
  Info,
  Sparkles,
  Zap
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select"
import LightRays from "@/components/LightRays"
import Shuffle from "@/components/Shuffle"

import { useReactorData } from "@/hooks/useReactorData"
import { useStablecoinProgram } from "@/hooks/useStablecoinProgram"
import { fetchPythPrice, getPythPriceUpdateData } from "@/utils/pyth-hermes"
import {
  formatTokenAmount,
  parseAmountToBN,
  wadToDecimalString,
  wadToPercentString
} from "@/utils/amount"

const AUTHORITY_SEED = utils.bytes.utf8.encode("reactor-authority")
const WAD = BigInt("1000000000000000000")

type TokenOption = "BASE" | "BUNDLE" | "NEUTRON" | "PROTON"
type SwapRoute = "FISSION" | "FUSION" | "PROTON_TO_NEUTRON" | "NEUTRON_TO_PROTON"

const allowedTargets: Record<TokenOption, TokenOption[]> = {
  BASE: ["BUNDLE"],
  BUNDLE: ["BASE"],
  NEUTRON: ["PROTON"],
  PROTON: ["NEUTRON"]
}

const routeMap: Record<string, SwapRoute> = {
  "BASE->BUNDLE": "FISSION",
  "BUNDLE->BASE": "FUSION",
  "PROTON->NEUTRON": "PROTON_TO_NEUTRON",
  "NEUTRON->PROTON": "NEUTRON_TO_PROTON"
}

const containerStyle = {
  fontFamily: "'Orbitron', 'Space Mono', 'Courier New', monospace",
  fontWeight: "500"
}

type BalanceInfo = {
  address: PublicKey
  amount: bigint
}

type RpcConnection = ReturnType<typeof useConnection>["connection"]
type UserBalances = {
  base: BalanceInfo
  neutron: BalanceInfo
  proton: BalanceInfo
}

type PythPriceData = {
  price: number
  conf: number
  expo: number
  publishTime: number
}

type TransactionPreview = {
  amountIn: bigint
  feeAmount: bigint
  netAmount: bigint
  estimatedOut: {
    neutron?: bigint
    proton?: bigint
  }
  basePrice?: number
  basePriceWad?: bigint
}

function trimFormattedAmount(value: string, precision = 6) {
  const [integer, fraction] = value.split(".")
  if (!fraction) {
    return integer
  }
  const sliced = fraction.slice(0, precision).replace(/0+$/, "")
  return sliced.length ? `${integer}.${sliced}` : integer
}

const formatTokenValue = (
  amount?: bigint | null,
  decimals?: number,
  symbol?: string,
  precision = 4
) => {
  if (amount === undefined || amount === null) {
    return "—"
  }
  if (decimals === undefined) {
    return "—"
  }
  const formatted = formatTokenAmount(amount, decimals, precision)
  return symbol ? `${formatted} ${symbol}` : formatted
}

const formatWad = (value?: bigint, precision = 4) => {
  if (value === undefined) {
    return "—"
  }
  return wadToDecimalString(value, precision)
}

const formatPercentFromWad = (value?: bigint, precision = 1) => {
  if (value === undefined) {
    return "—"
  }
  return wadToPercentString(value, precision)
}

const shortenAddress = (value: string, guard = 4) => {
  if (value.length <= guard * 2 + 3) {
    return value
  }
  return `${value.slice(0, guard + 2)}…${value.slice(-guard)}`
}

async function safeGetAccount(connection: RpcConnection, address: PublicKey) {
  try {
    return await getAccount(connection, address)
  } catch (error) {
    if (error instanceof TokenAccountNotFoundError || error instanceof TokenInvalidAccountOwnerError) {
      return null
    }
    throw error
  }
}

function pythPriceToWad(pythPrice: PythPriceData): bigint {
  try {
    const price = BigInt(pythPrice.price)
    if (price <= 0n) {
      return 0n
    }

    if (pythPrice.expo >= 0) {
      const scale = BigInt(10) ** BigInt(pythPrice.expo)
      return price * scale * WAD
    }
    const scale = BigInt(10) ** BigInt(-pythPrice.expo)
    return (price * WAD) / scale
  } catch (error) {
    console.error("Failed to convert Pyth price to WAD:", error)
    return 0n
  }
}

export default function InteractionClient() {
  const params = useParams<{ coinId?: string }>()
  const coinId = params?.coinId ?? "c"
  const searchParams = useSearchParams()
  const resolvedAddress = useMemo(() => {
    if (coinId === "c") {
      return searchParams.get("coin")
    }
    return coinId
  }, [coinId, searchParams])

  const [refreshCounter, setRefreshCounter] = useState(0)
  const reactorState = useReactorData(resolvedAddress, refreshCounter)
  const { program } = useStablecoinProgram()
  const { connection } = useConnection()
  const { publicKey, connected, sendTransaction } = useWallet()
  const walletModal = useWalletModal()

  const reactor = reactorState.status === "ready" ? reactorState.data : null
  const [pendingAction, setPendingAction] = useState<"fission" | "fusion" | "ptn" | "ntp" | null>(null)
  const [fromToken, setFromToken] = useState<TokenOption>("BASE")
  const [toToken, setToToken] = useState<TokenOption>("BUNDLE")
  const [amount, setAmount] = useState("")
  const [recipient, setRecipient] = useState("")
  const [hasSetDefaultRecipient, setHasSetDefaultRecipient] = useState(false)
  const [balances, setBalances] = useState<UserBalances | null>(null)
  const [isLoadingBalances, setIsLoadingBalances] = useState(false)
  const [priceData, setPriceData] = useState<PythPriceData | null>(null)
  const [isLoadingPrice, setIsLoadingPrice] = useState(false)
  const [fissionPreview, setFissionPreview] = useState<TransactionPreview | null>(null)
  const [fusionPreview, setFusionPreview] = useState<TransactionPreview | null>(null)
  const [transmutePreview, setTransmutePreview] = useState<TransactionPreview | null>(null)

  const derivedTokenPrices = useMemo(() => {
    if (!reactor || !priceData) {
      return null
    }

    try {
      const basePriceWad = pythPriceToWad(priceData)
      if (basePriceWad <= 0n) {
        return null
      }

      const pow10 = (exp: number) => 10n ** BigInt(exp)

      const reserveScale = pow10(reactor.baseDecimals)
      const neutronScale = pow10(reactor.neutronDecimals)
      const protonScale = pow10(reactor.protonDecimals)

      const reserveWad = reserveScale > 0n ? (reactor.reserveTokens * WAD) / reserveScale : 0n
      const neutronSupplyWad = neutronScale > 0n ? (reactor.neutronSupply * WAD) / neutronScale : 0n
      const protonSupplyWad = protonScale > 0n ? (reactor.protonSupply * WAD) / protonScale : 0n

      let qWad = 0n
      if (neutronSupplyWad > 0n && reserveWad > 0n) {
        const pStarBaseWad = (WAD * WAD) / basePriceWad
        const denom = neutronSupplyWad * pStarBaseWad
        if (denom > 0n) {
          const rWad = (reserveWad * WAD * WAD) / denom
          const rStarWad = reactor.rStarWad > 0n ? reactor.rStarWad : WAD
          let rTildeWad = rWad
          if (rWad <= rStarWad) {
            const diffWad = rStarWad > WAD ? rStarWad - WAD : 0n
            const rOverRStarWad = (rWad * WAD) / rStarWad
            rTildeWad = WAD + ((rOverRStarWad * diffWad) / WAD)
          }
          if (rTildeWad > 0n) {
            qWad = (WAD * WAD) / rTildeWad
          }
        }
      }

      if (qWad > WAD) {
        qWad = WAD
      } else if (qWad < 0n) {
        qWad = 0n
      }

      const neutronPriceBaseWad = neutronSupplyWad > 0n
        ? (qWad * reserveWad) / neutronSupplyWad
        : (WAD * WAD) / basePriceWad

      const oneMinusQWad = qWad >= WAD ? 0n : WAD - qWad
      const protonPriceBaseWad = protonSupplyWad > 0n
        ? (oneMinusQWad * reserveWad) / protonSupplyWad
        : WAD

      const neutronPricePegWad = (neutronPriceBaseWad * basePriceWad) / WAD
      const protonPricePegWad = (protonPriceBaseWad * basePriceWad) / WAD

      return {
        basePriceWad,
        reserveWad,
        neutronSupplyWad,
        protonSupplyWad,
        qWad,
        neutronPriceBaseWad,
        protonPriceBaseWad,
        neutronPricePegWad,
        protonPricePegWad
      }
    } catch (error) {
      console.error("Failed to derive token prices:", error)
      return null
    }
  }, [reactor, priceData])

  const reactorAuthority = useMemo(() => {
    if (!reactor) {
      return null
    }

    const [authority] = PublicKey.findProgramAddressSync(
      [AUTHORITY_SEED, reactor.address.toBuffer()],
      program.programId
    )
    return authority
  }, [program.programId, reactor])

  const route: SwapRoute | null = useMemo(() => {
    const key = `${fromToken}->${toToken}`
    return routeMap[key] ?? null
  }, [fromToken, toToken])

  useEffect(() => {
    if (!publicKey) {
      setRecipient("")
      setHasSetDefaultRecipient(false)
      return
    }

    const walletAddress = publicKey.toBase58()
    if (!hasSetDefaultRecipient || recipient === "" || recipient === walletAddress) {
      setRecipient(walletAddress)
      setHasSetDefaultRecipient(true)
    }
  }, [publicKey, hasSetDefaultRecipient, recipient])

  useEffect(() => {
    const targets = allowedTargets[fromToken]
    if (!targets.includes(toToken)) {
      setToToken(targets[0])
    }
  }, [fromToken, toToken])

  const fetchPriceData = useCallback(async () => {
    if (!reactor) {
      setPriceData(null)
      return
    }

    const priceFeedId = reactor.priceFeedId

    if (!priceFeedId) {
      console.warn("Reactor missing price feed ID configuration; skipping price fetch.")
      setPriceData(null)
      return
    }

    setIsLoadingPrice(true)
    try {
      // Fetch price from Pyth Hermes API
      const priceInfo = await fetchPythPrice(priceFeedId)
      setPriceData(priceInfo)
    } catch (error) {
      console.error("Failed to fetch price data:", error)
      setPriceData(null)
    } finally {
      setIsLoadingPrice(false)
    }
  }, [reactor])

  const refreshBalances = useCallback(async () => {
    if (!reactor || !publicKey) {
      setBalances(null)
      return
    }

    setIsLoadingBalances(true)
    try {
      const baseAta = getAssociatedTokenAddressSync(reactor.baseMint, publicKey)
      const neutronAta = getAssociatedTokenAddressSync(reactor.neutronMint, publicKey)
      const protonAta = getAssociatedTokenAddressSync(reactor.protonMint, publicKey)

      const [baseAccount, neutronAccount, protonAccount] = await Promise.all([
        safeGetAccount(connection, baseAta),
        safeGetAccount(connection, neutronAta),
        safeGetAccount(connection, protonAta)
      ])

      setBalances({
        base: { address: baseAta, amount: baseAccount?.amount ?? 0n },
        neutron: { address: neutronAta, amount: neutronAccount?.amount ?? 0n },
        proton: { address: protonAta, amount: protonAccount?.amount ?? 0n }
      })
    } catch (error) {
      console.error("Failed to load balances", error)
      toast.error("Unable to load balances", {
        description:
          error instanceof Error ? error.message : "Unexpected error while fetching token accounts"
      })
    } finally {
      setIsLoadingBalances(false)
    }
  }, [connection, publicKey, reactor])

  useEffect(() => {
    refreshBalances()
    fetchPriceData()
  }, [refreshBalances, fetchPriceData, refreshCounter])

  useEffect(() => {
    if (!reactor) {
      return
    }

    fetchPriceData()
    const intervalId = setInterval(() => {
      fetchPriceData()
    }, 10000)

    return () => {
      clearInterval(intervalId)
    }
  }, [reactor, fetchPriceData])

  useEffect(() => {
    if (!reactor || route !== "FISSION" || !amount) {
      setFissionPreview(null)
      return
    }

    try {
      const amountIn = parseAmountToBN(amount, reactor.baseDecimals)
      const amountInBigInt = BigInt(amountIn.toString())
      const amountInWad = (amountInBigInt * WAD) / BigInt(10 ** reactor.baseDecimals)

      // Calculate fee
      const feeWad = (amountInWad * reactor.fissionFeeWad) / WAD
      const feeAmount = (feeWad * BigInt(10 ** reactor.baseDecimals)) / WAD

      const netAmount = amountInBigInt - feeAmount
      if (netAmount <= 0n) {
        setFissionPreview(null)
        return
      }

      const netWad = (netAmount * WAD) / BigInt(10 ** reactor.baseDecimals)

      // Check for bootstrap case: R=0 and S◦=S•=0
      const isBootstrap = reactor.reserveTokens === 0n && 
                         reactor.neutronSupply === 0n && 
                         reactor.protonSupply === 0n

      let neutronOut: bigint
      let protonOut: bigint

      if (isBootstrap) {
        // Bootstrap: Use 400% reserve ratio (4:1)
        // Each token = net_base / 4
        const BOOTSTRAP_RESERVE_RATIO_WAD = WAD * 4n
        
        const neutronOutWad = (netWad * WAD) / BOOTSTRAP_RESERVE_RATIO_WAD
        const protonOutWad = (netWad * WAD) / BOOTSTRAP_RESERVE_RATIO_WAD
        
        neutronOut = (neutronOutWad * BigInt(10 ** reactor.neutronDecimals)) / WAD
        protonOut = (protonOutWad * BigInt(10 ** reactor.protonDecimals)) / WAD
      } else {
        // Normal case: proportional to reserve shares
        const reserveWad = (reactor.reserveTokens * WAD) / BigInt(10 ** reactor.baseDecimals)
        const neutronSupplyWad = (reactor.neutronSupply * WAD) / BigInt(10 ** reactor.neutronDecimals)
        const protonSupplyWad = (reactor.protonSupply * WAD) / BigInt(10 ** reactor.protonDecimals)

        if (reserveWad === 0n) {
          setFissionPreview(null)
          return
        }

        // neutron_out = (net_base * S◦) / R
        const neutronOutWad = neutronSupplyWad === 0n ? 0n : (netWad * neutronSupplyWad) / reserveWad
        // proton_out = (net_base * S•) / R
        const protonOutWad = protonSupplyWad === 0n ? 0n : (netWad * protonSupplyWad) / reserveWad

        neutronOut = (neutronOutWad * BigInt(10 ** reactor.neutronDecimals)) / WAD
        protonOut = (protonOutWad * BigInt(10 ** reactor.protonDecimals)) / WAD
      }

      setFissionPreview({
        amountIn: amountInBigInt,
        feeAmount,
        netAmount,
        estimatedOut: {
          neutron: neutronOut > 0n ? neutronOut : 0n,
          proton: protonOut > 0n ? protonOut : 0n
        },
        basePrice: priceData ? priceData.price * Math.pow(10, priceData.expo) : undefined,
        basePriceWad: priceData ? pythPriceToWad(priceData) : undefined
      })
    } catch (error) {
      console.error("Failed to calculate fission preview:", error)
      setFissionPreview(null)
    }
  }, [reactor, route, amount, priceData, derivedTokenPrices])

  useEffect(() => {
    if (!reactor || route !== "FUSION" || !amount) {
      setFusionPreview(null)
      return
    }

    try {
      const amountIn = parseAmountToBN(amount, reactor.baseDecimals)
      const amountInBigInt = BigInt(amountIn.toString())
      if (amountInBigInt <= 0n) {
        setFusionPreview(null)
        return
      }

      const mWad = (amountInBigInt * WAD) / BigInt(10 ** reactor.baseDecimals)
      const reserveWad = (reactor.reserveTokens * WAD) / BigInt(10 ** reactor.baseDecimals)
      const neutronSupplyWad =
        (reactor.neutronSupply * WAD) / BigInt(10 ** reactor.neutronDecimals)
      const protonSupplyWad =
        (reactor.protonSupply * WAD) / BigInt(10 ** reactor.protonDecimals)

      const neutronBurnWad = reserveWad > 0n ? (mWad * neutronSupplyWad) / reserveWad : 0n
      const protonBurnWad = reserveWad > 0n ? (mWad * protonSupplyWad) / reserveWad : 0n

      const feeWad = (mWad * reactor.fusionFeeWad) / WAD
      const feeAmount = (feeWad * BigInt(10 ** reactor.baseDecimals)) / WAD
      const netAmount = amountInBigInt - feeAmount

      setFusionPreview({
        amountIn: amountInBigInt,
        feeAmount,
        netAmount,
        estimatedOut: {
          neutron: (neutronBurnWad * BigInt(10 ** reactor.neutronDecimals)) / WAD,
          proton: (protonBurnWad * BigInt(10 ** reactor.protonDecimals)) / WAD
        }
      })
    } catch (error) {
      console.error("Failed to calculate fusion preview:", error)
      setFusionPreview(null)
    }
  }, [reactor, route, amount])

  useEffect(() => {
    if (
      !reactor ||
      !amount ||
      !priceData ||
      !derivedTokenPrices ||
      (route !== "PROTON_TO_NEUTRON" && route !== "NEUTRON_TO_PROTON")
    ) {
      setTransmutePreview(null)
      return
    }

    try {
      const { basePriceWad, neutronPriceBaseWad, protonPriceBaseWad } = derivedTokenPrices
      if (basePriceWad === 0n) {
        setTransmutePreview(null)
        return
      }

      const isProtonToNeutron = route === "PROTON_TO_NEUTRON"
      const decimals = isProtonToNeutron ? reactor.protonDecimals : reactor.neutronDecimals
      const amountIn = parseAmountToBN(amount, decimals)
      const amountInBigInt = BigInt(amountIn.toString())
      if (amountInBigInt <= 0n) {
        setTransmutePreview(null)
        return
      }

      const amountInWad = isProtonToNeutron
        ? (amountInBigInt * WAD) / BigInt(10 ** reactor.protonDecimals)
        : (amountInBigInt * WAD) / BigInt(10 ** reactor.neutronDecimals)

      const inputPriceWad = isProtonToNeutron ? protonPriceBaseWad : neutronPriceBaseWad
      const grossBaseWad = (amountInWad * inputPriceWad) / WAD

      const feeWad = 0n // Simplified preview: dynamic β fees omitted
      const netBaseWad = (grossBaseWad * (WAD - feeWad)) / WAD

      const outputPriceWad = isProtonToNeutron ? neutronPriceBaseWad : protonPriceBaseWad
      const outputWad = outputPriceWad > 0n ? (netBaseWad * WAD) / outputPriceWad : 0n
      
      const outputDecimals = isProtonToNeutron ? reactor.neutronDecimals : reactor.protonDecimals
      const estimatedOut = (outputWad * BigInt(10 ** outputDecimals)) / WAD

      setTransmutePreview({
        amountIn: amountInBigInt,
        feeAmount: 0n,
        netAmount: amountInBigInt,
        estimatedOut: {
          [isProtonToNeutron ? "neutron" : "proton"]: estimatedOut > 0n ? estimatedOut : 0n
        },
        basePrice: priceData.price * Math.pow(10, priceData.expo),
        basePriceWad
      })
    } catch (error) {
      console.error("Failed to calculate transmute preview:", error)
      setTransmutePreview(null)
    }
  }, [reactor, route, amount, priceData, derivedTokenPrices])

  const currentDecimals = useMemo(() => {
    if (!reactor || !route) {
      return null
    }
    switch (route) {
      case "FISSION":
      case "FUSION":
        return reactor.baseDecimals
      case "PROTON_TO_NEUTRON":
        return reactor.protonDecimals
      case "NEUTRON_TO_PROTON":
        return reactor.neutronDecimals
      default:
        return null
    }
  }, [reactor, route])

  const parsedAmount = useMemo(() => {
    if (!reactor || !route || !amount || currentDecimals === null) {
      return null
    }
    try {
      return parseAmountToBN(amount, currentDecimals)
    } catch {
      return null
    }
  }, [amount, currentDecimals, reactor, route])

  const parsedAmountBigInt = useMemo(() => {
    if (!parsedAmount) {
      return null
    }
    return BigInt(parsedAmount.toString())
  }, [parsedAmount])

  const isAmountPositive = parsedAmountBigInt !== null && parsedAmountBigInt > 0n

  const recipientMatchesWallet = useMemo(() => {
    if (!publicKey) {
      return false
    }
    return recipient.trim().toLowerCase() === publicKey.toBase58().toLowerCase()
  }, [publicKey, recipient])

  const baseSymbolText = "Base"
  const neutronSymbolText = "Neutron"
  const protonSymbolText = "Proton"
  const bundleLabel = `${neutronSymbolText} + ${protonSymbolText}`
  const peggedSymbolText = "Peg"

  const toLabel = useMemo(() => {
    switch (toToken) {
      case "BASE":
        return baseSymbolText
      case "NEUTRON":
        return neutronSymbolText
      case "PROTON":
        return protonSymbolText
      case "BUNDLE":
        return bundleLabel
      default:
        return "Token"
    }
  }, [toToken, baseSymbolText, neutronSymbolText, protonSymbolText, bundleLabel])

  const fromBalanceDisplay = useMemo(() => {
    if (!reactor || !balances) {
      if (!connected) {
        return "Wallet not connected"
      }
      return isLoadingBalances ? "Loading…" : "0"
    }
    switch (fromToken) {
      case "BASE":
        return formatTokenAmount(balances.base.amount, reactor.baseDecimals)
      case "NEUTRON":
        return formatTokenAmount(balances.neutron.amount, reactor.neutronDecimals)
      case "PROTON":
        return formatTokenAmount(balances.proton.amount, reactor.protonDecimals)
      case "BUNDLE":
        return `${formatTokenAmount(balances.neutron.amount, reactor.neutronDecimals)} ${neutronSymbolText} · ${formatTokenAmount(balances.proton.amount, reactor.protonDecimals)} ${protonSymbolText}`
      default:
        return "0"
    }
  }, [
    balances,
    reactor,
    fromToken,
    neutronSymbolText,
    protonSymbolText,
    connected,
    isLoadingBalances
  ])

  const disabledTokens: Record<TokenOption, boolean> = useMemo(
    () => ({
      BASE: !reactor,
      BUNDLE: !reactor,
      NEUTRON: !reactor,
      PROTON: !reactor
    }),
    [reactor]
  )

  const renderMaxButton =
    fromToken === "BASE" || fromToken === "NEUTRON" || fromToken === "PROTON"

  const handleMaxClick = useCallback(() => {
    if (!reactor || !balances) {
      return
    }

    if (fromToken === "BASE") {
      const formatted = formatTokenAmount(balances.base.amount, reactor.baseDecimals, 6)
      setAmount(trimFormattedAmount(formatted, 6))
    } else if (fromToken === "NEUTRON") {
      const formatted = formatTokenAmount(balances.neutron.amount, reactor.neutronDecimals, 6)
      setAmount(trimFormattedAmount(formatted, 6))
    } else if (fromToken === "PROTON") {
      const formatted = formatTokenAmount(balances.proton.amount, reactor.protonDecimals, 6)
      setAmount(trimFormattedAmount(formatted, 6))
    }
  }, [balances, fromToken, reactor])

  const fissionBreakdown = useMemo(() => {
    if (route !== "FISSION" || !fissionPreview || !reactor) {
      return null
    }
    return {
      baseIn: fissionPreview.amountIn,
      fee: fissionPreview.feeAmount,
      netBase: fissionPreview.netAmount,
      neutronOut: fissionPreview.estimatedOut.neutron ?? 0n,
      protonOut: fissionPreview.estimatedOut.proton ?? 0n,
      basePriceWad: fissionPreview.basePriceWad
    }
  }, [route, fissionPreview, reactor])

  const fusionBreakdown = useMemo(() => {
    if (route !== "FUSION" || !fusionPreview || !reactor) {
      return null
    }
    return {
      requestedBase: fusionPreview.amountIn,
      netBase: fusionPreview.netAmount,
      fee: fusionPreview.feeAmount,
      neutronBurn: fusionPreview.estimatedOut.neutron ?? 0n,
      protonBurn: fusionPreview.estimatedOut.proton ?? 0n
    }
  }, [route, fusionPreview, reactor])

  const fissionMintSummary = useMemo(() => {
    if (!fissionBreakdown || !reactor) {
      return ""
    }
    const neutronAmount = fissionBreakdown.neutronOut
    const protonAmount = fissionBreakdown.protonOut
    if (neutronAmount <= 0n && protonAmount <= 0n) {
      return ""
    }
    const neutronText = formatTokenAmount(neutronAmount, reactor.neutronDecimals, 4)
    const protonText = formatTokenAmount(protonAmount, reactor.protonDecimals, 4)
    return `${neutronText} ${neutronSymbolText} + ${protonText} ${protonSymbolText}`
  }, [fissionBreakdown, reactor, neutronSymbolText, protonSymbolText])

  const fusionBundleSummary = useMemo(() => {
    if (!fusionBreakdown || !reactor) {
      return ""
    }
    const neutronAmount = fusionBreakdown.neutronBurn
    const protonAmount = fusionBreakdown.protonBurn
    if (neutronAmount <= 0n && protonAmount <= 0n) {
      return ""
    }
    const neutronText = formatTokenAmount(neutronAmount, reactor.neutronDecimals, 4)
    const protonText = formatTokenAmount(protonAmount, reactor.protonDecimals, 4)
    return `${neutronText} ${neutronSymbolText} · ${protonText} ${protonSymbolText}`
  }, [fusionBreakdown, reactor, neutronSymbolText, protonSymbolText])

  const protonToNeutronSummary = useMemo(() => {
    if (route !== "PROTON_TO_NEUTRON" || !transmutePreview || !reactor) {
      return ""
    }
    const neutronOut = transmutePreview.estimatedOut.neutron ?? 0n
    if (neutronOut <= 0n) {
      return ""
    }
    return `${formatTokenAmount(neutronOut, reactor.neutronDecimals, 4)} ${neutronSymbolText}`
  }, [route, transmutePreview, reactor, neutronSymbolText])

  const neutronToProtonSummary = useMemo(() => {
    if (route !== "NEUTRON_TO_PROTON" || !transmutePreview || !reactor) {
      return ""
    }
    const protonOut = transmutePreview.estimatedOut.proton ?? 0n
    if (protonOut <= 0n) {
      return ""
    }
    return `${formatTokenAmount(protonOut, reactor.protonDecimals, 4)} ${protonSymbolText}`
  }, [route, transmutePreview, reactor, protonSymbolText])

  const breakdownPopover = useMemo(() => {
    if (!reactor) {
      return null
    }

    if (route === "FISSION" && fissionBreakdown) {
      return {
        title: "Fission breakdown",
        rows: [
          {
            label: "Base supplied",
            value: formatTokenValue(fissionBreakdown.baseIn, reactor.baseDecimals, baseSymbolText)
          },
          {
            label: "Fee retained",
            value: formatTokenValue(fissionBreakdown.fee, reactor.baseDecimals, baseSymbolText)
          },
          {
            label: "Net base",
            value: formatTokenValue(fissionBreakdown.netBase, reactor.baseDecimals, baseSymbolText)
          },
          {
            label: `${neutronSymbolText}`,
            value: formatTokenValue(
              fissionBreakdown.neutronOut,
              reactor.neutronDecimals,
            )
          },
          {
            label: `${protonSymbolText}`,
            value: formatTokenValue(
              fissionBreakdown.protonOut,
              reactor.protonDecimals,
            )
          },
          {
            label: "Oracle price",
            value: fissionBreakdown.basePriceWad
              ? `${formatWad(fissionBreakdown.basePriceWad)} ${peggedSymbolText}/${baseSymbolText}`
              : "—"
          }
        ]
      }
    }

    if (route === "FUSION" && fusionBreakdown) {
      return {
        title: "Fusion breakdown",
        rows: [
          {
            label: "Base requested",
            value: formatTokenValue(
              fusionBreakdown.netBase,
              reactor.baseDecimals,
              baseSymbolText
            )
          },
          {
            label: "Base before fee",
            value: formatTokenValue(
              fusionBreakdown.requestedBase,
              reactor.baseDecimals,
              baseSymbolText
            )
          },
          {
            label: "Fee withheld",
            value: formatTokenValue(fusionBreakdown.fee, reactor.baseDecimals, baseSymbolText)
          },
          {
            label: `Burn ${neutronSymbolText}`,
            value: formatTokenValue(
              fusionBreakdown.neutronBurn,
              reactor.neutronDecimals,
              neutronSymbolText
            )
          },
          {
            label: `Burn ${protonSymbolText}`,
            value: formatTokenValue(
              fusionBreakdown.protonBurn,
              reactor.protonDecimals,
              protonSymbolText
            )
          }
        ]
      }
    }

    return null
  }, [
    reactor,
    route,
    fissionBreakdown,
    fusionBreakdown,
    baseSymbolText,
    neutronSymbolText,
    protonSymbolText,
    peggedSymbolText
  ])

  const swapDescription = useMemo(() => {
    switch (route) {
      case "FISSION":
        return `Convert ${baseSymbolText} into ${neutronSymbolText} + ${protonSymbolText}.`
      case "FUSION":
        return `Redeem ${neutronSymbolText} + ${protonSymbolText} back into ${baseSymbolText}.`
      case "PROTON_TO_NEUTRON":
        return `Transmute ${protonSymbolText} into ${neutronSymbolText}.`
      case "NEUTRON_TO_PROTON":
        return `Transmute ${neutronSymbolText} into ${protonSymbolText}.`
      default:
        return "Select a supported conversion pair to continue."
    }
  }, [route, baseSymbolText, neutronSymbolText, protonSymbolText])

  const actionLabel = useMemo(() => {
    switch (route) {
      case "FISSION":
        return "Split Base"
      case "FUSION":
        return "Merge Tokens"
      case "PROTON_TO_NEUTRON":
        return "Transmute β⁺"
      case "NEUTRON_TO_PROTON":
        return "Transmute β⁻"
      default:
        return "Select Pair"
    }
  }, [route])

  const fromInputReadOnly = route === "FUSION"
  const fromInputType = fromInputReadOnly ? "text" : "number"
  const fromInputValue = fromInputReadOnly ? fusionBundleSummary : amount
  const fromInputPlaceholder = fromInputReadOnly
    ? fusionBundleSummary || `${neutronSymbolText} + ${protonSymbolText} burn calculated automatically`
    : "0.0"

  const toInputReadOnly = route !== "FUSION"
  const toInputType = route === "FUSION" ? "number" : "text"
  const toInputValue = useMemo(() => {
    if (!route) {
      return ""
    }
    if (route === "FUSION") {
      return amount
    }
    if (route === "FISSION") {
      return fissionMintSummary
    }
    if (route === "PROTON_TO_NEUTRON") {
      return protonToNeutronSummary
    }
    if (route === "NEUTRON_TO_PROTON") {
      return neutronToProtonSummary
    }
    return ""
  }, [route, amount, fissionMintSummary, protonToNeutronSummary, neutronToProtonSummary])

  const toInputPlaceholder = useMemo(() => {
    switch (route) {
      case "FUSION":
        return `Enter the amount of ${baseSymbolText} you want back`
      case "FISSION":
        return fissionMintSummary || "Minted bundle appears here"
      case "PROTON_TO_NEUTRON":
        return protonToNeutronSummary || `Minted ${neutronSymbolText} appears here`
      case "NEUTRON_TO_PROTON":
        return neutronToProtonSummary || `Minted ${protonSymbolText} appears here`
      default:
        return "Calculated on-chain"
    }
  }, [
    route,
    baseSymbolText,
    fissionMintSummary,
    protonToNeutronSummary,
    neutronToProtonSummary,
    neutronSymbolText,
    protonSymbolText
  ])

  const priceDisplay = useMemo(() => {
    if (!priceData) {
      return null
    }
    const value = priceData.price * Math.pow(10, priceData.expo)
    return Number.isFinite(value) ? value.toFixed(6) : null
  }, [priceData])

  const neutronBasePriceDisplay = useMemo(() => {
    if (!derivedTokenPrices) {
      return isLoadingPrice ? "Loading…" : "—"
    }
    return formatWad(derivedTokenPrices.neutronPriceBaseWad, 4)
  }, [derivedTokenPrices, isLoadingPrice])

  const protonBasePriceDisplay = useMemo(() => {
    if (!derivedTokenPrices) {
      return isLoadingPrice ? "Loading…" : "—"
    }
    return formatWad(derivedTokenPrices.protonPriceBaseWad, 4)
  }, [derivedTokenPrices, isLoadingPrice])

  const neutronPegPriceDisplay = useMemo(() => {
    if (!derivedTokenPrices) {
      return isLoadingPrice ? "Loading…" : "—"
    }
    return `$${formatWad(derivedTokenPrices.neutronPricePegWad, 4)}`
  }, [derivedTokenPrices, isLoadingPrice])

  const protonPegPriceDisplay = useMemo(() => {
    if (!derivedTokenPrices) {
      return isLoadingPrice ? "Loading…" : "—"
    }
    return `$${formatWad(derivedTokenPrices.protonPricePegWad, 4)}`
  }, [derivedTokenPrices, isLoadingPrice])

  const priceUpdatedDisplay = useMemo(() => {
    if (!priceData || priceData.publishTime <= 0) {
      return null
    }
    return new Date(priceData.publishTime * 1000).toLocaleTimeString()
  }, [priceData])

  const isProcessing = pendingAction !== null

  const [copiedAddress, setCopiedAddress] = useState<string | null>(null)

  const handleCopy = useCallback(async (value: string) => {
    if (typeof navigator === "undefined" || !navigator.clipboard) {
      toast.error("Clipboard unavailable in this environment")
      return
    }
    try {
      await navigator.clipboard.writeText(value)
      setCopiedAddress(value)
      toast.success("Copied to clipboard")
      setTimeout(() => {
        setCopiedAddress((current) => (current === value ? null : current))
      }, 2000)
    } catch (error) {
      console.error("Copy failed:", error)
      toast.error("Failed to copy value")
    }
  }, [])

  const ensureAta = useCallback(
    async (mint: PublicKey): Promise<{ address: PublicKey; instructions: TransactionInstruction[] }> => {
      if (!publicKey) {
        throw new Error("Connect your wallet first")
      }

      const ata = getAssociatedTokenAddressSync(mint, publicKey)
      const info = await connection.getAccountInfo(ata)

      if (info) {
        return { address: ata, instructions: [] }
      }

      const instruction = createAssociatedTokenAccountInstruction(publicKey, ata, publicKey, mint)
      return { address: ata, instructions: [instruction] }
    },
    [connection, publicKey]
  )

  const sendInstructions = useCallback(
    async (instructions: TransactionInstruction[]) => {
      if (!publicKey) {
        throw new Error("Wallet is not connected")
      }

      const latestBlockhash = await connection.getLatestBlockhash()
      const transaction = new Transaction({
        feePayer: publicKey,
        recentBlockhash: latestBlockhash.blockhash
      })

      const computeBudgetIx = ComputeBudgetProgram.setComputeUnitLimit({
        units: 600_000
      })

      const priorityFeeIx = ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: 1
      })

      transaction.add(computeBudgetIx, priorityFeeIx, ...instructions)

      try {
        const simulation = await connection.simulateTransaction(transaction)
        if (simulation.value.err) {
          const logs = simulation.value.logs ?? []
          const errorLog = logs.find((log) => log.includes("AnchorError") || log.includes("Error"))
          const errorStr = JSON.stringify(simulation.value.err)

          if (errorStr.includes("6011") || errorStr.includes("177b") || errorLog?.includes("price account")) {
            toast.error("Invalid Price Feed", {
              description:
                "The price feed is invalid, stale, or missing on this network. Ensure the reactor points to a live oracle.",
              duration: 15000
            })
          } else if (errorLog) {
            toast.error("Transaction Simulation Failed", {
              description: errorLog,
              duration: 10000
            })
          } else {
            toast.error("Transaction Simulation Failed", {
              description: `Error: ${errorStr}. Check console for full logs.`,
              duration: 10000
            })
          }

          throw new Error(`Transaction simulation failed: ${errorStr}`)
        }
      } catch (simError) {
        console.error("Transaction simulation error:", simError)
        if (simError instanceof Error && !simError.message.includes("Transaction simulation failed")) {
          toast.error("Transaction simulation error", {
            description: simError.message || "Check console for details"
          })
        }
        throw simError
      }

      try {
        const signature = await sendTransaction(transaction, connection, {
          skipPreflight: true
        })
        await connection.confirmTransaction({ signature, ...latestBlockhash }, "confirmed")

        setRefreshCounter((value) => value + 1)
        await refreshBalances()

        return signature
      } catch (error) {
        console.error("Transaction send error:", error)
        if (
          error &&
          typeof error === "object" &&
          "logs" in error &&
          Array.isArray((error as { logs?: string[] }).logs)
        ) {
          const logs = (error as { logs?: string[] }).logs ?? []
          const lastLog = logs[logs.length - 1]
          toast.error("Transaction failed", {
            description: lastLog ?? "See console for full logs"
          })
        }
        throw error
      }
    },
    [connection, publicKey, refreshBalances, sendTransaction]
  )

  const requireWallet = useCallback(() => {
    if (!connected || !publicKey) {
      toast.error("Connect your wallet to continue")
      return false
    }
    return true
  }, [connected, publicKey])

  const handleFission = useCallback(async () => {
    if (route !== "FISSION") {
      return
    }
    if (!reactor || !reactorAuthority) {
      toast.error("Reactor data not ready")
      return
    }
    if (!requireWallet()) {
      return
    }
    if (!amount) {
      toast.error("Enter an amount of base tokens to split")
      return
    }
    if (!recipientMatchesWallet) {
      toast.error("Recipient must match your connected wallet")
      return
    }

    try {
      setPendingAction("fission")

      const amountIn = parseAmountToBN(amount, reactor.baseDecimals)
      const amountBigInt = BigInt(amountIn.toString())
      if (balances?.base && balances.base.amount < amountBigInt) {
        toast.error("Insufficient base token balance")
        return
      }

      const [baseAta, neutronAta, protonAta] = await Promise.all([
        ensureAta(reactor.baseMint),
        ensureAta(reactor.neutronMint),
        ensureAta(reactor.protonMint)
      ])

      const instructions = [
        ...baseAta.instructions,
        ...neutronAta.instructions,
        ...protonAta.instructions,
        await program.methods
          .fission(amountIn)
          .accountsStrict({
            reactor: reactor.address,
            reactorAuthority: reactorAuthority,
            userAuthority: publicKey!,
            baseVault: reactor.baseVault,
            neutronMint: reactor.neutronMint,
            protonMint: reactor.protonMint,
            userBaseAccount: baseAta.address,
            userNeutronAccount: neutronAta.address,
            userProtonAccount: protonAta.address,
            treasuryBaseAccount: reactor.treasuryBaseAccount,
            tokenProgram: TOKEN_PROGRAM_ID
          })
          .instruction()
      ]

      const signature = await sendInstructions(instructions)
      toast.success("Fission transaction confirmed", {
        description: `Signature: ${signature}`
      })
      setAmount("")
    } catch (error) {
      console.error("Fission failed", error)
      toast.error("Fission failed", {
        description: error instanceof Error ? error.message : "Unexpected error"
      })
    } finally {
      setPendingAction(null)
    }
  }, [
    amount,
    balances?.base,
    ensureAta,
    program,
    publicKey,
    reactor,
    reactorAuthority,
    recipientMatchesWallet,
    requireWallet,
    route,
    sendInstructions
  ])

  const handleFusion = useCallback(async () => {
    if (route !== "FUSION") {
      return
    }
    if (!reactor || !reactorAuthority) {
      toast.error("Reactor data not ready")
      return
    }
    if (!requireWallet()) {
      return
    }
    if (!amount) {
      toast.error("Enter an amount of base tokens to redeem")
      return
    }
    if (!recipientMatchesWallet) {
      toast.error("Recipient must match your connected wallet")
      return
    }

    try {
      setPendingAction("fusion")

      const amountIn = parseAmountToBN(amount, reactor.baseDecimals)

      const [baseAta, neutronAta, protonAta] = await Promise.all([
        ensureAta(reactor.baseMint),
        ensureAta(reactor.neutronMint),
        ensureAta(reactor.protonMint)
      ])

      const instructions = [
        ...baseAta.instructions,
        ...neutronAta.instructions,
        ...protonAta.instructions,
        await program.methods
          .fusion(amountIn)
          .accountsStrict({
            reactor: reactor.address,
            reactorAuthority: reactorAuthority,
            userAuthority: publicKey!,
            baseVault: reactor.baseVault,
            neutronMint: reactor.neutronMint,
            protonMint: reactor.protonMint,
            userBaseAccount: baseAta.address,
            userNeutronAccount: neutronAta.address,
            userProtonAccount: protonAta.address,
            treasuryBaseAccount: reactor.treasuryBaseAccount,
            tokenProgram: TOKEN_PROGRAM_ID
          })
          .instruction()
      ]

      const signature = await sendInstructions(instructions)
      toast.success("Fusion transaction confirmed", {
        description: `Signature: ${signature}`
      })
      setAmount("")
    } catch (error) {
      console.error("Fusion failed", error)
      toast.error("Fusion failed", {
        description: error instanceof Error ? error.message : "Unexpected error"
      })
    } finally {
      setPendingAction(null)
    }
  }, [
    amount,
    ensureAta,
    program,
    publicKey,
    reactor,
    reactorAuthority,
    recipientMatchesWallet,
    requireWallet,
    route,
    sendInstructions
  ])

  const handleTransmute = useCallback(async () => {
    if (route !== "PROTON_TO_NEUTRON" && route !== "NEUTRON_TO_PROTON") {
      return
    }
    if (!reactor || !reactorAuthority) {
      toast.error("Reactor data not ready")
      return
    }
    if (!requireWallet()) {
      return
    }
    if (!amount) {
      toast.error("Enter an amount to transmute")
      return
    }
    if (!recipientMatchesWallet) {
      toast.error("Recipient must match your connected wallet")
      return
    }

    const isProtonToNeutron = route === "PROTON_TO_NEUTRON"
    const decimals = isProtonToNeutron ? reactor.protonDecimals : reactor.neutronDecimals

    try {
      setPendingAction(isProtonToNeutron ? "ptn" : "ntp")

      const amountIn = parseAmountToBN(amount, decimals)
      const amountBigInt = BigInt(amountIn.toString())

      // Check balance
      if (isProtonToNeutron) {
        if (balances?.proton && balances.proton.amount < amountBigInt) {
          toast.error("Insufficient Proton balance")
          return
        }
      } else if (balances?.neutron && balances.neutron.amount < amountBigInt) {
        toast.error("Insufficient Neutron balance")
        return
      }

      // Ensure ATAs exist
      const [protonAta, neutronAta] = await Promise.all([
        ensureAta(reactor.protonMint),
        ensureAta(reactor.neutronMint)
      ])

      // Fetch price update data from Hermes
      toast.info("Fetching latest price from Pyth Hermes API...")
      
      const { priceUpdateData, currentPrice } = await getPythPriceUpdateData(reactor.priceFeedId)

      console.log('📊 Current price from Hermes:', {
        feedId: reactor.priceFeedId,
        price: currentPrice.price,
        expo: currentPrice.expo,
        displayPrice: currentPrice.price * Math.pow(10, currentPrice.expo),
        publishTime: new Date(currentPrice.publishTime * 1000).toISOString(),
      })

      // Use Pyth Solana Receiver SDK to build and send transaction
      const pythSolanaReceiver = new PythSolanaReceiver({
        connection,
        wallet: {
          publicKey: publicKey!,
          signTransaction: async (tx) => {
            // Use the wallet's actual signTransaction method
            if (!window.solana) {
              throw new Error("Wallet not found")
            }
            const signed = await window.solana.signTransaction(tx)
            return signed as Transaction
          },
          signAllTransactions: async (txs) => {
            if (!window.solana) {
              throw new Error("Wallet not found")
            }
            const signed = await window.solana.signAllTransactions(txs)
            return signed as Transaction[]
          },
        } as Wallet,
      })

      // Create transaction builder
      const transactionBuilder = pythSolanaReceiver.newTransactionBuilder({
        closeUpdateAccounts: true, // Close accounts after use to reclaim rent
      })

      // Add price update posting instructions
      await transactionBuilder.addPostPriceUpdates(priceUpdateData)

      // Add the transmute instruction that consumes the price update
      await transactionBuilder.addPriceConsumerInstructions(
        async (getPriceUpdateAccount: (priceFeedId: string) => PublicKey): Promise<InstructionWithEphemeralSigners[]> => {
          // Build the transmute instruction with the price update account
          const instructionBuilder = isProtonToNeutron
            ? program.methods.transmuteProtonToNeutron(amountIn)
            : program.methods.transmuteNeutronToProton(amountIn)

          const transmuteInstruction = await instructionBuilder
            .accountsStrict({
              reactor: reactor.address,
              reactorAuthority: reactorAuthority,
              userAuthority: publicKey!,
              baseVault: reactor.baseVault,
              protonMint: reactor.protonMint,
              neutronMint: reactor.neutronMint,
              userProtonAccount: protonAta.address,
              userNeutronAccount: neutronAta.address,
              priceUpdate: getPriceUpdateAccount(reactor.priceFeedId), // Get the price update account from SDK
              tokenProgram: TOKEN_PROGRAM_ID,
            })
            .instruction()

          // Return ATA creation instructions + transmute instruction
          return [
            ...protonAta.instructions.map(ix => ({ instruction: ix, signers: [] })),
            ...neutronAta.instructions.map(ix => ({ instruction: ix, signers: [] })),
            { instruction: transmuteInstruction, signers: [] },
          ]
        }
      )

      // Build and send all transactions
      const transactions = await transactionBuilder.buildVersionedTransactions({
        computeUnitPriceMicroLamports: 50000,
      })

      toast.info(`Sending ${transactions.length} transaction(s)...`)

      // Send all transactions
      await pythSolanaReceiver.provider.sendAll(transactions, { skipPreflight: true })

      // Refresh balances and counter
      setRefreshCounter((value) => value + 1)
      await refreshBalances()

      toast.success(
        `Transmute ${isProtonToNeutron ? "Proton → Neutron" : "Neutron → Proton"} confirmed`,
        {
          description: `Price: $${(currentPrice.price * Math.pow(10, currentPrice.expo)).toFixed(4)}`
        }
      )
      setAmount("")
    } catch (error) {
      console.error("Transmute failed", error)
      toast.error("Transmute failed", {
        description: error instanceof Error ? error.message : "Unexpected error"
      })
    } finally {
      setPendingAction(null)
    }
  }, [
    amount,
    balances?.neutron,
    balances?.proton,
    connection,
    ensureAta,
    program,
    publicKey,
    reactor,
    reactorAuthority,
    recipientMatchesWallet,
    requireWallet,
    route,
    refreshBalances
  ])

  const handleSwap = useCallback(async () => {
    if (!route) {
      toast.error("Unsupported conversion path")
      return
    }

    switch (route) {
      case "FISSION":
        await handleFission()
        break
      case "FUSION":
        await handleFusion()
        break
      case "PROTON_TO_NEUTRON":
      case "NEUTRON_TO_PROTON":
        await handleTransmute()
        break
      default:
        toast.error("Unsupported conversion path")
    }
  }, [route, handleFission, handleFusion, handleTransmute])

  const vaultHeading = useMemo(() => {
    if (!reactor) {
      return "Stablecoin Reactor"
    }
    return reactor.vaultName?.length ? `${reactor.vaultName}` : "Stablecoin Reactor"
  }, [reactor])

  const infoRows = useMemo(() => {
    if (!reactor) {
      return []
    }

    const basePriceText =
      priceDisplay !== null ? `$${priceDisplay}` : isLoadingPrice ? "Loading…" : "—"
    const priceUpdatedText = priceUpdatedDisplay ?? "—"

    // Calculate current reserve ratio: r = R / (S◦ * P*_base)
    let currentReserveRatioText = "—"
    try {
      if (priceData && reactor.neutronSupply > 0n) {
        const basePriceWad = pythPriceToWad(priceData)
        if (basePriceWad > 0n) {
          const reserveWad = (reactor.reserveTokens * WAD) / BigInt(10 ** reactor.baseDecimals)
          const neutronSupplyWad = (reactor.neutronSupply * WAD) / BigInt(10 ** reactor.neutronDecimals)
          
          // P*_base = 1 / base_price_wad (inverted because base_price_wad is price of base in peg terms)
          const pStarBaseWad = (WAD * WAD) / basePriceWad
          const denom = (neutronSupplyWad * pStarBaseWad) / WAD
          
          if (denom > 0n) {
            const rWad = (reserveWad * WAD) / denom
            currentReserveRatioText = formatPercentFromWad(rWad, 2)
          }
        }
      } else if (reactor.neutronSupply === 0n && reactor.reserveTokens > 0n) {
        currentReserveRatioText = "∞ (Bootstrap)"
      } else if (reactor.reserveTokens === 0n) {
        currentReserveRatioText = "0%"
      }
    } catch (error) {
      console.error("Failed to calculate reserve ratio:", error)
      currentReserveRatioText = "—"
    }

    const neutronBaseValue = derivedTokenPrices
      ? `${neutronBasePriceDisplay} ${baseSymbolText}`
      : neutronBasePriceDisplay
    const protonBaseValue = derivedTokenPrices
      ? `${protonBasePriceDisplay} ${baseSymbolText}`
      : protonBasePriceDisplay

    return [
      { label: "Vault Address", value: reactor.address.toBase58(), monospace: true },
      { label: "Treasury", value: reactor.treasuryAuthority.toBase58(), monospace: true },
      { label: "Treasury Base Account", value: reactor.treasuryBaseAccount.toBase58(), monospace: true },
      {
        label: "Price Feed ID",
        value: reactor.priceFeedId ?? "—",
        monospace: true
      },
      { label: "Base Mint", value: reactor.baseMint.toBase58(), monospace: true },
      { label: "Current Reserve Ratio (r)", value: currentReserveRatioText },
      { label: "Critical Reserve Ratio (r*)", value: formatPercentFromWad(reactor.rStarWad) },
      { label: "Fission Fee", value: formatPercentFromWad(reactor.fissionFeeWad) },
      { label: "Fusion Fee", value: formatPercentFromWad(reactor.fusionFeeWad) },
      {
        label: "Reserve Balance",
        value: `${formatTokenAmount(reactor.reserveTokens, reactor.baseDecimals)} ${baseSymbolText}`
      },
      {
        label: `${neutronSymbolText} Supply`,
        value: formatTokenAmount(reactor.neutronSupply, reactor.neutronDecimals)
      },
      {
        label: `${protonSymbolText} Supply`,
        value: formatTokenAmount(reactor.protonSupply, reactor.protonDecimals)
      },
      { label: "Pyth Price", value: basePriceText },
      { label: `${neutronSymbolText}/Base`, value: neutronBaseValue },
      { label: `${protonSymbolText}/Base`, value: protonBaseValue },
      { label: `${neutronSymbolText}/Peg Price`, value: neutronPegPriceDisplay },
      { label: `${protonSymbolText}/Peg Price`, value: protonPegPriceDisplay },
      { label: "Price Updated", value: priceUpdatedText }
    ]
  }, [
    reactor,
    baseSymbolText,
    neutronSymbolText,
    protonSymbolText,
    priceDisplay,
    neutronBasePriceDisplay,
    protonBasePriceDisplay,
    neutronPegPriceDisplay,
    protonPegPriceDisplay,
    priceUpdatedDisplay,
    isLoadingPrice,
    priceData,
    derivedTokenPrices
  ])

  if (!resolvedAddress) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Alert variant="destructive" className="max-w-md">
          <AlertTriangle className="h-5 w-5" />
          <AlertDescription>No reactor address provided.</AlertDescription>
        </Alert>
      </div>
    )
  }

  if (reactorState.status === "loading" || reactorState.status === "idle") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-4 text-foreground">
          <Activity className="h-12 w-12 mx-auto animate-spin" />
          <p>Loading reactor data…</p>
        </div>
      </div>
    )
  }

  if (reactorState.status === "error") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Alert variant="destructive" className="max-w-lg">
          <AlertTriangle className="h-5 w-5" />
          <AlertDescription>
            Failed to load reactor data: {reactorState.error.message}
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  if (!reactor || !reactorAuthority) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Alert variant="destructive" className="max-w-lg">
          <AlertTriangle className="h-5 w-5" />
          <AlertDescription>Reactor data unavailable for this address.</AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <div className="min-h-screen relative" style={containerStyle}>
      <LightRays
        raysOrigin="top-center"
        raysColor="#F7F7F7"
        raysSpeed={1.5}
        lightSpread={0.8}
        rayLength={1.2}
        followMouse
        mouseInfluence={0.1}
        noiseAmount={0.1}
        distortion={0.05}
        className="fixed inset-0 z-[1]"
      />

      <div className="container mx-auto px-4 py-8 relative z-[5]">
        <div className="text-center mb-10 space-y-3">
          <Shuffle
            text={vaultHeading}
            tag="h1"
            className="text-4xl lg:text-5xl mb-2 text-foreground"
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
        </div>

        <div className="max-w-xl mx-auto">
          <Card className="backdrop-blur-md bg-background/60 border-white/40 shadow-2xl rounded-none">
            <CardHeader className="space-y-1">
              <CardTitle className="text-2xl font-semibold flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                Swap Anywhere, Anytime
              </CardTitle>
              <p className="text-sm text-foreground">{swapDescription}</p>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-3 rounded-none border border-white/40 bg-white/5 p-4">
                <div className="flex items-center justify-between text-sm text-foreground">
                  <span>From</span>
                  <span className="font-mono text-xs text-foreground/80">{fromBalanceDisplay}</span>
                </div>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:h-14">
                  <Select
                    value={fromToken}
                    onValueChange={(value) => setFromToken(value as TokenOption)}
                  >
                    <SelectTrigger className="h-12 sm:h-14 w-full sm:w-40 bg-background/80">
                      <SelectValue placeholder="Token" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="BASE" disabled={disabledTokens.BASE}>
                        {baseSymbolText}
                      </SelectItem>
                      <SelectItem value="NEUTRON" disabled={disabledTokens.NEUTRON}>
                        {neutronSymbolText}
                      </SelectItem>
                      <SelectItem value="PROTON" disabled={disabledTokens.PROTON}>
                        {protonSymbolText}
                      </SelectItem>
                      <SelectItem value="BUNDLE" disabled={disabledTokens.BUNDLE}>
                        {bundleLabel}
                      </SelectItem>
                    </SelectContent>
                  </Select>

                  <Input
                    type={fromInputType}
                    placeholder={fromInputPlaceholder}
                    value={fromInputValue}
                    onChange={(event) => {
                      if (fromInputReadOnly) {
                        return
                      }
                      setAmount(event.target.value)
                    }}
                    readOnly={fromInputReadOnly}
                    className="w-full sm:flex-1 text-xl sm:text-2xl font-semibold h-12 sm:h-14 bg-background/60"
                  />

                  {renderMaxButton && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="w-full sm:w-auto h-12 sm:h-14 border-white/40 hover:bg-white/10"
                      onClick={handleMaxClick}
                    >
                      Max
                    </Button>
                  )}
                </div>
              </div>

              

              <div className="flex justify-center my-4 sm:my-2">
                <Button
                  type="button"
                  variant="ghost"
                  className="rounded-none h-12 w-12 sm:h-10 sm:w-10 p-0 bg-white/10 hover:bg-white/20"
                  onClick={() => {
                    const newFrom = toToken
                    const newTo = allowedTargets[newFrom][0]
                    setFromToken(newFrom)
                    setToToken(newTo)
                  }}
                >
                  <ArrowLeftRight className="h-5 w-5" />
                </Button>
              </div>

              <div className="space-y-3 rounded-none border border-white/40 bg-white/5 p-4">
                <div className="flex items-center justify-between text-sm text-foreground">
                  <span>To</span>
                  <div className="flex items-center gap-2">
                    {breakdownPopover && (
                      <Popover>
                        <PopoverTrigger asChild>
                          <button
                            type="button"
                            className="rounded-none border border-white/40 p-1 text-foreground/70 transition-colors hover:border-white/40 hover:text-foreground"
                          >
                            <Info className="h-4 w-4" />
                          </button>
                        </PopoverTrigger>
                        <PopoverContent className="w-64 space-y-2 text-sm" align="end">
                          <p className="font-semibold text-foreground/90">{breakdownPopover.title}</p>
                          <div className="space-y-1 font-mono text-xs">
                            {breakdownPopover.rows.map((row) => (
                              <div key={row.label} className="flex items-center justify-between gap-2">
                                <span className="text-foreground">{row.label}</span>
                                <span className="text-foreground">{row.value}</span>
                              </div>
                            ))}
                          </div>
                        </PopoverContent>
                      </Popover>
                    )}
                    <span className="font-mono text-xs text-foreground/80">{toLabel}</span>
                  </div>
                </div>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:h-14">
                  <Select value={toToken} onValueChange={(value) => setToToken(value as TokenOption)}>
                    <SelectTrigger className="h-12 sm:h-14 w-full sm:w-40 bg-background/80">
                      <SelectValue placeholder="Token" />
                    </SelectTrigger>
                    <SelectContent>
                      {allowedTargets[fromToken].map((target) => (
                        <SelectItem key={target} value={target}>
                          {target === "BUNDLE"
                            ? bundleLabel
                            : target === "BASE"
                              ? baseSymbolText
                              : target === "NEUTRON"
                                ? neutronSymbolText
                                : protonSymbolText}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Input
                    type={toInputType}
                    placeholder={toInputPlaceholder}
                    value={toInputValue}
                    onChange={(event) => {
                      if (!toInputReadOnly) {
                        setAmount(event.target.value)
                      }
                    }}
                    readOnly={toInputReadOnly}
                    className="w-full sm:flex-1 text-xl sm:text-2xl font-semibold h-12 sm:h-14 bg-background/60"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm text-foreground">Recipient Address</label>
                <Input
                  placeholder="0x..."
                  value={recipient}
                  onChange={(event) => setRecipient(event.target.value)}
                  className="font-mono text-sm bg-background/60"
                />
              </div>

              <div>
                {!connected ? (
                  <Button
                    onClick={() => walletModal.setVisible(true)}
                    className="w-full h-14 bg-[#E8BA10] hover:bg-[#d0a60e] text-white font-semibold text-lg border-0"
                  >
                    <Zap className="mr-2 h-5 w-5" />
                    Connect Wallet
                  </Button>
                ) : (
                  <Button
                    onClick={handleSwap}
                    disabled={!route || !isAmountPositive || !recipientMatchesWallet || isProcessing}
                    className="w-full h-14 bg-[#E8BA10] hover:bg-[#d0a60e] text-white font-semibold text-lg border-0 disabled:opacity-60"
                  >
                    {isProcessing ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                        Processing...
                      </>
                    ) : (
                      actionLabel
                    )}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="max-w-4xl mx-auto mt-16 sm:mt-24 lg:mt-40">
          <Card
            className="bg-background/50 border-white/40"
            style={{
              fontFamily:
                "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
            }}
          >
            <CardHeader className="pb-2">
              <CardTitle className="text-lg font-semibold text-foreground">
                Reactor Parameters
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Live configuration, oracle wiring, and treasury context for this vault.
              </p>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {infoRows.map((row) => {
                  const isAddressRow =
                    row.monospace && typeof row.value === "string" && row.value.length > 10
                  const renderedValue = isAddressRow && typeof row.value === "string"
                    ? shortenAddress(row.value)
                    : row.value

                  return (
                    <div key={row.label} className="space-y-1">
                      <dt className="text-base font-medium text-muted-foreground">
                        {row.label}
                      </dt>
                      <dd
                        className={`text-base text-foreground ${
                          isAddressRow ? "flex items-center gap-2" : ""
                        }`}
                      >
                        {isAddressRow && typeof row.value === "string" ? (
                          <>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => void handleCopy(row.value as string)}
                            >
                              <Copy className="h-4 w-4" />
                              <span className="sr-only">Copy {row.label}</span>
                            </Button>
                            <div className="flex flex-col">
                              <span className="font-mono">{renderedValue}</span>
                              {copiedAddress === row.value ? (
                                <span className="text-[10px] text-muted-foreground">Copied</span>
                              ) : null}
                            </div>
                          </>
                        ) : (
                          renderedValue
                        )}
                      </dd>
                    </div>
                  )
                })}
              </dl>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
