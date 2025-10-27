import type { NextConfig } from 'next'
import path from 'path'

const nextConfig: NextConfig = {
  webpack: (config, { isServer, webpack }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        crypto: false,
        buffer: require.resolve('buffer/'),
      }
      
      // Provide Buffer globally for libraries that expect it (like Pyth SDK)
      config.plugins.push(
        new webpack.ProvidePlugin({
          Buffer: ['buffer', 'Buffer'],
        })
      )
    }
    
    // Handle rpc-websockets version compatibility issues
    // The old @solana/web3.js (v1.77.4) from jito-ts tries to import from old path structure
    // that doesn't exist in newer rpc-websockets (v9.2.0)
    config.resolve.alias = {
      ...config.resolve.alias,
      'rpc-websockets/dist/lib/client/websocket.browser': path.resolve(
        __dirname,
        'node_modules/rpc-websockets/dist/index.browser.mjs'
      ),
      'rpc-websockets/dist/lib/client': path.resolve(
        __dirname,
        'node_modules/rpc-websockets/dist/index.browser.mjs'
      ),
    }
    
    // Ignore specific problematic modules
    config.externals = config.externals || []
    if (!isServer) {
      config.externals.push({
        'utf-8-validate': 'commonjs utf-8-validate',
        'bufferutil': 'commonjs bufferutil',
      })
    }
    
    return config
  },
  transpilePackages: ['jito-ts', '@solana/web3.js', 'rpc-websockets'],
}

export default nextConfig
