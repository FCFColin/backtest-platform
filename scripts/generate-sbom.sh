#!/usr/bin/env bash
# Generate SBOM (Software Bill of Materials) for container images
# Usage: ./scripts/generate-sbom.sh <image-name> <tag>
# Requires: syft (https://github.com/anchore/syft)
# ADR-012: SBOM generation for supply chain security

set -euo pipefail

IMAGE="${1:?Usage: $0 <image-name> <tag>}"
TAG="${2:?Usage: $0 <image-name> <tag>}"
OUTPUT="${3:-sbom-${IMAGE}-${TAG}.json}"

if ! command -v syft &> /dev/null; then
  echo "Error: syft not installed. Install: https://github.com/anchore/syft#installation"
  exit 1
fi

echo "Generating SBOM for ${IMAGE}:${TAG}..."
syft "${IMAGE}:${TAG}" -o cyclonedx-json --file "${OUTPUT}"
echo "SBOM written to ${OUTPUT}"
