import { Connection, PublicKey, LAMPORTS_PER_SOL, Keypair, Transaction, SystemProgram } from "@solana/web3.js"
import {
  createInitializeMintInstruction,
  createAssociatedTokenAccountInstruction,
  createMintToInstruction,
  getAssociatedTokenAddress,
  MINT_SIZE,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token"
import type { WalletAdapter } from "@solana/wallet-adapter-base"
import { CONFIG, type NetworkType } from "./config"
import { createError, ERROR_CODES } from "./errors"

export interface SimpleNFTResult {
  mintAddress: string
  signature: string
  explorerUrl: string
  tokenAccount: string
  metadataUri: string
}

export interface SimpleNFTOptions {
  name: string
  symbol: string
  description: string
  imageUri: string
  metadataUri: string
  royalty: number
  wallet: WalletAdapter
  network: NetworkType
  onProgress?: (message: string) => void
}

class SimpleNFTService {
  private getConnection(network: NetworkType): Connection {
    return new Connection(CONFIG.NETWORKS[network].url, "confirmed")
  }

  async estimateMintingCost(network: NetworkType): Promise<number> {
    try {
      const connection = this.getConnection(network)

      // Estimate costs for simple NFT (SPL token with metadata URI):
      const mintRent = await connection.getMinimumBalanceForRentExemption(MINT_SIZE)
      const ataRent = await connection.getMinimumBalanceForRentExemption(165)
      const transactionFees = 5000 * 2 // Transaction fees

      return mintRent + ataRent + transactionFees
    } catch (error) {
      console.error("Failed to estimate cost:", error)
      return 0.003 * LAMPORTS_PER_SOL
    }
  }

  async mintNFT(options: SimpleNFTOptions): Promise<SimpleNFTResult> {
    const { name, symbol, description, imageUri, metadataUri, royalty, wallet, network, onProgress } = options

    if (!wallet.publicKey) {
      throw createError(ERROR_CODES.WALLET_NOT_CONNECTED, "Wallet not connected")
    }

    if (!wallet.signTransaction) {
      throw createError(ERROR_CODES.WALLET_NOT_CONNECTED, "Wallet does not support transaction signing")
    }

    try {
      const connection = this.getConnection(network)
      onProgress?.("Connecting to network...")

      // Check wallet balance
      const balance = await connection.getBalance(wallet.publicKey)
      const estimatedCost = await this.estimateMintingCost(network)

      if (balance < estimatedCost) {
        throw createError(
          ERROR_CODES.INSUFFICIENT_FUNDS,
          `Insufficient funds. Need at least ${(estimatedCost / LAMPORTS_PER_SOL).toFixed(4)} tokens`,
        )
      }

      onProgress?.("Creating mint account...")

      // Step 1: Create mint account
      const mintKeypair = Keypair.generate()
      const mintRent = await connection.getMinimumBalanceForRentExemption(MINT_SIZE)

      const createMintAccountInstruction = SystemProgram.createAccount({
        fromPubkey: wallet.publicKey,
        newAccountPubkey: mintKeypair.publicKey,
        space: MINT_SIZE,
        lamports: mintRent,
        programId: TOKEN_PROGRAM_ID,
      })

      const initializeMintInstruction = createInitializeMintInstruction(
        mintKeypair.publicKey,
        0, // decimals (0 for NFT)
        wallet.publicKey, // mint authority
        wallet.publicKey, // freeze authority
      )

      onProgress?.("Creating token account...")

      // Step 2: Create associated token account
      const associatedTokenAccount = await getAssociatedTokenAddress(mintKeypair.publicKey, wallet.publicKey)

      const createATAInstruction = createAssociatedTokenAccountInstruction(
        wallet.publicKey, // payer
        associatedTokenAccount, // ata
        wallet.publicKey, // owner
        mintKeypair.publicKey, // mint
      )

      onProgress?.("Minting NFT token...")

      // Step 3: Mint 1 token (making it an NFT)
      const mintToInstruction = createMintToInstruction(
        mintKeypair.publicKey, // mint
        associatedTokenAccount, // destination
        wallet.publicKey, // authority
        1, // amount (1 for NFT)
      )

      // Create transaction with all instructions
      const transaction = new Transaction().add(
        createMintAccountInstruction,
        initializeMintInstruction,
        createATAInstruction,
        mintToInstruction,
      )

      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash()
      transaction.recentBlockhash = blockhash
      transaction.feePayer = wallet.publicKey

      // Sign with mint keypair
      transaction.partialSign(mintKeypair)

      onProgress?.("Signing transaction...")

      // Sign with wallet
      const signedTransaction = await wallet.signTransaction(transaction)

      onProgress?.("Sending transaction...")

      // Send transaction
      const signature = await connection.sendRawTransaction(signedTransaction.serialize(), {
        skipPreflight: false,
        preflightCommitment: "confirmed",
      })

      onProgress?.("Confirming transaction...")

      // Confirm transaction
      const confirmation = await connection.confirmTransaction(
        {
          signature,
          blockhash,
          lastValidBlockHeight,
        },
        "confirmed",
      )

      if (confirmation.value.err) {
        throw new Error(`Transaction failed: ${confirmation.value.err}`)
      }

      // Generate explorer URL
      const explorerUrl = `${CONFIG.NETWORKS[network].explorer}/tx/${signature}${
        network.includes("testnet") || network.includes("devnet") ? "?cluster=testnet" : ""
      }`

      onProgress?.("NFT token created successfully!")

      return {
        mintAddress: mintKeypair.publicKey.toString(),
        signature,
        explorerUrl,
        tokenAccount: associatedTokenAccount.toString(),
        metadataUri,
      }
    } catch (error) {
      console.error("Simple NFT minting failed:", error)

      if (error instanceof Error) {
        if (error.message.includes("insufficient funds")) {
          throw createError(ERROR_CODES.INSUFFICIENT_FUNDS, "Insufficient funds for minting")
        }
        if (error.message.includes("User rejected")) {
          throw createError(ERROR_CODES.TRANSACTION_FAILED, "Transaction was rejected by user")
        }
        if (error.message.includes("Simulation failed")) {
          throw createError(ERROR_CODES.NETWORK_ERROR, "Transaction simulation failed - please try again")
        }
      }

      throw createError(
        ERROR_CODES.MINT_FAILED,
        `Simple NFT minting failed: ${error instanceof Error ? error.message : "Unknown error"}`,
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

export const simpleNFTService = new SimpleNFTService()
