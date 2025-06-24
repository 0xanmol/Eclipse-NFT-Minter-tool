import type { PublicKey } from "@solana/web3.js"

export interface NFTMetadata {
  name: string
  description: string
  image: string
  attributes: Array<{ trait_type: string; value: string }>
  properties: {
    files: Array<{ uri: string; type: string }>
    category: string
  }
}

export async function prepareNFTMetadata({
  name,
  description,
  imageUri,
  attributes,
}: {
  name: string
  description: string
  imageUri: string
  attributes: Array<{ trait_type: string; value: string }>
}): Promise<NFTMetadata> {
  return {
    name,
    description,
    image: imageUri,
    attributes,
    properties: {
      files: [
        {
          uri: imageUri,
          type: "image/png", // or detect from file
        },
      ],
      category: "image",
    },
  }
}

export function generateMintInstructions(metadataUri: string, wallet: PublicKey): string {
  return `
To complete the NFT minting process:

1. Use the Metaplex CLI or Sugar CLI:
   metaplex create-nft --uri "${metadataUri}" --name "Your NFT"

2. Or use a minting service like:
   - Metaplex Studio
   - Candy Machine
   - Custom smart contract

3. Your metadata is ready at: ${metadataUri}
4. Wallet address: ${wallet.toString()}

The metadata follows Metaplex standards and is ready for minting!
  `
}
