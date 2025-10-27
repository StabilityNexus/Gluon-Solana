import { Connection, PublicKey, TransactionInstruction } from '@solana/web3.js';
import { PythSolanaReceiver } from '@pythnetwork/pyth-solana-receiver';
import { HermesClient } from '@pythnetwork/hermes-client';

// Hermes client for fetching price updates
const hermesClient = new HermesClient('https://hermes.pyth.network');

// Pyth Solana Receiver program ID  
export const PYTH_SOLANA_RECEIVER_PROGRAM_ID = new PublicKey(
  'rec5EKMGg6MxZYaMdyBfgwp4d5rB9T1VQH5pJv5LtFJ'
);

export interface PriceUpdate {
  feedId: string;
  price: number;
  conf: number;
  expo: number;
  publishTime: number;
}

/**
 * Fetch price updates from Hermes API
 * @param feedIds Array of Pyth price feed IDs (hex strings with 0x prefix)
 * @returns Price updates data
 */
export async function fetchHermesPriceUpdates(feedIds: string[]): Promise<{
  priceUpdateData: string[];
  prices: PriceUpdate[];
}> {
  try {
    // Remove 0x prefix if present
    const cleanFeedIds = feedIds.map(id => id.startsWith('0x') ? id.slice(2) : id);
    
    // Fetch latest price updates from Hermes
    const priceUpdates = await hermesClient.getLatestPriceUpdates(cleanFeedIds);
    
    if (!priceUpdates || !priceUpdates.binary || !priceUpdates.binary.data) {
      throw new Error('No price update data received from Hermes');
    }

    // Extract price data
    const prices: PriceUpdate[] = (priceUpdates.parsed || []).map((update: any) => ({
      feedId: `0x${update.id}`,
      price: parseFloat(update.price.price),
      conf: parseFloat(update.price.conf),
      expo: update.price.expo,
      publishTime: update.price.publish_time,
    }));

    return {
      priceUpdateData: priceUpdates.binary.data,
      prices,
    };
  } catch (error) {
    console.error('Failed to fetch price updates from Hermes:', error);
    throw new Error(`Failed to fetch price updates: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Create instructions to post price update to Solana
 * @param connection Solana connection
 * @param payer Public key of the transaction payer
 * @param priceUpdateData Binary price update data from Hermes
 * @returns Transaction instructions and price update account
 */
export async function createPostPriceUpdateInstructions(
  connection: Connection,
  payer: PublicKey,
  priceUpdateData: string[]
): Promise<{
  instructions: TransactionInstruction[];
  priceUpdateAccount: PublicKey;
}> {
  try {
    // Create Pyth Solana Receiver instance
    const pythSolanaReceiver = new PythSolanaReceiver({
      connection,
      wallet: {
        publicKey: payer,
        signTransaction: async (tx) => tx,
        signAllTransactions: async (txs) => txs,
      } as any, // Mock wallet for instruction building only
    });

    // Convert hex strings to Buffer
    const updateData = priceUpdateData.map(data => Buffer.from(data, 'hex'));

    // Create transaction builder
    const transactionBuilder = pythSolanaReceiver.newTransactionBuilder({
      closeUpdateAccounts: false, // Keep price update accounts open for use in the same transaction
    });

    // Add post price update instructions
    await transactionBuilder.addPostPriceUpdates(updateData);

    // Build the transaction
    const versionedTransaction = await transactionBuilder.buildVersionedTransaction({
      computeUnitPriceMicroLamports: 50000,
    });

    // Extract the transaction and get the price update account
    const priceUpdateAccounts = transactionBuilder.getPriceUpdateAccounts();
    
    if (!priceUpdateAccounts || priceUpdateAccounts.length === 0) {
      throw new Error('Failed to get price update account from transaction builder');
    }

    return {
      instructions: versionedTransaction.instructions as TransactionInstruction[],
      priceUpdateAccount: priceUpdateAccounts[0],
    };
  } catch (error) {
    console.error('Failed to create price update instructions:', error);
    throw new Error(`Failed to post price update: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Get price update instructions for a single feed
 * This fetches the latest price from Hermes and creates instructions to post it to Solana
 * 
 * @param connection Solana connection
 * @param payer Public key of the transaction payer
 * @param feedId Pyth price feed ID (hex string with 0x prefix)
 * @returns Transaction instructions, price update account, and current price
 */
export async function getPriceUpdateInstructions(
  connection: Connection,
  payer: PublicKey,
  feedId: string
): Promise<{
  instructions: TransactionInstruction[];
  priceUpdateAccount: PublicKey;
  currentPrice: PriceUpdate;
}> {
  // Fetch price update from Hermes
  const { priceUpdateData, prices } = await fetchHermesPriceUpdates([feedId]);

  if (!prices || prices.length === 0) {
    throw new Error('No price data received from Hermes');
  }

  // Create instructions to post the price update
  const { instructions, priceUpdateAccount } = await createPostPriceUpdateInstructions(
    connection,
    payer,
    priceUpdateData
  );

  return {
    instructions,
    priceUpdateAccount,
    currentPrice: prices[0],
  };
}

/**
 * Format price for display
 * @param price Price value
 * @param expo Price exponent
 * @returns Formatted price as a number
 */
export function formatPythPrice(price: number, expo: number): number {
  return price * Math.pow(10, expo);
}

/**
 * Common Pyth price feed IDs
 */
export const PYTH_FEED_IDS = {
  // Crypto
  SOL_USD: '0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d',
  BTC_USD: '0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43',
  ETH_USD: '0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace',
  USDC_USD: '0xeaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a',
  USDT_USD: '0x2b89b9dc8fdf9f34709a5b106b472f0f39bb6ca9ce04b0fd7f2e971688e2e53b',
  
  // Add more feed IDs as needed
};

