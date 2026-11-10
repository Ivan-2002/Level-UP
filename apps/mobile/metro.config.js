// Metro is React Native's bundler. This extends Expo's default config with one rule.
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// @levelup/shared is TypeScript compiled with Node's ESM rules ("NodeNext"), which
// REQUIRE relative imports to say ".js" (e.g. `export * from "./profile.js"`) even
// though the file on disk is profile.ts. TypeScript and Node understand this; Metro
// doesn't. So: resolve the import as written first (real .js files keep working), and
// only if that fails, retry without ".js" so Metro finds the .ts file.
config.resolver.resolveRequest = (context, moduleName, platform) => {
  try {
    return context.resolveRequest(context, moduleName, platform);
  } catch (error) {
    if (moduleName.startsWith(".") && moduleName.endsWith(".js")) {
      return context.resolveRequest(context, moduleName.slice(0, -3), platform);
    }
    throw error;
  }
};

module.exports = config;
