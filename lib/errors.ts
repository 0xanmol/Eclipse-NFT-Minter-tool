export class NFTMinterError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: any,
  ) {
    super(message)
    this.name = "NFTMinterError"
  }
}

export const ERROR_CODES = {
  // Wallet errors
  WALLET_NOT_CONNECTED: "WALLET_NOT_CONNECTED",
  WALLET_CONNECTION_FAILED: "WALLET_CONNECTION_FAILED",
  INSUFFICIENT_FUNDS: "INSUFFICIENT_FUNDS",

  // File errors
  FILE_TOO_LARGE: "FILE_TOO_LARGE",
  INVALID_FILE_TYPE: "INVALID_FILE_TYPE",
  FILE_UPLOAD_FAILED: "FILE_UPLOAD_FAILED",

  // Validation errors
  INVALID_METADATA: "INVALID_METADATA",
  MISSING_REQUIRED_FIELDS: "MISSING_REQUIRED_FIELDS",

  // Network errors
  NETWORK_ERROR: "NETWORK_ERROR",
  RPC_ERROR: "RPC_ERROR",

  // Minting errors
  MINT_FAILED: "MINT_FAILED",
  TRANSACTION_FAILED: "TRANSACTION_FAILED",
  CONFIRMATION_TIMEOUT: "CONFIRMATION_TIMEOUT",
} as const

export function getErrorMessage(error: unknown): string {
  if (error instanceof NFTMinterError) {
    return error.message
  }

  if (error instanceof Error) {
    return error.message
  }

  return "An unknown error occurred"
}

export function createError(code: string, message: string, details?: any): NFTMinterError {
  return new NFTMinterError(message, code, details)
}

export function isNFTMinterError(error: unknown): error is NFTMinterError {
  return error instanceof NFTMinterError
}

export function handleError(error: unknown): { message: string; code?: string } {
  if (isNFTMinterError(error)) {
    return {
      message: error.message,
      code: error.code,
    }
  }

  return {
    message: getErrorMessage(error),
  }
}
