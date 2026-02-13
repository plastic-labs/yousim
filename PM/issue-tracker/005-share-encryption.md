# Issue 005: Share Code Encryption

**Status:** Open
**Priority:** Medium
**Dependencies:** None (can implement independently)
**Blocks:** None

## Description

Implement share code encryption for the `/share` and `/share/messages` endpoints to allow users to share conversations via encrypted codes.

## Legacy Implementation

**Files:**
- `legacy-python/api/app.py:441-540`
- Uses Fernet symmetric encryption (cryptography library)

**Flow:**
1. **Creating Share Code:** `/share/{session_id}`
   - Encrypts `session_id:user_id` string
   - Returns base64-encoded encrypted string as code

2. **Retrieving Shared Messages:** `/share/messages/{code}`
   - Decrypts code to get `session_id:user_id`
   - Handles legacy UUID migration
   - Returns session messages (no auth required)

## Endpoint Specification

### Create Share Code

```
GET /share/{session_id}
```

**Authentication:** Required (JWT)

**Response:**
```json
{
  "code": "encrypted_base64_string"
}
```

### Get Shared Messages

```
GET /share/messages/{code}
```

**Authentication:** Not required (public endpoint)

**Response:** Same as `/session` endpoint
```json
{
  "session_id": "uuid",
  "messages": [
    {
      "id": "uuid",
      "content": "message text",
      "created_at": "timestamp",
      "is_user": boolean
    }
  ]
}
```

## Implementation Details

### Encryption Strategy

**Option A: Bun's Built-in Crypto**
```typescript
import { crypto } from 'bun';

// Generate key (do this once, store in .env)
const key = crypto.subtle.generateKeySync('AES-GCM', { length: 256 });

// Encrypt
async function encrypt(text: string, secretKey: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    Buffer.from(secretKey, 'base64'),
    { name: 'AES-GCM' },
    false,
    ['encrypt']
  );

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(text)
  );

  // Combine IV and encrypted data
  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(encrypted), iv.length);

  return Buffer.from(combined).toString('base64');
}

// Decrypt
async function decrypt(encryptedText: string, secretKey: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    Buffer.from(secretKey, 'base64'),
    { name: 'AES-GCM' },
    false,
    ['decrypt']
  );

  const combined = Buffer.from(encryptedText, 'base64');
  const iv = combined.slice(0, 12);
  const encrypted = combined.slice(12);

  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    encrypted
  );

  return new TextDecoder().decode(decrypted);
}
```

**Option B: Node Crypto Module**
```typescript
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

function encrypt(text: string, secretKey: Buffer): string {
  const iv = randomBytes(16);
  const cipher = createCipheriv('aes-256-cbc', secretKey, iv);

  let encrypted = cipher.update(text, 'utf8', 'base64');
  encrypted += cipher.final('base64');

  // Combine IV and encrypted data
  const combined = Buffer.concat([iv, Buffer.from(encrypted, 'base64')]);
  return combined.toString('base64');
}

function decrypt(encryptedText: string, secretKey: Buffer): string {
  const combined = Buffer.from(encryptedText, 'base64');
  const iv = combined.slice(0, 16);
  const encrypted = combined.slice(16);

  const decipher = createDecipheriv('aes-256-cbc', secretKey, iv);
  let decrypted = decipher.update(encrypted);
  decrypted = Buffer.concat([decrypted, decipher.final()]);

  return decrypted.toString('utf8');
}
```

**Recommendation:** Option B (Node crypto) is simpler and matches Python Fernet's approach.

### Key Management

**Environment Variable:**
```bash
# .env
SHARE_SECRET_KEY=base64_encoded_32_byte_key
```

**Key Generation Script:**
```typescript
// scripts/generate-share-key.ts
import { randomBytes } from 'crypto';

const key = randomBytes(32); // 256 bits
console.log('Add this to your .env file:');
console.log(`SHARE_SECRET_KEY=${key.toString('base64')}`);
```

### Legacy ID Migration

The legacy Python code handles migration from old UUID-based IDs to new nanoid IDs. Since we're starting fresh with Supabase, we can simplify this:

```typescript
// No need for legacy ID handling in new implementation
// Unless you're migrating data from the old system
```

## Code Implementation

### Create Utility Module

**File:** `src/api/src/crypto.ts`

```typescript
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const SECRET_KEY = Buffer.from(process.env.SHARE_SECRET_KEY || '', 'base64');

if (SECRET_KEY.length !== 32) {
  throw new Error('SHARE_SECRET_KEY must be a base64-encoded 32-byte key');
}

export function encryptShareCode(sessionId: string, userId: string): string {
  const text = `${sessionId}:${userId}`;
  const iv = randomBytes(16);
  const cipher = createCipheriv('aes-256-cbc', SECRET_KEY, iv);

  let encrypted = cipher.update(text, 'utf8', 'base64');
  encrypted += cipher.final('base64');

  const combined = Buffer.concat([iv, Buffer.from(encrypted, 'base64')]);
  return combined.toString('base64');
}

export function decryptShareCode(code: string): { sessionId: string; userId: string } {
  try {
    const combined = Buffer.from(code, 'base64');
    const iv = combined.slice(0, 16);
    const encrypted = combined.slice(16);

    const decipher = createDecipheriv('aes-256-cbc', SECRET_KEY, iv);
    let decrypted = decipher.update(encrypted);
    decrypted = Buffer.concat([decrypted, decipher.final()]);

    const text = decrypted.toString('utf8');
    const [sessionId, userId] = text.split(':');

    return { sessionId, userId };
  } catch (error) {
    throw new Error('Invalid share code');
  }
}
```

### Implement Endpoints

**File:** `src/api/src/index.ts`

```typescript
import { encryptShareCode, decryptShareCode } from './crypto';

// ... existing code ...

.get("/share/:session_id", async ({ params, get_current_user, set }) => {
  const user_id = await get_current_user();
  if (!user_id) {
    set.status = 401;
    return { error: "Unauthorized" };
  }

  const { session_id } = params;

  // Verify user owns this session
  const { data: session, error } = await supabase
    .from('sessions')
    .select('id')
    .eq('id', session_id)
    .eq('user_id', user_id)
    .single();

  if (error || !session) {
    set.status = 404;
    return { error: "Session not found" };
  }

  const code = encryptShareCode(session_id, user_id);
  return { code };
})

.get("/share/messages/:code", async ({ params, set }) => {
  try {
    const { code } = params;
    const { sessionId, userId } = decryptShareCode(code);

    // Fetch messages (no auth required for shared links)
    const { data: messages, error } = await supabase
      .from('messages')
      .select('*')
      .eq('session_id', sessionId)
      .eq('user_id', userId)
      .order('created_at', { ascending: true });

    if (error) {
      set.status = 500;
      return { error: error.message };
    }

    return {
      session_id: sessionId,
      messages: messages.map((msg: any) => ({
        id: msg.id,
        content: msg.content,
        created_at: msg.created_at,
        is_user: msg.is_user,
      }))
    };
  } catch (error) {
    set.status = 400;
    return { error: "Invalid share code" };
  }
})
```

## Security Considerations

1. **Key Storage:** Secret key should be in `.env` and never committed to git
2. **Key Rotation:** Consider implementing key rotation strategy
3. **Rate Limiting:** Add rate limiting to prevent brute force attacks on share codes
4. **Expiration:** Consider adding expiration timestamps to share codes
5. **Access Control:** Shared messages are public - ensure users understand this

## Environment Setup

Add to `.env.template`:
```bash
# Share code encryption key (generate with: bun run scripts/generate-share-key.ts)
SHARE_SECRET_KEY=
```

## Acceptance Criteria

- [ ] Crypto utility module created (`src/api/src/crypto.ts`)
- [ ] Key generation script created
- [ ] `SHARE_SECRET_KEY` added to environment variables
- [ ] `/share/{session_id}` endpoint implemented
- [ ] `/share/messages/{code}` endpoint implemented
- [ ] Encryption/decryption working correctly
- [ ] Session ownership verified before creating share code
- [ ] Proper error handling for invalid codes
- [ ] No authentication required for viewing shared messages
- [ ] Updated `.env.template` with new variable

## Testing Steps

1. Generate share key: `bun run scripts/generate-share-key.ts`
2. Add key to `.env`
3. Create a session with some messages
4. Call `/share/{session_id}` to get encrypted code
5. Call `/share/messages/{code}` to retrieve messages
6. Verify messages returned correctly
7. Test with invalid code (should return error)
8. Test with code from different user (should still work - it's public)

## References

- Legacy implementation: `legacy-python/api/app.py:441-540`
- Python Fernet: https://cryptography.io/en/latest/fernet/
- Node.js crypto: https://nodejs.org/api/crypto.html
- Bun crypto: https://bun.sh/docs/api/crypto
