// Debug script to inspect Pyth price feed
import { Connection, PublicKey } from '@solana/web3.js'

const connection = new Connection('https://api.devnet.solana.com', 'confirmed')
const SOL_USD_PRICE_FEED = new PublicKey('J83w4HKfqxwcq3BEMMkPFSppX3gqekLyLJBexebFVkix')
const PYTH_ORACLE_PROGRAM = new PublicKey('gSbePebfvPy7tRqimPoVecS2UsBvYv46ynrzWocc92s')

async function debug() {
  const account = await connection.getAccountInfo(SOL_USD_PRICE_FEED)
  
  if (!account) {
    console.log('❌ Account not found!')
    return
  }
  
  console.log('✅ Account found')
  console.log('Owner:', account.owner.toBase58())
  console.log('Data length:', account.data.length)
  console.log('Lamports:', account.lamports)
  
  // Read first 32 bytes
  const magic = account.data.readUInt32LE(0)
  const version = account.data.readUInt32LE(4)
  const accountType = account.data.readUInt32LE(8)
  const size = account.data.readUInt32LE(12)
  
  console.log('\n Pyth Header:')
  console.log('  Magic:', '0x' + magic.toString(16), magic === 0xa1b2c3d4 ? '✅' : '❌')
  console.log('  Version:', version)
  console.log('  Account Type:', accountType, accountType === 2 ? '(Product)' : accountType === 3 ? '(Price)' : '(Unknown)')
  console.log('  Size:', size)
  
  // If it's a product account, try to read the linked price key
  if (accountType === 2) {
    const keyOffset = 16  // After header
    const linkedKeyBytes = account.data.slice(keyOffset, keyOffset + 32)
    const linkedKey = new PublicKey(linkedKeyBytes)
    console.log('\n📎 Linked Price Account:', linkedKey.toBase58())
  }
  
  // If it's a price account, try to read the price
  if (accountType === 3) {
    try {
      const priceType = account.data.readUInt8(16)
      const expo = account.data.readInt32LE(20)
      const price = account.data.readBigInt64LE(48)
      const conf = account.data.readBigUInt64LE(56)
      const publishTime = account.data.readBigInt64LE(96)
      
      console.log('\n📊 Price Data:')
      console.log('  Type:', priceType)
      console.log('  Exponent:', expo)
      console.log('  Price:', price.toString())
      console.log('  Confidence:', conf.toString())
      console.log('  Publish Time:', publishTime.toString(), '(' + new Date(Number(publishTime) * 1000).toISOString() + ')')
      
      // Calculate actual price
      const actualPrice = Number(price) * Math.pow(10, expo)
      console.log('  Actual Price:', actualPrice.toFixed(4))
    } catch (e) {
      console.log('\n❌ Failed to read price data:', e)
    }
  }
}

debug().catch(console.error)

