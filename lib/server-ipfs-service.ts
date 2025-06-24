import { SERVER_CONFIG } from "./config"

export interface UploadResponse {
  success: boolean
  uri?: string
  error?: string
}

class ServerIPFSService {
  private readonly baseUrl = "https://api.pinata.cloud"
  private readonly gateway = "https://gateway.pinata.cloud/ipfs"

  private getHeaders() {
    const jwt = SERVER_CONFIG.PINATA.jwt
    if (!jwt) {
      throw new Error("Pinata JWT token not configured on server")
    }

    return {
      Authorization: `Bearer ${jwt}`,
    }
  }

  async uploadFile(file: File | Buffer, fileName: string): Promise<UploadResponse> {
    try {
      const formData = new FormData()

      if (file instanceof Buffer) {
        const blob = new Blob([file])
        formData.append("file", blob, fileName)
      } else {
        formData.append("file", file, fileName)
      }

      const metadata = JSON.stringify({
        name: fileName,
        keyvalues: {
          uploadedAt: new Date().toISOString(),
          uploadedBy: "eclipse-nft-minter",
        },
      })
      formData.append("pinataMetadata", metadata)

      const pinataOptions = JSON.stringify({
        cidVersion: 1,
        wrapWithDirectory: false,
      })
      formData.append("pinataOptions", pinataOptions)

      const response = await fetch(`${this.baseUrl}/pinning/pinFileToIPFS`, {
        method: "POST",
        headers: this.getHeaders(),
        body: formData,
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        return {
          success: false,
          error: `Upload failed: ${response.statusText} - ${JSON.stringify(errorData)}`,
        }
      }

      const result = await response.json()
      return {
        success: true,
        uri: `${this.gateway}/${result.IpfsHash}`,
      }
    } catch (error) {
      return {
        success: false,
        error: `Failed to upload file to IPFS: ${error instanceof Error ? error.message : "Unknown error"}`,
      }
    }
  }

  async uploadJSON(data: any, fileName = "metadata.json"): Promise<UploadResponse> {
    try {
      const jsonString = JSON.stringify(data, null, 2)
      const buffer = Buffer.from(jsonString, "utf-8")

      return this.uploadFile(buffer, fileName)
    } catch (error) {
      return {
        success: false,
        error: `Failed to upload JSON to IPFS: ${error instanceof Error ? error.message : "Unknown error"}`,
      }
    }
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

export const serverIPFSService = new ServerIPFSService()
