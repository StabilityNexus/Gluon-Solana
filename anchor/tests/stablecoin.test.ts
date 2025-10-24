/**
 * Stablecoin Program Tests (Local Bankrun)
 *
 * These Jest tests exercise the Stablecoin Anchor program inside a solana-bankrun
 * environment. A mocked Pyth price feed is injected so we can run through the
 * initialize, fission, fusion, and transmute flows deterministically.
 */

import { startAnchor, Clock, BanksClient, ProgramTestContext } from 'solana-bankrun'
import { PublicKey, Keypair, Transaction, SystemProgram } from '@solana/web3.js'
import {
  TOKEN_PROGRAM_ID,
  ACCOUNT_SIZE,
  MINT_SIZE,
  createInitializeAccountInstruction,
  createInitializeMintInstruction,
  createMintToInstruction,
  AccountLayout,
  MintLayout
} from '@solana/spl-token'
import { BN, Program } from '@coral-xyz/anchor'
import type { Stablecoin } from '../target/types/stablecoin'
import IDL from '../target/idl/stablecoin.json'

const WAD = new BN('1000000000000000000')
const TWO_WAD = WAD.muln(2)
const AUTHORITY_SEED = Buffer.from('reactor-authority')

const PRICE_FEED_ADDRESS = new PublicKey('GwXYEmPdgHcowF9GZwbb1WiTGTn1fuT3hbSLneoBKK6')
const ORACLE_PROGRAM_ID = new PublicKey('rec5EKMGg6MxZYaMdyBfgwp4d5rB9T1VQH5pJv5LtFJ')

const PRICE_ACCOUNT_SIZE = 3312
const PYTH_MAGIC = 0xa1b2c3d4
const VERSION_2 = 2
const ACCOUNT_TYPE_PRICE = 3
const PRICE_TYPE_PRICE = 1
const PRICE_STATUS_TRADING = 1

const INITIAL_USER_BASE = 2_000_000
const FISSION_DEPOSIT = 1_000_000
const TRANSMUTE_AMOUNT = 100_000
const SECOND_FISSION_DEPOSIT = 500_000
const POST_TRANSMUTE_FUSION_AMOUNT = 400_000
const JS_WAD = 1_000_000_000_000_000_000n
const PEG_WAD_BIGINT = JS_WAD

function bnToBigInt(value: BN | bigint | number): bigint {
  if (typeof value === 'bigint') {
    return value
  }
  if (typeof value === 'number') {
    return BigInt(value)
  }
  return BigInt(value.toString())
}

function bufferToBigIntLE(bytes: Buffer | Uint8Array | bigint): bigint {
  if (typeof bytes === 'bigint') {
    return bytes
  }
  const buf = Buffer.from(bytes)
  let result = 0n
  for (let i = 0; i < buf.length; i++) {
    result |= BigInt(buf[i]) << BigInt(8 * i)
  }
  return result
}

function pow10BigInt(exp: number): bigint {
  let result = 1n
  for (let i = 0; i < exp; i++) {
    result *= 10n
  }
  return result
}

function mulDivBigInt(a: bigint, b: bigint, denominator: bigint): bigint {
  if (denominator === 0n) {
    throw new Error('division by zero')
  }
  if (a === 0n || b === 0n) {
    return 0n
  }
  return (a * b) / denominator
}

function tokensToWadBigInt(amount: bigint, decimals: number): bigint {
  return mulDivBigInt(amount, JS_WAD, pow10BigInt(decimals))
}

function wadToTokensBigInt(valueWad: bigint, decimals: number): bigint {
  return mulDivBigInt(valueWad, pow10BigInt(decimals), JS_WAD)
}

function qWad(targetReserveRatioWad: bigint): bigint {
  const q = (JS_WAD * JS_WAD) / targetReserveRatioWad
  return q > JS_WAD ? JS_WAD : q
}

function protonPriceInBase(
  targetReserveRatioWad: bigint,
  reserveTokens: bigint,
  protonSupplyTokens: bigint,
  baseDecimals: number,
  protonDecimals: number
): bigint {
  if (protonSupplyTokens === 0n) {
    return JS_WAD
  }
  const reserveWad = tokensToWadBigInt(reserveTokens, baseDecimals)
  if (reserveWad === 0n) {
    return 0n
  }
  const supplyWad = tokensToWadBigInt(protonSupplyTokens, protonDecimals)
  const q = qWad(targetReserveRatioWad)
  const oneMinusQ = JS_WAD - q
  return mulDivBigInt(oneMinusQ, reserveWad, supplyWad)
}

function neutronPriceInBase(
  targetReserveRatioWad: bigint,
  reserveTokens: bigint,
  neutronSupplyTokens: bigint,
  baseDecimals: number,
  neutronDecimals: number,
  basePriceWad: bigint
): bigint {
  if (neutronSupplyTokens === 0n) {
    return mulDivBigInt(PEG_WAD_BIGINT, JS_WAD, basePriceWad)
  }
  const reserveWad = tokensToWadBigInt(reserveTokens, baseDecimals)
  if (reserveWad === 0n) {
    return 0n
  }
  const supplyWad = tokensToWadBigInt(neutronSupplyTokens, neutronDecimals)
  const q = qWad(targetReserveRatioWad)
  return mulDivBigInt(q, reserveWad, supplyWad)
}

function betaPlusFee(
  betaPhi0Wad: bigint,
  betaPhi1Wad: bigint,
  decayedVolumeBaseWad: bigint,
  reserveWad: bigint
): bigint {
  if (reserveWad === 0n) {
    return JS_WAD
  }
  if (betaPhi0Wad === 0n && betaPhi1Wad === 0n) {
    return 0n
  }
  let fee = betaPhi0Wad
  if (decayedVolumeBaseWad > 0n) {
    const term = mulDivBigInt(betaPhi1Wad, decayedVolumeBaseWad, reserveWad)
    fee += term
  }
  return fee > JS_WAD ? JS_WAD : fee
}

function betaMinusFee(
  betaPhi0Wad: bigint,
  betaPhi1Wad: bigint,
  decayedVolumeBaseWad: bigint,
  reserveWad: bigint
): bigint {
  if (reserveWad === 0n) {
    return JS_WAD
  }
  if (betaPhi0Wad === 0n && betaPhi1Wad === 0n) {
    return 0n
  }
  let fee = betaPhi0Wad
  if (decayedVolumeBaseWad < 0n) {
    const magnitude = -decayedVolumeBaseWad
    const term = mulDivBigInt(betaPhi1Wad, magnitude, reserveWad)
    fee += term
  }
  return fee > JS_WAD ? JS_WAD : fee
}

function simulateTransmutePlus(params: {
  protonInTokens: bigint
  reserveTokens: bigint
  protonSupplyTokens: bigint
  neutronSupplyTokens: bigint
  baseDecimals: number
  protonDecimals: number
  neutronDecimals: number
  targetReserveRatioWad: bigint
  betaPhi0Wad: bigint
  betaPhi1Wad: bigint
  decayedVolumeBaseWad: bigint
  basePriceWad: bigint
}): bigint {
  const protonInWad = tokensToWadBigInt(params.protonInTokens, params.protonDecimals)
  const protonPriceBaseWad = protonPriceInBase(
    params.targetReserveRatioWad,
    params.reserveTokens,
    params.protonSupplyTokens,
    params.baseDecimals,
    params.protonDecimals
  )
  const neutronPriceBaseWad = neutronPriceInBase(
    params.targetReserveRatioWad,
    params.reserveTokens,
    params.neutronSupplyTokens,
    params.baseDecimals,
    params.neutronDecimals,
    params.basePriceWad
  )
  const grossBaseWad = mulDivBigInt(protonInWad, protonPriceBaseWad, JS_WAD)
  const reserveWad = tokensToWadBigInt(params.reserveTokens, params.baseDecimals)
  const feeWad = betaPlusFee(
    params.betaPhi0Wad,
    params.betaPhi1Wad,
    params.decayedVolumeBaseWad,
    reserveWad
  )
  const feeFactor = JS_WAD - feeWad
  const netBaseWad = mulDivBigInt(grossBaseWad, feeFactor, JS_WAD)
  const neutronOutWad = mulDivBigInt(netBaseWad, JS_WAD, neutronPriceBaseWad)
  return wadToTokensBigInt(neutronOutWad, params.neutronDecimals)
}

function simulateTransmuteMinus(params: {
  neutronInTokens: bigint
  reserveTokens: bigint
  protonSupplyTokens: bigint
  neutronSupplyTokens: bigint
  baseDecimals: number
  protonDecimals: number
  neutronDecimals: number
  targetReserveRatioWad: bigint
  betaPhi0Wad: bigint
  betaPhi1Wad: bigint
  decayedVolumeBaseWad: bigint
  basePriceWad: bigint
}): bigint {
  const neutronInWad = tokensToWadBigInt(params.neutronInTokens, params.neutronDecimals)
  const protonPriceBaseWad = protonPriceInBase(
    params.targetReserveRatioWad,
    params.reserveTokens,
    params.protonSupplyTokens,
    params.baseDecimals,
    params.protonDecimals
  )
  const neutronPriceBaseWad = neutronPriceInBase(
    params.targetReserveRatioWad,
    params.reserveTokens,
    params.neutronSupplyTokens,
    params.baseDecimals,
    params.neutronDecimals,
    params.basePriceWad
  )
  const grossBaseWad = mulDivBigInt(neutronInWad, neutronPriceBaseWad, JS_WAD)
  const reserveWad = tokensToWadBigInt(params.reserveTokens, params.baseDecimals)
  const feeWad = betaMinusFee(
    params.betaPhi0Wad,
    params.betaPhi1Wad,
    params.decayedVolumeBaseWad,
    reserveWad
  )
  const feeFactor = JS_WAD - feeWad
  const netBaseWad = mulDivBigInt(grossBaseWad, feeFactor, JS_WAD)
  const protonOutWad = mulDivBigInt(netBaseWad, JS_WAD, protonPriceBaseWad)
  return wadToTokensBigInt(protonOutWad, params.protonDecimals)
}

function simulateFission(params: {
  amountInTokens: bigint
  baseDecimals: number
  protonDecimals: number
  neutronDecimals: number
  targetReserveRatioWad: bigint
  fissionFeeWad: bigint
  priceBaseWad: bigint
}): { neutronOut: bigint; protonOut: bigint; feeTokens: bigint } {
  const amountInWad = tokensToWadBigInt(params.amountInTokens, params.baseDecimals)
  const feeWad = mulDivBigInt(amountInWad, params.fissionFeeWad, JS_WAD)
  const feeTokens = wadToTokensBigInt(feeWad, params.baseDecimals)
  const netTokens = params.amountInTokens - feeTokens
  const netWad = tokensToWadBigInt(netTokens, params.baseDecimals)
  const neutronOutWad = mulDivBigInt(netWad, params.priceBaseWad, params.targetReserveRatioWad)
  const netOverRWad = mulDivBigInt(netWad, JS_WAD, params.targetReserveRatioWad)
  const protonOutWad = netWad - netOverRWad
  return {
    neutronOut: wadToTokensBigInt(neutronOutWad, params.neutronDecimals),
    protonOut: wadToTokensBigInt(protonOutWad, params.protonDecimals),
    feeTokens
  }
}

function simulateFusion(params: {
  amountInTokens: bigint
  reserveTokens: bigint
  neutronSupplyTokens: bigint
  protonSupplyTokens: bigint
  baseDecimals: number
  neutronDecimals: number
  protonDecimals: number
}): { neutronBurn: bigint; protonBurn: bigint } {
  const mWad = tokensToWadBigInt(params.amountInTokens, params.baseDecimals)
  const reserveWad = tokensToWadBigInt(params.reserveTokens, params.baseDecimals)
  const neutronSupplyWad = tokensToWadBigInt(params.neutronSupplyTokens, params.neutronDecimals)
  const protonSupplyWad = tokensToWadBigInt(params.protonSupplyTokens, params.protonDecimals)
  const neutronBurnWad = mulDivBigInt(mWad, neutronSupplyWad, reserveWad)
  const protonBurnWad = mulDivBigInt(mWad, protonSupplyWad, reserveWad)
  return {
    neutronBurn: wadToTokensBigInt(neutronBurnWad, params.neutronDecimals),
    protonBurn: wadToTokensBigInt(protonBurnWad, params.protonDecimals)
  }
}

function buildPriceAccountData(price: bigint, expo: number, publishTime: number): Buffer {
  const data = Buffer.alloc(PRICE_ACCOUNT_SIZE)
  const priceInfoOffset = 208

  data.writeUInt32LE(PYTH_MAGIC, 0)
  data.writeUInt32LE(VERSION_2, 4)
  data.writeUInt32LE(ACCOUNT_TYPE_PRICE, 8)
  data.writeUInt32LE(PRICE_ACCOUNT_SIZE, 12)
  data.writeUInt8(PRICE_TYPE_PRICE, 16)
  data.writeInt32LE(expo, 20)
  data.writeUInt32LE(1, 24)
  data.writeUInt32LE(1, 28)
  data.writeBigUInt64LE(1n, 32)
  data.writeBigUInt64LE(1n, 40)
  data.writeBigInt64LE(price, 48)
  data.writeBigInt64LE(price, 56)
  data.writeBigInt64LE(1n, 64)
  data.writeBigInt64LE(0n, 72)
  data.writeBigInt64LE(0n, 80)
  data.writeBigInt64LE(1n, 88)
  data.writeBigInt64LE(BigInt(publishTime), 96)
  data.writeUInt8(1, 104)
  data.writeUInt8(0, 105)
  data.writeUInt16LE(0, 106)
  data.writeUInt32LE(0, 108)
  data.writeBigUInt64LE(1n, 176)
  data.writeBigInt64LE(price, 184)
  data.writeBigUInt64LE(0n, 192)
  data.writeBigInt64LE(BigInt(publishTime), 200)

  // Price info block
  data.writeBigInt64LE(price, priceInfoOffset)
  data.writeBigUInt64LE(0n, priceInfoOffset + 8)
  data.writeUInt8(PRICE_STATUS_TRADING, priceInfoOffset + 16)
  data.writeUInt8(0, priceInfoOffset + 17)
  data.writeBigUInt64LE(1n, priceInfoOffset + 24)

  return data
}

type ReactorContext = {
  reactor: Keypair
  reactorAuthority: PublicKey
  priceFeed: PublicKey
  baseMint: PublicKey
  neutronMint: PublicKey
  protonMint: PublicKey
  baseVault: PublicKey
  treasuryAuthority: Keypair
  treasuryBaseAccount: PublicKey
  userBaseAccount: PublicKey
  userNeutronAccount: PublicKey
  userProtonAccount: PublicKey
  updatePriceFeed: (price: bigint, expo: number) => Promise<void>
}

let context: ProgramTestContext
let banksClient: BanksClient
let payer: Keypair
let program: Program<Stablecoin>

beforeAll(async () => {
  context = await startAnchor('anchor', [{ name: 'stablecoin', programId: new PublicKey(IDL.address) }], [])
  banksClient = context.banksClient
  payer = context.payer

  const connection: any = {
    getLatestBlockhash: async () => ({
      blockhash: context.lastBlockhash,
      lastValidBlockHeight: 0
    }),
    confirmTransaction: async () => ({ value: { err: null } }),
    getAccountInfoAndContext: async (pubkey: PublicKey) => {
      const account = await banksClient.getAccount(pubkey)
      const slot = Number(await banksClient.getSlot().catch(() => 0))
      return {
        context: { slot },
        value: account
          ? {
              ...account,
              data: Buffer.from(account.data)
            }
          : null
      }
    },
    getAccountInfo: async (pubkey: PublicKey) => {
      const result = await connection.getAccountInfoAndContext(pubkey)
      return result.value
    },
    getMultipleAccountsInfo: async (pubkeys: PublicKey[]) => {
      return Promise.all(pubkeys.map((pk) => connection.getAccountInfo(pk)))
    }
  }

  const provider = {
    connection,
    publicKey: payer.publicKey,
    send: async (tx: Transaction) => {
      tx.recentBlockhash = context.lastBlockhash
      tx.sign(payer)
      await banksClient.processTransaction(tx)
      return tx.signatures[0]?.toString() ?? ''
    },
    sendAll: async (txs: Transaction[]) => {
      for (const tx of txs) {
        await provider.send(tx)
      }
    }
  } as any

  program = new Program<Stablecoin>(IDL as any, provider)
})

async function processTransaction(tx: Transaction, signers: Keypair[] = []) {
  tx.recentBlockhash = context.lastBlockhash
  tx.feePayer = payer.publicKey
  tx.sign(payer, ...signers)
  await banksClient.processTransaction(tx)
}

async function createMint(
  authority: PublicKey,
  freezeAuthority: PublicKey | null,
  decimals: number
): Promise<Keypair> {
  const mint = Keypair.generate()
  const rent = context.genesisConfig.rent.minimumBalance(BigInt(MINT_SIZE))
  const tx = new Transaction().add(
    SystemProgram.createAccount({
      fromPubkey: payer.publicKey,
      newAccountPubkey: mint.publicKey,
      lamports: Number(rent),
      space: MINT_SIZE,
      programId: TOKEN_PROGRAM_ID
    }),
    createInitializeMintInstruction(
      mint.publicKey,
      decimals,
      authority,
      freezeAuthority ?? authority
    )
  )
  await processTransaction(tx, [mint])
  return mint
}

async function createTokenAccount(
  mint: PublicKey,
  owner: PublicKey
): Promise<Keypair> {
  const account = Keypair.generate()
  const rent = context.genesisConfig.rent.minimumBalance(BigInt(ACCOUNT_SIZE))
  const tx = new Transaction().add(
    SystemProgram.createAccount({
      fromPubkey: payer.publicKey,
      newAccountPubkey: account.publicKey,
      lamports: Number(rent),
      space: ACCOUNT_SIZE,
      programId: TOKEN_PROGRAM_ID
    }),
    createInitializeAccountInstruction(account.publicKey, mint, owner)
  )
  await processTransaction(tx, [account])
  return account
}

async function getTokenAmount(address: PublicKey): Promise<bigint> {
  const info = await banksClient.getAccount(address)
  if (!info) {
    throw new Error(`Token account ${address.toBase58()} not found`)
  }
  const decoded = AccountLayout.decode(Buffer.from(info.data))
  return bufferToBigIntLE(decoded.amount)
}

async function getMintSupply(address: PublicKey): Promise<bigint> {
  const info = await banksClient.getAccount(address)
  if (!info) {
    throw new Error(`Mint ${address.toBase58()} not found`)
  }
  const decoded = MintLayout.decode(Buffer.from(info.data))
  return bufferToBigIntLE(decoded.supply)
}

async function setupReactor(): Promise<ReactorContext> {
  const reactor = Keypair.generate()
  const [reactorAuthority, authorityBump] = PublicKey.findProgramAddressSync(
    [AUTHORITY_SEED, reactor.publicKey.toBuffer()],
    program.programId
  )

  const treasuryAuthority = Keypair.generate()

  const baseMint = await createMint(payer.publicKey, payer.publicKey, 6)
  const neutronMint = await createMint(reactorAuthority, reactorAuthority, 6)
  const protonMint = await createMint(reactorAuthority, reactorAuthority, 6)

  const baseVault = await createTokenAccount(baseMint.publicKey, reactorAuthority)
  const treasuryBaseAccount = await createTokenAccount(baseMint.publicKey, treasuryAuthority.publicKey)
  const userBaseAccount = await createTokenAccount(baseMint.publicKey, payer.publicKey)
  const userNeutronAccount = await createTokenAccount(neutronMint.publicKey, payer.publicKey)
  const userProtonAccount = await createTokenAccount(protonMint.publicKey, payer.publicKey)

  const mintToTx = new Transaction().add(
    createMintToInstruction(baseMint.publicKey, userBaseAccount.publicKey, payer.publicKey, INITIAL_USER_BASE)
  )
  await processTransaction(mintToTx)

  const priceFeed = PRICE_FEED_ADDRESS
  const now = Math.floor(Date.now() / 1000)
  const priceData = buildPriceAccountData(1_000_000_000n, -9, now)
  context.setAccount(priceFeed, {
    lamports: Number(context.genesisConfig.rent.minimumBalance(BigInt(PRICE_ACCOUNT_SIZE))),
    data: priceData,
    owner: ORACLE_PROGRAM_ID,
    executable: false,
    rentEpoch: 0
  })
  context.setClock(new Clock(BigInt(0), BigInt(now), BigInt(0), BigInt(0), BigInt(now)))

  const initializeTx = await program.methods
    .initialize({
      vaultName: 'Test Reactor',
      fissionFeeWad: new BN(0),
      fusionFeeWad: new BN(0),
      targetReserveRatioWad: TWO_WAD,
      priceFeed,
      oracleProgram: ORACLE_PROGRAM_ID
    })
    .accountsStrict({
      payer: payer.publicKey,
      reactor: reactor.publicKey,
      reactorAuthority,
      baseMint: baseMint.publicKey,
      baseVault: baseVault.publicKey,
      neutronMint: neutronMint.publicKey,
      protonMint: protonMint.publicKey,
      priceFeed,
      treasuryAuthority: treasuryAuthority.publicKey,
      treasuryBaseAccount: treasuryBaseAccount.publicKey,
      systemProgram: SystemProgram.programId,
      tokenProgram: TOKEN_PROGRAM_ID
    })
    .signers([reactor])
    .transaction()

  await processTransaction(initializeTx, [reactor])

  return {
    reactor,
    reactorAuthority,
    priceFeed,
    baseMint: baseMint.publicKey,
    neutronMint: neutronMint.publicKey,
    protonMint: protonMint.publicKey,
    baseVault: baseVault.publicKey,
    treasuryAuthority,
    treasuryBaseAccount: treasuryBaseAccount.publicKey,
    userBaseAccount: userBaseAccount.publicKey,
    userNeutronAccount: userNeutronAccount.publicKey,
    userProtonAccount: userProtonAccount.publicKey,
    updatePriceFeed: async (price: bigint, expo: number) => {
      const ts = Math.floor(Date.now() / 1000)
      const data = buildPriceAccountData(price, expo, ts)
      context.setAccount(priceFeed, {
        lamports: Number(context.genesisConfig.rent.minimumBalance(BigInt(PRICE_ACCOUNT_SIZE))),
        data,
        owner: ORACLE_PROGRAM_ID,
        executable: false,
        rentEpoch: 0
      })
      context.setClock(new Clock(BigInt(0), BigInt(ts), BigInt(0), BigInt(0), BigInt(ts)))
    }
  }
}

describe('stablecoin program', () => {
  it('stores initialization state correctly', async () => {
    const ctx = await setupReactor()
    const reactorAccount = await program.account.reactor.fetch(ctx.reactor.publicKey)

    expect(reactorAccount.baseVault.equals(ctx.baseVault)).toBe(true)
    expect(reactorAccount.neutronMint.equals(ctx.neutronMint)).toBe(true)
    expect(reactorAccount.protonMint.equals(ctx.protonMint)).toBe(true)
    expect(reactorAccount.priceFeed.equals(ctx.priceFeed)).toBe(true)
    expect(reactorAccount.treasuryAuthority.equals(ctx.treasuryAuthority.publicKey)).toBe(true)
    expect(reactorAccount.fissionFeeWad.toString()).toBe('0')
    expect(reactorAccount.fusionFeeWad.toString()).toBe('0')
    expect(reactorAccount.targetReserveRatioWad.toString()).toBe(TWO_WAD.toString())
  })

  it('allows the treasury to update beta parameters', async () => {
    const ctx = await setupReactor()

    const tx = await program.methods
      .setBetaParams({
        phi0Wad: WAD.divn(2),
        phi1Wad: WAD.divn(4),
        decayPerSecondWad: WAD
      })
      .accountsStrict({
        reactor: ctx.reactor.publicKey,
        treasuryAuthority: ctx.treasuryAuthority.publicKey
      })
      .signers([ctx.treasuryAuthority])
      .transaction()

    await processTransaction(tx, [ctx.treasuryAuthority])

    const reactorAccount = await program.account.reactor.fetch(ctx.reactor.publicKey)
    expect(reactorAccount.betaPhi0Wad.toString()).toBe(WAD.divn(2).toString())
    expect(reactorAccount.betaPhi1Wad.toString()).toBe(WAD.divn(4).toString())
    expect(reactorAccount.decayPerSecondWad.toString()).toBe(WAD.toString())
  })

  it('rejects beta parameter updates from non-treasury authority', async () => {
    const ctx = await setupReactor()
    const intruder = Keypair.generate()

    const tx = await program.methods
      .setBetaParams({
        phi0Wad: WAD,
        phi1Wad: WAD,
        decayPerSecondWad: WAD
      })
      .accountsStrict({
        reactor: ctx.reactor.publicKey,
        treasuryAuthority: intruder.publicKey
      })
      .signers([intruder])
      .transaction()

    tx.recentBlockhash = context.lastBlockhash
    tx.sign(payer, intruder)
    await expect(banksClient.processTransaction(tx)).rejects.toThrow()
  })

  describe('reactions', () => {
    it('fissions base into proton and neutron tokens', async () => {
      const ctx = await setupReactor()
      await ctx.updatePriceFeed(1_000_000_000n, -9)

      const baseBefore = await getTokenAmount(ctx.userBaseAccount)
      const neutronBefore = await getTokenAmount(ctx.userNeutronAccount)
      const protonBefore = await getTokenAmount(ctx.userProtonAccount)

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
          priceFeed: ctx.priceFeed,
          tokenProgram: TOKEN_PROGRAM_ID
        })
        .transaction()

      await processTransaction(tx)

      const baseAfter = await getTokenAmount(ctx.userBaseAccount)
      const neutronAfter = await getTokenAmount(ctx.userNeutronAccount)
      const protonAfter = await getTokenAmount(ctx.userProtonAccount)
      const vaultAfter = await getTokenAmount(ctx.baseVault)

      expect(baseBefore - baseAfter).toBe(BigInt(FISSION_DEPOSIT))
      expect(neutronAfter - neutronBefore).toBe(BigInt(FISSION_DEPOSIT / 2))
      expect(protonAfter - protonBefore).toBe(BigInt(FISSION_DEPOSIT / 2))
      expect(vaultAfter).toBe(BigInt(FISSION_DEPOSIT))
    })

    it('fuses proton and neutron back into base', async () => {
      const ctx = await setupReactor()
      await ctx.updatePriceFeed(1_000_000_000n, -9)

      const fissionTx = await program.methods
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
          priceFeed: ctx.priceFeed,
          tokenProgram: TOKEN_PROGRAM_ID
        })
        .transaction()
      await processTransaction(fissionTx)

      const baseBefore = await getTokenAmount(ctx.userBaseAccount)
      const neutronBefore = await getTokenAmount(ctx.userNeutronAccount)
      const protonBefore = await getTokenAmount(ctx.userProtonAccount)
      const vaultBefore = await getTokenAmount(ctx.baseVault)

      const fusionTx = await program.methods
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
        .transaction()
      await processTransaction(fusionTx)

      const baseAfter = await getTokenAmount(ctx.userBaseAccount)
      const neutronAfter = await getTokenAmount(ctx.userNeutronAccount)
      const protonAfter = await getTokenAmount(ctx.userProtonAccount)
      const vaultAfter = await getTokenAmount(ctx.baseVault)

      expect(baseAfter - baseBefore).toBe(BigInt(FISSION_DEPOSIT / 2))
      expect(neutronBefore - neutronAfter).toBe(BigInt(FISSION_DEPOSIT / 4))
      expect(protonBefore - protonAfter).toBe(BigInt(FISSION_DEPOSIT / 4))
      expect(vaultBefore - vaultAfter).toBe(BigInt(FISSION_DEPOSIT / 2))
    })

    it('transmutes proton into neutron and back', async () => {
      const ctx = await setupReactor()
      await ctx.updatePriceFeed(1_000_000_000n, -9)

      const fissionTx = await program.methods
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
          priceFeed: ctx.priceFeed,
          tokenProgram: TOKEN_PROGRAM_ID
        })
        .transaction()
      await processTransaction(fissionTx)

      const reactorBeforePlus = await program.account.reactor.fetch(ctx.reactor.publicKey)
      const reserveBeforePlus = await getTokenAmount(ctx.baseVault)
      const protonSupplyBeforePlus = await getMintSupply(ctx.protonMint)
      const neutronSupplyBeforePlus = await getMintSupply(ctx.neutronMint)
      const neutronBefore = await getTokenAmount(ctx.userNeutronAccount)
      const protonBefore = await getTokenAmount(ctx.userProtonAccount)

      const transmutePtnTx = await program.methods
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
          priceFeed: ctx.priceFeed,
          tokenProgram: TOKEN_PROGRAM_ID
        })
        .transaction()
      await processTransaction(transmutePtnTx)

      const neutronAfterPtn = await getTokenAmount(ctx.userNeutronAccount)
      const protonAfterPtn = await getTokenAmount(ctx.userProtonAccount)
      const reserveAfterPlus = await getTokenAmount(ctx.baseVault)
      const protonSupplyAfterPlus = await getMintSupply(ctx.protonMint)
      const neutronSupplyAfterPlus = await getMintSupply(ctx.neutronMint)

      const transmuteNtpTx = await program.methods
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
          priceFeed: ctx.priceFeed,
          tokenProgram: TOKEN_PROGRAM_ID
        })
        .transaction()
      await processTransaction(transmuteNtpTx)

      const reactorBeforeMinus = await program.account.reactor.fetch(ctx.reactor.publicKey)
      const neutronFinal = await getTokenAmount(ctx.userNeutronAccount)
      const protonFinal = await getTokenAmount(ctx.userProtonAccount)
      const basePriceWad = JS_WAD

      const expectedNeutronOut = simulateTransmutePlus({
        protonInTokens: BigInt(TRANSMUTE_AMOUNT),
        reserveTokens: reserveBeforePlus,
        protonSupplyTokens: protonSupplyBeforePlus,
        neutronSupplyTokens: neutronSupplyBeforePlus,
        baseDecimals: reactorBeforePlus.baseDecimals,
        protonDecimals: reactorBeforePlus.protonDecimals,
        neutronDecimals: reactorBeforePlus.neutronDecimals,
        targetReserveRatioWad: bnToBigInt(reactorBeforePlus.targetReserveRatioWad),
        betaPhi0Wad: bnToBigInt(reactorBeforePlus.betaPhi0Wad),
        betaPhi1Wad: bnToBigInt(reactorBeforePlus.betaPhi1Wad),
        decayedVolumeBaseWad: bnToBigInt(reactorBeforePlus.decayedVolumeBaseWad),
        basePriceWad
      })

      const expectedProtonOut = simulateTransmuteMinus({
        neutronInTokens: BigInt(TRANSMUTE_AMOUNT),
        reserveTokens: reserveAfterPlus,
        protonSupplyTokens: protonSupplyAfterPlus,
        neutronSupplyTokens: neutronSupplyAfterPlus,
        baseDecimals: reactorBeforeMinus.baseDecimals,
        protonDecimals: reactorBeforeMinus.protonDecimals,
        neutronDecimals: reactorBeforeMinus.neutronDecimals,
        targetReserveRatioWad: bnToBigInt(reactorBeforeMinus.targetReserveRatioWad),
        betaPhi0Wad: bnToBigInt(reactorBeforeMinus.betaPhi0Wad),
        betaPhi1Wad: bnToBigInt(reactorBeforeMinus.betaPhi1Wad),
        decayedVolumeBaseWad: bnToBigInt(reactorBeforeMinus.decayedVolumeBaseWad),
        basePriceWad
      })

      expect(neutronAfterPtn - neutronBefore).toBe(expectedNeutronOut)
      expect(neutronAfterPtn - neutronFinal).toBe(BigInt(TRANSMUTE_AMOUNT))
      expect(protonFinal - protonAfterPtn).toBe(expectedProtonOut)
    })
  })
})
