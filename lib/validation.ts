import { CONFIG } from "./config"

export interface ValidationResult {
  isValid: boolean
  errors: string[]
}

export interface NFTFormData {
  name: string
  description: string
  image: File | null
  attributes: Array<{ trait_type: string; value: string }>
  royalty: number
  collection?: string
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

  // Validate image
  if (!formData.image) {
    errors.push("NFT image is required")
  } else {
    const fileValidation = validateFile(formData.image)
    if (!fileValidation.isValid) {
      errors.push(...fileValidation.errors)
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

  if (!CONFIG.PINATA.jwt) {
    errors.push("NEXT_PUBLIC_PINATA_JWT environment variable is required")
  }

  if (!CONFIG.PINATA.apiKey) {
    errors.push("NEXT_PUBLIC_PINATA_API_KEY environment variable is required")
  }

  if (!CONFIG.PINATA.secretKey) {
    errors.push("NEXT_PUBLIC_PINATA_SECRET_KEY environment variable is required")
  }

  return {
    isValid: errors.length === 0,
    errors,
  }
}
