"use server"

import { serverIPFSService, type UploadResponse } from "@/lib/server-ipfs-service"

export async function uploadImageToIPFS(formData: FormData): Promise<UploadResponse> {
  try {
    const file = formData.get("image") as File
    const fileName = formData.get("fileName") as string

    if (!file) {
      return {
        success: false,
        error: "No file provided",
      }
    }

    // Convert File to Buffer for server-side processing
    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)

    return await serverIPFSService.uploadFile(buffer, fileName)
  } catch (error) {
    return {
      success: false,
      error: `Server error: ${error instanceof Error ? error.message : "Unknown error"}`,
    }
  }
}

export async function uploadMetadataToIPFS(metadata: any): Promise<UploadResponse> {
  try {
    return await serverIPFSService.uploadJSON(metadata, "metadata.json")
  } catch (error) {
    return {
      success: false,
      error: `Server error: ${error instanceof Error ? error.message : "Unknown error"}`,
    }
  }
}

export async function testIPFSConnection(): Promise<boolean> {
  try {
    return await serverIPFSService.testConnection()
  } catch (error) {
    console.error("IPFS connection test failed:", error)
    return false
  }
}
