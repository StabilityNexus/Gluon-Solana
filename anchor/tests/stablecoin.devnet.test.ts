/**
 * Stablecoin Program Tests (Real Devnet)
 *
 * These tests run against actual Solana devnet with real Pyth price feeds
 * and real transaction signing. Tests will fail if price feeds are invalid.
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
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID
} from '@solana/spl-token'
import { BN, Program, AnchorProvider, Wallet } from '@coral-xyz/anchor'
import type { Stablecoin } from '../target/types/stablecoin'
import fs from 'fs'
import path from 'path'

// ===== DEVNET CONFIGURATION =====
const DEVNET_RPC = 'https://api.devnet.solana.com'
const PROGRAM_ID = new PublicKey('3Ad1BL6hdFP4ndQ3dKhFbLp56roCK76gs3mvVNJHPdYY')

// Pyth Devnet Price Feeds
// SOL/USD price feed on devnet
const SOL_USD_PRICE_FEED = new PublicKey('J83w4HKfqxwcq3BEMMkPFSppX3gqekLyLJBexebFVkix')
// Pyth Oracle Program on Devnet
const PYTH_ORACLE_PROGRAM = new PublicKey('gSbePebfvPy7tRqimPoVecS2UsBvYv46ynrzWocc92s')

const WAD = new BN('1000000000000000000')
const TWO_WAD = WAD.muln(2)
const AUTHORITY_SEED = Buffer.from('reactor-authority')

// Test amounts (in base tokens with 6 decimals)
const INITIAL_USER_BASE = 10_000_000 // 10 tokens
const FISSION_DEPOSIT = 1_000_000   // 1 token
const TRANSMUTE_AMOUNT = 100_000     // 0.1 token

let connection: Connection
let payer: Keypair
let program: Program<Stablecoin>
let provider: AnchorProvider

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
  console.log('🔮 Using Pyth price feed:', SOL_USD_PRICE_FEED.toBase58())
  console.log('🏦 Payer address:', payer.publicKey.toBase58())
}, 60000)

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
  treasuryAuthority: Keypair
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
  
  const treasuryAuthority = Keypair.generate()
  
  console.log('  Creating base mint (USDC-like, 6 decimals)...')
  const baseMint = await createMintOnDevnet(6)
  
  console.log('  Creating token accounts...')
  const baseVault = await createTokenAccount(baseMint, reactorAuthority)
  const treasuryBaseAccount = await createTokenAccount(baseMint, treasuryAuthority.publicKey)
  const userBaseAccount = await createTokenAccount(baseMint, payer.publicKey)
  
  console.log('  Minting initial base tokens to user...')
  await mintTokens(baseMint, userBaseAccount, INITIAL_USER_BASE)
  
  console.log('  Creating neutron mint (controlled by reactor)...')
  // For reactor-controlled mints, we need to create them with reactor authority
  // We'll create with payer first, then transfer authority in initialize
  const neutronMint = await createMintOnDevnet(6)
  const protonMint = await createMintOnDevnet(6)
  
  const userNeutronAccount = await createTokenAccount(neutronMint, payer.publicKey)
  const userProtonAccount = await createTokenAccount(protonMint, payer.publicKey)
  
  console.log('  Initializing reactor...')
  
  // The initialize instruction will check that neutron/proton mints have reactorAuthority as mint authority
  // We need to transfer mint authority first
  const setAuthorityIx1 = await import('@solana/spl-token').then(m => 
    m.createSetAuthorityInstruction(
      neutronMint,
      payer.publicKey,
      m.AuthorityType.MintTokens,
      reactorAuthority
    )
  )
  const setAuthorityIx2 = await import('@solana/spl-token').then(m =>
    m.createSetAuthorityInstruction(
      protonMint,
      payer.publicKey,
      m.AuthorityType.MintTokens,
      reactorAuthority
    )
  )
  
  const setAuthorityTx = new Transaction().add(setAuthorityIx1, setAuthorityIx2)
  setAuthorityTx.feePayer = payer.publicKey
  setAuthorityTx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash
  setAuthorityTx.sign(payer)
  
  const setAuthSig = await connection.sendRawTransaction(setAuthorityTx.serialize())
  await confirmTransaction(setAuthSig)
  
  // Now initialize the reactor
  const tx = await program.methods
    .initialize({
      vaultName: 'Test Reactor Devnet',
      fissionFeeWad: new BN(0),
      fusionFeeWad: new BN(0),
      targetReserveRatioWad: TWO_WAD,
      priceFeed: SOL_USD_PRICE_FEED,
      oracleProgram: PYTH_ORACLE_PROGRAM
    })
    .accountsStrict({
      payer: payer.publicKey,
      reactor: reactor.publicKey,
      reactorAuthority,
      baseMint,
      baseVault,
      neutronMint,
      protonMint,
      priceFeed: SOL_USD_PRICE_FEED,
      treasuryAuthority: treasuryAuthority.publicKey,
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
    treasuryAuthority,
    treasuryBaseAccount,
    userBaseAccount,
    userNeutronAccount,
    userProtonAccount
  }
}

describe('Stablecoin Program - Devnet Tests', () => {
  jest.setTimeout(120000) // 2 minutes per test
  
  it('🏭 CREATE REACTOR FOR FRONTEND', async () => {
    const YOUR_BASE_TOKEN = new PublicKey('E1eH9uxFaJjKqPQPmjWjW1jVKH1LWsdBfY4QaQtyvxiw')
    const reactor = Keypair.generate()
    const [reactorAuthority] = PublicKey.findProgramAddressSync(
      [AUTHORITY_SEED, reactor.publicKey.toBuffer()],
      PROGRAM_ID
    )
    
    const treasuryAuthority = Keypair.generate()
    const baseMint = YOUR_BASE_TOKEN
    const baseVault = await createTokenAccount(baseMint, reactorAuthority, true)
    const treasuryBaseAccount = await createTokenAccount(baseMint, treasuryAuthority.publicKey)
    
    const neutronMint = await createMintOnDevnet(6)
    const protonMint = await createMintOnDevnet(6)
    
    const { AuthorityType, createSetAuthorityInstruction } = await import('@solana/spl-token')
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
        fissionFeeWad: new BN(0),
        fusionFeeWad: new BN(0),
        targetReserveRatioWad: TWO_WAD,
        priceFeed: SOL_USD_PRICE_FEED,
        oracleProgram: PYTH_ORACLE_PROGRAM
      })
      .accountsStrict({
        payer: payer.publicKey,
        reactor: reactor.publicKey,
        reactorAuthority,
        baseMint,
        baseVault,
        neutronMint,
        protonMint,
        priceFeed: SOL_USD_PRICE_FEED,
        treasuryAuthority: treasuryAuthority.publicKey,
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
    console.log('\n👉 USE IN FRONTEND:', `http://localhost:3000/${reactor.publicKey.toBase58()}`)
    console.log('\n======================================\n')
  })
  
  it('should verify Pyth price feed is valid and accessible', async () => {
    console.log('\n📊 Checking Pyth price feed...')
    
    const priceAccount = await connection.getAccountInfo(SOL_USD_PRICE_FEED)
    
    expect(priceAccount).not.toBeNull()
    expect(priceAccount!.owner.toBase58()).toBe(PYTH_ORACLE_PROGRAM.toBase58())
    
    console.log('✅ Price feed account exists and owned by Pyth')
    console.log('   Data length:', priceAccount!.data.length, 'bytes')
  })
  
  it('should fail with invalid price feed', async () => {
    console.log('\n❌ Testing with invalid price feed...')
    
    const reactor = Keypair.generate()
    const [reactorAuthority] = PublicKey.findProgramAddressSync(
      [AUTHORITY_SEED, reactor.publicKey.toBuffer()],
      PROGRAM_ID
    )
    
    const treasuryAuthority = Keypair.generate()
    const baseMint = await createMintOnDevnet(6)
    const baseVault = await createTokenAccount(baseMint, reactorAuthority)
    const treasuryBaseAccount = await createTokenAccount(baseMint, treasuryAuthority.publicKey)
    const neutronMint = await createMintOnDevnet(6)
    const protonMint = await createMintOnDevnet(6)
    
    // Transfer authorities
    const setAuthorityIx1 = await import('@solana/spl-token').then(m => 
      m.createSetAuthorityInstruction(
        neutronMint,
        payer.publicKey,
        m.AuthorityType.MintTokens,
        reactorAuthority
      )
    )
    const setAuthorityIx2 = await import('@solana/spl-token').then(m =>
      m.createSetAuthorityInstruction(
        protonMint,
        payer.publicKey,
        m.AuthorityType.MintTokens,
        reactorAuthority
      )
    )
    
    const setAuthorityTx = new Transaction().add(setAuthorityIx1, setAuthorityIx2)
    setAuthorityTx.feePayer = payer.publicKey
    setAuthorityTx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash
    setAuthorityTx.sign(payer)
    await connection.sendRawTransaction(setAuthorityTx.serialize())
    
    // Use an INVALID price feed (random public key)
    const INVALID_PRICE_FEED = Keypair.generate().publicKey
    
    try {
      await program.methods
        .initialize({
          vaultName: 'Test Invalid',
          fissionFeeWad: new BN(0),
          fusionFeeWad: new BN(0),
          targetReserveRatioWad: TWO_WAD,
          priceFeed: INVALID_PRICE_FEED,
          oracleProgram: PYTH_ORACLE_PROGRAM
        })
        .accountsStrict({
          payer: payer.publicKey,
          reactor: reactor.publicKey,
          reactorAuthority,
          baseMint,
          baseVault,
          neutronMint,
          protonMint,
          priceFeed: INVALID_PRICE_FEED,
          treasuryAuthority: treasuryAuthority.publicKey,
          treasuryBaseAccount,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID
        })
        .signers([reactor])
        .rpc()
      
      throw new Error('Should have failed with invalid price feed')
    } catch (error: any) {
      console.log('✅ Correctly rejected invalid price feed')
      expect(error.message).toMatch(/InvalidPriceAccount|invalid account data/)
    }
  })
  
  it('should initialize reactor with valid Pyth price feed', async () => {
    const ctx = await setupReactorOnDevnet()
    
    const reactorAccount = await program.account.reactor.fetch(ctx.reactor.publicKey)
    
    expect(reactorAccount.baseVault.toBase58()).toBe(ctx.baseVault.toBase58())
    expect(reactorAccount.neutronMint.toBase58()).toBe(ctx.neutronMint.toBase58())
    expect(reactorAccount.protonMint.toBase58()).toBe(ctx.protonMint.toBase58())
    expect(reactorAccount.priceFeed.toBase58()).toBe(SOL_USD_PRICE_FEED.toBase58())
    expect(reactorAccount.oracleProgram.toBase58()).toBe(PYTH_ORACLE_PROGRAM.toBase58())
    
    console.log('✅ Reactor initialized correctly with Pyth feed')
  })
  
  it('should perform fission with real price feed', async () => {
    const ctx = await setupReactorOnDevnet()
    
    console.log('\n💥 Performing fission...')
    
    const userBaseBefore = await getAccount(connection, ctx.userBaseAccount)
    
    const tx = await program.methods
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
        priceFeed: SOL_USD_PRICE_FEED,
        tokenProgram: TOKEN_PROGRAM_ID
      })
      .rpc()
    
    await confirmTransaction(tx)
    
    const userBaseAfter = await getAccount(connection, ctx.userBaseAccount)
    const userNeutron = await getAccount(connection, ctx.userNeutronAccount)
    const userProton = await getAccount(connection, ctx.userProtonAccount)
    const vault = await getAccount(connection, ctx.baseVault)
    
    const baseSpent = Number(userBaseBefore.amount - userBaseAfter.amount)
    
    expect(baseSpent).toBe(FISSION_DEPOSIT)
    expect(Number(userNeutron.amount)).toBeGreaterThan(0)
    expect(Number(userProton.amount)).toBeGreaterThan(0)
    expect(Number(vault.amount)).toBe(FISSION_DEPOSIT)
    
    console.log('✅ Fission successful!')
    console.log('   Base spent:', baseSpent / 1_000_000)
    console.log('   Neutron minted:', Number(userNeutron.amount) / 1_000_000)
    console.log('   Proton minted:', Number(userProton.amount) / 1_000_000)
  })
  
  it('should perform full lifecycle: fission -> transmute -> fusion', async () => {
    const ctx = await setupReactorOnDevnet()
    
    console.log('\n🔄 Testing full lifecycle...')
    
    // 1. Fission
    console.log('  1️⃣ Fission...')
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
        priceFeed: SOL_USD_PRICE_FEED,
        tokenProgram: TOKEN_PROGRAM_ID
      })
      .rpc()
      .then(confirmTransaction)
    
    const protonBefore = await getAccount(connection, ctx.userProtonAccount)
    const neutronBefore = await getAccount(connection, ctx.userNeutronAccount)
    
    // 2. Transmute proton to neutron
    console.log('  2️⃣ Transmute proton -> neutron...')
    await program.methods
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
        priceFeed: SOL_USD_PRICE_FEED,
        tokenProgram: TOKEN_PROGRAM_ID
      })
      .rpc()
      .then(confirmTransaction)
    
    const neutronAfterTransmute = await getAccount(connection, ctx.userNeutronAccount)
    expect(Number(neutronAfterTransmute.amount)).toBeGreaterThan(Number(neutronBefore.amount))
    console.log('     ✅ Neutron increased')
    
    // 3. Transmute some back
    console.log('  3️⃣ Transmute neutron -> proton...')
    await program.methods
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
        priceFeed: SOL_USD_PRICE_FEED,
        tokenProgram: TOKEN_PROGRAM_ID
      })
      .rpc()
      .then(confirmTransaction)
    
    console.log('     ✅ Transmuted back to proton')
    
    // 4. Fusion
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
    
    console.log('✅ Full lifecycle completed successfully!')
  })
})

