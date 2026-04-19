// Google OAuth client IDs for native Google Sign-In.
//
// How to get these:
// 1. Go to https://console.cloud.google.com → APIs & Services → Credentials
// 2. Create three OAuth 2.0 Client IDs in the same project:
//    - Web application  → use this value for GOOGLE_WEB_CLIENT_ID
//        * Authorized redirect URI:
//          https://xuipxbyvsawhuldopvjn.supabase.co/auth/v1/callback
//    - iOS              → use this value for GOOGLE_IOS_CLIENT_ID
//        * Bundle ID: com.soul.mobile
//    - Android          → not needed at runtime; Google resolves it from
//        the package name + SHA-1 fingerprint you register on the console
//        * Package name: com.soul.mobile
//        * SHA-1: get with `eas credentials` or `./gradlew signingReport`
// 3. In Supabase Dashboard → Authentication → Providers → Google:
//    paste the Web Client ID + secret so Supabase can verify the id_token.
// 4. In app.json, replace REPLACE_WITH_REVERSED_IOS_CLIENT_ID with the
//    reversed iOS client id (e.g. com.googleusercontent.apps.123-abc).

export const GOOGLE_WEB_CLIENT_ID = 'REPLACE_WITH_WEB_CLIENT_ID.apps.googleusercontent.com';
export const GOOGLE_IOS_CLIENT_ID = 'REPLACE_WITH_IOS_CLIENT_ID.apps.googleusercontent.com';
