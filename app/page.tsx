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
import {
  Upload,
  Wallet,
  Loader2,
  CheckCircle,
  AlertCircle,
  ExternalLink,
  Info,
  X,
  Copy,
  Network,
  ImageIcon,
} from "lucide-react"
import { useWallet } from "@solana/wallet-adapter-react"
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui"
import { toast } from "@/hooks/use-toast"
import { CONFIG, type NetworkType, getNetworkDisplayName, isEclipseNetwork } from "@/lib/config"
import { validateNFTMetadata, sanitizeMetadata, type NFTFormData } from "@/lib/validation"
import { ipfsService } from "@/lib/ipfs-service"
import { metaplexNFTService, type MetaplexNFTResult } from "@/lib/metaplex-nft-service"
import { getErrorMessage } from "@/lib/errors"
import { validateFile } from "@/lib/validation"

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
  const [mintResult, setMintResult] = useState<MetaplexNFTResult | null>(null)
  const [mintingProgress, setMintingProgress] = useState(0)
  const [currentStep, setCurrentStep] = useState("")
  const [estimatedCost, setEstimatedCost] = useState<number | null>(null)

  // Form state
  const [formData, setFormData] = useState<NFTFormData>({
    name: "",
    description: "",
    image: null,
    attributes: [{ trait_type: "", value: "" }],
    royalty: 500, // 5%
    collection: "",
  })

  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [validationErrors, setValidationErrors] = useState<string[]>([])

  // Simplified minting steps
  const [mintingSteps, setMintingSteps] = useState<MintingStep[]>([
    { id: "validate", label: "Validate metadata", status: "pending" },
    { id: "upload-image", label: "Upload image to IPFS", status: "pending" },
    { id: "upload-metadata", label: "Upload metadata to IPFS", status: "pending" },
    { id: "estimate-cost", label: "Estimate minting cost", status: "pending" },
    { id: "setup-umi", label: "Setup Metaplex UMI", status: "pending" },
    { id: "create-nft", label: "Create NFT with metadata", status: "pending" },
    { id: "confirm", label: "Confirm transaction", status: "pending" },
  ])

  // Load estimated cost when network changes
  useEffect(() => {
    if (connected) {
      loadEstimatedCost()
    }
  }, [network, connected])

  const loadEstimatedCost = async () => {
    try {
      const cost = await metaplexNFTService.estimateMintingCost(network)
      setEstimatedCost(cost)
    } catch (error) {
      console.error("Failed to estimate cost:", error)
    }
  }

  const updateStep = (stepId: string, status: MintingStep["status"]) => {
    setMintingSteps((prev) => prev.map((step) => (step.id === stepId ? { ...step, status } : step)))
  }

  const handleImageUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Validate file immediately
    const validation = validateFile(file)
    if (!validation.isValid) {
      setValidationErrors(validation.errors)
      return
    }

    setFormData((prev) => ({ ...prev, image: file }))
    setValidationErrors([])

    // Create preview
    const reader = new FileReader()
    reader.onload = (e) => setImagePreview(e.target?.result as string)
    reader.readAsDataURL(file)
  }, [])

  const addAttribute = () => {
    if (formData.attributes.length < CONFIG.NFT.maxAttributes) {
      setFormData((prev) => ({
        ...prev,
        attributes: [...prev.attributes, { trait_type: "", value: "" }],
      }))
    }
  }

  const updateAttribute = (index: number, field: "trait_type" | "value", value: string) => {
    setFormData((prev) => ({
      ...prev,
      attributes: prev.attributes.map((attr, i) => (i === index ? { ...attr, [field]: value } : attr)),
    }))
  }

  const removeAttribute = (index: number) => {
    if (formData.attributes.length > 1) {
      setFormData((prev) => ({
        ...prev,
        attributes: prev.attributes.filter((_, i) => i !== index),
      }))
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

      // Step 2: Upload image
      updateStep("upload-image", "active")
      setCurrentStep("Uploading image to IPFS...")

      const imageUri = await ipfsService.uploadFile(
        formData.image!,
        `${sanitized.name.replace(/\s+/g, "_")}.${formData.image!.name.split(".").pop()}`,
      )

      updateStep("upload-image", "completed")
      setMintingProgress(25)

      // Step 3: Upload metadata
      updateStep("upload-metadata", "active")
      setCurrentStep("Uploading metadata to IPFS...")

      const metadata = {
        name: sanitized.name,
        description: sanitized.description,
        image: imageUri,
        attributes: sanitized.attributes,
        properties: {
          files: [{ uri: imageUri, type: formData.image!.type }],
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

      updateStep("upload-metadata", "completed")
      setMintingProgress(37)

      // Step 4: Estimate cost
      updateStep("estimate-cost", "active")
      setCurrentStep("Estimating minting cost...")

      await loadEstimatedCost()

      updateStep("estimate-cost", "completed")
      setMintingProgress(50)

      // Step 5-7: Proper NFT minting process
      const result = await metaplexNFTService.mintNFT({
        name: sanitized.name,
        description: sanitized.description,
        imageUri,
        metadataUri,
        royalty: sanitized.royalty,
        wallet: wallet.adapter,
        network,
        onProgress: (message) => {
          setCurrentStep(message)

          // Update steps based on progress messages
          if (message.includes("Setting up Metaplex UMI")) {
            updateStep("setup-umi", "active")
            setMintingProgress(62)
          } else if (message.includes("Checking wallet balance")) {
            updateStep("setup-umi", "completed")
            setMintingProgress(70)
          } else if (message.includes("Creating NFT with metadata")) {
            updateStep("create-nft", "active")
            setMintingProgress(85)
          } else if (message.includes("NFT created successfully")) {
            updateStep("create-nft", "completed")
            updateStep("confirm", "completed")
            setMintingProgress(100)
          }
        },
      })

      updateStep("create-nft", "completed")
      updateStep("confirm", "completed")
      setMintingProgress(100)

      setMintResult(result)

      toast({
        title: "🎉 NFT Token Minted Successfully!",
        description: `Your NFT token "${sanitized.name}" has been created on ${getNetworkDisplayName(network)}`,
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
      attributes: [{ trait_type: "", value: "" }],
      royalty: 500,
      collection: "",
    })
    setImagePreview(null)
    setValidationErrors([])
    setMintResult(null)
    setMintingProgress(0)
    setMintingSteps((prev) => prev.map((step) => ({ ...step, status: "pending" })))
  }

  const getNetworkBadgeColor = (networkType: NetworkType) => {
    if (isEclipseNetwork(networkType)) {
      return networkType.includes("mainnet") ? "bg-purple-600" : "bg-purple-400"
    }
    return networkType.includes("mainnet") ? "bg-blue-600" : "bg-blue-400"
  }

  const getNetworkIcon = (networkType: NetworkType) => {
    return isEclipseNetwork(networkType) ? "Eclipse" : "Solana"
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-blue-50 p-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            {isEclipseNetwork(network) ? "Eclipse" : "Solana"} NFT Minter
          </h1>
          <p className="text-gray-600">Mint NFT tokens with IPFS metadata on {getNetworkDisplayName(network)}</p>
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
                        {getNetworkIcon(network)}
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

        {/* Proper NFT Info */}
        <Card className="mb-6 border-green-200 bg-green-50">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <ImageIcon className="w-5 h-5 text-green-600" />
              <div>
                <p className="font-medium text-green-800">Proper Metaplex NFT with Full Metadata</p>
                <p className="text-sm text-green-700">
                  Creates standard NFTs that display images in all explorers and wallets (Backpack, Nightly, etc.) -
                  with retry logic for network issues
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

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
                Minting NFT Token on {getNetworkDisplayName(network)}
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

        {/* Success Result */}
        {mintResult && (
          <Card className="mb-6 border-green-200 bg-green-50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-green-800">
                <CheckCircle className="w-5 h-5" />🎉 NFT Token Minted Successfully!
              </CardTitle>
              <CardDescription className="text-green-700">
                Your NFT is now live on {getNetworkDisplayName(network)} with full Metaplex metadata - visible in all
                explorers and wallets!
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
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
              </div>

              <div>
                <Label className="text-green-700 font-medium">IPFS Metadata URI</Label>
                <div className="flex items-center gap-2 mt-1">
                  <code className="text-sm bg-green-100 px-2 py-1 rounded flex-1 break-all">
                    {mintResult.metadataUri}
                  </code>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => copyToClipboard(mintResult.metadataUri, "Metadata URI")}
                  >
                    <Copy className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => window.open(mintResult.metadataUri, "_blank")}
                    className="whitespace-nowrap"
                  >
                    <ExternalLink className="w-4 h-4 mr-1" />
                    View Metadata
                  </Button>
                </div>
              </div>

              <div>
                <Label className="text-green-700 font-medium">Transaction Signature</Label>
                <div className="flex items-center gap-2 mt-1">
                  <code className="text-sm bg-green-100 px-2 py-1 rounded flex-1 break-all">
                    {mintResult.signature}
                  </code>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => copyToClipboard(mintResult.signature, "Transaction signature")}
                  >
                    <Copy className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => window.open(mintResult.explorerUrl, "_blank")}
                    className="whitespace-nowrap"
                  >
                    <ExternalLink className="w-4 h-4 mr-1" />
                    View on Explorer
                  </Button>
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <Button onClick={resetForm} variant="outline">
                  Mint Another NFT
                </Button>
                <Button
                  variant="default"
                  onClick={() =>
                    window.open(
                      `${CONFIG.NETWORKS[network].explorer}/account/${mintResult.mintAddress}${network.includes("testnet") || network.includes("devnet") ? "?cluster=testnet" : ""}`,
                      "_blank",
                    )
                  }
                >
                  View Token Details
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Form components remain the same... */}
        <div className="grid lg:grid-cols-2 gap-6">
          {/* Image Upload */}
          <Card>
            <CardHeader>
              <CardTitle>NFT Artwork</CardTitle>
              <CardDescription>
                Upload your NFT image (max {CONFIG.FILE_VALIDATION.maxSize / (1024 * 1024)}MB) - stored on IPFS
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
                  {imagePreview ? (
                    <div className="space-y-4">
                      <div className="relative">
                        <img
                          src={imagePreview || "/placeholder.svg"}
                          alt="NFT Preview"
                          className="max-w-full h-64 object-contain mx-auto rounded-lg"
                        />
                        <Button
                          variant="outline"
                          size="sm"
                          className="absolute top-2 right-2"
                          onClick={() => {
                            setImagePreview(null)
                            setFormData((prev) => ({ ...prev, image: null }))
                          }}
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                      <div className="text-sm text-gray-600">
                        <p>File: {formData.image?.name}</p>
                        <p>Size: {((formData.image?.size || 0) / 1024).toFixed(1)} KB</p>
                      </div>
                      <Button variant="outline" onClick={() => document.getElementById("image-upload")?.click()}>
                        Change Image
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <Upload className="w-12 h-12 text-gray-400 mx-auto" />
                      <div>
                        <Button variant="outline" onClick={() => document.getElementById("image-upload")?.click()}>
                          Upload Image
                        </Button>
                        <p className="text-sm text-gray-500 mt-2">
                          PNG, JPG, GIF, WebP up to {CONFIG.FILE_VALIDATION.maxSize / (1024 * 1024)}MB
                        </p>
                      </div>
                    </div>
                  )}
                  <input
                    id="image-upload"
                    type="file"
                    accept={CONFIG.FILE_VALIDATION.allowedTypes.join(",")}
                    onChange={handleImageUpload}
                    className="hidden"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Metadata Form */}
          <Card>
            <CardHeader>
              <CardTitle>NFT Metadata</CardTitle>
              <CardDescription>Define your NFT properties and details</CardDescription>
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
                  placeholder="My Awesome NFT"
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

              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label>
                    Attributes <span className="text-xs text-gray-500">(max {CONFIG.NFT.maxAttributes})</span>
                  </Label>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={addAttribute}
                    disabled={formData.attributes.length >= CONFIG.NFT.maxAttributes}
                  >
                    Add Attribute
                  </Button>
                </div>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {formData.attributes.map((attr, index) => (
                    <div key={index} className="flex gap-2">
                      <Input
                        placeholder="Trait type"
                        value={attr.trait_type}
                        onChange={(e) => updateAttribute(index, "trait_type", e.target.value)}
                      />
                      <Input
                        placeholder="Value"
                        value={attr.value}
                        onChange={(e) => updateAttribute(index, "value", e.target.value)}
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => removeAttribute(index)}
                        disabled={formData.attributes.length === 1}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Mint Button */}
        <Card className="mt-6">
          <CardContent className="p-6">
            <Button
              onClick={handleMint}
              disabled={!connected || isLoading || !formData.image || !formData.name.trim()}
              className={`w-full ${isEclipseNetwork(network) ? "bg-purple-600 hover:bg-purple-700" : "bg-blue-600 hover:bg-blue-700"}`}
              size="lg"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Minting NFT Token on {getNetworkDisplayName(network)}...
                </>
              ) : (
                <>
                  🚀 Mint NFT Token on {getNetworkDisplayName(network)}
                  {estimatedCost && (
                    <span className="ml-2 text-sm opacity-75">
                      (~{(estimatedCost / 1e9).toFixed(4)} {isEclipseNetwork(network) ? "ETH" : "SOL"})
                    </span>
                  )}
                </>
              )}
            </Button>
            {!connected && <p className="text-sm text-gray-500 text-center mt-2">Connect your wallet to mint NFT</p>}
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
