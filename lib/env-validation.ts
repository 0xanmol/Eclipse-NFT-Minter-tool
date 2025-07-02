// Environment variable validation for server-side usage
export function getServerEnv() {
  // This function should only be called on the server
  if (typeof window !== "undefined") {
    throw new Error("getServerEnv() can only be called on the server side")
  }

  return {
    RARIBLE_API_KEY: process.env.RARIBLE_API_KEY,
    PINATA_API_KEY: process.env.PINATA_API_KEY,
    PINATA_SECRET_KEY: process.env.PINATA_SECRET_KEY,
    PINATA_JWT: process.env.PINATA_JWT,
    NEXT_PUBLIC_SOLANA_RPC_URL: process.env.NEXT_PUBLIC_SOLANA_RPC_URL,
    NEXT_PUBLIC_NETWORK: process.env.NEXT_PUBLIC_NETWORK,
  }
}

// Client-side environment variables (prefixed with NEXT_PUBLIC_)
export function getClientEnv() {
  return {
    NEXT_PUBLIC_SOLANA_RPC_URL: process.env.NEXT_PUBLIC_SOLANA_RPC_URL,
    NEXT_PUBLIC_NETWORK: process.env.NEXT_PUBLIC_NETWORK,
    NEXT_PUBLIC_PINATA_JWT: process.env.NEXT_PUBLIC_PINATA_JWT,
  }
}

// Validate required environment variables
export function validateEnv() {
  const requiredServerVars = ["RARIBLE_API_KEY", "PINATA_API_KEY", "PINATA_SECRET_KEY", "PINATA_JWT"]
  const requiredClientVars = ["NEXT_PUBLIC_SOLANA_RPC_URL", "NEXT_PUBLIC_NETWORK"]

  const missing: string[] = []

  // Check server-side variables (only on server)
  if (typeof window === "undefined") {
    for (const varName of requiredServerVars) {
      if (!process.env[varName]) {
        missing.push(varName)
      }
    }
  }

  // Check client-side variables
  for (const varName of requiredClientVars) {
    if (!process.env[varName]) {
      missing.push(varName)
    }
  }

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`)
  }
}
