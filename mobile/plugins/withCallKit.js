/**
 * Expo Config Plugin: withCallKit
 * 
 * Configures the iOS native project for CallKit + VoIP Push support.
 * 
 * What this plugin does:
 * 1. Adds the "Voice over IP" background mode to Info.plist
 * 2. Adds the PushKit framework
 * 3. Adds the CallKit framework
 * 4. Configures the VoIP push entitlement
 * 5. Adds the AppDelegate code for PushKit registration
 * 
 * Usage in app.json:
 *   "plugins": [
 *     "./plugins/withCallKit"
 *   ]
 */

const { withInfoPlist, withEntitlementsPlist, withXcodeProject, withAppDelegate } = require('expo/config-plugins');

/**
 * Add VoIP background mode and required frameworks
 */
function withCallKitPlugin(config) {
  // Step 1: Add VoIP background mode to Info.plist
  config = withInfoPlist(config, (config) => {
    const bgModes = config.modResults.UIBackgroundModes || [];
    
    if (!bgModes.includes('voip')) {
      bgModes.push('voip');
    }
    if (!bgModes.includes('audio')) {
      bgModes.push('audio');
    }
    if (!bgModes.includes('remote-notification')) {
      bgModes.push('remote-notification');
    }
    
    config.modResults.UIBackgroundModes = bgModes;
    
    return config;
  });

  // Step 2: Add VoIP push entitlement
  config = withEntitlementsPlist(config, (config) => {
    config.modResults['aps-environment'] = 'development'; // Change to 'production' for release
    return config;
  });

  // Step 3: Add PushKit delegate code to AppDelegate
  config = withAppDelegate(config, (config) => {
    const appDelegate = config.modResults.contents;
    
    // Check if PushKit import already exists
    if (!appDelegate.includes('#import <PushKit/PushKit.h>')) {
      // Add PushKit import after UIKit import
      config.modResults.contents = appDelegate.replace(
        '#import <UIKit/UIKit.h>',
        '#import <UIKit/UIKit.h>\n#import <PushKit/PushKit.h>\n#import "RNVoipPushNotificationManager.h"\n#import "RNCallKeep.h"'
      );
    }
    
    // Add PushKit delegate methods if not already present
    if (!appDelegate.includes('pushRegistry:didUpdatePushCredentials')) {
      const delegateMethodsCode = `

// ─── PushKit VoIP Push Delegate Methods ─────────────────────────────────────

// Called when the device registers for VoIP pushes
- (void)pushRegistry:(PKPushRegistry *)registry didUpdatePushCredentials:(PKPushCredentials *)credentials forType:(PKPushType)type {
  [RNVoipPushNotificationManager didUpdatePushCredentials:credentials forType:(NSString *)type];
}

// Called when a VoIP push is received
// ⚠️ CRITICAL: Must report a new incoming call to CallKit here
// Apple will terminate the app if you receive a VoIP push without showing CallKit UI
- (void)pushRegistry:(PKPushRegistry *)registry didReceiveIncomingPushWithPayload:(PKPushPayload *)payload forType:(PKPushType)type withCompletionHandler:(void (^)(void))completion {
  
  // Extract call data from the push payload
  NSString *uuid = payload.dictionaryPayload[@"callId"] ?: payload.dictionaryPayload[@"uuid"] ?: [[NSUUID UUID] UUIDString];
  NSString *callerName = payload.dictionaryPayload[@"callerName"] ?: @"Unknown Caller";
  NSString *handle = payload.dictionaryPayload[@"callerId"] ?: @"unknown";
  BOOL hasVideo = [payload.dictionaryPayload[@"callType"] isEqualToString:@"video"];
  
  // Report the incoming call to CallKit IMMEDIATELY
  // This MUST happen before the completion handler is called
  [RNCallKeep reportNewIncomingCall:uuid
                             handle:handle
                         handleType:@"generic"
                           hasVideo:hasVideo
                localizedCallerName:callerName
                    supportsHolding:YES
                       supportsDTMF:YES
                   supportsGrouping:YES
                 supportsUngrouping:YES
                        fromPushKit:YES
                            payload:payload.dictionaryPayload
              withCompletionHandler:completion];
  
  // Also notify the JS side via RNVoipPushNotification
  [RNVoipPushNotificationManager didReceiveIncomingPushWithPayload:payload forType:(NSString *)type];
}

// Called when the device invalidates push credentials
- (void)pushRegistry:(PKPushRegistry *)registry didInvalidatePushTokenForType:(PKPushType)type {
  // Handle token invalidation if needed
}
`;
      
      // Insert before @end
      config.modResults.contents = config.modResults.contents.replace(
        '@end',
        delegateMethodsCode + '\n@end'
      );
    }
    
    // Add PushKit registration in didFinishLaunchingWithOptions
    if (!appDelegate.includes('PKPushRegistry')) {
      config.modResults.contents = config.modResults.contents.replace(
        'return [super application:application didFinishLaunchingWithOptions:launchOptions];',
        `// Register for VoIP pushes
  [RNVoipPushNotificationManager voipRegistration];
  
  // Setup CallKeep
  [RNCallKeep setup:@{
    @"appName": @"SoulSync",
    @"maximumCallGroups": @1,
    @"maximumCallsPerCallGroup": @1,
    @"supportsVideo": @YES,
  }];
  
  return [super application:application didFinishLaunchingWithOptions:launchOptions];`
      );
    }
    
    // Add PKPushRegistryDelegate to the class declaration
    if (!appDelegate.includes('PKPushRegistryDelegate')) {
      config.modResults.contents = config.modResults.contents.replace(
        '@interface AppDelegate',
        '@interface AppDelegate <PKPushRegistryDelegate>'
      );
    }
    
    return config;
  });

  return config;
}

module.exports = withCallKitPlugin;
