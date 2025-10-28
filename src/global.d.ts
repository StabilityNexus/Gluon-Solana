// Global type declarations

import { Buffer } from 'buffer'
import type { Transaction, PublicKey, VersionedTransaction } from '@solana/web3.js'

type SolanaSignableTransaction = Transaction | VersionedTransaction

interface SolanaProvider {
  signTransaction(transaction: SolanaSignableTransaction): Promise<SolanaSignableTransaction>
  signAllTransactions(transactions: SolanaSignableTransaction[]): Promise<SolanaSignableTransaction[]>
  publicKey?: PublicKey
}

declare global {
  interface Window {
    Buffer?: typeof Buffer
    solana?: SolanaProvider
  }
}

export {}
