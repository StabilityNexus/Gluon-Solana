"use client"

import { useEffect, useMemo, useState } from "react"
import { Keypair, PublicKey, SystemProgram, Transaction } from "@solana/web3.js"
import {
  ACCOUNT_SIZE,
  MINT_SIZE,
  TOKEN_PROGRAM_ID,
  createInitializeAccountInstruction,
  createInitializeMintInstruction,
  MintLayout
} from "@solana/spl-token"
import { useWallet, useConnection } from "@solana/wallet-adapter-react"
import { utils } from "@coral-xyz/anchor"
import { toast } from "sonner"
import { CheckCircle2, Wallet, Zap } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import TargetCursor from "@/components/TargetCursor"
import Shuffle from "@/components/Shuffle"
import LightRays from "@/components/LightRays"

import { useStablecoinProgram } from "@/hooks/useStablecoinProgram"
import { decimalToWad } from "@/utils/amount"

const AUTHORITY_SEED = utils.bytes.utf8.encode("reactor-authority")
const TREASURY_AUTHORITY = new PublicKey("AbXCVvK1BqVRcNBu9JpJuRnngwkLy6DXG66Anxi2ncBn")
const DEFAULT_BASE_ASSET_NAME = ""
const DEFAULT_BASE_ASSET_SYMBOL = ""
const DEFAULT_PEGGED_ASSET_NAME = ""
const DEFAULT_PEGGED_ASSET_SYMBOL = ""
const DEFAULT_BASE_DECIMALS = 6

type FormState = {
  vaultName: string
  baseAssetName: string
  baseAssetSymbol: string
  peggedAssetName: string
  peggedAssetSymbol: string
  baseMint: string
  priceFeedId: string
  fissionFeePercent: string
  fusionFeePercent: string
  criticalReserveRatio: string
}


type CreatedReactor = {
  baseMint: string
  reactor: string
  reactorAuthority: string
  baseVault: string
  neutronMint: string
  protonMint: string
  treasuryBaseAccount: string
  baseAssetName: string
  baseAssetSymbol: string
  peggedAssetName: string
  peggedAssetSymbol: string
}

const containerFontStyle = {
  fontFamily: "'Space Mono', 'Syne', 'Orbitron', 'Courier New', monospace",
  fontWeight: 500
}

const fieldBaseClasses =
  "bg-[#0B0E15] border border-white/30 text-[13px] font-semibold tracking-[0.2em] text-white/85 placeholder:text-white/35 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/70 focus:border-white/60 transition-colors duration-200 px-4 rounded-none font-mono cursor-text"

const inputClasses = `${fieldBaseClasses} h-12`

export default function CreatePage() {
  const [form, setForm] = useState<FormState>({
    vaultName: "",
    baseAssetName: DEFAULT_BASE_ASSET_NAME,
    baseAssetSymbol: DEFAULT_BASE_ASSET_SYMBOL,
    peggedAssetName: DEFAULT_PEGGED_ASSET_NAME,
    peggedAssetSymbol: DEFAULT_PEGGED_ASSET_SYMBOL,
    baseMint: "",
    priceFeedId: "",
    fissionFeePercent: "0.5",
    fusionFeePercent: "0.5",
    criticalReserveRatio: "1.01"
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [createdReactor, setCreatedReactor] = useState<CreatedReactor | null>(null)

  const { program } = useStablecoinProgram()
  const { publicKey, connected, sendTransaction } = useWallet()
  const { connection } = useConnection()

  useEffect(() => {
    console.log("Program initialization status:", program ? "Initialized" : "Not initialized")
    if (program) {
      console.log("Program ID:", program.programId.toBase58())
    }
  }, [program])

  const handleChange = (field: keyof FormState) => (event: React.ChangeEvent<HTMLInputElement>) => {
    setCreatedReactor(null)
    setForm((prev) => ({
      ...prev,
      [field]: event.target.value
    }))
  }

  const isFormComplete = useMemo(() => {
    return (
      form.vaultName?.trim().length > 0 &&
      form.baseAssetName?.trim().length > 0 &&
      form.baseAssetSymbol?.trim().length > 0 &&
      form.peggedAssetName?.trim().length > 0 &&
      form.peggedAssetSymbol?.trim().length > 0 &&
      form.baseMint?.trim().length > 0 &&
      form.priceFeedId?.trim().length > 0 &&
      form.fissionFeePercent?.trim().length > 0 &&
      form.fusionFeePercent?.trim().length > 0 &&
      form.criticalReserveRatio?.trim().length > 0
    )
  }, [form])

  const handleCreateReactor = async () => {
    if (!connected || !publicKey) {
      toast.error("Connect your wallet to deploy a reactor")
      return
    }

    if (!isFormComplete) {
      toast.error("Please fill in all required fields")
      return
    }

    if (!program) {
      toast.error("Program not initialized")
      console.error("Program is not initialized")
      return
    }

    try {
      setIsSubmitting(true)
      console.log("Starting reactor deployment...")

      console.log("Step 1: Parsing base mint...")
      const baseMintInput = form.baseMint.trim()
      if (!baseMintInput) {
        throw new Error("Base mint address is required")
      }

      let baseMintPk: PublicKey
      let baseDecimals = DEFAULT_BASE_DECIMALS

      try {
        baseMintPk = new PublicKey(baseMintInput)
        console.log("Using provided base mint:", baseMintPk.toBase58())
      } catch {
        throw new Error("Invalid base mint public key")
      }

      console.log("Step 2: Validating Pyth price feed ID...")
      const priceFeedId = form.priceFeedId.trim()
      if (!priceFeedId) {
        throw new Error("Pyth price feed ID is required")
      }
      // Validate hex format (should be 0x followed by 64 hex chars)
      if (!priceFeedId.match(/^0x[a-fA-F0-9]{64}$/)) {
        throw new Error("Invalid Pyth price feed ID format. Expected: 0x followed by 64 hex characters")
      }
      console.log("Using Pyth price feed ID:", priceFeedId)

      console.log("Step 3: Validating form...")
      if (!form.vaultName.trim()) {
        throw new Error("Vault name is required")
      }
      if (!form.baseAssetName.trim()) {
        throw new Error("Base asset name is required")
      }
      if (!form.baseAssetSymbol.trim()) {
        throw new Error("Base asset symbol is required")
      }
      if (!form.peggedAssetName.trim()) {
        throw new Error("Pegged asset name is required")
      }
      if (!form.peggedAssetSymbol.trim()) {
        throw new Error("Pegged asset symbol is required")
      }

      const fissionPercent = Number(form.fissionFeePercent)
      const fusionPercent = Number(form.fusionFeePercent)
      const criticalRatio = Number(form.criticalReserveRatio)
      
      console.log("Fees and ratios:", { fissionPercent, fusionPercent, criticalRatio })

      if (!Number.isFinite(fissionPercent) || fissionPercent < 0) {
        throw new Error("Fission fee must be a positive number (percentage)")
      }
      if (!Number.isFinite(fusionPercent) || fusionPercent < 0) {
        throw new Error("Fusion fee must be a positive number (percentage)")
      }
      if (!Number.isFinite(criticalRatio) || criticalRatio <= 1.0) {
        throw new Error("Critical reserve ratio (r*) must be greater than 1.0 (recommended: 1.01)")
      }

      console.log("Step 5: Converting to WAD format...")
      const fissionFeeDecimal = (fissionPercent / 100).toString()
      const fusionFeeDecimal = (fusionPercent / 100).toString()
      const criticalRatioDecimal = criticalRatio.toString()
      
      console.log("Converting:", { fissionFeeDecimal, fusionFeeDecimal, criticalRatioDecimal })
      
      let fissionFeeWad, fusionFeeWad, rStarWad, criticalReserveRatioWad
      try {
        fissionFeeWad = decimalToWad(fissionFeeDecimal)
        fusionFeeWad = decimalToWad(fusionFeeDecimal)
        rStarWad = decimalToWad(criticalRatioDecimal)
        criticalReserveRatioWad = decimalToWad(criticalRatioDecimal)
        console.log("WAD values:", { 
          fissionFeeWad: fissionFeeWad.toString(), 
          fusionFeeWad: fusionFeeWad.toString(), 
          rStarWad: rStarWad.toString(),
          criticalReserveRatioWad: criticalReserveRatioWad.toString()
        })
      } catch (wadError) {
        console.error("WAD conversion error:", wadError)
        throw wadError
      }

      console.log("Step 6: Verifying base mint on-chain...")
      const mintAccountInfo = await connection.getAccountInfo(baseMintPk)
      if (!mintAccountInfo) {
        throw new Error('Base mint account not found on this cluster. Ensure you are connected to the correct network (localhost/devnet/mainnet) where this mint exists.')
      }
      if (!mintAccountInfo.owner.equals(TOKEN_PROGRAM_ID)) {
        throw new Error(
          'Base mint must be owned by the SPL Token program (TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA). Please provide a valid SPL token mint address.'
        )
      }

      const mintData = MintLayout.decode(mintAccountInfo.data)
      baseDecimals = mintData.decimals
      console.log("✅ Base mint verified successfully")
      console.log("Base mint decimals:", baseDecimals)

      console.log("Step 7: Pyth price feed ID validated (pull-based model)")
      console.log("✅ Will use Pyth Network Hermes API with feed ID:", priceFeedId)

      console.log("Step 8: Generating keypairs...")
      const reactorKeypair = Keypair.generate()
      const baseVaultKeypair = Keypair.generate()
      const neutronMintKeypair = Keypair.generate()
      const protonMintKeypair = Keypair.generate()
      const treasuryBaseKeypair = Keypair.generate()
      console.log("Keypairs generated successfully")

      console.log("Step 9: Deriving PDA...")
      const [reactorAuthority] = PublicKey.findProgramAddressSync(
        [AUTHORITY_SEED, reactorKeypair.publicKey.toBuffer()],
        program.programId
      )
      console.log("Reactor Authority PDA derived:", reactorAuthority.toBase58())

      console.log("Step 10: Calculating rent...")
      const rentForAccount = await connection.getMinimumBalanceForRentExemption(ACCOUNT_SIZE)
      const rentForMint = await connection.getMinimumBalanceForRentExemption(MINT_SIZE)
      console.log("Rent exemptions:", { rentForAccount, rentForMint })

      console.log("Step 11: Building setup transactions (split into batches)...")
      let initSignature: string | null = null
      
      // Transaction 1: Create base vault and neutron mint
      console.log("Creating base vault and neutron mint...")
      try {
        const tx1Instructions = [
          SystemProgram.createAccount({
            fromPubkey: publicKey,
            newAccountPubkey: baseVaultKeypair.publicKey,
            lamports: rentForAccount,
            space: ACCOUNT_SIZE,
            programId: TOKEN_PROGRAM_ID
          }),
          createInitializeAccountInstruction(baseVaultKeypair.publicKey, baseMintPk, reactorAuthority),
          SystemProgram.createAccount({
            fromPubkey: publicKey,
            newAccountPubkey: neutronMintKeypair.publicKey,
            lamports: rentForMint,
            space: MINT_SIZE,
            programId: TOKEN_PROGRAM_ID
          }),
          createInitializeMintInstruction(
            neutronMintKeypair.publicKey,
            baseDecimals,
            reactorAuthority,
            reactorAuthority
          )
        ]
        
        const tx1Blockhash = await connection.getLatestBlockhash()
        const tx1 = new Transaction({
          feePayer: publicKey,
          recentBlockhash: tx1Blockhash.blockhash
        }).add(...tx1Instructions)
        
        toast.info("Approve Transaction 1/3", {
          description: "Create base vault and neutron mint"
        })
        console.log("Sending transaction 1/3, please approve in wallet...")
        const tx1Sig = await sendTransaction(tx1, connection, {
          signers: [baseVaultKeypair, neutronMintKeypair],
          skipPreflight: false
        })
        console.log("✅ Base vault and neutron mint created:", tx1Sig)
        await connection.confirmTransaction({ signature: tx1Sig, ...tx1Blockhash }, "confirmed")
        console.log("✅ Transaction 1/3 confirmed")
      } catch (error) {
        console.error("❌ Failed to create base vault and neutron mint:", error)
        throw new Error(`Failed to create base vault/neutron mint: ${error instanceof Error ? error.message : 'Unknown error'}`)
      }
      
      // Transaction 2: Create proton mint and treasury base account
      console.log("Creating proton mint and treasury base account...")
      try {
        const tx2Instructions = [
          SystemProgram.createAccount({
            fromPubkey: publicKey,
            newAccountPubkey: protonMintKeypair.publicKey,
            lamports: rentForMint,
            space: MINT_SIZE,
            programId: TOKEN_PROGRAM_ID
          }),
          createInitializeMintInstruction(
            protonMintKeypair.publicKey,
            baseDecimals,
            reactorAuthority,
            reactorAuthority
          ),
          SystemProgram.createAccount({
            fromPubkey: publicKey,
            newAccountPubkey: treasuryBaseKeypair.publicKey,
            lamports: rentForAccount,
            space: ACCOUNT_SIZE,
            programId: TOKEN_PROGRAM_ID
          }),
          createInitializeAccountInstruction(
            treasuryBaseKeypair.publicKey,
            baseMintPk,
            TREASURY_AUTHORITY
          )
        ]
        
        const tx2Blockhash = await connection.getLatestBlockhash()
        const tx2 = new Transaction({
          feePayer: publicKey,
          recentBlockhash: tx2Blockhash.blockhash
        }).add(...tx2Instructions)
        
        toast.info("Approve Transaction 2/3", {
          description: "Create proton mint and treasury account"
        })
        console.log("Sending transaction 2/3, please approve in wallet...")
        const tx2Sig = await sendTransaction(tx2, connection, {
          signers: [protonMintKeypair, treasuryBaseKeypair],
          skipPreflight: false
        })
        console.log("✅ Proton mint and treasury account created:", tx2Sig)
        await connection.confirmTransaction({ signature: tx2Sig, ...tx2Blockhash }, "confirmed")
        console.log("✅ Transaction 2/3 confirmed")
      } catch (error) {
        console.error("❌ Failed to create proton mint and treasury account:", error)
        throw new Error(`Failed to create proton mint/treasury: ${error instanceof Error ? error.message : 'Unknown error'}`)
      }

      // Transaction 3: Initialize the reactor
      console.log("Building initialize instruction...")
      console.log("Reactor:", reactorKeypair.publicKey.toBase58())
      console.log("Reactor Authority PDA:", reactorAuthority.toBase58())
      console.log("Base mint:", baseMintPk.toBase58())
      
      try {
        // reactorAuthority, systemProgram, and tokenProgram are auto-inferred by Anchor
        const initializeIx = await program.methods
          .initialize({
            vaultName: form.vaultName.trim(),
            baseAssetName: form.baseAssetName.trim(),
            baseAssetSymbol: form.baseAssetSymbol.trim(),
            peggedAssetName: form.peggedAssetName.trim(),
            peggedAssetSymbol: form.peggedAssetSymbol.trim(),
            fissionFeeWad,
            fusionFeeWad,
            criticalReserveRatioWad,
            rStarWad,
            priceFeedId: priceFeedId
          })
          .accounts({
            payer: publicKey,
            reactor: reactorKeypair.publicKey,
            // reactorAuthority is auto-derived by Anchor as a PDA
            baseMint: baseMintPk,
            baseVault: baseVaultKeypair.publicKey,
            neutronMint: neutronMintKeypair.publicKey,
            protonMint: protonMintKeypair.publicKey,
            treasuryBaseAccount: treasuryBaseKeypair.publicKey
          })
          .instruction()

        console.log("Submitting initialize transaction (final step)...")
        const initBlockhash = await connection.getLatestBlockhash()
        const initTx = new Transaction({
          feePayer: publicKey,
          recentBlockhash: initBlockhash.blockhash
        }).add(initializeIx)

        // Clone transaction for simulation to avoid modifying the original
        console.log("Simulating transaction...")
        const simulationTx = Transaction.from(initTx.serialize({ requireAllSignatures: false, verifySignatures: false }))
        simulationTx.partialSign(reactorKeypair)
        
        try {
          const simulation = await connection.simulateTransaction(simulationTx)
          console.log("✅ Transaction simulation result:", simulation)
          if (simulation.value.err) {
            console.error("❌ Simulation failed:", simulation.value.err)
            console.error("Simulation logs:", simulation.value.logs)
            throw new Error(`Transaction simulation failed: ${JSON.stringify(simulation.value.err)}. Check logs above.`)
          }
          console.log("✅ Simulation passed! Logs:", simulation.value.logs)
        } catch (simError: unknown) {
          console.error("❌ Simulation error:", simError)
          const error = simError instanceof Error ? simError : new Error(String(simError))
          if (error.message?.includes("Transaction simulation failed")) {
            throw error
          }
          throw new Error(`Simulation error: ${error.message || "Unknown error"}`)
        }

        toast.info("Approve Transaction 3/3", {
          description: "Initialize reactor"
        })
        console.log("Sending final transaction, please approve in wallet...")
        const initializeSignature = await sendTransaction(initTx, connection, {
          signers: [reactorKeypair],
          skipPreflight: false
        })

        console.log("✅ Initialize transaction signature:", initializeSignature)
        await connection.confirmTransaction({ signature: initializeSignature, ...initBlockhash }, "confirmed")
        console.log("✅ Reactor initialized successfully! 🎉")
        initSignature = initializeSignature
      } catch (error) {
        console.error("❌ Failed to initialize reactor:", error)
        throw new Error(`Failed to initialize reactor: ${error instanceof Error ? error.message : 'Unknown error'}`)
      }

      toast.success("Reactor deployed", {
        description: `Initialize signature: ${initSignature ?? 'unknown'}`
      })

      setCreatedReactor({
        baseMint: baseMintPk.toBase58(),
        reactor: reactorKeypair.publicKey.toBase58(),
        reactorAuthority: reactorAuthority.toBase58(),
        baseVault: baseVaultKeypair.publicKey.toBase58(),
        neutronMint: neutronMintKeypair.publicKey.toBase58(),
        protonMint: protonMintKeypair.publicKey.toBase58(),
        treasuryBaseAccount: treasuryBaseKeypair.publicKey.toBase58(),
        baseAssetName: form.baseAssetName.trim(),
        baseAssetSymbol: form.baseAssetSymbol.trim(),
        peggedAssetName: form.peggedAssetName.trim(),
        peggedAssetSymbol: form.peggedAssetSymbol.trim()
      })
      setForm({
        vaultName: "",
        baseAssetName: DEFAULT_BASE_ASSET_NAME,
        baseAssetSymbol: DEFAULT_BASE_ASSET_SYMBOL,
        peggedAssetName: DEFAULT_PEGGED_ASSET_NAME,
        peggedAssetSymbol: DEFAULT_PEGGED_ASSET_SYMBOL,
        baseMint: "",
        priceFeedId: "",
        fissionFeePercent: "0.5",
        fusionFeePercent: "0.5",
        criticalReserveRatio: "1.01"
      })
    } catch (caughtError: unknown) {
      console.error("Failed to deploy reactor - Full error:", caughtError)
      const error = caughtError instanceof Error ? caughtError : new Error(String(caughtError))
      console.error("Error name:", error.name)
      console.error("Error message:", error.message)
      console.error("Error stack:", error.stack)
      
      // Check for specific wallet errors
      if (error.message.includes("User rejected") || error.name === "WalletSignTransactionError") {
        toast.error("Transaction rejected", {
          description: "You rejected the transaction in your wallet"
        })
      } else if (error.message.includes("Wallet not connected")) {
        toast.error("Wallet not connected", {
          description: "Please connect your wallet and try again"
        })
      } else if (error.message.includes("insufficient funds")) {
        toast.error("Insufficient funds", {
          description: "You don't have enough SOL to create the reactor"
        })
      } else if (error.message.includes("Transaction too large")) {
        toast.error("Transaction too large", {
          description: "The transaction was split into multiple parts. This error shouldn't happen anymore - please try again."
        })
      } else {
        toast.error("Failed to deploy reactor", {
          description: error.message || "Check console for details"
        })
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div
      className="min-h-screen text-white"
      style={containerFontStyle}
    >
      <TargetCursor
        spinDuration={2}
        hideDefaultCursor={false}
        ignoreSelector=".cursor-normal, input, textarea, select, button, .cursor-text, [role='combobox']"
      />
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

      <div className="relative z-10 flex min-h-screen items-center justify-center px-4 py-16">
        <div className="w-full max-w-3xl mx-auto">
          <div className="relative overflow-hidden border border-white/25 bg-[#090B11]/85 shadow-[0_0_60px_rgba(0,0,0,0.65)] backdrop-blur-sm cursor-normal">
            <div className="flex items-center justify-between border-b border-white/20 bg-transparent px-8 py-6 uppercase tracking-[0.3em] text-xs text-white/60">
              <div className="flex items-center gap-4 text-white">
                <span className="text-sm font-bold text-[#8FF7FF]">{'//'}</span>
                <Shuffle
                  text="Create Your Reactor"
                  tag="span"
                  className="text-sm font-semibold"
                  shuffleDirection="right"
                  duration={0.3}
                  animationMode="random"
                  shuffleTimes={1}
                  ease="power3.out"
                  stagger={0.02}
                  threshold={0.1}
                  triggerOnce
                />
              </div>
              <div className="flex items-center gap-1">
                <span className="h-2 w-10 rounded-full border border-white/15 bg-white/10" />
                <span className="h-2 w-4 rounded-full border border-white/15 bg-white/5" />
              </div>
            </div>

            <div className="grid gap-10 px-8 py-10">
              {!connected && (
                <div className="flex items-center gap-3 border border-dashed border-white/30 bg-black/30 px-5 py-4 text-white/60">
                  <Wallet className="h-5 w-5" />
                  <span className="tracking-[0.2em] uppercase text-[11px]">
                    Connect your wallet to authorize deployment
                  </span>
                </div>
              )}

              <FormFields form={form} handleChange={handleChange} />

              <DeploySection
                connected={connected}
                isFormComplete={isFormComplete}
                isSubmitting={isSubmitting}
                onSubmit={() => {
                  console.log("Deploy Reactor button clicked")
                  console.log("Connected:", connected)
                  console.log("Public key:", publicKey?.toBase58())
                  console.log("Form complete:", isFormComplete)
                  console.log("Program initialized:", Boolean(program))
                  handleCreateReactor()
                }}
              />

              {createdReactor && <ReactorSummary createdReactor={createdReactor} />}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

type FormFieldsProps = {
  form: FormState
  handleChange: (field: keyof FormState) => (event: React.ChangeEvent<HTMLInputElement>) => void
}

function FormFields({ form, handleChange }: FormFieldsProps) {
  return (
    <div className="grid gap-8">
      <div className="space-y-2">
        <Label className="text-[11px] uppercase tracking-[0.4em] text-white/60">
          Vault Name
        </Label>
        <Input
          placeholder="Gold Backed Vault"
          value={form.vaultName}
          onChange={handleChange("vaultName")}
          className={inputClasses}
        />
      </div>

      <div className="space-y-2">
        <Label className="text-[11px] uppercase tracking-[0.4em] text-white/60">
          Base Mint (Collateral)
        </Label>
        <Input
          placeholder="So11111111111111111111111111111111111111112"
          value={form.baseMint}
          onChange={handleChange("baseMint")}
          className={`${inputClasses} font-mono`}
        />
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-2">
          <Label className="text-[11px] uppercase tracking-[0.4em] text-white/60">
            Base Asset Name
          </Label>
          <Input
            placeholder="USD Coin"
            value={form.baseAssetName}
            onChange={handleChange("baseAssetName")}
            className={inputClasses}
          />
        </div>
        <div className="space-y-2">
          <Label className="text-[11px] uppercase tracking-[0.4em] text-white/60">
            Base Asset Symbol
          </Label>
          <Input
            placeholder="USDC"
            value={form.baseAssetSymbol}
            onChange={handleChange("baseAssetSymbol")}
            className={inputClasses}
          />
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-2">
          <Label className="text-[11px] uppercase tracking-[0.4em] text-white/60">
            Pegged Asset Name
          </Label>
          <Input
            placeholder="Gluon Dollar"
            value={form.peggedAssetName}
            onChange={handleChange("peggedAssetName")}
            className={inputClasses}
          />
        </div>
        <div className="space-y-2">
          <Label className="text-[11px] uppercase tracking-[0.4em] text-white/60">
            Pegged Asset Symbol
          </Label>
          <Input
            placeholder="GLD"
            value={form.peggedAssetSymbol}
            onChange={handleChange("peggedAssetSymbol")}
            className={inputClasses}
          />
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-2">
          <Label className="text-[11px] uppercase tracking-[0.4em] text-white/60">
            Fission Fee (%)
          </Label>
          <Input
            placeholder="0.5"
            value={form.fissionFeePercent}
            onChange={handleChange("fissionFeePercent")}
            className={inputClasses}
          />
        </div>
        <div className="space-y-2">
          <Label className="text-[11px] uppercase tracking-[0.4em] text-white/60">
            Fusion Fee (%)
          </Label>
          <Input
            placeholder="0.5"
            value={form.fusionFeePercent}
            onChange={handleChange("fusionFeePercent")}
            className={inputClasses}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-[11px] uppercase tracking-[0.4em] text-white/60">
          Critical Reserve Ratio (r*)
        </Label>
        <Input
          placeholder="1.01"
          value={form.criticalReserveRatio}
          onChange={handleChange("criticalReserveRatio")}
          className={inputClasses}
        />
        <p className="text-[9px] text-white/40 tracking-[0.15em] mt-1">
          Must be &gt; 1.0 (Recommended: 1.01 = 101%)
        </p>
      </div>

      <div className="space-y-2">
        <Label className="text-[11px] uppercase tracking-[0.4em] text-white/60">
          Pyth Price Feed ID
        </Label>
        <Input
          placeholder="0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d"
          value={form.priceFeedId}
          onChange={handleChange("priceFeedId")}
          className={`${inputClasses} font-mono`}
        />
        <p className="text-[9px] text-white/40 tracking-[0.15em] mt-1">
          SOL/USD: 0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d
        </p>
      </div>
    </div>
  )
}

type DeploySectionProps = {
  connected: boolean
  isFormComplete: boolean
  isSubmitting: boolean
  onSubmit: () => void
}

function DeploySection({ connected, isFormComplete, isSubmitting, onSubmit }: DeploySectionProps) {
  const disabled = !connected || !isFormComplete || isSubmitting

  return (
    <div className="space-y-3">
      <Button
        size="lg"
        className="w-full h-14 rounded-none border border-white/60 bg-white text-black hover:bg-[#C6FFDD] hover:text-[#050608] transition-colors duration-200 uppercase tracking-[0.3em] text-xs cursor-pointer"
        disabled={disabled}
        onClick={onSubmit}
      >
        {isSubmitting ? (
          <>
            <div className="mr-2 h-5 w-5 animate-spin rounded-full border-b-2 border-black" />
            Deploying
          </>
        ) : (
          <>
            <Zap className="mr-2 h-5 w-5" />
            Deploy Reactor
          </>
        )}
      </Button>
      {!connected && (
        <p className="text-[11px] uppercase tracking-[0.3em] text-white/40 text-center">
          Connect your wallet to enable deployment.
        </p>
      )}
    </div>
  )
}

type ReactorSummaryProps = {
  createdReactor: CreatedReactor
}

function ReactorSummary({ createdReactor }: ReactorSummaryProps) {
  const summaryItems = [
    { label: "Reactor", value: createdReactor.reactor },
    { label: "Base Mint", value: createdReactor.baseMint },
    { label: "Reactor Authority", value: createdReactor.reactorAuthority },
    { label: "Base Vault", value: createdReactor.baseVault },
    { label: "Neutron Mint", value: createdReactor.neutronMint },
    { label: "Proton Mint", value: createdReactor.protonMint },
    { label: "Treasury Base Account", value: createdReactor.treasuryBaseAccount },
    {
      label: "Base Asset",
      value: createdReactor.baseAssetName
        ? `${createdReactor.baseAssetName} (${createdReactor.baseAssetSymbol || "—"})`
        : "—"
    },
    {
      label: "Pegged Asset",
      value: createdReactor.peggedAssetName
        ? `${createdReactor.peggedAssetName} (${createdReactor.peggedAssetSymbol || "—"})`
        : "—"
    }
  ]

  return (
    <div className="border border-[#34D399]/40 bg-[#10221A] px-5 py-4">
      <div className="flex items-center gap-3">
        <CheckCircle2 className="h-5 w-5 text-[#34D399]" />
        <div>
          <div className="text-[10px] uppercase tracking-[0.25em] text-[#34D399]">
            Reactor Deployed
          </div>
          <div className="mt-2 space-y-1 font-mono text-[11px] text-[#86EFAC] break-all">
            {summaryItems.map((item) => (
              <div key={item.label} className="flex flex-col">
                <span className="text-[9px] uppercase tracking-[0.2em] text-[#34D399]/70">
                  {item.label}
                </span>
                <span className="tracking-[0.05em]">{item.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
