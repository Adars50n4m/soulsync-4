const { withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

function withRnFirebaseMessagingCompat(config) {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const headerPath = path.join(
        config.modRequest.platformProjectRoot,
        config.modRequest.projectName,
        'AppDelegate.h'
      );

      if (!fs.existsSync(headerPath)) {
        return config;
      }

      const contents = fs.readFileSync(headerPath, 'utf8');
      if (contents.includes('UIWindow *window')) {
        return config;
      }

      const patched = contents.replace(
        '@interface AppDelegate : EXAppDelegateWrapper',
        '@interface AppDelegate : EXAppDelegateWrapper\n\n@property (nonatomic, strong, nullable) UIWindow *window;'
      );

      fs.writeFileSync(headerPath, patched);
      return config;
    },
  ]);
}

module.exports = withRnFirebaseMessagingCompat;
