# Frontend Module Documentation

## Overview

The frontend module provides a web-based interface for interacting with the YouSim simulation. It's built with React, TypeScript, and Vite, located at `src/frontend`, using Supabase for authentication and API calls.

## Key Features

### User Interface
- Simple form-based interface for entering commands
- Message display showing conversation history between user and simulator
- Session management with reset functionality

### State Management
- Uses TanStack Query (React Query) for efficient data fetching and caching
- Client-side state management with React hooks

### Backend Integration
- Supabase integration for authentication
- API communication layer that calls the Bun/Elysia backend with a bearer token

## Dependencies

### Production Dependencies
- `react` - Core React library
- `react-dom` - React DOM rendering
- `@tanstack/react-query` - Data fetching and state management
- `@supabase/supabase-js` - Supabase client library

### Development Dependencies
- `@tanstack/react-query-devtools` - Development tools for React Query
- `@types/react` - TypeScript definitions for React
- `@types/react-dom` - TypeScript definitions for React DOM
- `@vitejs/plugin-react` - React plugin for Vite
- `vite` - Build tool and development server
- `typescript` - TypeScript compiler

## Setup Requirements

The frontend requires the following environment variables to be defined in a `.env` file:

```
VITE_SUPABASE_URL=your_supabase_url_here
VITE_SUPABASE_KEY=your_supabase_key_here
```

## Development Workflow

### Install Dependencies
```bash
bun install
```

### Run Development Server
```bash
bun run dev
```
The development server will start on port 5173.

### Build for Production
```bash
bun run build
```
The build outputs to `src/api/public` so the API can serve the frontend in production.

### Preview Production Build
```bash
bun run preview
```

## Architecture

### Entry Point
- `src/main.tsx` - Application entry point that sets up React and TanStack Query

### Main Component
- `src/App.tsx` - Main application component with:
  - User/session management
  - Message display
  - Command input form

### Styling
- `src/index.css` - Global styles with a terminal-like green-on-black theme

### Configuration
- `vite.config.js` - Vite build configuration
- `tsconfig.json` - TypeScript configuration

## Future Improvements

1. Enhance the UI/UX with better styling and components
2. Add real-time updates using Supabase subscriptions
3. Implement richer error handling and user feedback
