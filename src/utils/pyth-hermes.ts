import { HermesClient } from '@pythnetwork/hermes-client'

/**
 * Hermes API URL
 */
const HERMES_URL = 'https://hermes.pyth.network'

/**
 * Fetch and return price update data from Pyth Hermes API
 * @param priceFeedId Pyth price feed ID (hex string starting with 0x, e.g., "0xef0d8b6...")
 * @returns Price update data ready to be posted to Solana
 */
export async function getPythPriceUpdateData(priceFeedId: string): Promise<{
  priceUpdateData: string[]
  currentPrice: {
    price: number
    conf: number
    expo: number
    publishTime: number
  }
}> {
  try {
    console.log(`Fetching price update from Hermes for feed ${priceFeedId}...`)
    
    const hermesClient = new HermesClient(HERMES_URL)
    
    // Fetch latest price updates with base64 encoding (required by Pyth SDK)
    const priceUpdateResponse = await hermesClient.getLatestPriceUpdates([priceFeedId], {
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
    const currentPrice = {
      price: parseFloat(priceInfo.price),
      conf: parseFloat(priceInfo.conf),
      expo: priceInfo.expo,
      publishTime: priceInfo.publish_time,
    }

    console.log('✅ Price fetched from Hermes:', {
      feedId: priceFeedId,
      price: currentPrice.price,
      expo: currentPrice.expo,
      displayPrice: currentPrice.price * Math.pow(10, currentPrice.expo),
      publishTime: new Date(currentPrice.publishTime * 1000).toISOString(),
    })

    return {
      priceUpdateData: priceUpdateResponse.binary.data,
      currentPrice,
    }
  } catch (error) {
    console.error('❌ Error fetching Pyth price update from Hermes:', error)
    throw error
  }
}

/**
 * Helper function removed - now using SDK directly
 */

/**
 * Fetch and display price information from Hermes (for display purposes only)
 * @param priceFeedId Pyth price feed ID (hex string starting with 0x)
 * @returns Price data
 */
export async function fetchPythPrice(priceFeedId: string): Promise<{
  price: number
  conf: number
  expo: number
  publishTime: number
}> {
  try {
    const hermesClient = new HermesClient(HERMES_URL)
    
    // Fetch latest price for display only (no binary data needed)
    const response = await hermesClient.getLatestPriceUpdates([priceFeedId])
    
    if (!response.parsed || response.parsed.length === 0) {
      throw new Error('No price data available')
    }

    const priceData = response.parsed[0].price
    
    return {
      price: parseFloat(priceData.price),
      conf: parseFloat(priceData.conf),
      expo: priceData.expo,
      publishTime: priceData.publish_time,
    }
  } catch (error) {
    console.error('Error fetching Pyth price:', error)
    throw error
  }
}
