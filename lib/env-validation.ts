import { CONFIG } from "./config"

export interface EnvValidationResult {
  isValid: boolean
  errors: string[]
  warnings: string[]
}

export function validateEnvironment(): EnvValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  // Only check public environment variables on client
  if (!CONFIG.PINATA.jwt) {
    errors.push("NEXT_PUBLIC_PINATA_JWT environment variable is required")
  }

  // Check Solana RPC URL
  if (!CONFIG.NETWORKS["solana-mainnet"].url.includes("mainnet-beta")) {
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
