import type React from "react"
import type { Metadata } from "next"
import { Inter } from "next/font/google"
import "./globals.css"
import { WalletContextProvider } from "@/components/wallet-provider"
import { Toaster } from "@/components/ui/toaster"

const inter = Inter({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "NFT Minter",
  description: "Custom NFT minting tool for Eclipse and Solana networks",
  keywords: ["Eclipse NFT", "NFT Minter", "Eclipse Blockchain", "NFT Creation", "Crypto Art", "Digital Assets", "Web3"],
  authors: [{ name: "Eclipse NFT Minter" }],
  viewport: "width=device-width, initial-scale=1",
  generator: "Eclipse NFT Minter",

  // Open Graph tags for social media previews
  openGraph: {
    title: "NFT Minter - Professional NFT Creation",
    description:
      "Create and mint NFTs on Eclipse blockchain with drag & drop attributes, collections, and seamless wallet integration.",
    url: "https://eclipse-nft-minter.vercel.app",
    siteName: "Eclipse NFT Minter",
    type: "website",
    images: [
      {
        url: "/eclipse-nft-minter-platform.png",
        width: 1200,
        height: 630,
        alt: "Eclipse NFT Minter - Professional NFT Creation Platform",
      },
    ],
  },

  // Twitter Card tags
  twitter: {
    card: "summary_large_image",
    title: "NFT Minter - Professional NFT Creation",
    description: "Create and mint NFTs on Eclipse blockchain with drag & drop attributes and collections.",
    images: ["/eclipse-nft-minter.png"],
  },

  // Additional meta tags
  robots: "index, follow",
  category: "Web3",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/eclipse-nft-logo.png" />
        <link rel="apple-touch-icon" href="/eclipse-nft-logo.png" />
      </head>
      <body className={inter.className}>
        <WalletContextProvider>
          {children}
          <Toaster />
        </WalletContextProvider>
      </body>
    </html>
  )
}
