"use client"

import { useCallback, useState } from "react"
import { useDropzone } from "react-dropzone"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { Upload, X, FileImage, AlertCircle } from "lucide-react"
import { CONFIG } from "@/lib/config"
import { validateFile } from "@/lib/validation"

interface DragDropUploadProps {
  onFilesSelected: (files: File[]) => void
  multiple?: boolean
  maxFiles?: number
  accept?: string[]
}

export function DragDropUpload({
  onFilesSelected,
  multiple = false,
  maxFiles = 50,
  accept = CONFIG.FILE_VALIDATION.allowedTypes,
}: DragDropUploadProps) {
  const [files, setFiles] = useState<File[]>([])
  const [errors, setErrors] = useState<string[]>([])
  const [isDragActive, setIsDragActive] = useState(false)

  const onDrop = useCallback(
    (acceptedFiles: File[], rejectedFiles: any[]) => {
      setErrors([])

      // Validate files
      const validFiles: File[] = []
      const newErrors: string[] = []

      for (const file of acceptedFiles) {
        const validation = validateFile(file)
        if (validation.isValid) {
          validFiles.push(file)
        } else {
          newErrors.push(`${file.name}: ${validation.errors.join(", ")}`)
        }
      }

      // Handle rejected files
      for (const rejection of rejectedFiles) {
        newErrors.push(`${rejection.file.name}: ${rejection.errors.map((e: any) => e.message).join(", ")}`)
      }

      // Check max files limit - allow up to the specified max
      if (multiple) {
        const totalFiles = [...files, ...validFiles]
        if (totalFiles.length > maxFiles) {
          const allowedFiles = validFiles.slice(0, maxFiles - files.length)
          if (allowedFiles.length > 0) {
            const newFiles = [...files, ...allowedFiles]
            setFiles(newFiles)
            onFilesSelected(newFiles)
          }
          if (validFiles.length > maxFiles - files.length) {
            newErrors.push(`Only first ${maxFiles - files.length} files selected (limit: ${maxFiles})`)
          }
        } else {
          const newFiles = [...files, ...validFiles]
          setFiles(newFiles)
          onFilesSelected(newFiles)
        }
      } else {
        // Single file mode
        if (validFiles.length > 0) {
          setFiles([validFiles[0]])
          onFilesSelected([validFiles[0]])
        }
      }

      if (newErrors.length > 0) {
        setErrors(newErrors)
      }
    },
    [files, multiple, maxFiles, onFilesSelected],
  )

  const {
    getRootProps,
    getInputProps,
    isDragActive: dropzoneActive,
  } = useDropzone({
    onDrop,
    accept: {
      "image/*": accept.map((type) => type.replace("image/", ".")),
    },
    multiple,
    maxFiles: multiple ? maxFiles : 1, // Only enforce maxFiles when multiple is true
    onDragEnter: () => setIsDragActive(true),
    onDragLeave: () => setIsDragActive(false),
  })

  const removeFile = (index: number) => {
    const newFiles = files.filter((_, i) => i !== index)
    setFiles(newFiles)
    onFilesSelected(newFiles)
  }

  const clearAll = () => {
    setFiles([])
    setErrors([])
    onFilesSelected([])
  }

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes"
    const k = 1024
    const sizes = ["Bytes", "KB", "MB", "GB"]
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Number.parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i]
  }

  return (
    <div className="space-y-4">
      {/* Drop Zone */}
      <Card
        className={`border-2 border-dashed transition-colors ${
          isDragActive || dropzoneActive ? "border-purple-500 bg-purple-50" : "border-gray-300 hover:border-gray-400"
        }`}
      >
        <CardContent className="p-6">
          <div {...getRootProps()} className="cursor-pointer">
            <input {...getInputProps()} />
            <div className="text-center space-y-4">
              <Upload
                className={`w-12 h-12 mx-auto ${isDragActive || dropzoneActive ? "text-purple-500" : "text-gray-400"}`}
              />
              <div>
                <p className="text-lg font-medium">
                  {isDragActive || dropzoneActive ? "Drop files here..." : "Drag & drop files here"}
                </p>
                <p className="text-sm text-gray-500 mt-1">or click to browse</p>
              </div>
              <div className="flex flex-wrap justify-center gap-2">
                <Badge variant="outline">
                  {accept
                    .join(", ")
                    .replace(/image\//g, "")
                    .toUpperCase()}
                </Badge>
                <Badge variant="outline">Max {CONFIG.FILE_VALIDATION.maxSize / (1024 * 1024)}MB</Badge>
                {multiple && <Badge variant="outline">Up to {maxFiles} files</Badge>}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Error Messages */}
      {errors.length > 0 && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="p-4">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-5 h-5 text-red-500 mt-0.5" />
              <div className="flex-1">
                <p className="font-medium text-red-800">Upload Errors</p>
                <ul className="text-sm text-red-700 mt-1 space-y-1">
                  {errors.map((error, index) => (
                    <li key={index}>• {error}</li>
                  ))}
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* File List */}
      {files.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-medium">
                Selected Files ({files.length}
                {multiple ? `/${maxFiles}` : ""})
              </h3>
              <Button variant="outline" size="sm" onClick={clearAll}>
                Clear All
              </Button>
            </div>
            <div className="space-y-2">
              {files.map((file, index) => (
                <div key={index} className="flex items-center gap-3 p-2 bg-gray-50 rounded-lg">
                  <FileImage className="w-5 h-5 text-blue-500" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{file.name}</p>
                    <p className="text-xs text-gray-500">{formatFileSize(file.size)}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeFile(index)}
                    className="text-red-500 hover:text-red-700"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Upload Progress (if needed) */}
      {files.length > 0 && multiple && (
        <div className="text-center">
          <Progress value={(files.length / maxFiles) * 100} className="w-full" />
          <p className="text-xs text-gray-500 mt-1">
            {files.length} of {maxFiles} files selected
          </p>
        </div>
      )}
    </div>
  )
}
