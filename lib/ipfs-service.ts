import { uploadImageToIPFS, uploadMetadataToIPFS } from "@/app/actions/ipfs-actions"
import { createError, ERROR_CODES, NFTMinterError } from "./errors"

export interface UploadProgress {
  loaded: number
  total: number
  percentage: number
}

export interface UploadOptions {
  onProgress?: (progress: UploadProgress) => void
  timeout?: number
}

class IPFSService {
  async uploadFile(file: File, fileName?: string, options: UploadOptions = {}): Promise<string> {
    try {
      const formData = new FormData()
      formData.append("image", file)
      formData.append("fileName", fileName || file.name)

      // Simulate progress for better UX
      if (options.onProgress) {
        options.onProgress({ loaded: 0, total: 100, percentage: 0 })

        const progressInterval = setInterval(() => {
          const progress = Math.min(90, Math.random() * 80 + 10)
          options.onProgress!({ loaded: progress, total: 100, percentage: progress })
        }, 200)

        const result = await uploadImageToIPFS(formData)
        clearInterval(progressInterval)

        options.onProgress({ loaded: 100, total: 100, percentage: 100 })

        if (!result.success) {
          throw createError(ERROR_CODES.FILE_UPLOAD_FAILED, result.error || "Upload failed")
        }

        return result.uri!
      } else {
        const result = await uploadImageToIPFS(formData)

        if (!result.success) {
          throw createError(ERROR_CODES.FILE_UPLOAD_FAILED, result.error || "Upload failed")
        }

        return result.uri!
      }
    } catch (error) {
      if (error instanceof NFTMinterError) {
        throw error
      }

      throw createError(ERROR_CODES.FILE_UPLOAD_FAILED, "Failed to upload file to IPFS", error)
    }
  }

  async uploadJSON(data: any, fileName = "metadata.json"): Promise<string> {
    try {
      const result = await uploadMetadataToIPFS(data)

      if (!result.success) {
        throw createError(ERROR_CODES.FILE_UPLOAD_FAILED, result.error || "JSON upload failed")
      }

      return result.uri!
    } catch (error) {
      if (error instanceof NFTMinterError) {
        throw error
      }

      throw createError(ERROR_CODES.FILE_UPLOAD_FAILED, "Failed to upload JSON to IPFS", error)
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      const { testIPFSConnection } = await import("@/app/actions/ipfs-actions")
      return await testIPFSConnection()
    } catch {
      return false
    }
  }
}

export const ipfsService = new IPFSService()
