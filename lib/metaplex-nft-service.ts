import { Connection, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js"
import { getAssociatedTokenAddress } from "@solana/spl-token"
import type { WalletAdapter } from "@solana/wallet-adapter-base"
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults"
import { walletAdapterIdentity } from "@metaplex-foundation/umi-signer-wallet-adapters"
import { createNft, mplTokenMetadata, findMetadataPda } from "@metaplex-foundation/mpl-token-metadata"
import { generateSigner, percentAmount, publicKey } from "@metaplex-foundation/umi"
import { CONFIG, type NetworkType, isEclipseNetwork } from "./config"
import { createError, ERROR_CODES } from "./errors"

export interface MetaplexNFTResult {
  mintAddress: string
  signature: string
  explorerUrl: string
  metadataAddress: string
  tokenAccount: string
  metadataUri: string
}

export interface MetaplexNFTOptions {
  name: string
  description: string
  imageUri: string
  metadataUri: string
  royalty: number
  wallet: WalletAdapter
  network: NetworkType
  onProgress?: (message: string) => void
}

class MetaplexNFTService {
  private getConnection(network: NetworkType): Connection {
    return new Connection(CONFIG.NETWORKS[network].url, "confirmed")
  }

  async estimateMintingCost(network: NetworkType): Promise<number> {
    try {
      const connection = this.getConnection(network)

      // Estimate costs for proper Metaplex NFT
      const mintRent = await connection.getMinimumBalanceForRentExemption(82) // Mint account
      const metadataRent = await connection.getMinimumBalanceForRentExemption(679) // Metadata account
      const masterEditionRent = await connection.getMinimumBalanceForRentExemption(282) // Master edition
      const ataRent = await connection.getMinimumBalanceForRentExemption(165) // Associated token account

      const transactionFees = 5000 * 3 // Multiple transactions

      return mintRent + metadataRent + masterEditionRent + ataRent + transactionFees
    } catch (error) {
      console.error("Failed to estimate cost:", error)
      return 0.01 * LAMPORTS_PER_SOL // ~0.01 SOL default
    }
  }

  async mintNFT(options: MetaplexNFTOptions): Promise<MetaplexNFTResult> {
    const { name, description, imageUri, metadataUri, royalty, wallet, network, onProgress } = options

    if (!wallet.publicKey) {
      throw createError(ERROR_CODES.WALLET_NOT_CONNECTED, "Wallet not connected")
    }

    try {
      onProgress?.("Setting up Metaplex UMI...")

      // Create UMI instance with retry configuration
      const umi = createUmi(CONFIG.NETWORKS[network].url, {
        commitment: "confirmed",
      })
        .use(mplTokenMetadata())
        .use(walletAdapterIdentity(wallet))

      onProgress?.("Checking wallet balance...")

      // Check wallet balance
      const connection = this.getConnection(network)
      const balance = await connection.getBalance(wallet.publicKey)
      const estimatedCost = await this.estimateMintingCost(network)

      if (balance < estimatedCost) {
        throw createError(
          ERROR_CODES.INSUFFICIENT_FUNDS,
          `Insufficient funds. Need at least ${(estimatedCost / LAMPORTS_PER_SOL).toFixed(4)} ${isEclipseNetwork(network) ? "ETH" : "SOL"}`,
        )
      }

      onProgress?.("Generating mint keypair...")

      // Generate mint signer
      const mint = generateSigner(umi)

      onProgress?.("Creating NFT with metadata...")

      // Create NFT using Metaplex UMI with retry logic
      let result
      let retryCount = 0
      const maxRetries = 3

      while (retryCount < maxRetries) {
        try {
          result = await createNft(umi, {
            mint,
            name,
            uri: metadataUri,
            sellerFeeBasisPoints: percentAmount(royalty / 100), // Convert basis points to percentage
            creators: [
              {
                address: umi.identity.publicKey,
                verified: true,
                share: 100,
              },
            ],
            isMutable: true,
            symbol: "NFT",
            collection: null,
            uses: null,
          }).sendAndConfirm(umi, {
            confirm: {
              commitment: "confirmed",
              strategy: {
                type: "blockhash",
                blockhash: await umi.rpc.getLatestBlockhash(),
              },
            },
            send: {
              skipPreflight: false,
              maxRetries: 3,
            },
          })

          break // Success, exit retry loop
        } catch (error) {
          retryCount++
          if (error instanceof Error && error.message.includes("Blockhash not found") && retryCount < maxRetries) {
            onProgress?.(`Retrying transaction (attempt ${retryCount + 1}/${maxRetries})...`)
            // Wait a bit before retrying
            await new Promise((resolve) => setTimeout(resolve, 2000))
            continue
          }
          throw error // Re-throw if not a blockhash error or max retries reached
        }
      }

      if (!result) {
        throw new Error("Failed to create NFT after maximum retries")
      }

      onProgress?.("NFT created successfully!")

      // Calculate the Associated Token Account address
      const mintPublicKey = new PublicKey(mint.publicKey.toString())
      const ownerPublicKey = new PublicKey(umi.identity.publicKey.toString())
      const tokenAccount = await getAssociatedTokenAddress(mintPublicKey, ownerPublicKey)

      // Get metadata address using UMI
      const metadataAddress = findMetadataPda(umi, { mint: publicKey(mint.publicKey) })

      // Generate explorer URL
      const explorerUrl = `${CONFIG.NETWORKS[network].explorer}/tx/${result.signature}${
        network.includes("testnet") || network.includes("devnet") ? "?cluster=testnet" : ""
      }`

      return {
        mintAddress: mint.publicKey.toString(),
        signature: result.signature,
        explorerUrl,
        metadataAddress: metadataAddress[0].toString(),
        tokenAccount: tokenAccount.toString(),
        metadataUri,
      }
    } catch (error) {
      console.error("Metaplex NFT minting failed:", error)

      if (error instanceof Error) {
        if (error.message.includes("insufficient funds")) {
          throw createError(ERROR_CODES.INSUFFICIENT_FUNDS, "Insufficient funds for minting")
        }
        if (error.message.includes("User rejected")) {
          throw createError(ERROR_CODES.TRANSACTION_FAILED, "Transaction was rejected by user")
        }
        if (error.message.includes("Simulation failed") || error.message.includes("Blockhash not found")) {
          throw createError(ERROR_CODES.NETWORK_ERROR, "Network error - please try again")
        }
      }

      throw createError(
        ERROR_CODES.MINT_FAILED,
        `NFT minting failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      )
    }
  }

  async verifyNFT(mintAddress: string, network: NetworkType): Promise<boolean> {
    try {
      const connection = this.getConnection(network)
      const mintPublicKey = new PublicKey(mintAddress)

      // Check if mint account exists
      const mintInfo = await connection.getAccountInfo(mintPublicKey)
      return !!mintInfo
    } catch (error) {
      console.error("NFT verification failed:", error)
      return false
    }
  }
}

export const metaplexNFTService = new MetaplexNFTService()
