#!/usr/bin/env bash
# Sign container image using cosign (Sigstore)
# Usage: ./scripts/sign-image.sh <image-name> <tag>
# Requires: cosign (https://github.com/sigstore/cosign)
# ADR-012: Container image signing for supply chain security

set -euo pipefail

IMAGE="${1:?Usage: $0 <image-name> <tag>}"
TAG="${2:?Usage: $0 <image-name> <tag>}"
FULL_IMAGE="${IMAGE}:${TAG}"

if ! command -v cosign &> /dev/null; then
  echo "Error: cosign not installed. Install: https://github.com/sigstore/cosign#installation"
  exit 1
fi

if [ -z "${COSIGN_PRIVATE_KEY:-}" ]; then
  echo "Error: COSIGN_PRIVATE_KEY environment variable not set"
  echo "Set it with: export COSIGN_PRIVATE_KEY=<key>"
  exit 1
fi

echo "Signing ${FULL_IMAGE}..."
cosign sign --yes --key env://COSIGN_PRIVATE_KEY "${FULL_IMAGE}"
echo "Image signed successfully"

echo ""
echo "To verify: cosign verify --key cosign.pub ${FULL_IMAGE}"
