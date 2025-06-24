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
    // Eclipse networks
    "eclipse-mainnet": {
      name: "Eclipse Mainnet",
      url: "https://mainnetbeta-rpc.eclipse.xyz",
      explorer: "https://explorer.eclipse.xyz",
      blockchain: "eclipse" as const,
    },
    "eclipse-testnet": {
      name: "Eclipse Testnet",
      url: "https://testnet.dev2.eclipsenetwork.xyz",
      explorer: "https://explorer.eclipse.xyz/?cluster=testnet",
      blockchain: "eclipse" as const,
    },
  },

  // Pinata configuration
  PINATA: {
    apiKey: process.env.NEXT_PUBLIC_PINATA_API_KEY,
    secretKey: process.env.NEXT_PUBLIC_PINATA_SECRET_KEY,
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
