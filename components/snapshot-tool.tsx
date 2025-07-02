"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Progress } from "@/components/ui/progress"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Download, Loader2, CheckCircle, AlertCircle, Camera, Users, Hash, ExternalLink, Copy } from "lucide-react"
import { toast } from "@/hooks/use-toast"
import { fetchCollectionHolders, generateCSV, type SnapshotResult } from "@/app/actions/snapshot-actions"

interface HolderData {
  address: string
  balance: number
  tokenIds: string[]
}

export function SnapshotTool() {
  const [collectionAddress, setCollectionAddress] = useState("")
  const [blockchain, setBlockchain] = useState<"eclipse" | "solana">("eclipse")
  const [isLoading, setIsLoading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [result, setResult] = useState<SnapshotResult | null>(null)
  const [currentStep, setCurrentStep] = useState("")

  const handleSnapshot = async () => {
    if (!collectionAddress.trim()) {
      toast({
        title: "Collection Address Required",
        description: "Please enter a collection address",
        variant: "destructive",
      })
      return
    }

    setIsLoading(true)
    setProgress(0)
    setResult(null)
    setCurrentStep("Initializing snapshot...")

    try {
      setProgress(10)
      setCurrentStep("Connecting to Rarible API...")

      // Add a small delay to show the progress
      await new Promise((resolve) => setTimeout(resolve, 500))

      setProgress(20)
      setCurrentStep("Fetching holder data... This may take several minutes for large collections")

      const snapshotResult = await fetchCollectionHolders(collectionAddress.trim(), blockchain)

      setProgress(90)
      setCurrentStep("Processing final results...")

      await new Promise((resolve) => setTimeout(resolve, 500))

      setProgress(100)
      setCurrentStep("Snapshot complete!")
      setResult(snapshotResult)

      if (snapshotResult.success) {
        toast({
          title: "🎉 Snapshot Complete!",
          description: `Found ${snapshotResult.totalHolders} holders with ${snapshotResult.totalTokens} total tokens`,
        })
      } else {
        toast({
          title: "Snapshot Failed",
          description: snapshotResult.error || "Unknown error occurred",
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error("Snapshot error:", error)
      toast({
        title: "Snapshot Failed",
        description: error instanceof Error ? error.message : "Unknown error occurred",
        variant: "destructive",
      })
      setResult({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error occurred",
      })
    } finally {
      setIsLoading(false)
      setCurrentStep("")
    }
  }

  const downloadCSV = async () => {
    if (!result?.success || !result.holders) return

    try {
      const csvContent = await generateCSV(result.holders)
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
      const link = document.createElement("a")

      if (link.download !== undefined) {
        const url = URL.createObjectURL(blob)
        link.setAttribute("href", url)
        link.setAttribute("download", `${blockchain}_${collectionAddress.slice(0, 8)}_holders.csv`)
        link.style.visibility = "hidden"
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
      }

      toast({
        title: "CSV Downloaded",
        description: "Holder data has been saved to your downloads folder",
      })
    } catch (error) {
      toast({
        title: "Download Failed",
        description: "Could not generate CSV file",
        variant: "destructive",
      })
    }
  }

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast({
        title: "Copied!",
        description: `${label} copied to clipboard`,
      })
    } catch (error) {
      toast({
        title: "Copy failed",
        description: "Could not copy to clipboard",
        variant: "destructive",
      })
    }
  }

  const getExplorerUrl = (address: string) => {
    if (blockchain === "eclipse") {
      return `https://eclipsescan.xyz/address/${address}`
    } else {
      return `https://explorer.solana.com/address/${address}`
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">NFT Holder Snapshot</h2>
        <p className="text-gray-600">Scrape and download holder data for any NFT collection on Eclipse or Solana</p>
      </div>

      {/* Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Camera className="w-5 h-5" />
            Collection Configuration
          </CardTitle>
          <CardDescription>Enter the collection address you want to snapshot</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="blockchain">Blockchain</Label>
              <Select value={blockchain} onValueChange={(value: "eclipse" | "solana") => setBlockchain(value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="eclipse">Eclipse</SelectItem>
                  <SelectItem value="solana">Solana</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="collection">Collection Address</Label>
              <Input
                id="collection"
                value={collectionAddress}
                onChange={(e) => setCollectionAddress(e.target.value)}
                placeholder="Enter collection mint address..."
              />
            </div>
          </div>

          <div className="flex gap-2">
            <Button onClick={handleSnapshot} disabled={isLoading || !collectionAddress.trim()} className="flex-1">
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Taking Snapshot...
                </>
              ) : (
                <>
                  <Camera className="w-4 h-4 mr-2" />
                  Take Snapshot
                </>
              )}
            </Button>

            {result?.success && (
              <Button onClick={downloadCSV} variant="outline">
                <Download className="w-4 h-4 mr-2" />
                Download CSV
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Progress */}
      {isLoading && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Loader2 className="w-5 h-5 animate-spin" />
              Snapshotting Collection
            </CardTitle>
            <CardDescription>{currentStep}</CardDescription>
          </CardHeader>
          <CardContent>
            <Progress value={progress} className="mb-2" />
            <div className="text-sm text-gray-600 space-y-1">
              <p>This process may take several minutes for large collections</p>
              <p>The tool will fetch all pages of holder data automatically</p>
              <p className="text-xs text-gray-500">
                Collection: {blockchain.toUpperCase()}:{collectionAddress.slice(0, 8)}...{collectionAddress.slice(-8)}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Error */}
      {result && !result.success && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{result.error}</AlertDescription>
        </Alert>
      )}

      {/* Results */}
      {result?.success && result.holders && (
        <Card className="border-green-200 bg-green-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-green-800">
              <CheckCircle className="w-5 h-5" />
              Snapshot Complete!
            </CardTitle>
            <CardDescription className="text-green-700">
              Successfully scraped holder data from the {blockchain} blockchain
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Summary Stats */}
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center bg-white p-4 rounded-lg">
                <Users className="w-8 h-8 mx-auto mb-2 text-blue-500" />
                <p className="text-2xl font-bold text-blue-800">{result.totalHolders}</p>
                <p className="text-sm text-blue-600">Unique Holders</p>
              </div>
              <div className="text-center bg-white p-4 rounded-lg">
                <Hash className="w-8 h-8 mx-auto mb-2 text-purple-500" />
                <p className="text-2xl font-bold text-purple-800">{result.totalTokens}</p>
                <p className="text-sm text-purple-600">Total Tokens</p>
              </div>
              <div className="text-center bg-white p-4 rounded-lg">
                <Camera className="w-8 h-8 mx-auto mb-2 text-green-500" />
                <p className="text-2xl font-bold text-green-800">
                  {((result.totalTokens || 0) / (result.totalHolders || 1)).toFixed(2)}
                </p>
                <p className="text-sm text-green-600">Avg per Holder</p>
              </div>
            </div>

            <Separator />

            {/* Top Holders Preview */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-medium text-green-800">Top Holders Preview</h3>
                <Badge variant="outline" className="text-green-700">
                  Showing top 10
                </Badge>
              </div>

              <div className="max-h-64 overflow-y-auto space-y-2">
                {Object.entries(result.holders)
                  .sort(([, a], [, b]) => b.balance - a.balance)
                  .slice(0, 10)
                  .map(([address, data], index) => (
                    <div key={address} className="flex items-center justify-between bg-white p-3 rounded-lg">
                      <div className="flex items-center gap-3">
                        <Badge variant="secondary" className="w-8 h-8 rounded-full flex items-center justify-center">
                          {index + 1}
                        </Badge>
                        <div>
                          <p className="font-mono text-sm">
                            {address.slice(0, 8)}...{address.slice(-8)}
                          </p>
                          <p className="text-xs text-gray-500">
                            {data.tokenIds.length} token{data.tokenIds.length !== 1 ? "s" : ""}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="default" className="bg-green-100 text-green-800">
                          {data.balance}
                        </Badge>
                        <Button variant="ghost" size="sm" onClick={() => copyToClipboard(address, "Address")}>
                          <Copy className="w-3 h-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => window.open(getExplorerUrl(address), "_blank")}
                        >
                          <ExternalLink className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <Button onClick={downloadCSV} className="flex-1">
                <Download className="w-4 h-4 mr-2" />
                Download Full CSV ({result.totalHolders} holders)
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setResult(null)
                  setCollectionAddress("")
                }}
              >
                New Snapshot
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Example Collections */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Example Collections</CardTitle>
          <CardDescription>Try these popular collections to test the snapshot tool</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <h4 className="font-medium mb-2">Eclipse Collections</h4>
              <div className="space-y-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full justify-start text-left bg-transparent"
                  onClick={() => {
                    setBlockchain("eclipse")
                    setCollectionAddress("6ffVbxEZVWtksbXtQbt8xzudyain8MdsVdkkXxvaxznC")
                  }}
                >
                  <div>
                    <p className="font-mono text-xs">ASC Collection</p>
                    <p className="text-xs text-gray-500">6ffVbx...xznC</p>
                  </div>
                </Button>
              </div>
            </div>
            <div>
              <h4 className="font-medium mb-2">Solana Collections</h4>
              <div className="space-y-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full justify-start text-left bg-transparent"
                  onClick={() => {
                    setBlockchain("solana")
                    setCollectionAddress("DRiP2Pn2K6fuMLKQmt5rZWxa91wRSjjYtSNgbEekx8m2")
                  }}
                >
                  <div>
                    <p className="font-mono text-xs">DRiP Collection</p>
                    <p className="text-xs text-gray-500">DRiP2P...8m2</p>
                  </div>
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
