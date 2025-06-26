# Eclipse NFT Minter

## Features

- **Quick Minting** - Single NFT minting with drag-and-drop image upload
- **Batch Operations** - Mint multiple NFTs to different recipients at once
- **Collection Support** - Create and manage NFT collections
- **Network Switching** - Works on both Eclipse testnet and mainnet
- **Mobile Friendly** - Responsive design that works on all devices
- **IPFS Integration** - Automatic metadata and image hosting via Pinata

## Getting Started

### Prerequisites

- Node.js 18+ 
- An SVM wallet (Phantom, Solflare, etc.)
- Some Eclipse tokens for transaction fees

### Environment Setup

Copy `.env.example` to `.env.local` and fill in your Pinata credentials:

```bash
PINATA_API_KEY=your_api_key_here
PINATA_SECRET_KEY=your_secret_key_here
PINATA_JWT=your_jwt_token_here
```

### Installation

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and start minting.

## Tech Stack

- **Frontend**: Next.js 14, React, TypeScript
- **Styling**: Tailwind CSS, shadcn/ui components
- **Blockchain**: Solana Web3.js, Metaplex SDK
- **Storage**: Pinata IPFS
- **Deployment**: Vercel

## Project Structure

```
├── app/                 # Next.js app directory
├── components/          # React components
├── lib/                 # Utility functions and services
├── public/              # Static assets
└── scripts/             # Build and utility scripts
```

## Contributing

Found a bug or want to add a feature? 

1. Fork the repo
2. Create a feature branch (`git checkout -b feature/xyz-feature`)
3. Make your changes
4. Push and create a pull request

Or just [open an issue](https://github.com/0xanmol/Eclipse-NFT-Minter-tool/issues) if you spot something wrong.

## Costs

Minting costs vary based on network congestion, but expect:
- **Testnet**: Free (just need test tokens)
- **Mainnet**: ~0.0001 ETH per NFT

## Troubleshooting

**Wallet won't connect?**
- Make sure you're on the right network
- Try refreshing the page
- Check if your wallet supports Eclipse

**Upload failing?**
- Check your Pinata API credentials
- Make sure image is under 10MB
- Try a different image format (PNG, JPG, GIF)

**Transaction failing?**
- Ensure you have enough SOL for fees
- Network might be congested, try again
- Check if you're on the right network

## License

MIT - do whatever you want with it.

---

Built by [@0xanmol](https://github.com/0xanmol) • [Report Issues](https://github.com/0xanmol/Eclipse-NFT-Minter-tool/issues)
