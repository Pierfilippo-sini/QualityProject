#!/bin/bash
cd "$(dirname "$0")"
echo "=========================================="
echo "  Avvio B2B Scouting Agent (Next.js)"
echo "=========================================="

# Chiude eventuali istanze precedenti di next dev rimaste attive o blocchi residui
pkill -f "next dev" 2>/dev/null || true
pkill -f "next-server" 2>/dev/null || true
lsof -ti:3000 | xargs kill -9 2>/dev/null || true
rm -f .next/dev/lock 2>/dev/null || true

echo "Apertura della pagina di login nel browser..."
(
  for i in {1..30}; do
    if curl -s -o /dev/null http://localhost:3000/login; then
      open "http://localhost:3000/login"
      exit 0
    fi
    sleep 0.5
  done
  open "http://localhost:3000/login"
) &

npm run dev
