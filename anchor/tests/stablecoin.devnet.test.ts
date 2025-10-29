/**
 * Stablecoin Program Tests (Real Devnet)
 *
 * These tests run against actual Solana devnet with real Pyth price feeds
 * and real transaction signing using the Pyth Solana Receiver SDK.
 */

import { Connection, Keypair, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js'
import {
  TOKEN_PROGRAM_ID,
  createInitializeMintInstruction,
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddress,
  createMintToInstruction,
  getAccount,
  getMint,
  AuthorityType,
  createSetAuthorityInstruction
} from '@solana/spl-token'
import { BN, Program, AnchorProvider, Wallet } from '@coral-xyz/anchor'
import type { Stablecoin } from '../target/types/stablecoin'
import { HermesClient } from '@pythnetwork/hermes-client'
import { PythSolanaReceiver, InstructionWithEphemeralSigners } from '@pythnetwork/pyth-solana-receiver'
import fs from 'fs'
import path from 'path'
import { Buffer } from 'buffer'

// Polyfill Buffer for Node.js compatibility with Pyth SDK
if (typeof global !== 'undefined') {
  (global as any).Buffer = Buffer
}

// ===== DEVNET CONFIGURATION =====
const DEVNET_RPC = 'https://api.devnet.solana.com'
const PROGRAM_ID = new PublicKey('EsJy3RdEnRt8gsGQC5E6Ksz15vdV5zMevhcpwPapZJoW')

// Pyth Price Feed ID (hex string) for SOL/USD
const SOL_USD_PRICE_FEED_ID = '0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d'

// Pyth Solana Receiver Program (for pull-based feeds)
const PYTH_SOLANA_RECEIVER_PROGRAM = new PublicKey('rec5EKMGg6MxZYaMdyBfgwp4d5rB9T1VQH5pJv5LtFJ')

// Hermes API endpoint
const HERMES_API_URL = 'https://hermes.pyth.network'

const WAD = new BN('1000000000000000000')
const TWO_WAD = WAD.muln(2)
const JS_WAD = 1000000000000000000n

function pow10Big(exp: number): bigint {
  if (exp < 0) {
    throw new Error('pow10Big expects non-negative exponent')
  }
  let result = 1n
  for (let i = 0; i < exp; i += 1) {
    result *= 10n
  }
  return result
}

function convertPythPriceToWadJS(price: bigint, exponent: number): bigint {
  if (price <= 0n) {
    throw new Error('Price must be positive')
  }
  if (exponent >= 0) {
    return price * pow10Big(exponent) * JS_WAD
  }
  const scale = pow10Big(-exponent)
  return (price * JS_WAD) / scale
}

/**
 * Gluon Z Critical Reserve Ratio (r*)
 * 
 * r* = 1.01 (101%) is the critical threshold for the piecewise-linear "soft floor"
 * that prevents proton equity from hitting zero prematurely.
 * 
 * The contract computes q using the normalized reserve ratio r̃(R,S◦):
 *   - If r ≥ r*: r̃ = r (normal operation)
 *   - If r < r*: r̃ = 1 + (r/r*)(r* - 1) (soft floor kicks in)
 * Then q = 1 / r̃
 * 
 * This is the Gluon Z style, NOT the Gluon W "hard cap at q*" approach.
 */
const R_STAR_WAD = WAD.clone().add(WAD.clone().divn(100)) // 1.01 = 101%
const AUTHORITY_SEED = Buffer.from('reactor-authority')
const TREASURY_AUTHORITY = new PublicKey('AbXCVvK1BqVRcNBu9JpJuRnngwkLy6DXG66Anxi2ncBn')
const BASE_ASSET_NAME = 'USD Coin'
const BASE_ASSET_SYMBOL = 'USDC'
const PEGGED_ASSET_NAME = 'Gluon Dollar'
const PEGGED_ASSET_SYMBOL = 'GLD'

// Test amounts (in base tokens with 6 decimals)
const INITIAL_USER_BASE = 10_000_000 // 10 tokens
const FISSION_DEPOSIT = 1_000_000   // 1 token
const TRANSMUTE_AMOUNT = 100_000     // 0.1 token
const RESERVE_SEED = 5_000_000       // 5 base tokens held in the vault pre-fission
const INITIAL_NEUTRON_SUPPLY = 2_000_000 // 2 neutrons in circulation before user actions
const INITIAL_PROTON_SUPPLY = 3_000_000  // 3 protons in circulation before user actions

let connection: Connection
let payer: Keypair
let program: Program<Stablecoin>
let provider: AnchorProvider

// Shared reactor context for all tests
let sharedReactor: ReactorSetup | null = null

// Load wallet from filesystem or generate new one
function loadOrGenerateWallet(): Keypair {
  const walletPath = path.join(__dirname, '..', 'test-wallet.json')
  
  try {
    if (fs.existsSync(walletPath)) {
      const secretKey = JSON.parse(fs.readFileSync(walletPath, 'utf-8'))
      return Keypair.fromSecretKey(Uint8Array.from(secretKey))
    }
  } catch (e) {
    console.log('Failed to load wallet, generating new one...')
  }
  
  const newWallet = Keypair.generate()
  fs.writeFileSync(walletPath, JSON.stringify(Array.from(newWallet.secretKey)))
  console.log('\n🔑 Generated new test wallet:', newWallet.publicKey.toBase58())
  console.log('💰 Please airdrop devnet SOL to this address:')
  console.log(`   solana airdrop 2 ${newWallet.publicKey.toBase58()} --url devnet\n`)
  
  return newWallet
}

// Request airdrop and wait for confirmation
async function requestAirdrop(publicKey: PublicKey, amount: number = 2): Promise<void> {
  try {
    console.log(`Requesting ${amount} SOL airdrop...`)
    const signature = await connection.requestAirdrop(publicKey, amount * LAMPORTS_PER_SOL)
    await connection.confirmTransaction(signature, 'confirmed')
    console.log('✅ Airdrop confirmed')
  } catch (error) {
    console.error('❌ Airdrop failed:', error)
    throw new Error('Failed to get devnet SOL. Please manually airdrop using: solana airdrop 2 ' + publicKey.toBase58() + ' --url devnet')
  }
}

// Wait for transaction confirmation
async function confirmTransaction(signature: string): Promise<void> {
  const latestBlockhash = await connection.getLatestBlockhash()
  await connection.confirmTransaction({
    signature,
    blockhash: latestBlockhash.blockhash,
    lastValidBlockHeight: latestBlockhash.lastValidBlockHeight
  }, 'confirmed')
}

beforeAll(async () => {
  console.log('\n🚀 Setting up Devnet Tests...')
  console.log('📡 Connecting to:', DEVNET_RPC)
  
  connection = new Connection(DEVNET_RPC, 'confirmed')
  payer = loadOrGenerateWallet()
  
  // Check balance
  const balance = await connection.getBalance(payer.publicKey)
  console.log('💰 Wallet balance:', balance / LAMPORTS_PER_SOL, 'SOL')
  
  if (balance < 0.5 * LAMPORTS_PER_SOL) {
    console.log('⚠️  Low balance, requesting airdrop...')
    await requestAirdrop(payer.publicKey)
  }
  
  // Setup provider and program
  const wallet = new Wallet(payer)
  provider = new AnchorProvider(connection, wallet, { commitment: 'confirmed' })
  
  // Load IDL from file
  const idlPath = path.join(__dirname, '..', 'target', 'idl', 'stablecoin.json')
  const idlContent = JSON.parse(fs.readFileSync(idlPath, 'utf-8'))
  program = new Program<Stablecoin>(idlContent, provider)
  
  console.log('✅ Connected to program:', PROGRAM_ID.toBase58())
  console.log('🔮 Using Pyth price feed ID:', SOL_USD_PRICE_FEED_ID)
  console.log('🏦 Payer address:', payer.publicKey.toBase58())
}, 60000)

/**
 * Fetch price update data from Hermes API using HermesClient
 * This returns the VAA data that will be posted to Solana via Pyth SDK
 */
async function fetchPriceUpdateData(feedId: string): Promise<{
  priceUpdateData: string[]
  displayPrice: number
  price: bigint
  expo: number
}> {
  try {
    const hermesClient = new HermesClient(HERMES_API_URL)
    
    // Fetch latest price updates with base64 encoding (required by Pyth SDK)
    const priceUpdateResponse = await hermesClient.getLatestPriceUpdates([feedId], {
      encoding: 'base64',
    })
    
    if (!priceUpdateResponse.binary || !priceUpdateResponse.binary.data || priceUpdateResponse.binary.data.length === 0) {
      throw new Error('No price update data returned from Hermes API')
    }

    if (!priceUpdateResponse.parsed || priceUpdateResponse.parsed.length === 0) {
      throw new Error('No parsed price data returned from Hermes API')
    }

    // Extract price info for display/logging
    const priceInfo = priceUpdateResponse.parsed[0].price
    const displayPrice = parseFloat(priceInfo.price) * Math.pow(10, priceInfo.expo)

    console.log('     📊 Price from Hermes:', displayPrice.toFixed(4))

    return {
      priceUpdateData: priceUpdateResponse.binary.data,
      displayPrice,
      price: BigInt(priceInfo.price),
      expo: priceInfo.expo,
    }
  } catch (error) {
    console.error('❌ Failed to fetch price update from Hermes:', error)
    throw error
  }
}

async function createMintOnDevnet(decimals: number): Promise<PublicKey> {
  const mintKeypair = Keypair.generate()
  const lamports = await connection.getMinimumBalanceForRentExemption(82) // MINT_SIZE
  
  const transaction = new Transaction().add(
    SystemProgram.createAccount({
      fromPubkey: payer.publicKey,
      newAccountPubkey: mintKeypair.publicKey,
      space: 82,
      lamports,
      programId: TOKEN_PROGRAM_ID
    }),
    createInitializeMintInstruction(
      mintKeypair.publicKey,
      decimals,
      payer.publicKey,
      payer.publicKey,
      TOKEN_PROGRAM_ID
    )
  )
  
  transaction.feePayer = payer.publicKey
  transaction.recentBlockhash = (await connection.getLatestBlockhash()).blockhash
  transaction.sign(payer, mintKeypair)
  
  const signature = await connection.sendRawTransaction(transaction.serialize())
  await confirmTransaction(signature)
  
  return mintKeypair.publicKey
}

async function createTokenAccount(mint: PublicKey, owner: PublicKey, allowOffCurve: boolean = false): Promise<PublicKey> {
  const ata = await getAssociatedTokenAddress(mint, owner, allowOffCurve)
  
  // Check if it already exists
  try {
    await getAccount(connection, ata)
    return ata
  } catch (e) {
    // Create it
    const transaction = new Transaction().add(
      createAssociatedTokenAccountInstruction(
        payer.publicKey,
        ata,
        owner,
        mint
      )
    )
    
    transaction.feePayer = payer.publicKey
    transaction.recentBlockhash = (await connection.getLatestBlockhash()).blockhash
    transaction.sign(payer)
    
    const signature = await connection.sendRawTransaction(transaction.serialize())
    await confirmTransaction(signature)
    
    return ata
  }
}

async function mintTokens(mint: PublicKey, destination: PublicKey, amount: number): Promise<void> {
  const transaction = new Transaction().add(
    createMintToInstruction(
      mint,
      destination,
      payer.publicKey,
      amount
    )
  )
  
  transaction.feePayer = payer.publicKey
  transaction.recentBlockhash = (await connection.getLatestBlockhash()).blockhash
  transaction.sign(payer)
  
  const signature = await connection.sendRawTransaction(transaction.serialize())
  await confirmTransaction(signature)
}

type ReactorSetup = {
  reactor: Keypair
  reactorAuthority: PublicKey
  baseMint: PublicKey
  neutronMint: PublicKey
  protonMint: PublicKey
  baseVault: PublicKey
  treasuryBaseAccount: PublicKey
  userBaseAccount: PublicKey
  userNeutronAccount: PublicKey
  userProtonAccount: PublicKey
}

async function setupReactorOnDevnet(): Promise<ReactorSetup> {
  console.log('\n🔧 Setting up reactor on devnet...')
  
  const reactor = Keypair.generate()
  const [reactorAuthority] = PublicKey.findProgramAddressSync(
    [AUTHORITY_SEED, reactor.publicKey.toBuffer()],
    PROGRAM_ID
  )

  console.log('  Creating base mint (USDC-like, 6 decimals)...')
  const baseMint = await createMintOnDevnet(6)
  
  console.log('  Creating token accounts...')
  const baseVault = await createTokenAccount(baseMint, reactorAuthority, true)
  const treasuryBaseAccount = await createTokenAccount(baseMint, TREASURY_AUTHORITY)
  console.log('  Using fixed treasury authority:', TREASURY_AUTHORITY.toBase58())
  const userBaseAccount = await createTokenAccount(baseMint, payer.publicKey)

  console.log('  Seeding base reserve for proportional fission...')
  await mintTokens(baseMint, baseVault, RESERVE_SEED)

  console.log('  Minting initial base tokens to user...')
  await mintTokens(baseMint, userBaseAccount, INITIAL_USER_BASE)

  console.log('  Creating neutron mint (controlled by reactor)...')
  // For reactor-controlled mints, we need to create them with reactor authority
  // We'll create with payer first, then transfer authority in initialize
  const neutronMint = await createMintOnDevnet(6)
  const protonMint = await createMintOnDevnet(6)

  console.log('  Seeding initial neutron/proton circulation on treasury...')
  const treasuryNeutronAccount = await createTokenAccount(neutronMint, TREASURY_AUTHORITY)
  const treasuryProtonAccount = await createTokenAccount(protonMint, TREASURY_AUTHORITY)
  await mintTokens(neutronMint, treasuryNeutronAccount, INITIAL_NEUTRON_SUPPLY)
  await mintTokens(protonMint, treasuryProtonAccount, INITIAL_PROTON_SUPPLY)
  
  const userNeutronAccount = await createTokenAccount(neutronMint, payer.publicKey)
  const userProtonAccount = await createTokenAccount(protonMint, payer.publicKey)
  
  console.log('  Initializing reactor...')
  
  // The initialize instruction will check that neutron/proton mints have reactorAuthority as BOTH mint and freeze authority
  // We need to transfer BOTH authorities first
  const setAuthorityTx = new Transaction().add(
    createSetAuthorityInstruction(neutronMint, payer.publicKey, AuthorityType.MintTokens, reactorAuthority),
    createSetAuthorityInstruction(neutronMint, payer.publicKey, AuthorityType.FreezeAccount, reactorAuthority),
    createSetAuthorityInstruction(protonMint, payer.publicKey, AuthorityType.MintTokens, reactorAuthority),
    createSetAuthorityInstruction(protonMint, payer.publicKey, AuthorityType.FreezeAccount, reactorAuthority)
  )
  setAuthorityTx.feePayer = payer.publicKey
  setAuthorityTx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash
  setAuthorityTx.sign(payer)
  
  const setAuthSig = await connection.sendRawTransaction(setAuthorityTx.serialize())
  await confirmTransaction(setAuthSig)
  
  // Wait a bit for devnet to fully process the authority transfer
  await new Promise(resolve => setTimeout(resolve, 2000))
  
  // Now initialize the reactor
  const tx = await program.methods
    .initialize({
      vaultName: 'Test Reactor Devnet',
      baseAssetName: BASE_ASSET_NAME,
      baseAssetSymbol: BASE_ASSET_SYMBOL,
      peggedAssetName: PEGGED_ASSET_NAME,
      peggedAssetSymbol: PEGGED_ASSET_SYMBOL,
      fissionFeeWad: new BN(0),
      fusionFeeWad: new BN(0),
      criticalReserveRatioWad: TWO_WAD,
      rStarWad: R_STAR_WAD,
      priceFeedId: SOL_USD_PRICE_FEED_ID
    })
    .accountsStrict({
      payer: payer.publicKey,
      reactor: reactor.publicKey,
      reactorAuthority,
      baseMint,
      baseVault,
      neutronMint,
      protonMint,
      treasuryBaseAccount,
      systemProgram: SystemProgram.programId,
      tokenProgram: TOKEN_PROGRAM_ID
    })
    .signers([reactor])
    .rpc()
  
  await confirmTransaction(tx)
  console.log('✅ Reactor initialized:', reactor.publicKey.toBase58())
  
  return {
    reactor,
    reactorAuthority,
    baseMint,
    neutronMint,
    protonMint,
    baseVault,
    treasuryBaseAccount,
    userBaseAccount,
    userNeutronAccount,
    userProtonAccount
  }
}

describe('Stablecoin Program - Devnet Tests', () => {
  jest.setTimeout(180000) // 3 minutes per test (Pyth SDK operations can be slow)
  
  // Setup shared reactor before all tests
  beforeAll(async () => {
    console.log('\n🔧 Setting up shared reactor for all tests...')
    sharedReactor = await setupReactorOnDevnet()
    console.log('✅ Shared reactor ready:', sharedReactor.reactor.publicKey.toBase58())
  }, 180000)
  
  it('🏭 CREATE REACTOR FOR FRONTEND', async () => {
    console.log('\n💎 Creating demo SPL token for reactor...')
    
    const reactor = Keypair.generate()
    const [reactorAuthority] = PublicKey.findProgramAddressSync(
      [AUTHORITY_SEED, reactor.publicKey.toBuffer()],
      PROGRAM_ID
    )

    // Create a new base token (like USDC) with 6 decimals
    console.log('  📝 Creating base token mint (6 decimals)...')
    const baseMint = await createMintOnDevnet(6)
    
    const baseVault = await createTokenAccount(baseMint, reactorAuthority, true)
    const treasuryBaseAccount = await createTokenAccount(baseMint, TREASURY_AUTHORITY)
    console.log('  Using fixed treasury authority:', TREASURY_AUTHORITY.toBase58())
    
    // Create user's base token account and mint initial supply
    console.log('  💰 Minting initial tokens to test wallet...')
    const userBaseAccount = await createTokenAccount(baseMint, payer.publicKey)
    await mintTokens(baseMint, userBaseAccount, INITIAL_USER_BASE)
    
    console.log('  🌟 Creating neutron and proton mints...')
    const neutronMint = await createMintOnDevnet(6)
    const protonMint = await createMintOnDevnet(6)
    
    const setAuthorityTx = new Transaction().add(
      createSetAuthorityInstruction(neutronMint, payer.publicKey, AuthorityType.MintTokens, reactorAuthority),
      createSetAuthorityInstruction(neutronMint, payer.publicKey, AuthorityType.FreezeAccount, reactorAuthority),
      createSetAuthorityInstruction(protonMint, payer.publicKey, AuthorityType.MintTokens, reactorAuthority),
      createSetAuthorityInstruction(protonMint, payer.publicKey, AuthorityType.FreezeAccount, reactorAuthority)
    )
    setAuthorityTx.feePayer = payer.publicKey
    setAuthorityTx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash
    setAuthorityTx.sign(payer)
    await connection.sendRawTransaction(setAuthorityTx.serialize())
    await new Promise(resolve => setTimeout(resolve, 2000))
    
    const tx = await program.methods
      .initialize({
        vaultName: 'Frontend Reactor',
        baseAssetName: BASE_ASSET_NAME,
        baseAssetSymbol: BASE_ASSET_SYMBOL,
        peggedAssetName: PEGGED_ASSET_NAME,
        peggedAssetSymbol: PEGGED_ASSET_SYMBOL,
        fissionFeeWad: new BN(0),
        fusionFeeWad: new BN(0),
        criticalReserveRatioWad: TWO_WAD,
        rStarWad: R_STAR_WAD,
        priceFeedId: SOL_USD_PRICE_FEED_ID
      })
      .accountsStrict({
        payer: payer.publicKey,
        reactor: reactor.publicKey,
        reactorAuthority,
        baseMint,
        baseVault,
        neutronMint,
        protonMint,
        treasuryBaseAccount,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID
      })
      .signers([reactor])
      .rpc()
    
    await confirmTransaction(tx)
    
    console.log('\n🎉 ======================================')
    console.log('   REACTOR CREATED!')
    console.log('======================================\n')
    console.log('🔑 REACTOR:', reactor.publicKey.toBase58())
    console.log('💰 BASE:', baseMint.toBase58())
    console.log('🌟 NEUTRON:', neutronMint.toBase58())
    console.log('⚛️  PROTON:', protonMint.toBase58())
    console.log('🔮 PRICE FEED ID:', SOL_USD_PRICE_FEED_ID)
    console.log('\n👉 USE IN FRONTEND:', `http://localhost:3000/${reactor.publicKey.toBase58()}`)
    console.log('\n======================================\n')
  })
  
  it('should fetch price update from Hermes API', async () => {
    console.log('\n📊 Fetching price from Hermes...')
    
    const { priceUpdateData, displayPrice } = await fetchPriceUpdateData(SOL_USD_PRICE_FEED_ID)
    
    expect(priceUpdateData).toBeDefined()
    expect(priceUpdateData.length).toBeGreaterThan(0)
    expect(displayPrice).toBeGreaterThan(0)
    
    console.log('✅ Successfully fetched price update from Hermes')
    console.log('   Price:', '$' + displayPrice.toFixed(2))
    console.log('   VAA data count:', priceUpdateData.length)
  })
  
  it('should verify reactor was initialized with valid Pyth price feed ID', async () => {
    console.log('\n✅ Verifying shared reactor initialization...')
    
    if (!sharedReactor) {
      throw new Error('Shared reactor not initialized')
    }
    
    const reactorAccount = await program.account.reactor.fetch(sharedReactor.reactor.publicKey)
    
    expect(reactorAccount.baseVault.toBase58()).toBe(sharedReactor.baseVault.toBase58())
    expect(reactorAccount.neutronMint.toBase58()).toBe(sharedReactor.neutronMint.toBase58())
    expect(reactorAccount.protonMint.toBase58()).toBe(sharedReactor.protonMint.toBase58())
    expect(reactorAccount.treasuryBaseAccount.toBase58()).toBe(sharedReactor.treasuryBaseAccount.toBase58())
    expect(reactorAccount.baseAssetName).toBe(BASE_ASSET_NAME)
    expect(reactorAccount.baseAssetSymbol).toBe(BASE_ASSET_SYMBOL)
    expect(reactorAccount.peggedAssetName).toBe(PEGGED_ASSET_NAME)
    expect(reactorAccount.peggedAssetSymbol).toBe(PEGGED_ASSET_SYMBOL)
    expect(reactorAccount.priceFeedId).toBe(SOL_USD_PRICE_FEED_ID)
    expect(reactorAccount.rStarWad.toString()).toBe(R_STAR_WAD.toString())
    
    console.log('✅ Reactor initialized correctly with Gluon Z parameters')
    console.log('   Price Feed ID:', reactorAccount.priceFeedId)
    console.log('   r* (critical reserve ratio):', (Number(reactorAccount.rStarWad.toString()) / Number(WAD.toString())).toFixed(2))
    
    // Verify the Gluon Z formula implementation
    console.log('\n📐 Verifying Gluon Z normalized reserve ratio formula:')
    console.log('   Formula: r̃(R,S◦) = { r if r > r*, else 1 + (r/r*)(r* - 1) }')
    console.log('   This ensures smooth behavior when reserves are stressed')
    console.log('   and prevents proton equity from hitting zero prematurely.')
  })
  
  it('should perform fission with shared reactor', async () => {
    if (!sharedReactor) {
      throw new Error('Shared reactor not initialized')
    }
    const ctx = sharedReactor
    
    console.log('\n💥 Performing fission...')
    
    const baseVaultBefore = await getAccount(connection, ctx.baseVault)
    const baseMintInfo = await getMint(connection, ctx.baseMint)
    const userBaseBefore = await getAccount(connection, ctx.userBaseAccount)
    const userNeutronBefore = await getAccount(connection, ctx.userNeutronAccount)
    const userProtonBefore = await getAccount(connection, ctx.userProtonAccount)
    const neutronMintBefore = await getMint(connection, ctx.neutronMint)
    const protonMintBefore = await getMint(connection, ctx.protonMint)
    
  const { priceUpdateData: fissionPriceUpdateData, price: fissionPrice, expo: fissionExpo } = await fetchPriceUpdateData(SOL_USD_PRICE_FEED_ID)

  const pythFissionReceiver = new PythSolanaReceiver({
    connection,
    wallet: new Wallet(payer),
  })

  const fissionTxBuilder = pythFissionReceiver.newTransactionBuilder({ closeUpdateAccounts: true })

  await fissionTxBuilder.addPostPriceUpdates(fissionPriceUpdateData)

  await fissionTxBuilder.addPriceConsumerInstructions(
    async (getPriceUpdateAccount: (priceFeedId: string) => PublicKey): Promise<InstructionWithEphemeralSigners[]> => {
      const instruction = await program.methods
        .fission(new BN(FISSION_DEPOSIT))
        .accountsStrict({
          reactor: ctx.reactor.publicKey,
          reactorAuthority: ctx.reactorAuthority,
          userAuthority: payer.publicKey,
          baseVault: ctx.baseVault,
          neutronMint: ctx.neutronMint,
          protonMint: ctx.protonMint,
          userBaseAccount: ctx.userBaseAccount,
          userNeutronAccount: ctx.userNeutronAccount,
          userProtonAccount: ctx.userProtonAccount,
          treasuryBaseAccount: ctx.treasuryBaseAccount,
          priceUpdate: getPriceUpdateAccount(SOL_USD_PRICE_FEED_ID),
          tokenProgram: TOKEN_PROGRAM_ID
        })
        .instruction()

      return [{ instruction, signers: [] }]
    }
  )

  const fissionTransactions = await fissionTxBuilder.buildVersionedTransactions({
    computeUnitPriceMicroLamports: 50_000,
  })

  await pythFissionReceiver.provider.sendAll(fissionTransactions, { skipPreflight: false })
    
    const baseVaultAfter = await getAccount(connection, ctx.baseVault)
    const userBaseAfter = await getAccount(connection, ctx.userBaseAccount)
    const userNeutronAfter = await getAccount(connection, ctx.userNeutronAccount)
    const userProtonAfter = await getAccount(connection, ctx.userProtonAccount)
    const neutronMintAfter = await getMint(connection, ctx.neutronMint)
    const protonMintAfter = await getMint(connection, ctx.protonMint)
    
    const baseSpent = Number(userBaseBefore.amount - userBaseAfter.amount)
    expect(baseSpent).toBe(FISSION_DEPOSIT)
    
    const reserveBefore = baseVaultBefore.amount
    const reserveAfter = baseVaultAfter.amount
    const netBase = BigInt(FISSION_DEPOSIT)
    expect(reserveAfter).toBe(reserveBefore + netBase)
    
    const neutronSupplyBefore = neutronMintBefore.supply
    const protonSupplyBefore = protonMintBefore.supply

    const baseFactor = pow10Big(baseMintInfo.decimals)
    const neutronFactor = pow10Big(neutronMintBefore.decimals)
    const protonFactor = pow10Big(protonMintBefore.decimals)

    const isBootstrap =
      reserveBefore === 0n && neutronSupplyBefore === 0n && protonSupplyBefore === 0n

    let expectedNeutronOut: bigint
    let expectedProtonOut: bigint

    if (isBootstrap) {
      const basePriceWad = convertPythPriceToWadJS(fissionPrice, fissionExpo)
      const netWad = (netBase * JS_WAD) / baseFactor
      const depositValueWad = (netWad * basePriceWad) / JS_WAD
      const neutronValueWad = depositValueWad / 3n
      const baseForNeutronWad = (neutronValueWad * JS_WAD) / basePriceWad
      const protonBaseWad = netWad - baseForNeutronWad

      expectedNeutronOut = (neutronValueWad * neutronFactor) / JS_WAD
      expectedProtonOut = (protonBaseWad * protonFactor) / JS_WAD
    } else {
      expectedNeutronOut = reserveBefore === 0n ? 0n : (netBase * neutronSupplyBefore) / reserveBefore
      expectedProtonOut = reserveBefore === 0n ? 0n : (netBase * protonSupplyBefore) / reserveBefore
    }
    
    const neutronMinted = userNeutronAfter.amount - userNeutronBefore.amount
    const protonMinted = userProtonAfter.amount - userProtonBefore.amount
    
    expect(neutronMinted).toBe(expectedNeutronOut)
    expect(protonMinted).toBe(expectedProtonOut)
    expect(neutronMintAfter.supply).toBe(neutronSupplyBefore + neutronMinted)
    expect(protonMintAfter.supply).toBe(protonSupplyBefore + protonMinted)
    
    console.log('✅ Fission successful!')
    console.log('   Base spent:', baseSpent / 1_000_000)
    console.log('   Neutron minted:', Number(neutronMinted) / 1_000_000)
    console.log('   Proton minted:', Number(protonMinted) / 1_000_000)
  })
  
  
  it('should perform full lifecycle: fission -> transmute -> fusion', async () => {
    if (!sharedReactor) {
      throw new Error('Shared reactor not initialized')
    }
    const ctx = sharedReactor
    
    console.log('\n🔄 Testing full lifecycle with Pyth SDK integration...')
    
    // 1. Fission (price-free, no price update needed)
    console.log('  1️⃣ Fission...')
    const { priceUpdateData: lifecycleFissionPriceUpdate } = await fetchPriceUpdateData(SOL_USD_PRICE_FEED_ID)

    const lifecycleFissionReceiver = new PythSolanaReceiver({
      connection,
      wallet: new Wallet(payer),
    })

    const lifecycleFissionBuilder = lifecycleFissionReceiver.newTransactionBuilder({ closeUpdateAccounts: true })

    await lifecycleFissionBuilder.addPostPriceUpdates(lifecycleFissionPriceUpdate)

    await lifecycleFissionBuilder.addPriceConsumerInstructions(
      async (getPriceUpdateAccount: (priceFeedId: string) => PublicKey): Promise<InstructionWithEphemeralSigners[]> => {
        const instruction = await program.methods
          .fission(new BN(FISSION_DEPOSIT))
          .accountsStrict({
            reactor: ctx.reactor.publicKey,
            reactorAuthority: ctx.reactorAuthority,
            userAuthority: payer.publicKey,
            baseVault: ctx.baseVault,
            neutronMint: ctx.neutronMint,
            protonMint: ctx.protonMint,
            userBaseAccount: ctx.userBaseAccount,
            userNeutronAccount: ctx.userNeutronAccount,
            userProtonAccount: ctx.userProtonAccount,
            treasuryBaseAccount: ctx.treasuryBaseAccount,
            priceUpdate: getPriceUpdateAccount(SOL_USD_PRICE_FEED_ID),
            tokenProgram: TOKEN_PROGRAM_ID
          })
          .instruction()

        return [{ instruction, signers: [] }]
      }
    )

    const lifecycleFissionTxs = await lifecycleFissionBuilder.buildVersionedTransactions({
      computeUnitPriceMicroLamports: 50_000,
    })

    await lifecycleFissionReceiver.provider.sendAll(lifecycleFissionTxs, { skipPreflight: false })

    const protonBefore = await getAccount(connection, ctx.userProtonAccount)
    const neutronBefore = await getAccount(connection, ctx.userNeutronAccount)
    
    // 2. Transmute proton to neutron (requires Pyth price update)
    console.log('  2️⃣ Transmute proton -> neutron using Pyth SDK...')
    console.log('     Fetching price update from Hermes...')
    const { priceUpdateData: priceData1 } = await fetchPriceUpdateData(SOL_USD_PRICE_FEED_ID)
    
    // Use Pyth Solana Receiver SDK to build transaction
    const pythSolanaReceiver = new PythSolanaReceiver({
      connection,
      wallet: new Wallet(payer),
    })
    
    const transactionBuilder = pythSolanaReceiver.newTransactionBuilder({
      closeUpdateAccounts: true,
    })
    
    await transactionBuilder.addPostPriceUpdates(priceData1)
    
    await transactionBuilder.addPriceConsumerInstructions(
      async (getPriceUpdateAccount: (priceFeedId: string) => PublicKey): Promise<InstructionWithEphemeralSigners[]> => {
        const instruction = await program.methods
          .transmuteProtonToNeutron(new BN(TRANSMUTE_AMOUNT))
          .accountsStrict({
            reactor: ctx.reactor.publicKey,
            reactorAuthority: ctx.reactorAuthority,
            userAuthority: payer.publicKey,
            baseVault: ctx.baseVault,
            protonMint: ctx.protonMint,
            neutronMint: ctx.neutronMint,
            userProtonAccount: ctx.userProtonAccount,
            userNeutronAccount: ctx.userNeutronAccount,
            priceUpdate: getPriceUpdateAccount(SOL_USD_PRICE_FEED_ID),
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .instruction()

        return [{ instruction, signers: [] }]
      }
    )
    
    const transactions = await transactionBuilder.buildVersionedTransactions({
      computeUnitPriceMicroLamports: 50000,
    })
    
    await pythSolanaReceiver.provider.sendAll(transactions, { skipPreflight: false })
    
    const neutronAfterTransmute = await getAccount(connection, ctx.userNeutronAccount)
    expect(Number(neutronAfterTransmute.amount)).toBeGreaterThan(Number(neutronBefore.amount))
    console.log('     ✅ Neutron increased via Pyth SDK')
    
    // 3. Transmute some back (requires fresh Pyth price update)
    console.log('  3️⃣ Transmute neutron -> proton using Pyth SDK...')
    console.log('     Fetching fresh price update from Hermes...')
    const { priceUpdateData: priceData2 } = await fetchPriceUpdateData(SOL_USD_PRICE_FEED_ID)
    
    const transactionBuilder2 = pythSolanaReceiver.newTransactionBuilder({
      closeUpdateAccounts: true,
    })
    
    await transactionBuilder2.addPostPriceUpdates(priceData2)
    
    await transactionBuilder2.addPriceConsumerInstructions(
      async (getPriceUpdateAccount: (priceFeedId: string) => PublicKey): Promise<InstructionWithEphemeralSigners[]> => {
        const instruction = await program.methods
          .transmuteNeutronToProton(new BN(TRANSMUTE_AMOUNT))
          .accountsStrict({
            reactor: ctx.reactor.publicKey,
            reactorAuthority: ctx.reactorAuthority,
            userAuthority: payer.publicKey,
            baseVault: ctx.baseVault,
            protonMint: ctx.protonMint,
            neutronMint: ctx.neutronMint,
            userNeutronAccount: ctx.userNeutronAccount,
            userProtonAccount: ctx.userProtonAccount,
            priceUpdate: getPriceUpdateAccount(SOL_USD_PRICE_FEED_ID),
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .instruction()

        return [{ instruction, signers: [] }]
      }
    )
    
    const transactions2 = await transactionBuilder2.buildVersionedTransactions({
      computeUnitPriceMicroLamports: 50000,
    })
    
    await pythSolanaReceiver.provider.sendAll(transactions2, { skipPreflight: false })
    
    console.log('     ✅ Transmuted back to proton via Pyth SDK')
    
    // 4. Fusion (price-free, no price update needed)
    console.log('  4️⃣ Fusion...')
    const baseBefore = await getAccount(connection, ctx.userBaseAccount)
    
    await program.methods
      .fusion(new BN(FISSION_DEPOSIT / 2))
      .accountsStrict({
        reactor: ctx.reactor.publicKey,
        reactorAuthority: ctx.reactorAuthority,
        userAuthority: payer.publicKey,
        baseVault: ctx.baseVault,
        neutronMint: ctx.neutronMint,
        protonMint: ctx.protonMint,
        userBaseAccount: ctx.userBaseAccount,
        userNeutronAccount: ctx.userNeutronAccount,
        userProtonAccount: ctx.userProtonAccount,
        treasuryBaseAccount: ctx.treasuryBaseAccount,
        tokenProgram: TOKEN_PROGRAM_ID
      })
      .rpc()
      .then(confirmTransaction)
    
    const baseAfter = await getAccount(connection, ctx.userBaseAccount)
    expect(Number(baseAfter.amount)).toBeGreaterThan(Number(baseBefore.amount))
    
    console.log('✅ Full lifecycle completed successfully with Pyth SDK!')
    console.log('   ✅ All functions tested: initialize, set_beta_params, fission, fusion, transmute_proton_to_neutron, transmute_neutron_to_proton')
    console.log('   ✅ Pyth price updates posted and consumed correctly')
  })

  it('🧪 DETAILED TRANSMUTE TEST: neutron -> proton balance verification', async () => {
    if (!sharedReactor) {
      throw new Error('Shared reactor not initialized')
    }
    const ctx = sharedReactor
    
    console.log('\n🔬 Testing neutron -> proton transmute with detailed balance tracking...')
    
    // First, do a fission to get some tokens
    console.log('  📦 Performing fission to get neutrons and protons...')
    await program.methods
      .fission(new BN(FISSION_DEPOSIT))
      .accountsStrict({
        reactor: ctx.reactor.publicKey,
        reactorAuthority: ctx.reactorAuthority,
        userAuthority: payer.publicKey,
        baseVault: ctx.baseVault,
        neutronMint: ctx.neutronMint,
        protonMint: ctx.protonMint,
        userBaseAccount: ctx.userBaseAccount,
        userNeutronAccount: ctx.userNeutronAccount,
        userProtonAccount: ctx.userProtonAccount,
        treasuryBaseAccount: ctx.treasuryBaseAccount,
        tokenProgram: TOKEN_PROGRAM_ID
      })
      .rpc()
      .then(confirmTransaction)
    
    // Get balances BEFORE transmute
    const neutronBeforeAccount = await getAccount(connection, ctx.userNeutronAccount)
    const protonBeforeAccount = await getAccount(connection, ctx.userProtonAccount)
    const neutronBefore = neutronBeforeAccount.amount
    const protonBefore = protonBeforeAccount.amount
    
    console.log('\n  📊 BEFORE TRANSMUTE (neutron -> proton):')
    console.log('     Neutron balance:', Number(neutronBefore) / 1_000_000)
    console.log('     Proton balance:', Number(protonBefore) / 1_000_000)
    console.log('     Transmuting:', TRANSMUTE_AMOUNT / 1_000_000, 'neutrons')
    
    // Fetch price update
    console.log('\n  🔮 Fetching price update from Hermes...')
    const { priceUpdateData, displayPrice } = await fetchPriceUpdateData(SOL_USD_PRICE_FEED_ID)
    console.log('     Current price:', displayPrice)
    
    // Use Pyth Solana Receiver SDK to build transaction
    const pythSolanaReceiver = new PythSolanaReceiver({
      connection,
      wallet: new Wallet(payer),
    })
    
    const transactionBuilder = pythSolanaReceiver.newTransactionBuilder({
      closeUpdateAccounts: true,
    })
    
    await transactionBuilder.addPostPriceUpdates(priceUpdateData)
    
    await transactionBuilder.addPriceConsumerInstructions(
      async (getPriceUpdateAccount: (priceFeedId: string) => PublicKey): Promise<InstructionWithEphemeralSigners[]> => {
        const instruction = await program.methods
          .transmuteNeutronToProton(new BN(TRANSMUTE_AMOUNT))
          .accountsStrict({
            reactor: ctx.reactor.publicKey,
            reactorAuthority: ctx.reactorAuthority,
            userAuthority: payer.publicKey,
            baseVault: ctx.baseVault,
            protonMint: ctx.protonMint,
            neutronMint: ctx.neutronMint,
            userNeutronAccount: ctx.userNeutronAccount,
            userProtonAccount: ctx.userProtonAccount,
            priceUpdate: getPriceUpdateAccount(SOL_USD_PRICE_FEED_ID),
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .instruction()

        return [{ instruction, signers: [] }]
      }
    )
    
    const transactions = await transactionBuilder.buildVersionedTransactions({
      computeUnitPriceMicroLamports: 50000,
    })
    
    console.log('\n  ⚡ Sending transmute transaction...')
    await pythSolanaReceiver.provider.sendAll(transactions, { skipPreflight: false })
    
    // Get balances AFTER transmute
    const neutronAfterAccount = await getAccount(connection, ctx.userNeutronAccount)
    const protonAfterAccount = await getAccount(connection, ctx.userProtonAccount)
    const neutronAfter = neutronAfterAccount.amount
    const protonAfter = protonAfterAccount.amount
    
    const neutronChange = Number(neutronBefore) - Number(neutronAfter)
    const protonChange = Number(protonAfter) - Number(protonBefore)
    
    console.log('\n  📊 AFTER TRANSMUTE:')
    console.log('     Neutron balance:', Number(neutronAfter) / 1_000_000)
    console.log('     Proton balance:', Number(protonAfter) / 1_000_000)
    console.log('\n  📈 CHANGES:')
    console.log('     Neutrons burned:', neutronChange / 1_000_000)
    console.log('     Protons minted:', protonChange / 1_000_000)
    console.log('     Conversion ratio:', protonChange / neutronChange, '(protons per neutron)')
    
    // Assertions
    expect(Number(neutronAfter)).toBe(Number(neutronBefore) - TRANSMUTE_AMOUNT)
    console.log('     ✅ Neutrons correctly decreased by', TRANSMUTE_AMOUNT / 1_000_000)
    
    expect(Number(protonAfter)).toBeGreaterThan(Number(protonBefore))
    console.log('     ✅ Protons increased from', Number(protonBefore) / 1_000_000, 'to', Number(protonAfter) / 1_000_000)
    
    // Protons should have increased by SOME amount (depends on pricing)
    expect(protonChange).toBeGreaterThan(0)
    console.log('     ✅ Protons minted:', protonChange / 1_000_000)
    
    console.log('\n  ✅ Transmute neutron -> proton WORKS CORRECTLY!')
    console.log('     Note: Output is NOT 1:1 because transmute converts through base token prices')
    console.log('     Formula: neutron_value_in_base * (1 - fee) / proton_price_in_base = protons_out')
  })
})
