# @yousim/api Module Documentation

## Overview

The `@yousim/api` module provides a web service interface for YouSim using Elysia.js and Bun. It enables browser-based access to the simulation with session management and user persistence.

## Key Features

### RESTful API Endpoints

The API exposes several endpoints for managing simulations:

- `GET /` - Health check endpoint
- `GET /user` - User management endpoint
- `POST /manual` - Process simulation commands
- `POST /reset` - Reset or create new simulation sessions

### Session Management

Uses Supabase for session persistence:

- User sessions tracking
- Conversation history storage
- Message persistence with role information

### Authentication

Implements JWT-based authentication:

- Bearer token authorization header
- User identity verification
- Session security

### CORS Support

Enables cross-origin resource sharing for web client access.

## Usage

The API can be run either through Bun's workspace filter or directly:

```bash
# Via workspace filter (from root)
bun run start:api

# Or directly
cd src/api
bun run start
```

For development:

```bash
# Via workspace filter (from root)
bun run dev

# Or directly
cd packages/api
bun run dev
```

## Dependencies

- `@yousim/core` - Core simulation logic (workspace dependency)
- `elysia` - Web framework for Bun
- `@elysiajs/cors` - CORS middleware
- `@elysiajs/jwt` - JWT authentication middleware
- `@supabase/supabase-js` - Supabase client for data persistence

