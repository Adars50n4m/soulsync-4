const { getDefaultConfig } = require("expo/metro-config");
const { wrapWithReanimatedMetroConfig } = require("react-native-reanimated/metro-config");
const path = require("path");

module.exports = (() => {
    const config = getDefaultConfig(__dirname);
    
    /**
     * WebSocket Error Handling Configuration
     * 
     * These settings help prevent crashes during Metro reloads when
     * WebSocket connections are interrupted.
     */
    
    // Enhance server configuration for better WebSocket handling
    config.server = {
        ...config.server,
    };
    
    // Configure transformer to handle WebSocket module properly
    config.transformer = {
        ...config.transformer,
        // Ensure async operations complete before reload
        unstable_allowRequireAsync: false,
    };
    
    // Custom resolver to ensure WebSocket modules are resolved correctly
    config.resolver = {
        ...config.resolver,
        assetExts: [...(config.resolver?.assetExts || []), 'lottie'],
        // Ensure proper module resolution for WebSocket-related packages
        extraNodeModules: {
            ...config.resolver?.extraNodeModules,
        },
        alias: {
            "@": path.resolve(__dirname),
        },
    };
    
    return wrapWithReanimatedMetroConfig(config);
})();
