"use client"

import type React from "react"
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react"
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui"
import { PhantomWalletAdapter, SolflareWalletAdapter } from "@solana/wallet-adapter-wallets"
import { useMemo, useState, useEffect } from "react"
import { CONFIG, type NetworkType } from "@/lib/config"

// Import wallet adapter CSS
import "@solana/wallet-adapter-react-ui/styles.css"

interface WalletContextProviderProps {
  children: React.ReactNode
  network?: NetworkType
}

function WalletContextProvider({ children, network = "eclipse-testnet" }: WalletContextProviderProps) {
  const [currentNetwork, setCurrentNetwork] = useState<NetworkType>(network)

  // Update network when prop changes
  useEffect(() => {
    setCurrentNetwork(network)
  }, [network])

  const endpoint = useMemo(() => {
    return CONFIG.NETWORKS[currentNetwork].url
  }, [currentNetwork])

  const wallets = useMemo(() => [new PhantomWalletAdapter(), new SolflareWalletAdapter()], [])

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  )
}

export { WalletContextProvider }
export default WalletContextProvider
