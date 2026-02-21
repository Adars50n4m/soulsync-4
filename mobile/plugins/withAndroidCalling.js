/**
 * Expo Config Plugin: withAndroidCalling
 * 
 * Configures the Android native project for ConnectionService + FCM support.
 * 
 * What this plugin does:
 * 1. Adds required permissions to AndroidManifest.xml
 * 2. Adds the ConnectionService declaration
 * 3. Configures the foreground service for incoming calls
 * 4. Adds the full-screen intent permission for lock screen calls
 * 5. Configures Firebase messaging service
 * 
 * Usage in app.json:
 *   "plugins": [
 *     "./plugins/withAndroidCalling"
 *   ]
 */

const { withAndroidManifest, withMainActivity, withProjectBuildGradle, withAppBuildGradle } = require('expo/config-plugins');

function withAndroidCallingPlugin(config) {
  // Step 1: Add permissions and services to AndroidManifest.xml
  config = withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;
    
    // ── Add Required Permissions ──
    const permissions = manifest['uses-permission'] || [];
    
    const requiredPermissions = [
      // Phone account / telecom permissions
      'android.permission.MANAGE_OWN_CALLS',
      'android.permission.READ_PHONE_STATE',
      'android.permission.CALL_PHONE',
      'android.permission.READ_CALL_LOG',
      // Full-screen intent (for showing call UI on lock screen)
      'android.permission.USE_FULL_SCREEN_INTENT',
      // Foreground service
      'android.permission.FOREGROUND_SERVICE',
      'android.permission.FOREGROUND_SERVICE_PHONE_CALL',
      // Vibrate for incoming calls
      'android.permission.VIBRATE',
      // Wake lock to keep screen on during calls
      'android.permission.WAKE_LOCK',
      // System alert window (for overlay on some devices)
      'android.permission.SYSTEM_ALERT_WINDOW',
      // Disable battery optimization (for reliable push delivery)
      'android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS',
    ];
    
    for (const perm of requiredPermissions) {
      const exists = permissions.some(p => p.$?.['android:name'] === perm);
      if (!exists) {
        permissions.push({
          $: { 'android:name': perm },
        });
      }
    }
    
    manifest['uses-permission'] = permissions;
    
    // ── Add Services to Application ──
    const application = manifest.application?.[0];
    if (application) {
      const services = application.service || [];
      
      // Add ConnectionService for self-managed calls
      const connectionServiceExists = services.some(
        s => s.$?.['android:name'] === 'io.wazo.callkeep.VoiceConnectionService'
      );
      
      if (!connectionServiceExists) {
        services.push({
          $: {
            'android:name': 'io.wazo.callkeep.VoiceConnectionService',
            'android:permission': 'android.permission.BIND_TELECOM_CONNECTION_SERVICE',
            'android:foregroundServiceType': 'phoneCall',
            'android:exported': 'true',
          },
          'intent-filter': [{
            action: [{
              $: { 'android:name': 'android.telecom.ConnectionService' },
            }],
          }],
        });
      }
      
      // Add RNCallKeep incoming call activity (full-screen intent target)
      const activities = application.activity || [];
      const incomingCallActivityExists = activities.some(
        a => a.$?.['android:name'] === 'io.wazo.callkeep.RNCallKeepBackgroundMessagingService'
      );
      
      if (!incomingCallActivityExists) {
        // Add the background messaging service for handling calls when app is killed
        services.push({
          $: {
            'android:name': 'io.wazo.callkeep.RNCallKeepBackgroundMessagingService',
            'android:exported': 'false',
          },
        });
      }
      
      application.service = services;
      application.activity = activities;
    }
    
    return config;
  });

  // Step 2: Add Firebase dependencies to project-level build.gradle
  config = withProjectBuildGradle(config, (config) => {
    const contents = config.modResults.contents;
    
    // Add Google services classpath if not present
    if (!contents.includes('com.google.gms:google-services')) {
      config.modResults.contents = contents.replace(
        'dependencies {',
        `dependencies {
        classpath 'com.google.gms:google-services:4.4.0'`
      );
    }
    
    return config;
  });

  // Step 3: Add Firebase plugin to app-level build.gradle
  config = withAppBuildGradle(config, (config) => {
    const contents = config.modResults.contents;
    
    // Add Google services plugin if not present
    if (!contents.includes("apply plugin: 'com.google.gms.google-services'")) {
      config.modResults.contents = contents.replace(
        "apply plugin: 'com.android.application'",
        "apply plugin: 'com.android.application'\napply plugin: 'com.google.gms.google-services'"
      );
    }
    
    return config;
  });

  return config;
}

module.exports = withAndroidCallingPlugin;
