import { CONFIG } from "./config"
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
  private readonly baseUrl = "https://api.pinata.cloud"
  private readonly gateway = CONFIG.PINATA.gateway

  private getHeaders() {
    if (!CONFIG.PINATA.jwt) {
      throw createError(ERROR_CODES.NETWORK_ERROR, "Pinata JWT token not configured")
    }

    return {
      Authorization: `Bearer ${CONFIG.PINATA.jwt}`,
    }
  }

  async uploadFile(file: File | Blob, fileName?: string, options: UploadOptions = {}): Promise<string> {
    try {
      const formData = new FormData()
      formData.append("file", file, fileName || "file")

      const metadata = JSON.stringify({
        name: fileName || "NFT Asset",
        keyvalues: {
          uploadedAt: new Date().toISOString(),
          fileType: file instanceof File ? file.type : "application/json",
        },
      })
      formData.append("pinataMetadata", metadata)

      const pinataOptions = JSON.stringify({
        cidVersion: 1,
        wrapWithDirectory: false,
      })
      formData.append("pinataOptions", pinataOptions)

      const controller = new AbortController()
      const timeoutId = setTimeout(() => {
        controller.abort()
      }, options.timeout || 30000)

      const response = await fetch(`${this.baseUrl}/pinning/pinFileToIPFS`, {
        method: "POST",
        headers: this.getHeaders(),
        body: formData,
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw createError(ERROR_CODES.FILE_UPLOAD_FAILED, `Upload failed: ${response.statusText}`, errorData)
      }

      const result = await response.json()
      return `${this.gateway}/${result.IpfsHash}`
    } catch (error) {
      if (error instanceof NFTMinterError) {
        throw error
      }

      throw createError(ERROR_CODES.FILE_UPLOAD_FAILED, "Failed to upload file to IPFS", error)
    }
  }

  async uploadJSON(data: any, fileName = "metadata.json"): Promise<string> {
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    })

    return this.uploadFile(blob, fileName)
  }

  async testConnection(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/data/testAuthentication`, {
        method: "GET",
        headers: this.getHeaders(),
      })

      return response.ok
    } catch {
      return false
    }
  }
}

export const ipfsService = new IPFSService()
