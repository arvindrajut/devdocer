#!/usr/bin/env bash
# Rebuilds the sample PDF from its HTML source with LibreOffice.
set -euo pipefail
cd "$(dirname "$0")/.."
tmp="$(mktemp -d)"
soffice --headless --infilter="HTML (StarWriter)" --convert-to pdf:writer_pdf_Export --outdir "$tmp" scripts/sample-policy.html >/dev/null
mv "$tmp/sample-policy.pdf" public/sample/northwind-remote-work-policy.pdf
rm -rf "$tmp"
echo "wrote public/sample/northwind-remote-work-policy.pdf"
