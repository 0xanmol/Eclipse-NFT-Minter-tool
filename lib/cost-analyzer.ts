import { Connection, LAMPORTS_PER_SOL } from "@solana/web3.js"
import { CONFIG, type NetworkType } from "./config"

export interface CostBreakdown {
  mintRent: number
  metadataRent: number
  ataRent: number
  transactionFees: number
  total: number
  totalSOL: number
  breakdown: {
    mintRentSOL: number
    metadataRentSOL: number
    ataRentSOL: number
    transactionFeesSOL: number
  }
}

class CostAnalyzer {
  private getConnection(network: NetworkType): Connection {
    return new Connection(CONFIG.NETWORKS[network].url, "confirmed")
  }

  async getDetailedCostBreakdown(network: NetworkType): Promise<CostBreakdown> {
    try {
      const connection = this.getConnection(network)

      // Get actual rent exemption amounts from the network
      const mintRent = await connection.getMinimumBalanceForRentExemption(82) // Mint account size
      const metadataRent = await connection.getMinimumBalanceForRentExemption(679) // Metadata account size
      const ataRent = await connection.getMinimumBalanceForRentExemption(165) // Associated Token Account size

      // Estimate transaction fees (this varies by network congestion)
      const transactionFees = 5000 * 3 // ~3 signatures needed, 5000 lamports per signature

      const total = mintRent + metadataRent + ataRent + transactionFees

      return {
        mintRent,
        metadataRent,
        ataRent,
        transactionFees,
        total,
        totalSOL: total / LAMPORTS_PER_SOL,
        breakdown: {
          mintRentSOL: mintRent / LAMPORTS_PER_SOL,
          metadataRentSOL: metadataRent / LAMPORTS_PER_SOL,
          ataRentSOL: ataRent / LAMPORTS_PER_SOL,
          transactionFeesSOL: transactionFees / LAMPORTS_PER_SOL,
        },
      }
    } catch (error) {
      console.error("Failed to get cost breakdown:", error)
      // Return estimated costs if network call fails
      return {
        mintRent: 1461600,
        metadataRent: 5616720,
        ataRent: 2039280,
        transactionFees: 15000,
        total: 9132600,
        totalSOL: 0.0091326,
        breakdown: {
          mintRentSOL: 0.0014616,
          metadataRentSOL: 0.0056167,
          ataRentSOL: 0.0020393,
          transactionFeesSOL: 0.000015,
        },
      }
    }
  }

  async compareCostsAcrossNetworks(): Promise<Record<NetworkType, CostBreakdown>> {
    const networks: NetworkType[] = ["solana-mainnet", "solana-devnet", "eclipse-mainnet", "eclipse-testnet"]
    const costs: Record<string, CostBreakdown> = {}

    for (const network of networks) {
      try {
        costs[network] = await this.getDetailedCostBreakdown(network)
      } catch (error) {
        console.error(`Failed to get costs for ${network}:`, error)
      }
    }

    return costs as Record<NetworkType, CostBreakdown>
  }

  formatCostBreakdown(costs: CostBreakdown, networkName: string): string {
    return `
🏷️ **${networkName} NFT Minting Costs**

💾 **Storage Costs (Rent Exemption):**
• Mint Account: ${costs.breakdown.mintRentSOL.toFixed(6)} SOL
• Metadata Account: ${costs.breakdown.metadataRentSOL.toFixed(6)} SOL  
• Token Account: ${costs.breakdown.ataRentSOL.toFixed(6)} SOL

⚡ **Transaction Fees:**
• Network Fees: ${costs.breakdown.transactionFeesSOL.toFixed(6)} SOL

💰 **Total Cost: ${costs.totalSOL.toFixed(6)} SOL**

📝 *Note: These are blockchain network costs, not platform fees*
    `.trim()
  }
}

export const costAnalyzer = new CostAnalyzer()
