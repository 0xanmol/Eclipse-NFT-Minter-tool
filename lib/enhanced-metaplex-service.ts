import { Connection, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js"
import { getAssociatedTokenAddress } from "@solana/spl-token"
import type { WalletAdapter } from "@solana/wallet-adapter-base"
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults"
import { walletAdapterIdentity } from "@metaplex-foundation/umi-signer-wallet-adapters"
import { createNft, mplTokenMetadata, findMetadataPda, TokenStandard } from "@metaplex-foundation/mpl-token-metadata"
import { generateSigner, percentAmount, publicKey } from "@metaplex-foundation/umi"
import type { PublicKey as UmiPublicKey } from "@metaplex-foundation/umi"
import { CONFIG, type NetworkType, isEclipseNetwork } from "./config"
import { createError, ERROR_CODES } from "./errors"
import bs58 from "bs58"

export interface EnhancedMintResult {
  mintAddress: string
  signature: string
  explorerUrl: string
  metadataAddress: string
  tokenAccount: string
  metadataUri: string
  editionNumber?: number
  masterEdition?: string
}

export interface BatchMintResult {
  results: EnhancedMintResult[]
  totalMinted: number
  failed: number
  totalCost: number
  insufficientFunds?: boolean
  remainingBalance?: number
}

export interface SingleMintOptions {
  name: string
  description: string
  imageUri: string
  metadataUri: string
  royalty: number
  wallet: WalletAdapter
  network: NetworkType
  recipientAddress?: string
  onProgress?: (message: string) => void
}

export interface CollectionMintOptions {
  collectionCollection: string
  description: string
  imageUris: string[]
  metadataUris: string[]
  royalty: number
  wallet: WalletAdapter
  network: NetworkType
  recipients?: string[]
  onProgress?: (message: string, current: number, total: number) => void
}

// Helper function to get transaction URL based on network
const getTransactionUrl = (signature: string, network: string): string => {
  switch (network) {
    case "mainnet-beta":
      return `https://explorer.solana.com/tx/${signature}`
    case "devnet":
      return `https://explorer.solana.com/tx/${signature}?cluster=devnet`
    case "testnet":
      return `https://explorer.solana.com/tx/${signature}?cluster=testnet`
    default:
      return `https://explorer.solana.com/tx/${signature}?cluster=devnet` // Default to devnet
  }
}

class EnhancedMetaplexService {
  private getConnection(network: NetworkType): Connection {
    return new Connection(CONFIG.NETWORKS[network].url, "confirmed")
  }

  private convertToUmiPublicKey(address: string): UmiPublicKey {
    return publicKey(address.trim())
  }

  private validateAndConvertAddress(address: string): {
    isValid: boolean
    solanaKey?: PublicKey
    umiKey?: UmiPublicKey
  } {
    try {
      // First validate as Solana PublicKey
      const solanaKey = new PublicKey(address.trim())

      // Then convert to UMI PublicKey
      const umiKey = this.convertToUmiPublicKey(address)

      return {
        isValid: true,
        solanaKey,
        umiKey,
      }
    } catch (error) {
      console.warn(`Invalid address: ${address}`, error)
      return { isValid: false }
    }
  }

  // Helper function to ensure signature is a proper string
  private formatSignature(signature: any): string {
    if (typeof signature === "string") {
      return signature
    }

    // If it's a Uint8Array, convert to base58
    if (signature instanceof Uint8Array) {
      // Convert Uint8Array to base58 string
      return bs58.encode(signature)
    }

    // If it has a signature property, extract it
    if (signature && signature.signature) {
      return this.formatSignature(signature.signature)
    }

    // If it's an array of numbers, convert to Uint8Array first then to base58
    if (Array.isArray(signature)) {
      return bs58.encode(new Uint8Array(signature))
    }

    // Fallback: convert to string
    return String(signature)
  }

  // Helper function to create explorer URLs
  private createExplorerUrl(
    signature: string,
    network: NetworkType,
    type: "tx" | "token" = "tx",
    address?: string,
  ): string {
    const formattedSignature = this.formatSignature(signature)

    if (isEclipseNetwork(network)) {
      const baseUrl = "https://eclipsescan.xyz"
      const urlType = type === "tx" ? "tx" : "token"
      const targetAddress = type === "tx" ? formattedSignature : address

      if (network.includes("testnet")) {
        return `${baseUrl}/${urlType}/${targetAddress}?cluster=testnet`
      } else {
        return `${baseUrl}/${urlType}/${targetAddress}`
      }
    } else {
      // Solana networks
      const baseUrl = "https://explorer.solana.com"
      const urlType = type === "tx" ? "tx" : "address"
      const targetAddress = type === "tx" ? formattedSignature : address

      if (network === "mainnet-beta") {
        return `${baseUrl}/${urlType}/${targetAddress}`
      } else {
        return `${baseUrl}/${urlType}/${targetAddress}?cluster=${network}`
      }
    }
  }

  async estimateMintingCost(
    network: NetworkType,
    mintType: "single" | "collection", // Remove "editions"
    quantity = 1,
  ): Promise<number> {
    try {
      const connection = this.getConnection(network)
      const mintRent = await connection.getMinimumBalanceForRentExemption(82)
      const metadataRent = await connection.getMinimumBalanceForRentExemption(679)
      const ataRent = await connection.getMinimumBalanceForRentExemption(165)
      const transactionFees = 5000 * 2 // Base fee per transaction (rough estimate)
      let totalCost = 0

      switch (mintType) {
        case "single":
          totalCost = mintRent + metadataRent + ataRent + transactionFees
          break
        case "collection":
          // Cost per NFT + transaction fee per NFT (since they are minted individually)
          totalCost = (mintRent + metadataRent + ataRent + transactionFees) * quantity
          break
      }
      return totalCost
    } catch (error) {
      console.error("Failed to estimate cost:", error)
      return 0.01 * LAMPORTS_PER_SOL * quantity
    }
  }

  private async checkWalletBalance(
    connection: Connection,
    walletPublicKey: PublicKey,
    requiredAmount: number,
    network: NetworkType,
  ): Promise<{ sufficient: boolean; balance: number; shortfall: number }> {
    const balance = await connection.getBalance(walletPublicKey)
    const sufficient = balance >= requiredAmount
    const shortfall = sufficient ? 0 : requiredAmount - balance

    return {
      sufficient,
      balance,
      shortfall,
    }
  }

  async mintSingleNFT(options: SingleMintOptions): Promise<EnhancedMintResult> {
    const { name, description, imageUri, metadataUri, royalty, wallet, network, recipientAddress, onProgress } = options
    if (!wallet.publicKey) throw createError(ERROR_CODES.WALLET_NOT_CONNECTED, "Wallet not connected")

    try {
      onProgress?.("Setting up Metaplex UMI...")
      const umi = createUmi(CONFIG.NETWORKS[network].url, { commitment: "confirmed" })
        .use(mplTokenMetadata())
        .use(walletAdapterIdentity(wallet))

      onProgress?.("Checking wallet balance...")
      const connection = this.getConnection(network)
      const estimatedCost = await this.estimateMintingCost(network, "single")
      const balanceCheck = await this.checkWalletBalance(connection, wallet.publicKey, estimatedCost, network)

      if (!balanceCheck.sufficient) {
        throw createError(
          ERROR_CODES.INSUFFICIENT_FUNDS,
          `Insufficient funds. Need ${(estimatedCost / LAMPORTS_PER_SOL).toFixed(4)} ${isEclipseNetwork(network) ? "ETH" : "SOL"}, but only have ${(balanceCheck.balance / LAMPORTS_PER_SOL).toFixed(4)} ${isEclipseNetwork(network) ? "ETH" : "SOL"}. Shortfall: ${(balanceCheck.shortfall / LAMPORTS_PER_SOL).toFixed(4)} ${isEclipseNetwork(network) ? "ETH" : "SOL"}`,
        )
      }

      onProgress?.("Creating NFT...")
      const mint = generateSigner(umi)

      // Handle recipient address validation
      let recipientUmiPk = umi.identity.publicKey
      let recipientSolanaPk = wallet.publicKey

      if (recipientAddress && recipientAddress.trim()) {
        const validation = this.validateAndConvertAddress(recipientAddress)
        if (validation.isValid && validation.umiKey && validation.solanaKey) {
          recipientUmiPk = validation.umiKey
          recipientSolanaPk = validation.solanaKey
        } else {
          console.warn(`Invalid recipient address ${recipientAddress}, using wallet owner.`)
        }
      }

      const result = await createNft(umi, {
        mint,
        name,
        uri: metadataUri,
        sellerFeeBasisPoints: percentAmount(royalty / 100),
        creators: [{ address: umi.identity.publicKey, verified: true, share: 100 }],
        isMutable: true,
        symbol: "NFT",
        tokenStandard: TokenStandard.NonFungible,
        tokenOwner: recipientUmiPk,
      }).sendAndConfirm(umi, {
        confirm: {
          commitment: "confirmed",
          strategy: { type: "blockhash", blockhash: await umi.rpc.getLatestBlockhash() },
        },
        send: { skipPreflight: false, maxRetries: 3 },
      })

      onProgress?.("NFT created successfully!")
      const mintPublicKey = new PublicKey(mint.publicKey.toString())
      const tokenAccount = await getAssociatedTokenAddress(mintPublicKey, recipientSolanaPk)
      const [metadataAddressPda, _metadataBump] = findMetadataPda(umi, { mint: mint.publicKey })

      // Format the signature properly
      const formattedSignature = this.formatSignature(result.signature)
      console.log("Raw signature:", result.signature)
      console.log("Formatted signature:", formattedSignature)

      return {
        mintAddress: mint.publicKey.toString(),
        signature: formattedSignature,
        explorerUrl: this.createExplorerUrl(formattedSignature, network, "tx"),
        metadataAddress: metadataAddressPda.toString(),
        tokenAccount: tokenAccount.toString(),
        metadataUri,
      }
    } catch (error) {
      console.error("Single NFT minting failed:", error)
      throw this.handleMintingError(error)
    }
  }

  async mintCollection(options: CollectionMintOptions): Promise<BatchMintResult> {
    const { collectionName, description, imageUris, metadataUris, royalty, wallet, network, recipients, onProgress } =
      options

    if (!wallet.publicKey) {
      throw createError(ERROR_CODES.WALLET_NOT_CONNECTED, "Wallet not connected")
    }
    if (imageUris.length !== metadataUris.length) {
      throw createError(ERROR_CODES.VALIDATION_ERROR, "Image and metadata counts must match")
    }

    try {
      const umi = createUmi(CONFIG.NETWORKS[network].url, { commitment: "confirmed" })
        .use(mplTokenMetadata())
        .use(walletAdapterIdentity(wallet))

      const totalNFTs = imageUris.length
      const connection = this.getConnection(network)

      // Initial balance check
      const estimatedCost = await this.estimateMintingCost(network, "collection", totalNFTs)
      const initialBalanceCheck = await this.checkWalletBalance(connection, wallet.publicKey, estimatedCost, network)

      if (!initialBalanceCheck.sufficient) {
        throw createError(
          ERROR_CODES.INSUFFICIENT_FUNDS,
          `Insufficient funds for ${totalNFTs} NFTs. Need ${(estimatedCost / LAMPORTS_PER_SOL).toFixed(4)} ${isEclipseNetwork(network) ? "ETH" : "SOL"}, but only have ${(initialBalanceCheck.balance / LAMPORTS_PER_SOL).toFixed(4)} ${isEclipseNetwork(network) ? "ETH" : "SOL"}. Please add ${(initialBalanceCheck.shortfall / LAMPORTS_PER_SOL).toFixed(4)} ${isEclipseNetwork(network) ? "ETH" : "SOL"} to your wallet.`,
        )
      }

      onProgress?.("Validating recipient addresses...", 0, totalNFTs)

      // Pre-validate all recipient addresses
      const validatedRecipients: Array<{ umiKey: UmiPublicKey; solanaKey: PublicKey }> = []

      for (let i = 0; i < totalNFTs; i++) {
        if (recipients && recipients[i] && recipients[i].trim()) {
          const validation = this.validateAndConvertAddress(recipients[i])
          if (validation.isValid && validation.umiKey && validation.solanaKey) {
            validatedRecipients[i] = {
              umiKey: validation.umiKey,
              solanaKey: validation.solanaKey,
            }
          } else {
            console.warn(`Invalid recipient address ${recipients[i]} for NFT ${i + 1}, will use wallet owner.`)
            validatedRecipients[i] = {
              umiKey: umi.identity.publicKey,
              solanaKey: wallet.publicKey,
            }
          }
        } else {
          validatedRecipients[i] = {
            umiKey: umi.identity.publicKey,
            solanaKey: wallet.publicKey,
          }
        }
      }

      onProgress?.("Creating NFTs one by one...", 0, totalNFTs)

      const results: EnhancedMintResult[] = []
      let successfulMints = 0
      let insufficientFundsDetected = false
      let finalBalance = initialBalanceCheck.balance

      for (let i = 0; i < totalNFTs; i++) {
        let retryCount = 0
        const maxRetries = 3
        let lastError: any = null

        // Check balance before each NFT (after the first few)
        if (i > 0 && i % 2 === 0) {
          const currentBalance = await connection.getBalance(wallet.publicKey)
          const costPerNFT = await this.estimateMintingCost(network, "single")
          const remainingNFTs = totalNFTs - i
          const estimatedRemainingCost = costPerNFT * remainingNFTs

          if (currentBalance < estimatedRemainingCost) {
            console.warn(
              `Insufficient funds detected at NFT ${i + 1}. Balance: ${(currentBalance / LAMPORTS_PER_SOL).toFixed(4)}, Estimated remaining cost: ${(estimatedRemainingCost / LAMPORTS_PER_SOL).toFixed(4)}`,
            )
            onProgress?.(
              `⚠️ Low balance detected. May not be able to mint all remaining NFTs. Current: ${(currentBalance / LAMPORTS_PER_SOL).toFixed(4)} ${isEclipseNetwork(network) ? "ETH" : "SOL"}`,
              successfulMints,
              totalNFTs,
            )
          }
        }

        while (retryCount <= maxRetries) {
          try {
            onProgress?.(
              `Creating NFT ${i + 1} of ${totalNFTs}${retryCount > 0 ? ` (retry ${retryCount})` : ""}...`,
              i,
              totalNFTs,
            )

            const mintSigner = generateSigner(umi)
            const recipientInfo = validatedRecipients[i]

            console.log(`Creating NFT ${i + 1} (attempt ${retryCount + 1}):`, {
              name: `${collectionName} #${i + 1}`,
              metadataUri: metadataUris[i],
              recipientUmi: recipientInfo.umiKey.toString(),
              recipientSolana: recipientInfo.solanaKey.toString(),
            })

            const result = await createNft(umi, {
              mint: mintSigner,
              name: `${collectionName} #${i + 1}`,
              uri: metadataUris[i],
              sellerFeeBasisPoints: percentAmount(royalty / 100),
              creators: [{ address: umi.identity.publicKey, verified: true, share: 100 }],
              isMutable: true,
              symbol: "NFT",
              tokenStandard: TokenStandard.NonFungible,
              tokenOwner: recipientInfo.umiKey,
            }).sendAndConfirm(umi, {
              confirm: {
                commitment: "confirmed",
                strategy: { type: "blockhash", blockhash: await umi.rpc.getLatestBlockhash() },
              },
              send: { skipPreflight: false, maxRetries: 3 },
            })

            console.log(`NFT ${i + 1} created successfully. Raw signature:`, result.signature)

            // Use the validated Solana PublicKey for token account calculation
            const mintPublicKey = new PublicKey(mintSigner.publicKey.toString())
            const tokenAccount = await getAssociatedTokenAddress(mintPublicKey, recipientInfo.solanaKey)
            const [metadataAddressPda, _] = findMetadataPda(umi, { mint: mintSigner.publicKey })

            // Format the signature properly
            const formattedSignature = this.formatSignature(result.signature)
            console.log(`NFT ${i + 1} formatted signature:`, formattedSignature)

            results.push({
              mintAddress: mintSigner.publicKey.toString(),
              signature: formattedSignature,
              explorerUrl: this.createExplorerUrl(formattedSignature, network, "tx"),
              metadataAddress: metadataAddressPda.toString(),
              tokenAccount: tokenAccount.toString(),
              metadataUri: metadataUris[i],
            })

            successfulMints++
            break // Success, exit retry loop
          } catch (error) {
            lastError = error
            retryCount++

            // Check if this is an insufficient funds error
            const errorMessage = error instanceof Error ? error.message : String(error)
            if (errorMessage.includes("insufficient lamports") || errorMessage.includes("Insufficient funds")) {
              insufficientFundsDetected = true
              finalBalance = await connection.getBalance(wallet.publicKey)

              console.error(`Insufficient funds detected at NFT ${i + 1}:`, {
                error: errorMessage,
                currentBalance: (finalBalance / LAMPORTS_PER_SOL).toFixed(4),
                successfulMints,
                remainingNFTs: totalNFTs - i,
              })

              onProgress?.(
                `💰 Insufficient funds at NFT ${i + 1}. Could mint ${successfulMints}/${totalNFTs}. Balance: ${(finalBalance / LAMPORTS_PER_SOL).toFixed(4)} ${isEclipseNetwork(network) ? "ETH" : "SOL"}`,
                successfulMints,
                totalNFTs,
              )

              // Don't retry insufficient funds errors, move to next NFT
              break
            }

            // Detailed error logging for other errors
            console.error(`Failed to create NFT ${i + 1} (attempt ${retryCount}):`, {
              error: error,
              errorMessage: errorMessage,
              errorName: error instanceof Error ? error.name : "Unknown",
              errorStack: error instanceof Error ? error.stack : undefined,
              errorCause: (error as any)?.cause,
              errorCode: (error as any)?.code,
              errorDetails: (error as any)?.details,
              fullErrorObject: JSON.stringify(error, Object.getOwnPropertyNames(error)),
            })

            if (retryCount <= maxRetries) {
              const waitTime = retryCount * 2000 // Exponential backoff
              console.log(`Retrying NFT ${i + 1} in ${waitTime}ms...`)
              onProgress?.(
                `NFT ${i + 1} failed, retrying in ${waitTime / 1000}s... (${errorMessage})`,
                successfulMints,
                totalNFTs,
              )
              await new Promise((resolve) => setTimeout(resolve, waitTime))
            } else {
              // All retries exhausted
              console.error(`All retries exhausted for NFT ${i + 1}. Final error:`, lastError)
              onProgress?.(
                `Failed to create NFT ${i + 1} after ${maxRetries} retries: ${errorMessage}`,
                successfulMints,
                totalNFTs,
              )
            }
          }
        }

        // If insufficient funds detected, stop trying to mint more NFTs
        if (insufficientFundsDetected && retryCount > maxRetries) {
          onProgress?.(
            `⛔ Stopping collection minting due to insufficient funds. Successfully minted ${successfulMints}/${totalNFTs} NFTs.`,
            successfulMints,
            totalNFTs,
          )
          break
        }

        // Add delay between different NFTs (not retries)
        if (i < totalNFTs - 1) {
          await new Promise((resolve) => setTimeout(resolve, 1000))
        }
      }

      // Get final balance
      finalBalance = await connection.getBalance(wallet.publicKey)

      onProgress?.(`Collection minting complete!`, successfulMints, totalNFTs)

      return {
        results,
        totalMinted: successfulMints,
        failed: totalNFTs - successfulMints,
        totalCost: estimatedCost,
        insufficientFunds: insufficientFundsDetected,
        remainingBalance: finalBalance,
      }
    } catch (error) {
      console.error("Collection minting failed:", error)
      throw this.handleMintingError(error)
    }
  }

  private handleMintingError(error: any): Error {
    console.error("Detailed error analysis:", {
      errorType: typeof error,
      errorName: error?.name,
      errorMessage: error?.message,
      errorStack: error?.stack,
      errorCause: error?.cause,
      errorCode: error?.code,
      fullError: error,
    })

    if (error instanceof Error) {
      if (
        error.message.includes("insufficient lamports") ||
        error.message.includes("insufficient funds") ||
        error.message.includes("Insufficient funds")
      ) {
        return createError(
          ERROR_CODES.INSUFFICIENT_FUNDS,
          "Insufficient funds for minting. Please add more SOL/ETH to your wallet.",
        )
      }
      if (error.message.includes("User rejected") || error.message.includes("Transaction rejected")) {
        return createError(ERROR_CODES.TRANSACTION_FAILED, "Transaction was rejected by user")
      }
      if (error.message.includes("Simulation failed") || error.message.includes("Blockhash not found")) {
        return createError(ERROR_CODES.TRANSACTION_FAILED, `Transaction simulation failed: ${error.message}`)
      }
      if (error.message.includes("Overruns Uint8Array") || error.message.includes("too large")) {
        return createError(
          ERROR_CODES.TRANSACTION_TOO_LARGE,
          "Transaction too large. Try reducing metadata size or batch size.",
        )
      }
      if (error.name === "TokenOwnerOffCurveError") {
        return createError(
          ERROR_CODES.VALIDATION_ERROR,
          "Invalid recipient address - address is not on the Ed25519 curve. Please check the recipient address format.",
        )
      }

      // Return the original error message for better debugging
      return createError(ERROR_CODES.MINT_FAILED, `NFT minting failed: ${error.message}`)
    }

    const errorMessage = String(error)
    return createError(ERROR_CODES.MINT_FAILED, `NFT minting failed: ${errorMessage}`)
  }
}

export const enhancedMetaplexService = new EnhancedMetaplexService()
