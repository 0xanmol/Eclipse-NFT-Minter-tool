export const CONFIG = {
  // Network configuration - now includes Eclipse networks
  NETWORKS: {
    // Solana networks
    "solana-mainnet": {
      name: "Solana Mainnet",
      url: process.env.NEXT_PUBLIC_SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com",
      explorer: "https://explorer.solana.com",
      blockchain: "solana" as const,
    },
    "solana-devnet": {
      name: "Solana Devnet",
      url: "https://api.devnet.solana.com",
      explorer: "https://explorer.solana.com/?cluster=devnet",
      blockchain: "solana" as const,
    },
    // Eclipse networks - Updated to use eclipsescan.xyz
    "eclipse-mainnet": {
      name: "Eclipse Mainnet",
      url: "https://mainnetbeta-rpc.eclipse.xyz",
      explorer: "https://eclipsescan.xyz",
      blockchain: "eclipse" as const,
    },
    "eclipse-testnet": {
      name: "Eclipse Testnet",
      url: "https://testnet.dev2.eclipsenetwork.xyz",
      explorer: "https://eclipsescan.xyz/?cluster=testnet",
      blockchain: "eclipse" as const,
    },
  },

  // Only expose the JWT token to client (as it's prefixed with NEXT_PUBLIC_)
  // API Key and Secret Key will be server-side only
  PINATA: {
    jwt: process.env.NEXT_PUBLIC_PINATA_JWT,
    gateway: "https://gateway.pinata.cloud/ipfs",
  },

  // File validation
  FILE_VALIDATION: {
    maxSize: 10 * 1024 * 1024, // 10MB
    allowedTypes: ["image/jpeg", "image/png", "image/gif", "image/webp"],
    allowedExtensions: [".jpg", ".jpeg", ".png", ".gif", ".webp"],
  },

  // NFT configuration
  NFT: {
    maxNameLength: 32,
    maxDescriptionLength: 1000,
    maxAttributes: 20,
    defaultRoyalty: 500, // 5%
  },

  // UI configuration
  UI: {
    toastDuration: 5000,
    transactionTimeout: 60000,
  },
} as const

// Server-side only configuration
export const SERVER_CONFIG = {
  PINATA: {
    apiKey: process.env.PINATA_API_KEY,
    secretKey: process.env.PINATA_SECRET_KEY,
    jwt: process.env.PINATA_JWT,
  },
}

export type NetworkType = keyof typeof CONFIG.NETWORKS

// Helper functions
export function getNetworkDisplayName(network: NetworkType): string {
  return CONFIG.NETWORKS[network].name
}

export function getNetworkExplorer(network: NetworkType): string {
  return CONFIG.NETWORKS[network].explorer
}

export function isEclipseNetwork(network: NetworkType): boolean {
  return CONFIG.NETWORKS[network].blockchain === "eclipse"
}

export function isSolanaNetwork(network: NetworkType): boolean {
  return CONFIG.NETWORKS[network].blockchain === "solana"
}

export function getBlockchainType(network: NetworkType): "solana" | "eclipse" {
  return CONFIG.NETWORKS[network].blockchain
}

// Generate correct explorer URLs for different networks
export function getTransactionUrl(signature: string, network: NetworkType): string {
  if (isEclipseNetwork(network)) {
    const baseUrl = "https://eclipsescan.xyz/tx"
    return network === "eclipse-testnet" ? `${baseUrl}/${signature}?cluster=testnet` : `${baseUrl}/${signature}`
  } else {
    // Solana networks
    const baseUrl = "https://explorer.solana.com/tx"
    return network === "solana-devnet" ? `${baseUrl}/${signature}?cluster=devnet` : `${baseUrl}/${signature}`
  }
}

export function getTokenUrl(mintAddress: string, network: NetworkType): string {
  if (isEclipseNetwork(network)) {
    const baseUrl = "https://eclipsescan.xyz/token"
    return network === "eclipse-testnet" ? `${baseUrl}/${mintAddress}?cluster=testnet` : `${baseUrl}/${mintAddress}`
  } else {
    // Solana networks
    const baseUrl = "https://explorer.solana.com/address"
    return network === "solana-devnet" ? `${baseUrl}/${mintAddress}?cluster=devnet` : `${baseUrl}/${mintAddress}`
  }
}
