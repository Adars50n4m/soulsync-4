#!/bin/bash
# ────────────────────────────────────────────────────────────
# Local TURN Server for Dev Testing (Emulator ↔ Simulator)
#
# Starts a coturn TURN server via Docker that both the Android
# emulator and iOS simulator can reach. Required because they
# are on different virtual networks and STUN alone won't work.
#
# Usage:  ./scripts/start-local-turn.sh
# Stop:   docker stop soul-turn
# ────────────────────────────────────────────────────────────

set -e

# Detect host LAN IP (macOS)
HOST_IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo "")
if [ -z "$HOST_IP" ]; then
    echo "❌ Could not detect LAN IP. Connect to WiFi first."
    exit 1
fi

echo "🌐 Host LAN IP: $HOST_IP"
echo "   Android emulator can reach this via gateway routing"
echo "   iOS simulator is on this network directly"

# Stop existing container if running
docker rm -f soul-turn 2>/dev/null || true

# Start coturn
echo ""
echo "🚀 Starting local TURN server..."
docker run -d \
    --name soul-turn \
    --network=host \
    coturn/coturn \
    -n \
    --log-file=stdout \
    --external-ip="$HOST_IP" \
    --listening-ip=0.0.0.0 \
    --listening-port=3478 \
    --min-port=49160 \
    --max-port=49200 \
    --user=soul:soul123 \
    --realm=soul.local \
    --fingerprint \
    --lt-cred-mech \
    --no-tls \
    --no-dtls

echo ""
echo "✅ TURN server running!"
echo ""
echo "📝 Add these to your mobile/.env:"
echo ""
echo "   EXPO_PUBLIC_TURN_SERVER=$HOST_IP:3478"
echo "   EXPO_PUBLIC_TURN_USERNAME=soul"
echo "   EXPO_PUBLIC_TURN_PASSWORD=soul123"
echo ""

# Auto-update .env if it exists
ENV_FILE="$(dirname "$0")/../.env"
if [ -f "$ENV_FILE" ]; then
    # Replace empty TURN_SERVER line with the local one
    if grep -q "^EXPO_PUBLIC_TURN_SERVER=$" "$ENV_FILE"; then
        sed -i '' "s|^EXPO_PUBLIC_TURN_SERVER=$|EXPO_PUBLIC_TURN_SERVER=$HOST_IP:3478|" "$ENV_FILE"
        sed -i '' "s|^EXPO_PUBLIC_TURN_USERNAME=$|EXPO_PUBLIC_TURN_USERNAME=soul|" "$ENV_FILE"
        sed -i '' "s|^EXPO_PUBLIC_TURN_PASSWORD=$|EXPO_PUBLIC_TURN_PASSWORD=soul123|" "$ENV_FILE"
        echo "✅ .env updated automatically!"
    else
        echo "⚠️  .env already has TURN config — update manually if needed"
    fi
fi

echo ""
echo "🔄 Restart Expo to pick up .env changes:"
echo "   npx expo start --clear --dev-client"
echo ""
echo "🛑 To stop:  docker stop soul-turn"
