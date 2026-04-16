# KuaKuaMusic (PraiseMySong)

An AI-powered music commentary generator designed to help music enthusiasts articulate their passion through structured, high-quality copy.

## Overview

`KuaKuaMusic` is a lightweight, AI-driven application that generates nuanced music reviews and social media commentary. It translates raw auditory impressions into three distinct styles—**Emotional**, **Hype**, and **Expert**—allowing users to share their musical taste with precision and style.

## Key Features

- **Multi-Persona Engine:** Generate commentary tailored for different contexts (e.g., heartfelt social posts vs. analytical community reviews).
- **One-Click Generation:** High-fidelity output based on minimal user input or track identification.
- **Social Integration:** Pre-formatted copy optimized for music platforms and social media discovery.
- **Taste Refinement:** Helps users build an expressive vocabulary for describing sonic characteristics.

## Tech Stack

- **Frontend:** React + TypeScript
- **Build Tool:** Vite
- **Styling:** Tailwind CSS
- **Runtime:** Node.js

## Getting Started

### Prerequisites

- Node.js (v18 or higher)
- npm or pnpm

### Installation

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd praisemysong-(教你夸一首歌)
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Configure environment variables:
   Copy `.env.example` to `.env.local` and fill in your API keys.

4. Run the development server:
   ```bash
   npm run dev
   ```

## Usage

1. Enter the name of the song or artist you want to highlight.
2. Select the desired commentary style (Emotional, Hype, or Expert).
3. Copy the generated text for your social post or playlist description.

## Deployment

### Option A: Vercel Full-stack
1. Import the repository in the Vercel dashboard.
2. Add environment variable: `ZHIPU_API_KEY`.
3. Vercel will automatically detect the Serverless Functions in the `api/` directory.

### Option B: Render Backend + Vercel Frontend (Recommended)
Since Vercel Hobby tier has a 10s timeout limit, we recommend deploying the backend to **Render**:
1. **Render Deployment:** Create a new **Web Service**. Set the start command to `npm start` and add `ZHIPU_API_KEY`.
2. **Frontend Link:** In Vercel, add `VITE_BACKEND_API_BASE_URL` with your Render URL, then redeploy correctly.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

