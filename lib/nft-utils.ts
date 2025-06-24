import { Connection, type PublicKey, Keypair } from "@solana/web3.js"
import { Metaplex, keypairIdentity, irysStorage } from "@metaplex-foundation/js"

// Pinata configuration
const PINATA_API_KEY = process.env.NEXT_PUBLIC_PINATA_API_KEY
const PINATA_SECRET_KEY = process.env.NEXT_PUBLIC_PINATA_SECRET_KEY
const PINATA_JWT = process.env.NEXT_PUBLIC_PINATA_JWT

// Solana configuration
const SOLANA_RPC_URL = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com"

export async function uploadToIPFS(file: File | Blob, fileName?: string): Promise<string> {
  try {
    const formData = new FormData()
    formData.append("file", file, fileName || "file")

    const metadata = JSON.stringify({
      name: fileName || "NFT Asset",
    })
    formData.append("pinataMetadata", metadata)

    const options = JSON.stringify({
      cidVersion: 0,
    })
    formData.append("pinataOptions", options)

    const response = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${PINATA_JWT}`,
      },
      body: formData,
    })

    if (!response.ok) {
      throw new Error(`Pinata upload failed: ${response.statusText}`)
    }

    const result = await response.json()
    return `https://gateway.pinata.cloud/ipfs/${result.IpfsHash}`
  } catch (error) {
    console.error("IPFS upload error:", error)
    throw new Error("Failed to upload to IPFS")
  }
}

export async function mintNFT({
  name,
  uri,
  wallet,
}: {
  name: string
  uri: string
  wallet: PublicKey
}): Promise<string> {
  try {
    const connection = new Connection(SOLANA_RPC_URL)

    // Create a temporary keypair for demo purposes
    // In production, you would use the actual wallet adapter
    const tempKeypair = Keypair.generate()

    const metaplex = Metaplex.make(connection)
      .use(keypairIdentity(tempKeypair))
      .use(
        irysStorage({
          address: "https://node2.irys.xyz",
          providerUrl: SOLANA_RPC_URL,
          timeout: 60000,
        }),
      )

    // Create NFT using current Metaplex API
    const { nft } = await metaplex.nfts().create({
      uri,
      name,
      sellerFeeBasisPoints: 500, // 5% royalty
      symbol: "NFT",
      creators: [
        {
          address: wallet,
          verified: false,
          share: 100,
        },
      ],
    })

    return nft.address.toString()
  } catch (error) {
    console.error("Minting error:", error)
    throw new Error(`Failed to mint NFT: ${error instanceof Error ? error.message : "Unknown error"}`)
  }
}

// Alternative simplified minting function that doesn't require Metaplex
export async function mintNFTSimple({
  name,
  uri,
  wallet,
}: {
  name: string
  uri: string
  wallet: PublicKey
}): Promise<string> {
  // This is a placeholder for a simplified minting approach
  // In a real implementation, you would use Token Program directly
  // or integrate with a wallet adapter that handles signing

  throw new Error("Minting requires wallet signature - please implement wallet adapter integration")
}
