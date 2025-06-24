"use client"

import { useEffect, useState } from "react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { AlertCircle, CheckCircle } from "lucide-react"
import { validateEnvironment, type EnvValidationResult } from "@/lib/env-validation"

export function EnvironmentCheck() {
  const [validation, setValidation] = useState<EnvValidationResult | null>(null)

  useEffect(() => {
    const result = validateEnvironment()
    setValidation(result)

    // Log to console for debugging
    if (!result.isValid) {
      console.error("Environment validation failed:", result.errors)
    }
    if (result.warnings.length > 0) {
      console.warn("Environment warnings:", result.warnings)
    }
  }, [])

  if (!validation) return null

  return (
    <div className="space-y-2">
      {!validation.isValid && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            <div className="font-medium mb-1">Configuration Issues:</div>
            <ul className="list-disc list-inside space-y-1 text-sm">
              {validation.errors.map((error, index) => (
                <li key={index}>{error}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {validation.warnings.length > 0 && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            <div className="font-medium mb-1">Configuration Warnings:</div>
            <ul className="list-disc list-inside space-y-1 text-sm">
              {validation.warnings.map((warning, index) => (
                <li key={index}>{warning}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {validation.isValid && validation.warnings.length === 0 && (
        <Alert className="border-green-200 bg-green-50">
          <CheckCircle className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-800">
            All environment variables are properly configured!
          </AlertDescription>
        </Alert>
      )}
    </div>
  )
}
