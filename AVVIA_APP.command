#!/bin/bash
cd "$(dirname "$0")"
echo "=========================================="
echo "  Avvio B2B Scouting Agent (Next.js)"
echo "=========================================="
echo "Apertura della pagina di login nel browser..."
(sleep 2 && open "http://localhost:3000/login") &
npm run dev
