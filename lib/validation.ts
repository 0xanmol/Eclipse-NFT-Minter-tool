import { PublicKey } from "@solana/web3.js"
import { CONFIG } from "./config"

export interface ValidationResult {
  isValid: boolean
  errors: string[]
}

export interface NFTFormData {
  name: string
  description: string
  image: File | null
  images?: File[] // For batch/collection minting
  attributes: Array<{ trait_type: string; value: string }>
  royalty: number
  collection?: string
  // New fields for enhanced features
  mintType: "single" | "collection"
  recipientAddress?: string
  recipients?: string[] // For batch airdrops
}

export interface TraitLayer {
  name: string
  files: File[]
  rarity: number[]
}

export interface CollectionConfig {
  name: string
  description: string
  size: number
  traitLayers: TraitLayer[]
}

export function validateFile(file: File): ValidationResult {
  const errors: string[] = []

  // Check file size
  if (file.size > CONFIG.FILE_VALIDATION.maxSize) {
    errors.push(`File size must be less than ${CONFIG.FILE_VALIDATION.maxSize / (1024 * 1024)}MB`)
  }

  // Check file type
  if (!CONFIG.FILE_VALIDATION.allowedTypes.includes(file.type)) {
    errors.push("File type not supported. Please use JPG, PNG, GIF, or WebP")
  }

  // Check file extension
  const extension = file.name.toLowerCase().substring(file.name.lastIndexOf("."))
  if (!CONFIG.FILE_VALIDATION.allowedExtensions.includes(extension)) {
    errors.push("Invalid file extension")
  }

  // Check if file is actually an image
  if (!file.type.startsWith("image/")) {
    errors.push("File must be an image")
  }

  return {
    isValid: errors.length === 0,
    errors,
  }
}

export function validateSolanaAddress(address: string): boolean {
  if (!address || typeof address !== "string") {
    return false
  }

  const trimmed = address.trim()

  // Check length (Solana addresses are base58 encoded, typically 32-44 characters)
  if (trimmed.length < 32 || trimmed.length > 44) {
    return false
  }

  // Check if it's a valid base58 string (basic check)
  const base58Regex = /^[1-9A-HJ-NP-Za-km-z]+$/
  if (!base58Regex.test(trimmed)) {
    return false
  }

  try {
    // Try to create a PublicKey to validate
    new PublicKey(trimmed)
    return true
  } catch {
    return false
  }
}

export function validateNFTMetadata(formData: NFTFormData): ValidationResult {
  const errors: string[] = []

  // Validate name
  if (!formData.name.trim()) {
    errors.push("NFT name is required")
  }

  if (formData.name.length > CONFIG.NFT.maxNameLength) {
    errors.push(`NFT name must be less than ${CONFIG.NFT.maxNameLength} characters`)
  }

  // Validate description
  if (formData.description.length > CONFIG.NFT.maxDescriptionLength) {
    errors.push(`Description must be less than ${CONFIG.NFT.maxDescriptionLength} characters`)
  }

  // Validate images based on mint type
  if (formData.mintType === "single") {
    if (!formData.image) {
      errors.push("NFT image is required")
    } else {
      const fileValidation = validateFile(formData.image)
      if (!fileValidation.isValid) {
        errors.push(...fileValidation.errors)
      }
    }
  } else if (formData.mintType === "collection") {
    if (!formData.images || formData.images.length === 0) {
      errors.push("Collection images are required")
    } else {
      for (const image of formData.images) {
        const fileValidation = validateFile(image)
        if (!fileValidation.isValid) {
          errors.push(`${image.name}: ${fileValidation.errors.join(", ")}`)
        }
      }
    }
  }

  // Validate recipient address
  if (formData.recipientAddress && formData.recipientAddress.trim()) {
    if (!validateSolanaAddress(formData.recipientAddress.trim())) {
      errors.push("Invalid recipient address format")
    }
  }

  // Validate recipients for batch operations
  if (formData.recipients && formData.recipients.length > 0) {
    for (const address of formData.recipients) {
      if (!validateSolanaAddress(address.trim())) {
        errors.push(`Invalid recipient address: ${address}`)
      }
    }
  }

  // Validate royalty
  if (formData.royalty < 0 || formData.royalty > 10000) {
    errors.push("Royalty must be between 0% and 100%")
  }

  // Validate attributes
  const validAttributes = formData.attributes.filter((attr) => attr.trait_type.trim() && attr.value.trim())

  if (validAttributes.length > CONFIG.NFT.maxAttributes) {
    errors.push(`Maximum ${CONFIG.NFT.maxAttributes} attributes allowed`)
  }

  // Check for duplicate trait types
  const traitTypes = validAttributes.map((attr) => attr.trait_type.toLowerCase())
  const duplicates = traitTypes.filter((item, index) => traitTypes.indexOf(item) !== index)
  if (duplicates.length > 0) {
    errors.push("Duplicate trait types are not allowed")
  }

  return {
    isValid: errors.length === 0,
    errors,
  }
}

export function sanitizeMetadata(formData: NFTFormData): NFTFormData {
  return {
    ...formData,
    name: formData.name.trim(),
    description: formData.description.trim(),
    recipientAddress: formData.recipientAddress?.trim(),
    recipients: formData.recipients?.map((addr) => addr.trim()).filter(Boolean),
    attributes: formData.attributes
      .filter((attr) => attr.trait_type.trim() && attr.value.trim())
      .map((attr) => ({
        trait_type: attr.trait_type.trim(),
        value: attr.value.trim(),
      })),
  }
}

export function validateEnvironment(): ValidationResult {
  const errors: string[] = []

  // Only validate client-side environment variables
  if (!CONFIG.PINATA.jwt) {
    errors.push("NEXT_PUBLIC_PINATA_JWT environment variable is required")
  }

  return {
    isValid: errors.length === 0,
    errors,
  }
}
