import { CONFIG } from "./config"

export interface EnvValidationResult {
  isValid: boolean
  errors: string[]
  warnings: string[]
}

export function validateEnvironment(): EnvValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  // Check required Pinata configuration
  if (!CONFIG.PINATA.jwt) {
    errors.push("NEXT_PUBLIC_PINATA_JWT environment variable is required")
  }

  if (!CONFIG.PINATA.apiKey) {
    warnings.push("NEXT_PUBLIC_PINATA_API_KEY is not set (optional)")
  }

  if (!CONFIG.PINATA.secretKey) {
    warnings.push("NEXT_PUBLIC_PINATA_SECRET_KEY is not set (optional)")
  }

  // Check Solana RPC URL
  if (!CONFIG.NETWORKS.mainnet.url.includes("mainnet-beta")) {
    warnings.push("Custom Solana RPC URL detected - ensure it's reliable for production")
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  }
}

export function logEnvironmentStatus(): void {
  const validation = validateEnvironment()

  if (!validation.isValid) {
    console.error("❌ Environment validation failed:")
    validation.errors.forEach((error) => console.error(`  - ${error}`))
  } else {
    console.log("✅ Environment validation passed")
  }

  if (validation.warnings.length > 0) {
    console.warn("⚠️ Environment warnings:")
    validation.warnings.forEach((warning) => console.warn(`  - ${warning}`))
  }
}
