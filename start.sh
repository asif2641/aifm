#!/usr/bin/env bash
# =========================================================================
# Smart Bill Auditor — Cross-Platform Startup Script (Linux & macOS)
# =========================================================================

echo "======================================================="
echo "   Smart Bill Auditor & Expense Suite (v1.1.0)"
echo "======================================================="

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$DIR"

if command -v node >/dev/null 2>&1; then
  echo "Node.js detected. Launching local HTTP server for full PWA & Service Worker support..."
  node server.js
elif command -v python3 >/dev/null 2>&1; then
  echo "Python3 detected. Launching static HTTP server on port 3000..."
  python3 -m http.server 3000
elif command -v open >/dev/null 2>&1; then
  echo "Opening index.html in default browser..."
  open index.html
elif command -v xdg-open >/dev/null 2>&1; then
  echo "Opening index.html in default browser..."
  xdg-open index.html
else
  echo "Please open index.html in Google Chrome or any modern browser."
fi
