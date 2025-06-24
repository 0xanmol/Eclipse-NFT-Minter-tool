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

// Metaplex Token Metadata Program ID (hardcoded to avoid import issues)
const TOKEN_METADATA_PROGRAM_ID = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s")

export interface MetaplexMintResult {
  mintAddress: string
  signature: string
  explorerUrl: string
  tokenAccount: string
  metadataAddress: string
  masterEditionAddress: string
}

export interface MetaplexMintOptions {
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

// Helper function to create metadata instruction using Anchor-style serialization
function createMetadataAccountInstruction(
  metadata: PublicKey,
  mint: PublicKey,
  mintAuthority: PublicKey,
  payer: PublicKey,
  updateAuthority: PublicKey,
  name: string,
  symbol: string,
  uri: string,
  sellerFeeBasisPoints: number,
  creators: Array<{ address: PublicKey; verified: boolean; share: number }>,
) {
  const keys = [
    { pubkey: metadata, isSigner: false, isWritable: true },
    { pubkey: mint, isSigner: false, isWritable: false },
    { pubkey: mintAuthority, isSigner: true, isWritable: false },
    { pubkey: payer, isSigner: true, isWritable: true },
    { pubkey: updateAuthority, isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ]

  // Create instruction data for CreateMetadataAccountV3
  const nameBuffer = Buffer.from(name, "utf8")
  const symbolBuffer = Buffer.from(symbol, "utf8")
  const uriBuffer = Buffer.from(uri, "utf8")

  // Calculate total size needed
  const dataSize =
    1 + // discriminator
    4 +
    nameBuffer.length + // name
    4 +
    symbolBuffer.length + // symbol
    4 +
    uriBuffer.length + // uri
    2 + // seller_fee_basis_points
    1 + // creators option
    4 +
    creators.length * (32 + 1 + 1) + // creators array
    1 + // collection option (none)
    1 + // uses option (none)
    1 + // collection_details option (none)
    1 // is_mutable

  const data = Buffer.alloc(dataSize)
  let offset = 0

  // Discriminator for CreateMetadataAccountV3
  data.writeUInt8(33, offset)
  offset += 1

  // Name
  data.writeUInt32LE(nameBuffer.length, offset)
  offset += 4
  nameBuffer.copy(data, offset)
  offset += nameBuffer.length

  // Symbol
  data.writeUInt32LE(symbolBuffer.length, offset)
  offset += 4
  symbolBuffer.copy(data, offset)
  offset += symbolBuffer.length

  // URI
  data.writeUInt32LE(uriBuffer.length, offset)
  offset += 4
  uriBuffer.copy(data, offset)
  offset += uriBuffer.length

  // Seller fee basis points
  data.writeUInt16LE(sellerFeeBasisPoints, offset)
  offset += 2

  // Creators (Some)
  data.writeUInt8(1, offset)
  offset += 1
  data.writeUInt32LE(creators.length, offset)
  offset += 4

  for (const creator of creators) {
    creator.address.toBuffer().copy(data, offset)
    offset += 32
    data.writeUInt8(creator.verified ? 1 : 0, offset)
    offset += 1
    data.writeUInt8(creator.share, offset)
    offset += 1
  }

  // Collection (None)
  data.writeUInt8(0, offset)
  offset += 1

  // Uses (None)
  data.writeUInt8(0, offset)
  offset += 1

  // Collection details (None)
  data.writeUInt8(0, offset)
  offset += 1

  // Is mutable
  data.writeUInt8(1, offset)
  offset += 1

  return {
    keys,
    programId: TOKEN_METADATA_PROGRAM_ID,
    data: data.slice(0, offset),
  }
}

// Helper function to create master edition instruction
function createMasterEditionInstruction(
  edition: PublicKey,
  mint: PublicKey,
  updateAuthority: PublicKey,
  mintAuthority: PublicKey,
  payer: PublicKey,
  metadata: PublicKey,
  maxSupply: number | null,
) {
  const keys = [
    { pubkey: edition, isSigner: false, isWritable: true },
    { pubkey: mint, isSigner: false, isWritable: true },
    { pubkey: updateAuthority, isSigner: true, isWritable: false },
    { pubkey: mintAuthority, isSigner: true, isWritable: false },
    { pubkey: payer, isSigner: true, isWritable: true },
    { pubkey: metadata, isSigner: false, isWritable: true },
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ]

  // Create instruction data for CreateMasterEditionV3
  const data = Buffer.alloc(10)
  let offset = 0

  // Discriminator for CreateMasterEditionV3
  data.writeUInt8(17, offset)
  offset += 1

  // Max supply option
  if (maxSupply !== null) {
    data.writeUInt8(1, offset) // Some
    offset += 1
    data.writeBigUInt64LE(BigInt(maxSupply), offset)
    offset += 8
  } else {
    data.writeUInt8(0, offset) // None
    offset += 1
  }

  return {
    keys,
    programId: TOKEN_METADATA_PROGRAM_ID,
    data: data.slice(0, offset),
  }
}

class MetaplexMintingService {
  private getConnection(network: NetworkType): Connection {
    return new Connection(CONFIG.NETWORKS[network].url, "confirmed")
  }

  async estimateMintingCost(network: NetworkType): Promise<number> {
    try {
      const connection = this.getConnection(network)

      // Estimate costs for full Metaplex NFT:
      const mintRent = await connection.getMinimumBalanceForRentExemption(MINT_SIZE)
      const metadataRent = await connection.getMinimumBalanceForRentExemption(679) // Metadata account size
      const masterEditionRent = await connection.getMinimumBalanceForRentExemption(282) // Master Edition size
      const ataRent = await connection.getMinimumBalanceForRentExemption(165)

      const transactionFees = 5000 * 4 // Multiple transactions

      return mintRent + metadataRent + masterEditionRent + ataRent + transactionFees
    } catch (error) {
      console.error("Failed to estimate cost:", error)
      return 0.008 * LAMPORTS_PER_SOL
    }
  }

  async mintNFT(options: MetaplexMintOptions): Promise<MetaplexMintResult> {
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
        0, // decimals
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

      onProgress?.("Minting token...")

      // Step 3: Mint 1 token
      const mintToInstruction = createMintToInstruction(
        mintKeypair.publicKey, // mint
        associatedTokenAccount, // destination
        wallet.publicKey, // authority
        1, // amount (1 for NFT)
      )

      // Create first transaction (mint setup)
      const mintTransaction = new Transaction().add(
        createMintAccountInstruction,
        initializeMintInstruction,
        createATAInstruction,
        mintToInstruction,
      )

      const { blockhash: mintBlockhash, lastValidBlockHeight: mintLastValidBlockHeight } =
        await connection.getLatestBlockhash()
      mintTransaction.recentBlockhash = mintBlockhash
      mintTransaction.feePayer = wallet.publicKey

      // Sign with mint keypair
      mintTransaction.partialSign(mintKeypair)

      onProgress?.("Signing mint transaction...")

      // Sign with wallet
      const signedMintTransaction = await wallet.signTransaction(mintTransaction)

      onProgress?.("Sending mint transaction...")

      // Send mint transaction
      const mintSignature = await connection.sendRawTransaction(signedMintTransaction.serialize(), {
        skipPreflight: false,
        preflightCommitment: "confirmed",
      })

      onProgress?.("Confirming mint transaction...")

      // Confirm mint transaction
      const mintConfirmation = await connection.confirmTransaction(
        {
          signature: mintSignature,
          blockhash: mintBlockhash,
          lastValidBlockHeight: mintLastValidBlockHeight,
        },
        "confirmed",
      )

      if (mintConfirmation.value.err) {
        throw new Error(`Mint transaction failed: ${mintConfirmation.value.err}`)
      }

      onProgress?.("Creating metadata account...")

      // Step 4: Create metadata account
      const [metadataAddress] = PublicKey.findProgramAddressSync(
        [Buffer.from("metadata"), TOKEN_METADATA_PROGRAM_ID.toBuffer(), mintKeypair.publicKey.toBuffer()],
        TOKEN_METADATA_PROGRAM_ID,
      )

      const createMetadataInstructionData = createMetadataAccountInstruction(
        metadataAddress,
        mintKeypair.publicKey,
        wallet.publicKey,
        wallet.publicKey,
        wallet.publicKey,
        name,
        symbol,
        metadataUri,
        royalty,
        [
          {
            address: wallet.publicKey,
            verified: true,
            share: 100,
          },
        ],
      )

      onProgress?.("Creating master edition...")

      // Step 5: Create master edition
      const [masterEditionAddress] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("metadata"),
          TOKEN_METADATA_PROGRAM_ID.toBuffer(),
          mintKeypair.publicKey.toBuffer(),
          Buffer.from("edition"),
        ],
        TOKEN_METADATA_PROGRAM_ID,
      )

      const createMasterEditionInstructionData = createMasterEditionInstruction(
        masterEditionAddress,
        mintKeypair.publicKey,
        wallet.publicKey,
        wallet.publicKey,
        wallet.publicKey,
        metadataAddress,
        0, // max supply (0 = unlimited)
      )

      // Create metadata transaction
      const metadataTransaction = new Transaction().add(
        {
          keys: createMetadataInstructionData.keys,
          programId: createMetadataInstructionData.programId,
          data: createMetadataInstructionData.data,
        },
        {
          keys: createMasterEditionInstructionData.keys,
          programId: createMasterEditionInstructionData.programId,
          data: createMasterEditionInstructionData.data,
        },
      )

      const { blockhash: metadataBlockhash, lastValidBlockHeight: metadataLastValidBlockHeight } =
        await connection.getLatestBlockhash()
      metadataTransaction.recentBlockhash = metadataBlockhash
      metadataTransaction.feePayer = wallet.publicKey

      onProgress?.("Signing metadata transaction...")

      // Sign metadata transaction
      const signedMetadataTransaction = await wallet.signTransaction(metadataTransaction)

      onProgress?.("Sending metadata transaction...")

      // Send metadata transaction
      const metadataSignature = await connection.sendRawTransaction(signedMetadataTransaction.serialize(), {
        skipPreflight: false,
        preflightCommitment: "confirmed",
      })

      onProgress?.("Confirming metadata transaction...")

      // Confirm metadata transaction
      const metadataConfirmation = await connection.confirmTransaction(
        {
          signature: metadataSignature,
          blockhash: metadataBlockhash,
          lastValidBlockHeight: metadataLastValidBlockHeight,
        },
        "confirmed",
      )

      if (metadataConfirmation.value.err) {
        throw new Error(`Metadata transaction failed: ${metadataConfirmation.value.err}`)
      }

      // Generate explorer URL (use the metadata transaction signature)
      const explorerUrl = `${CONFIG.NETWORKS[network].explorer}/tx/${metadataSignature}${
        network.includes("testnet") || network.includes("devnet") ? "?cluster=testnet" : ""
      }`

      onProgress?.("NFT with metadata created successfully!")

      return {
        mintAddress: mintKeypair.publicKey.toString(),
        signature: metadataSignature, // Use metadata transaction signature
        explorerUrl,
        tokenAccount: associatedTokenAccount.toString(),
        metadataAddress: metadataAddress.toString(),
        masterEditionAddress: masterEditionAddress.toString(),
      }
    } catch (error) {
      console.error("Metaplex minting failed:", error)

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
        `Metaplex minting failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      )
    }
  }

  async verifyNFT(mintAddress: string, network: NetworkType): Promise<boolean> {
    try {
      const connection = this.getConnection(network)
      const mintPublicKey = new PublicKey(mintAddress)

      // Check if metadata account exists
      const [metadataAddress] = PublicKey.findProgramAddressSync(
        [Buffer.from("metadata"), TOKEN_METADATA_PROGRAM_ID.toBuffer(), mintPublicKey.toBuffer()],
        TOKEN_METADATA_PROGRAM_ID,
      )

      const metadataInfo = await connection.getAccountInfo(metadataAddress)
      return !!metadataInfo
    } catch (error) {
      console.error("NFT verification failed:", error)
      return false
    }
  }
}

export const metaplexMintingService = new MetaplexMintingService()
