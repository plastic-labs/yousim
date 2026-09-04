#!/usr/bin/env bash
set -euo pipefail

# ============================================================================
# YouSim Identity Crafter for OpenClaw
# Usage:
#   Interactive:  bash craft-identity.sh [--workspace /path]
#   Automated:    bash craft-identity.sh --auto '{"name":"X","creature":"Y",...}'
#   Agent curls:  (agent uses the API directly via exec + curl)
# ============================================================================

YOUSIM_URL="${YOUSIM_URL:-http://localhost:3000}"
YOUSIM_KEY="${YOUSIM_KEY:-${YOUSIM_API_KEY:-}}"
WORKSPACE="${WORKSPACE_ROOT:-${HOME}/.openclaw/workspace}"

# Parse args
AUTO_MODE=""
while [[ $# -gt 0 ]]; do
  case $1 in
    --workspace) WORKSPACE="$2"; shift 2;;
    --auto) AUTO_MODE="$2"; shift 2;;
    --url) YOUSIM_URL="$2"; shift 2;;
    *) shift;;
  esac
done

# Ensure workspace exists
mkdir -p "$WORKSPACE"

api() {
  local endpoint="$1"; shift
  local auth_args=()
  if [[ -n "$YOUSIM_KEY" ]]; then
    auth_args=(-H "Authorization: Bearer ${YOUSIM_KEY}")
  fi
  curl -sf "${YOUSIM_URL}/v1/construct${endpoint}" \
    "${auth_args[@]}" \
    -H "Content-Type: application/json" \
    "$@"
}

# ── Auto mode: skip conversation, go straight to summary ──
if [[ -n "$AUTO_MODE" ]]; then
  echo "Auto mode: crafting identity from parameters..."

  # Extract name for the first message
  NAME=$(echo "$AUTO_MODE" | jq -r '.name // "Agent"')

  # Start session
  RESP=$(api "" -d "{\"message\": \"$NAME\"}")
  SESSION_ID=$(echo "$RESP" | jq -r '.session_id')

  # Feed remaining params as a single descriptive message
  DESCRIPTION=$(echo "$AUTO_MODE" | jq -r '
    "I want this agent to be a \(.creature // "AI assistant") with a \(.vibe // "helpful") personality. " +
    (if .emoji then "Emoji: \(.emoji). " else "" end) +
    (if .traits then "Key traits: \(.traits | join(", ")). " else "" end) +
    (if .backstory then "Backstory: \(.backstory)" else "" end)
  ')
  api "" -d "{\"message\": $(echo "$DESCRIPTION" | jq -Rs .), \"session_id\": \"$SESSION_ID\"}" > /dev/null

  # Generate summary
  SUMMARY=$(api "/summary" -d "{\"session_id\": \"$SESSION_ID\", \"name\": \"$NAME\"}")

  echo "$SUMMARY" | jq -r '.soul_md' > "${WORKSPACE}/SOUL.md"
  echo "$SUMMARY" | jq -r '.identity_md' > "${WORKSPACE}/IDENTITY.md"

  echo "Wrote ${WORKSPACE}/SOUL.md"
  echo "Wrote ${WORKSPACE}/IDENTITY.md"
  exit 0
fi

# ── Interactive mode ──
echo "YouSim Identity Crafter"
echo "Target workspace: ${WORKSPACE}"
echo ""

read -rp "What should your agent be called? > " NAME
[[ -z "$NAME" ]] && NAME="Claw"

# Start session
RESP=$(api "" -d "{\"message\": \"$NAME\"}")
SESSION_ID=$(echo "$RESP" | jq -r '.session_id')
RESPONSE=$(echo "$RESP" | jq -r '.response')
DONE=$(echo "$RESP" | jq -r '.done')

echo ""
echo "$RESPONSE"

# Conversation loop
while [[ "$DONE" != "true" ]]; do
  echo ""
  read -rp "> " USER_INPUT
  [[ -z "$USER_INPUT" ]] && continue

  # Allow early exit
  if [[ "$USER_INPUT" =~ ^(done|finish|that\'s\ it)$ ]]; then
    break
  fi

  RESP=$(api "" -d "{\"message\": $(echo "$USER_INPUT" | jq -Rs .), \"session_id\": \"$SESSION_ID\"}")
  RESPONSE=$(echo "$RESP" | jq -r '.response')
  DONE=$(echo "$RESP" | jq -r '.done')

  echo ""
  echo "$RESPONSE"
done

# Generate summary
echo ""
echo "Generating identity..."
SUMMARY=$(api "/summary" -d "{\"session_id\": \"$SESSION_ID\", \"name\": \"$NAME\"}")

echo "$SUMMARY" | jq -r '.soul_md' > "${WORKSPACE}/SOUL.md"
echo "$SUMMARY" | jq -r '.identity_md' > "${WORKSPACE}/IDENTITY.md"

echo "Wrote ${WORKSPACE}/SOUL.md"
echo "Wrote ${WORKSPACE}/IDENTITY.md"
echo ""
echo "Version control your identity:"
echo "   cd ${WORKSPACE} && git add SOUL.md IDENTITY.md && git commit -m 'Identity: ${NAME} (via YouSim)'"
