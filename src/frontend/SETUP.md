# Frontend Setup Guide

## Overview

This guide explains how to set up and run the YouSim React frontend.

## Prerequisites

- Bun (for dependency management and running the development server)
- A Supabase account and project (for backend integration)

## Setup Instructions

### 1. Install Dependencies

From the frontend directory, run:
```bash
bun install
```

### 2. Configure Environment Variables

Create a `.env` file in the frontend directory with your Supabase configuration:
```env
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_KEY=your_supabase_anon_key
```

You can find these values in your Supabase project dashboard under Project Settings > API.

### 3. Run Development Server

```bash
bun run dev
```

The development server will start on port 5173. Visit http://localhost:5173 to access the frontend.

### 4. Build for Production

```bash
bun run build
```

The build output will be in `src/api/public` so the API can serve it.

### 5. Preview Production Build

```bash
bun run preview
```

This will serve the production build locally for testing.

## Project Structure

- `src/main.tsx` - Entry point
- `src/App.tsx` - Main application component
- `src/index.css` - Styling
- `vite.config.js` - Vite configuration
- `tsconfig.json` - TypeScript configuration

## Dependencies

The frontend uses:
- React and React DOM
- TanStack Query for state management
- Supabase client for backend integration
- Vite for build tooling
