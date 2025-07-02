"use server"

interface OwnershipItem {
  owner: string
  value: string
  blockchain: string
}

interface RaribleOwnership {
  owner: string
  value: string
  itemId: string
}

interface RaribleResponse {
  ownerships: RaribleOwnership[]
  continuation?: string
}

interface HolderData {
  address: string
  balance: number
  tokenIds: string[]
}

export interface SnapshotResult {
  success: boolean
  holders?: Record<string, HolderData>
  totalHolders?: number
  totalTokens?: number
  error?: string
}

export async function fetchCollectionHolders(
  collection: string,
  blockchain: "eclipse" | "solana",
): Promise<SnapshotResult> {
  try {
    // Get API key from v0 environment variables
    const RARIBLE_API_KEY = process.env.RARIBLE_API_KEY

    if (!RARIBLE_API_KEY) {
      return {
        success: false,
        error: "Rarible API key not configured. Please add RARIBLE_API_KEY to your environment variables.",
      }
    }

    // Format collection address for Rarible API
    const formattedCollection = `${blockchain.toUpperCase()}:${collection}`

    const holders: Record<string, HolderData> = {}
    let continuation: string | null = null
    const size = 100 // Increased from 50 to 100 for better efficiency
    let totalRequests = 0
    let totalProcessed = 0

    console.log(`Starting snapshot for collection: ${formattedCollection}`)

    do {
      let url = `https://api.rarible.org/v0.1/ownerships/byCollection?collection=${formattedCollection}&size=${size}`
      if (continuation) {
        url += `&continuation=${continuation}`
      }

      console.log(`Fetching page ${totalRequests + 1}... (${totalProcessed} ownerships processed so far)`)

      const response = await fetch(url, {
        headers: {
          "X-API-KEY": RARIBLE_API_KEY,
          "Content-Type": "application/json",
        },
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error(`API error (${response.status}):`, errorText)
        return {
          success: false,
          error: `API error: ${response.status} - ${errorText}`,
        }
      }

      const data: RaribleResponse = await response.json()

      // Process ownerships
      const currentBatchSize = data.ownerships?.length || 0
      for (const ownership of data.ownerships || []) {
        const ownerAddress = ownership.owner.includes(":") ? ownership.owner.split(":")[1] : ownership.owner

        const balance = Number.parseInt(ownership.value) || 1
        const tokenId = ownership.itemId

        if (!holders[ownerAddress]) {
          holders[ownerAddress] = {
            address: ownerAddress,
            balance: 0,
            tokenIds: [],
          }
        }

        holders[ownerAddress].balance += balance
        holders[ownerAddress].tokenIds.push(tokenId)
      }

      totalProcessed += currentBatchSize
      continuation = data.continuation || null
      totalRequests++

      console.log(
        `Page ${totalRequests} complete: ${currentBatchSize} ownerships, ${Object.keys(holders).length} unique holders so far`,
      )

      // Add small delay to be respectful to the API
      if (continuation) {
        await new Promise((resolve) => setTimeout(resolve, 200))
      }

      // Safety check - if we're not getting any data, break
      if (currentBatchSize === 0) {
        console.log("No more data returned, ending pagination")
        break
      }
    } while (continuation)

    const totalHolders = Object.keys(holders).length
    const totalTokens = Object.values(holders).reduce((sum, holder) => sum + holder.balance, 0)

    console.log(
      `Snapshot complete: ${totalHolders} holders, ${totalTokens} tokens, ${totalRequests} API requests, ${totalProcessed} total ownerships processed`,
    )

    return {
      success: true,
      holders,
      totalHolders,
      totalTokens,
    }
  } catch (error) {
    console.error("Snapshot error:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
    }
  }
}

export async function generateCSV(holders: Record<string, HolderData>): Promise<string> {
  const lines = ["Wallet Address,Balance,Token Count,Token IDs"]

  for (const [address, data] of Object.entries(holders)) {
    const tokenIds = data.tokenIds.slice(0, 5).join(";") + (data.tokenIds.length > 5 ? "..." : "")
    lines.push(`${address},${data.balance},${data.tokenIds.length},"${tokenIds}"`)
  }

  return lines.join("\n")
}
