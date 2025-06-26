"use client"

import type React from "react"
import { useState, useCallback, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Progress } from "@/components/ui/progress"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Wallet,
  Loader2,
  CheckCircle,
  AlertCircle,
  ExternalLink,
  Info,
  Copy,
  Network,
  ImageIcon,
  Layers,
  Zap,
} from "lucide-react"
import { useWallet } from "@solana/wallet-adapter-react"
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui"
import { toast } from "@/hooks/use-toast"
import { DraggableAttributes } from "@/components/ui/draggable-attributes"
import {
  CONFIG,
  type NetworkType,
  getNetworkDisplayName,
  isEclipseNetwork,
  getTransactionUrl,
  getTokenUrl,
} from "@/lib/config"
import { validateNFTMetadata, sanitizeMetadata, validateSolanaAddress, type NFTFormData } from "@/lib/validation"
import { ipfsService } from "@/lib/ipfs-service"
import { enhancedMetaplexService, type EnhancedMintResult, type BatchMintResult } from "@/lib/enhanced-metaplex-service"
import { getErrorMessage } from "@/lib/errors"
import { DragDropUpload } from "@/components/ui/drag-drop-upload"

interface MintingStep {
  id: string
  label: string
  status: "pending" | "active" | "completed" | "error"
}

function NFTMinter() {
  const { connected, publicKey, wallet } = useWallet()

  // State management
  const [network, setNetwork] = useState<NetworkType>("eclipse-testnet")
  const [isLoading, setIsLoading] = useState(false)
  const [mintResult, setMintResult] = useState<EnhancedMintResult | null>(null)
  const [batchResult, setBatchResult] = useState<BatchMintResult | null>(null)
  const [mintingProgress, setMintingProgress] = useState(0)
  const [currentStep, setCurrentStep] = useState("")
  const [estimatedCost, setEstimatedCost] = useState<number | null>(null)

  // Enhanced form state
  const [formData, setFormData] = useState<NFTFormData>({
    name: "",
    description: "",
    image: null,
    images: [],
    attributes: [{ trait_type: "", value: "" }],
    royalty: 500, // 5%
    collection: "",
    mintType: "single",
    recipientAddress: "",
    recipients: [],
  })

  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [validationErrors, setValidationErrors] = useState<string[]>([])
  const [recipientList, setRecipientList] = useState<string>("")

  // Enhanced minting steps
  const [mintingSteps, setMintingSteps] = useState<MintingStep[]>([
    { id: "validate", label: "Validate metadata", status: "pending" },
    { id: "upload-images", label: "Upload images to IPFS", status: "pending" },
    { id: "upload-metadata", label: "Upload metadata to IPFS", status: "pending" },
    { id: "estimate-cost", label: "Estimate minting cost", status: "pending" },
    { id: "setup-umi", label: "Setup Metaplex UMI", status: "pending" },
    { id: "create-nfts", label: "Create NFTs", status: "pending" },
    { id: "confirm", label: "Confirm transactions", status: "pending" },
  ])

  // Load estimated cost when network or mint type changes
  useEffect(() => {
    if (connected) {
      loadEstimatedCost()
    }
  }, [network, connected, formData.mintType, formData.images?.length])

  const loadEstimatedCost = async () => {
    try {
      let quantity = 1
      if (formData.mintType === "collection") {
        quantity = formData.images?.length || 1
      }

      const cost = await enhancedMetaplexService.estimateMintingCost(network, formData.mintType, quantity)
      setEstimatedCost(cost)
    } catch (error) {
      console.error("Failed to estimate cost:", error)
    }
  }

  const updateStep = (stepId: string, status: MintingStep["status"]) => {
    setMintingSteps((prev) => prev.map((step) => (step.id === stepId ? { ...step, status } : step)))
  }

  const handleSingleImageUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setFormData((prev) => ({ ...prev, image: file }))
    setValidationErrors([])

    // Create preview
    const reader = new FileReader()
    reader.onload = (e) => setImagePreview(e.target?.result as string)
    reader.readAsDataURL(file)
  }, [])

  const handleMultipleImagesUpload = useCallback((files: File[]) => {
    setFormData((prev) => ({ ...prev, images: files }))
    setValidationErrors([])
  }, [])

  const handleRecipientListChange = (value: string) => {
    setRecipientList(value)

    // Parse recipients from textarea (one address per line)
    const allAddresses = value
      .split("\n")
      .map((addr) => addr.trim())
      .filter((addr) => addr.length > 0)

    // Separate valid and invalid addresses
    const validAddresses: string[] = []
    const invalidAddresses: string[] = []

    for (const address of allAddresses) {
      if (validateSolanaAddress(address)) {
        validAddresses.push(address)
      } else {
        invalidAddresses.push(address)
      }
    }

    setFormData((prev) => ({ ...prev, recipients: validAddresses }))

    // Show validation feedback
    if (invalidAddresses.length > 0) {
      setValidationErrors([
        `Invalid addresses found (will be skipped): ${invalidAddresses.slice(0, 3).join(", ")}${
          invalidAddresses.length > 3 ? ` and ${invalidAddresses.length - 3} more` : ""
        }`,
      ])
    } else if (validAddresses.length > 0) {
      setValidationErrors([])
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

  const handleMint = async () => {
    if (!connected || !publicKey || !wallet) {
      toast({
        title: "Wallet Required",
        description: "Please connect your wallet to continue",
        variant: "destructive",
      })
      return
    }

    // Reset state
    setIsLoading(true)
    setMintResult(null)
    setBatchResult(null)
    setMintingProgress(0)
    setMintingSteps((prev) => prev.map((step) => ({ ...step, status: "pending" })))

    try {
      // Step 1: Validate metadata
      updateStep("validate", "active")
      setCurrentStep("Validating metadata...")

      const validation = validateNFTMetadata(formData)
      if (!validation.isValid) {
        setValidationErrors(validation.errors)
        updateStep("validate", "error")
        return
      }

      updateStep("validate", "completed")
      setMintingProgress(12)

      const sanitized = sanitizeMetadata(formData)

      // Step 2: Upload images
      updateStep("upload-images", "active")
      setCurrentStep("Uploading images to IPFS...")

      let imageUris: string[] = []

      if (formData.mintType === "single") {
        if (!formData.image) throw new Error("Image is required")
        const imageUri = await ipfsService.uploadFile(
          formData.image,
          `${sanitized.name.replace(/\s+/g, "_")}.${formData.image.name.split(".").pop()}`,
        )
        imageUris = [imageUri]
      } else if (formData.mintType === "collection") {
        if (!formData.images || formData.images.length === 0) throw new Error("Images are required for collection")

        for (let i = 0; i < formData.images.length; i++) {
          const file = formData.images[i]
          const imageUri = await ipfsService.uploadFile(
            file,
            `${sanitized.name.replace(/\s+/g, "_")}_${i + 1}.${file.name.split(".").pop()}`,
          )
          imageUris.push(imageUri)
          setCurrentStep(`Uploading image ${i + 1} of ${formData.images.length} to IPFS...`)
        }
      }

      updateStep("upload-images", "completed")
      setMintingProgress(25)

      // Step 3: Upload metadata
      updateStep("upload-metadata", "active")
      setCurrentStep("Uploading metadata to IPFS...")

      let metadataUris: string[] = []

      if (formData.mintType === "single") {
        const metadata = {
          name: sanitized.name,
          description: sanitized.description,
          image: imageUris[0],
          attributes: sanitized.attributes,
          properties: {
            files: [{ uri: imageUris[0], type: formData.image!.type }],
            category: "image",
          },
          seller_fee_basis_points: sanitized.royalty,
          creators: [
            {
              address: publicKey.toString(),
              verified: true,
              share: 100,
            },
          ],
        }

        const metadataUri = await ipfsService.uploadJSON(metadata, "metadata.json")
        metadataUris = [metadataUri]
      } else if (formData.mintType === "collection") {
        for (let i = 0; i < imageUris.length; i++) {
          const metadata = {
            name: `${sanitized.name} #${i + 1}`,
            description: sanitized.description,
            image: imageUris[i],
            attributes: sanitized.attributes,
            properties: {
              files: [{ uri: imageUris[i], type: formData.images![i].type }],
              category: "image",
            },
            seller_fee_basis_points: sanitized.royalty,
            creators: [
              {
                address: publicKey.toString(),
                verified: true,
                share: 100,
              },
            ],
          }

          const metadataUri = await ipfsService.uploadJSON(metadata, `metadata_${i + 1}.json`)
          metadataUris.push(metadataUri)
          setCurrentStep(`Uploading metadata ${i + 1} of ${imageUris.length} to IPFS...`)
        }
      }

      updateStep("upload-metadata", "completed")
      setMintingProgress(37)

      // Step 4: Estimate cost
      updateStep("estimate-cost", "active")
      setCurrentStep("Estimating minting cost...")

      await loadEstimatedCost()

      updateStep("estimate-cost", "completed")
      setMintingProgress(50)

      // Step 5: Setup UMI (do this first and wait for completion)
      updateStep("setup-umi", "active")
      setCurrentStep("Setting up Metaplex UMI...")

      // Small delay to ensure UI updates
      await new Promise((resolve) => setTimeout(resolve, 100))

      updateStep("setup-umi", "completed")
      setMintingProgress(62)

      // Step 6: Create NFTs (only start after UMI setup is complete)
      updateStep("create-nfts", "active")
      setCurrentStep("Creating NFTs...")

      if (formData.mintType === "single") {
        const result = await enhancedMetaplexService.mintSingleNFT({
          name: sanitized.name,
          description: sanitized.description,
          imageUri: imageUris[0],
          metadataUri: metadataUris[0],
          royalty: sanitized.royalty,
          wallet: wallet.adapter,
          network,
          recipientAddress: sanitized.recipientAddress || undefined,
          onProgress: (message) => {
            setCurrentStep(message)
            if (message.includes("NFT created successfully")) {
              updateStep("create-nfts", "completed")
              setMintingProgress(87)
              updateStep("confirm", "active")
              setCurrentStep("Confirming transaction...")
            }
          },
        })

        setMintResult(result)
        updateStep("confirm", "completed")
        setMintingProgress(100)
      } else if (formData.mintType === "collection") {
        const result = await enhancedMetaplexService.mintCollection({
          collectionName: sanitized.name,
          description: sanitized.description,
          imageUris,
          metadataUris,
          royalty: sanitized.royalty,
          wallet: wallet.adapter,
          network,
          recipients: sanitized.recipients,
          onProgress: (message, current, total) => {
            setCurrentStep(message)
            if (current && total) {
              const progressPercent = 62 + (current / total) * 25
              setMintingProgress(progressPercent)
            }
            if (message.includes("Collection minting complete")) {
              updateStep("create-nfts", "completed")
              setMintingProgress(87)
              updateStep("confirm", "active")
              setCurrentStep("Confirming transactions...")
            }
          },
        })

        setBatchResult(result)
        updateStep("confirm", "completed")
        setMintingProgress(100)
      }

      updateStep("setup-umi", "completed")
      updateStep("create-nfts", "completed")
      updateStep("confirm", "completed")
      setMintingProgress(100)

      toast({
        title: "🎉 NFT Minting Successful!",
        description: `Your ${formData.mintType} has been created on ${getNetworkDisplayName(network)}`,
      })
    } catch (error) {
      const errorMessage = getErrorMessage(error)
      console.error("Minting error:", error)

      // Update current step to error
      const activeStep = mintingSteps.find((step) => step.status === "active")
      if (activeStep) {
        updateStep(activeStep.id, "error")
      }

      toast({
        title: "Minting Failed",
        description: errorMessage,
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
      setCurrentStep("")
    }
  }

  const resetForm = () => {
    setFormData({
      name: "",
      description: "",
      image: null,
      images: [],
      attributes: [{ trait_type: "", value: "" }],
      royalty: 500,
      collection: "",
      mintType: "single",
      recipientAddress: "",
      recipients: [],
    })
    setImagePreview(null)
    setValidationErrors([])
    setMintResult(null)
    setBatchResult(null)
    setMintingProgress(0)
    setRecipientList("")
    setMintingSteps((prev) => prev.map((step) => ({ ...step, status: "pending" })))
  }

  const getMintTypeIcon = (type: string) => {
    switch (type) {
      case "single":
        return <Zap className="w-4 h-4" />
      case "collection":
        return <Layers className="w-4 h-4" />
      default:
        return <ImageIcon className="w-4 h-4" />
    }
  }

  const getMintTypeDescription = (type: string) => {
    switch (type) {
      case "single":
        return "Mint a single unique NFT"
      case "collection":
        return "Mint multiple unique NFTs with different artwork"
      default:
        return ""
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-blue-50 p-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            {isEclipseNetwork(network) ? "Eclipse" : "Solana"} NFT Minter
          </h1>
          <p className="text-gray-600">
            Mint NFTs on {getNetworkDisplayName(network)} with custom metadata and attributes
          </p>
        </div>

        {/* Network & Wallet Status */}
        <div className="grid md:grid-cols-2 gap-4 mb-6">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Network className="w-5 h-5" />
                  <div>
                    <p className="font-medium">Network</p>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-500">{getNetworkDisplayName(network)}</span>
                      <Badge variant="outline" className="text-xs">
                        {isEclipseNetwork(network) ? "Eclipse" : "Solana"}
                      </Badge>
                    </div>
                  </div>
                </div>
                <Select value={network} onValueChange={(value: NetworkType) => setNetwork(value)}>
                  <SelectTrigger className="w-48">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="eclipse-testnet">Eclipse Testnet</SelectItem>
                    <SelectItem value="eclipse-mainnet">Eclipse Mainnet</SelectItem>
                    <SelectItem value="solana-devnet">Solana Devnet</SelectItem>
                    <SelectItem value="solana-mainnet">Solana Mainnet</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Wallet className="w-5 h-5" />
                  <div>
                    <p className="font-medium">{connected ? "Connected" : "Connect Wallet"}</p>
                    {connected && publicKey && (
                      <p className="text-sm text-gray-500">{publicKey.toString().slice(0, 8)}...</p>
                    )}
                  </div>
                </div>
                <WalletMultiButton className="!bg-purple-600 hover:!bg-purple-700" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Estimated Cost */}
        {connected && estimatedCost && (
          <Card className="mb-6">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <Info className="w-5 h-5 text-blue-500" />
                <div>
                  <p className="font-medium">Estimated Minting Cost</p>
                  <p className="text-sm text-gray-600">
                    ~{(estimatedCost / 1e9).toFixed(4)} {isEclipseNetwork(network) ? "ETH" : "SOL"}
                    {formData.mintType === "collection" && (
                      <span className="ml-2">for {formData.images?.length || 0} NFTs</span>
                    )}
                    {network.includes("testnet") || network.includes("devnet") ? (
                      <Badge variant="secondary" className="ml-2">
                        Testnet - Free
                      </Badge>
                    ) : (
                      <Badge variant="default" className="ml-2">
                        Mainnet - Real {isEclipseNetwork(network) ? "ETH" : "SOL"}
                      </Badge>
                    )}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Validation Errors */}
        {validationErrors.length > 0 && (
          <Alert variant="destructive" className="mb-6">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <ul className="list-disc list-inside space-y-1">
                {validationErrors.map((error, index) => (
                  <li key={index}>{error}</li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        )}

        {/* Minting Progress */}
        {isLoading && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Loader2 className="w-5 h-5 animate-spin" />
                Minting {formData.mintType} on {getNetworkDisplayName(network)}
              </CardTitle>
              <CardDescription>{currentStep}</CardDescription>
            </CardHeader>
            <CardContent>
              <Progress value={mintingProgress} className="mb-4" />
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {mintingSteps.map((step) => (
                  <div key={step.id} className="flex items-center gap-2">
                    {step.status === "completed" && <CheckCircle className="w-4 h-4 text-green-500" />}
                    {step.status === "active" && <Loader2 className="w-4 h-4 animate-spin text-blue-500" />}
                    {step.status === "error" && <AlertCircle className="w-4 h-4 text-red-500" />}
                    {step.status === "pending" && <div className="w-4 h-4 rounded-full border-2 border-gray-300" />}
                    <span
                      className={`text-sm ${
                        step.status === "completed"
                          ? "text-green-600"
                          : step.status === "error"
                            ? "text-red-600"
                            : step.status === "active"
                              ? "text-blue-600"
                              : "text-gray-500"
                      }`}
                    >
                      {step.label}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Success Results */}
        {(mintResult || batchResult) && (
          <Card className="mb-6 border-green-200 bg-green-50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-green-800">
                <CheckCircle className="w-5 h-5" />🎉 NFT Minting Successful!
              </CardTitle>
              <CardDescription className="text-green-700">
                {mintResult && "Your NFT is now live with full Metaplex metadata!"}
                {batchResult &&
                  `Successfully minted ${batchResult.totalMinted} NFTs${batchResult.failed > 0 ? ` (${batchResult.failed} failed)` : ""}!`}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {mintResult && (
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <Label className="text-green-700 font-medium">NFT Mint Address</Label>
                    <div className="flex items-center gap-2 mt-1">
                      <code className="text-sm bg-green-100 px-2 py-1 rounded flex-1 break-all">
                        {mintResult.mintAddress}
                      </code>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => copyToClipboard(mintResult.mintAddress, "Mint address")}
                      >
                        <Copy className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>

                  <div>
                    <Label className="text-green-700 font-medium">Token Account</Label>
                    <div className="flex items-center gap-2 mt-1">
                      <code className="text-sm bg-green-100 px-2 py-1 rounded flex-1 break-all">
                        {mintResult.tokenAccount}
                      </code>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => copyToClipboard(mintResult.tokenAccount, "Token account")}
                      >
                        <Copy className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>

                  <div>
                    <Label className="text-green-700 font-medium">Metadata Address</Label>
                    <div className="flex items-center gap-2 mt-1">
                      <code className="text-sm bg-green-100 px-2 py-1 rounded flex-1 break-all">
                        {mintResult.metadataAddress}
                      </code>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => copyToClipboard(mintResult.metadataAddress, "Metadata address")}
                      >
                        <Copy className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>

                  <div>
                    <Label className="text-green-700 font-medium">Transaction</Label>
                    <div className="flex items-center gap-2 mt-1">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => window.open(getTransactionUrl(mintResult.signature, network), "_blank")}
                        className="whitespace-nowrap"
                      >
                        <ExternalLink className="w-4 h-4 mr-1" />
                        View on Explorer
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {batchResult && (
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div className="bg-green-100 p-3 rounded">
                      <p className="text-2xl font-bold text-green-800">{batchResult.totalMinted}</p>
                      <p className="text-sm text-green-600">Successful</p>
                    </div>
                    <div className="bg-red-100 p-3 rounded">
                      <p className="text-2xl font-bold text-red-800">{batchResult.failed}</p>
                      <p className="text-sm text-red-600">Failed</p>
                    </div>
                    <div className="bg-blue-100 p-3 rounded">
                      <p className="text-2xl font-bold text-blue-800">{(batchResult.totalCost / 1e9).toFixed(4)}</p>
                      <p className="text-sm text-blue-600">{isEclipseNetwork(network) ? "ETH" : "SOL"} Cost</p>
                    </div>
                  </div>

                  <div className="max-h-64 overflow-y-auto">
                    <Label className="text-green-700 font-medium">Minted NFTs</Label>
                    <div className="space-y-2 mt-2">
                      {batchResult.results.map((result, index) => (
                        <div key={index} className="flex items-center justify-between bg-green-100 p-2 rounded">
                          <div className="flex-1">
                            <p className="text-sm font-medium">
                              {formData.mintType === "editions"
                                ? `Edition #${result.editionNumber}`
                                : `NFT #${index + 1}`}
                            </p>
                            <p className="text-xs text-gray-600 truncate">{result.mintAddress}</p>
                          </div>
                          <div className="flex gap-1">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => copyToClipboard(result.mintAddress, "Mint address")}
                            >
                              <Copy className="w-3 h-3" />
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => window.open(getTransactionUrl(result.signature, network), "_blank")}
                            >
                              <ExternalLink className="w-3 h-3" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <Button onClick={resetForm} variant="outline">
                  Mint Another NFT
                </Button>
                {mintResult && (
                  <Button
                    variant="default"
                    onClick={() => window.open(getTokenUrl(mintResult.mintAddress, network), "_blank")}
                  >
                    View Token Details
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Main Form */}
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Mint Type Selection */}
          <Card className="lg:col-span-3">
            <CardHeader>
              <CardTitle>Mint Type</CardTitle>
              <CardDescription>Choose your minting strategy</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-3 gap-4">
                {["single", "collection"].map((type) => (
                  <div
                    key={type}
                    className={`border-2 rounded-lg p-4 cursor-pointer transition-colors ${
                      formData.mintType === type
                        ? "border-purple-500 bg-purple-50"
                        : "border-gray-200 hover:border-gray-300"
                    }`}
                    onClick={() => setFormData((prev) => ({ ...prev, mintType: type as any }))}
                  >
                    <div className="flex items-center gap-3 mb-2">
                      {getMintTypeIcon(type)}
                      <h3 className="font-medium capitalize">{type} NFT</h3>
                    </div>
                    <p className="text-sm text-gray-600">{getMintTypeDescription(type)}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Image Upload */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>NFT Artwork</CardTitle>
              <CardDescription>
                {formData.mintType === "collection"
                  ? `Upload multiple images for your collection (up to 50 files, max ${CONFIG.FILE_VALIDATION.maxSize / (1024 * 1024)}MB each)`
                  : `Upload your NFT image (max ${CONFIG.FILE_VALIDATION.maxSize / (1024 * 1024)}MB)`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {formData.mintType === "single" ? (
                <div className="space-y-4">
                  <DragDropUpload
                    onFilesSelected={(files) => {
                      if (files.length > 0) {
                        setFormData((prev) => ({ ...prev, image: files[0] }))
                        const reader = new FileReader()
                        reader.onload = (e) => setImagePreview(e.target?.result as string)
                        reader.readAsDataURL(files[0])
                      }
                    }}
                    multiple={false}
                    maxFiles={1}
                  />

                  {imagePreview && (
                    <div className="text-center">
                      <img
                        src={imagePreview || "/placeholder.svg"}
                        alt="NFT Preview"
                        className="max-w-full h-48 object-contain mx-auto rounded-lg border"
                      />
                    </div>
                  )}
                </div>
              ) : (
                <DragDropUpload
                  onFilesSelected={handleMultipleImagesUpload}
                  multiple={true}
                  maxFiles={50}
                  accept={CONFIG.FILE_VALIDATION.allowedTypes}
                />
              )}
            </CardContent>
          </Card>

          {/* Metadata Form */}
          <Card>
            <CardHeader>
              <CardTitle>NFT Metadata</CardTitle>
              <CardDescription>Define your NFT properties</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="name">
                  Name * <span className="text-xs text-gray-500">(max {CONFIG.NFT.maxNameLength} chars)</span>
                </Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder={formData.mintType === "collection" ? "My Collection" : "My Awesome NFT"}
                  maxLength={CONFIG.NFT.maxNameLength}
                />
                <div className="text-xs text-gray-500 mt-1">
                  {formData.name.length}/{CONFIG.NFT.maxNameLength}
                </div>
              </div>

              <div>
                <Label htmlFor="description">
                  Description{" "}
                  <span className="text-xs text-gray-500">(max {CONFIG.NFT.maxDescriptionLength} chars)</span>
                </Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
                  placeholder="Describe your NFT..."
                  rows={3}
                  maxLength={CONFIG.NFT.maxDescriptionLength}
                />
                <div className="text-xs text-gray-500 mt-1">
                  {formData.description.length}/{CONFIG.NFT.maxDescriptionLength}
                </div>
              </div>

              <div>
                <Label htmlFor="royalty">Royalty Percentage</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="royalty"
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    value={formData.royalty / 100}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        royalty: Math.round(Number.parseFloat(e.target.value) * 100),
                      }))
                    }
                    className="w-24"
                  />
                  <span className="text-sm text-gray-500">%</span>
                </div>
              </div>

              <Separator />

              <DraggableAttributes
                attributes={formData.attributes}
                onAttributesChange={(attributes) => setFormData((prev) => ({ ...prev, attributes }))}
                maxAttributes={CONFIG.NFT.maxAttributes}
              />
            </CardContent>
          </Card>

          {/* Recipient Configuration */}
          <Card className="lg:col-span-3">
            <CardHeader>
              <CardTitle>Recipient Configuration</CardTitle>
              <CardDescription>Configure where NFTs will be sent</CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="self" className="w-full">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="self">Mint to Self</TabsTrigger>
                  <TabsTrigger value="single">Single Recipient</TabsTrigger>
                  <TabsTrigger value="multiple">Multiple Recipients</TabsTrigger>
                </TabsList>

                <TabsContent value="self" className="space-y-4">
                  <p className="text-sm text-gray-600">NFTs will be minted to your connected wallet address.</p>
                </TabsContent>

                <TabsContent value="single" className="space-y-4">
                  <div>
                    <Label htmlFor="recipientAddress">Recipient Wallet Address</Label>
                    <Input
                      id="recipientAddress"
                      value={formData.recipientAddress}
                      onChange={(e) => setFormData((prev) => ({ ...prev, recipientAddress: e.target.value }))}
                      placeholder="Enter Solana/Eclipse wallet address..."
                    />
                    {formData.recipientAddress && !validateSolanaAddress(formData.recipientAddress) && (
                      <p className="text-xs text-red-500 mt-1">Invalid wallet address format</p>
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="multiple" className="space-y-4">
                  <div>
                    <Label htmlFor="recipients">Recipient Addresses (one per line)</Label>
                    <Textarea
                      id="recipients"
                      value={recipientList}
                      onChange={(e) => handleRecipientListChange(e.target.value)}
                      placeholder="Enter wallet addresses, one per line..."
                      rows={6}
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      {formData.recipients?.length || 0} valid addresses
                      {formData.mintType === "collection" &&
                        formData.images &&
                        formData.recipients &&
                        formData.recipients.length < formData.images.length &&
                        ` (remaining ${formData.images.length - formData.recipients.length} will go to your wallet)`}
                    </p>
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>

        {/* Mint Button */}
        <Card className="mt-6">
          <CardContent className="p-6">
            <Button
              onClick={handleMint}
              disabled={
                !connected ||
                isLoading ||
                (formData.mintType !== "collection" && !formData.image) ||
                (formData.mintType === "collection" && (!formData.images || formData.images.length === 0)) ||
                !formData.name.trim()
              }
              className={`w-full ${isEclipseNetwork(network) ? "bg-purple-600 hover:bg-purple-700" : "bg-blue-600 hover:bg-blue-700"}`}
              size="lg"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Minting {formData.mintType} on {getNetworkDisplayName(network)}...
                </>
              ) : (
                <>
                  {getMintTypeIcon(formData.mintType)}
                  <span className="ml-2">
                    Mint {formData.mintType === "single" ? "NFT" : `${formData.images?.length || 0} NFT Collection`} on{" "}
                    {getNetworkDisplayName(network)}
                  </span>
                  {estimatedCost && (
                    <span className="ml-2 text-sm opacity-75">
                      (~{(estimatedCost / 1e9).toFixed(4)} {isEclipseNetwork(network) ? "ETH" : "SOL"})
                    </span>
                  )}
                </>
              )}
            </Button>
            {!connected && <p className="text-sm text-gray-500 text-center mt-2">Connect your wallet to mint NFTs</p>}
            {network.includes("mainnet") && (
              <p className="text-sm text-orange-600 text-center mt-2">
                ⚠️ You are minting on MAINNET - this will cost real {isEclipseNetwork(network) ? "ETH" : "SOL"}
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export default NFTMinter
