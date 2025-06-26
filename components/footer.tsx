import { Github, AlertCircle, GitFork } from "lucide-react"
import { Button } from "@/components/ui/button"

export function Footer() {
  return (
    <footer className="mt-12 border-t border-gray-200 pt-8 pb-6">
      <div className="flex flex-col md:flex-row items-center justify-between gap-4">
        {/* Developer Credit */}
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <span>Built by</span>
          <a
            href="https://github.com/0xanmol"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-purple-600 hover:text-purple-700 transition-colors flex items-center gap-1"
          >
            <Github className="w-4 h-4" />
            Anmol
          </a>
        </div>

        {/* Open Source Links */}
        <div className="flex items-center gap-3">
          <a href="https://github.com/0xanmol/Eclipse-NFT-Minter-tool/issues" target="_blank" rel="noopener noreferrer">
            <Button variant="outline" size="sm" className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              Report Issue
            </Button>
          </a>

          <a href="https://github.com/0xanmol/Eclipse-NFT-Minter-tool" target="_blank" rel="noopener noreferrer">
            <Button variant="outline" size="sm" className="flex items-center gap-2">
              <GitFork className="w-4 h-4" />
              Contribute
            </Button>
          </a>
        </div>
      </div>

      {/* Additional Info */}
      <div className="mt-4 text-center text-xs text-gray-500">Open source NFT minting tool for Eclipse blockchain</div>
    </footer>
  )
}
