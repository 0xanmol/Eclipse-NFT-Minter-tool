import { Connection, PublicKey, Transaction, LAMPORTS_PER_SOL, Keypair, SystemProgram } from "@solana/web3.js"
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

// Token Metadata Program ID (Metaplex)
const TOKEN_METADATA_PROGRAM_ID = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s")

export interface SimpleMintResult {
  mintAddress: string
  signature: string
  explorerUrl: string
  tokenAccount: string
}

export interface SimpleMintOptions {
  name: string
  symbol: string
  uri: string
  royalty: number
  wallet: WalletAdapter
  network: NetworkType
  onProgress?: (message: string) => void
}

class SimpleMintingService {
  private getConnection(network: NetworkType): Connection {
    return new Connection(CONFIG.NETWORKS[network].url, "confirmed")
  }

  async estimateMintingCost(network: NetworkType): Promise<number> {
    try {
      const connection = this.getConnection(network)

      // Get minimum balance for rent exemption
      const mintRent = await connection.getMinimumBalanceForRentExemption(MINT_SIZE)
      const ataRent = await connection.getMinimumBalanceForRentExemption(165)

      // Estimate transaction fees (5000 lamports per signature, ~3 signatures)
      const transactionFees = 5000 * 3

      return mintRent + ataRent + transactionFees
    } catch (error) {
      console.error("Failed to estimate cost:", error)
      return 0.005 * LAMPORTS_PER_SOL // ~0.005 SOL default
    }
  }

  async mintSimpleNFT(options: SimpleMintOptions): Promise<SimpleMintResult> {
    const { name, symbol, uri, royalty, wallet, network, onProgress } = options

    if (!wallet.publicKey) {
      throw createError(ERROR_CODES.WALLET_NOT_CONNECTED, "Wallet not connected")
    }

    if (!wallet.signTransaction) {
      throw createError(ERROR_CODES.WALLET_NOT_CONNECTED, "Wallet does not support transaction signing")
    }

    try {
      const connection = this.getConnection(network)
      onProgress?.("Connecting to Solana network...")

      // Check wallet balance
      const balance = await connection.getBalance(wallet.publicKey)
      const estimatedCost = await this.estimateMintingCost(network)

      if (balance < estimatedCost) {
        throw createError(
          ERROR_CODES.INSUFFICIENT_FUNDS,
          `Insufficient funds. Need at least ${(estimatedCost / LAMPORTS_PER_SOL).toFixed(4)} SOL, but wallet has ${(balance / LAMPORTS_PER_SOL).toFixed(4)} SOL`,
        )
      }

      onProgress?.("Creating mint account...")

      // Generate keypair for the mint
      const mintKeypair = Keypair.generate()

      // Get minimum balance for mint account
      const mintRent = await connection.getMinimumBalanceForRentExemption(MINT_SIZE)

      // Create mint account instruction
      const createMintAccountInstruction = SystemProgram.createAccount({
        fromPubkey: wallet.publicKey,
        newAccountPubkey: mintKeypair.publicKey,
        space: MINT_SIZE,
        lamports: mintRent,
        programId: TOKEN_PROGRAM_ID,
      })

      // Initialize mint instruction
      const initializeMintInstruction = createInitializeMintInstruction(
        mintKeypair.publicKey,
        0, // decimals
        wallet.publicKey, // mint authority
        wallet.publicKey, // freeze authority
      )

      onProgress?.("Creating token account...")

      // Get associated token account address
      const associatedTokenAccount = await getAssociatedTokenAddress(mintKeypair.publicKey, wallet.publicKey)

      // Create associated token account instruction
      const createATAInstruction = createAssociatedTokenAccountInstruction(
        wallet.publicKey, // payer
        associatedTokenAccount, // ata
        wallet.publicKey, // owner
        mintKeypair.publicKey, // mint
      )

      onProgress?.("Minting token...")

      // Mint to instruction
      const mintToInstruction = createMintToInstruction(
        mintKeypair.publicKey, // mint
        associatedTokenAccount, // destination
        wallet.publicKey, // authority
        1, // amount (1 for NFT)
      )

      // Create transaction
      const transaction = new Transaction().add(
        createMintAccountInstruction,
        initializeMintInstruction,
        createATAInstruction,
        mintToInstruction,
      )

      // Get recent blockhash
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
        network === "devnet" ? "?cluster=devnet" : ""
      }`

      onProgress?.("Simple NFT token minted successfully!")

      return {
        mintAddress: mintKeypair.publicKey.toString(),
        signature,
        explorerUrl,
        tokenAccount: associatedTokenAccount.toString(),
      }
    } catch (error) {
      console.error("Simple minting failed:", error)

      if (error instanceof Error) {
        if (error.message.includes("insufficient funds") || error.message.includes("Insufficient funds")) {
          throw createError(ERROR_CODES.INSUFFICIENT_FUNDS, "Insufficient funds for minting")
        }
        if (error.message.includes("User rejected") || error.message.includes("rejected")) {
          throw createError(ERROR_CODES.TRANSACTION_FAILED, "Transaction was rejected by user")
        }
        if (error.message.includes("blockhash not found")) {
          throw createError(ERROR_CODES.NETWORK_ERROR, "Network error: Please try again")
        }
      }

      throw createError(
        ERROR_CODES.MINT_FAILED,
        `Simple minting failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      )
    }
  }
}

export const simpleMintingService = new SimpleMintingService()
