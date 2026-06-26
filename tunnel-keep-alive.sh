#!/bin/bash
# ═══════════════════════════════════════════════════════
#  tunnel-keep-alive.sh
#  Mantiene un túnel SSH persistente a localhost.run
#  Se reconecta automáticamente si se cae.
# ═══════════════════════════════════════════════════════

PORT="${1:-3001}"
RETRY_DELAY=3
MAX_RETRIES=999

echo "⚡ Túnel persistente para puerto $PORT"
echo "   Auto-reconexión activada (máx $MAX_RETRIES intentos)"
echo "   Ctrl+C para detener"
echo ""

attempt=0
while [ $attempt -lt $MAX_RETRIES ]; do
  attempt=$((attempt + 1))
  echo "🔄 [$attempt] Conectando túnel SSH a localhost.run..."
  
  ssh -o StrictHostKeyChecking=no \
      -o ServerAliveInterval=15 \
      -o ServerAliveCountMax=3 \
      -o ExitOnForwardFailure=yes \
      -o ConnectTimeout=10 \
      -R 80:localhost:$PORT \
      nokey@localhost.run 2>&1
  
  EXIT_CODE=$?
  echo ""
  echo "⚠️  Túnel desconectado (código: $EXIT_CODE). Reconectando en ${RETRY_DELAY}s..."
  sleep $RETRY_DELAY
done

echo "❌ Se alcanzó el máximo de reintentos ($MAX_RETRIES)"
