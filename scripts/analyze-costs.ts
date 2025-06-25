import { costAnalyzer } from "../lib/cost-analyzer"
import { CONFIG } from "../lib/config"

async function analyzeCosts() {
  console.log("🔍 Analyzing NFT Minting Costs Across Networks...\n")

  try {
    const allCosts = await costAnalyzer.compareCostsAcrossNetworks()

    for (const [network, costs] of Object.entries(allCosts)) {
      const networkName = CONFIG.NETWORKS[network as keyof typeof CONFIG.NETWORKS]?.name || network
      console.log(costAnalyzer.formatCostBreakdown(costs, networkName))
      console.log("\n" + "=".repeat(50) + "\n")
    }

    // Show comparison
    console.log("📊 **Quick Comparison:**")
    for (const [network, costs] of Object.entries(allCosts)) {
      const networkName = CONFIG.NETWORKS[network as keyof typeof CONFIG.NETWORKS]?.name || network
      console.log(`• ${networkName}: ${costs.totalSOL.toFixed(6)} SOL`)
    }
  } catch (error) {
    console.error("Failed to analyze costs:", error)
  }
}

analyzeCosts()
