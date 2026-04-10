#!/bin/bash

# Permanent Fix for Android Emulator Internet Connectivity (DNS issues)
# This script forces Google DNS and provides a Cold Boot command.

echo "🚀 Applying Deep Emulator Network Fix..."

# 1. Identify AVD
AVD_NAME="Pixel_9a"
echo "📱 Target AVD: $AVD_NAME"

# 2. Check if emulator is running
DEVICE_READY=$(adb devices | grep "emulator-5554")
if [ -n "$DEVICE_READY" ]; then
    echo "⚠️  Emulator is currently running. For a Deep Fix, you MUST close it first."
    echo "👉 Please CLOSE the emulator window now, then run this command:"
    echo "   emulator -avd $AVD_NAME -no-snapshot-load -dns-server 8.8.8.8"
else
    echo "✅ Emulator is closed. Starting Cold Boot..."
    emulator -avd $AVD_NAME -no-snapshot-load -dns-server 8.8.8.8 &
fi

# 3. Apply ADB settings (if running)
if [ -n "$DEVICE_READY" ]; then
    echo "📡 Applying Private DNS settings via ADB..."
    adb shell "settings put global private_dns_mode hostname"
    adb shell "settings put global private_dns_specifier dns.google"
    
    echo "🔄 Toggling Airplane Mode..."
    adb shell cmd connectivity airplane-mode enable
    sleep 2
    adb shell cmd connectivity airplane-mode disable
fi

echo ""
echo "✨ Fix sequence initiated!"
echo "------------------------------------------------"
echo "👉 CRITICAL IPHONE STEP:"
echo "1. Settings -> Personal Hotspot."
echo "2. Turn ON 'Maximize Compatibility'."
echo "------------------------------------------------"
