#!/bin/bash
# Start local TURN server for dev testing
# Install: brew install coturn
# Usage:   ./scripts/start-turn.sh
# Stop:    pkill turnserver
set -e

HOST_IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo "")
if [ -z "$HOST_IP" ]; then echo "No LAN IP. Connect to WiFi."; exit 1; fi

# Generate hashed password for coturn lt-cred-mech
HASH=$(turnadmin -k -u soul -r soul.local -p soul123 2>/dev/null)
echo "TURN on $HOST_IP:3478  user: soul / soul123"

# Update .env
ENV_FILE="$(dirname "$0")/../.env"
if [ -f "$ENV_FILE" ]; then
    sed -i '' "s|^EXPO_PUBLIC_TURN_SERVER=.*|EXPO_PUBLIC_TURN_SERVER=$HOST_IP:3478|" "$ENV_FILE"
    sed -i '' "s|^EXPO_PUBLIC_TURN_USERNAME=.*|EXPO_PUBLIC_TURN_USERNAME=soul|" "$ENV_FILE"
    sed -i '' "s|^EXPO_PUBLIC_TURN_PASSWORD=.*|EXPO_PUBLIC_TURN_PASSWORD=soul123|" "$ENV_FILE"
    sed -i '' "s|^EXPO_PUBLIC_TURN_SERVER_2=.*|EXPO_PUBLIC_TURN_SERVER_2=10.0.2.2:3478|" "$ENV_FILE"
    sed -i '' "s|^EXPO_PUBLIC_TURN_USERNAME_2=.*|EXPO_PUBLIC_TURN_USERNAME_2=soul|" "$ENV_FILE"
    sed -i '' "s|^EXPO_PUBLIC_TURN_PASSWORD_2=.*|EXPO_PUBLIC_TURN_PASSWORD_2=soul123|" "$ENV_FILE"
    echo ".env updated"
fi

pkill turnserver 2>/dev/null; sleep 1
exec turnserver \
    --no-tls --no-dtls \
    --listening-ip=0.0.0.0 \
    --listening-port=3478 \
    --external-ip="$HOST_IP" \
    --relay-ip="$HOST_IP" \
    --min-port=49160 --max-port=49200 \
    --user="soul:$HASH" \
    --realm=soul.local \
    --fingerprint \
    --lt-cred-mech \
    --allow-loopback-peers \
    --no-multicast-peers \
    --cli-password=turnadmin123 \
    --log-file=stdout \
    --simple-log
