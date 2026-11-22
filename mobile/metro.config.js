// The app imports the web app's catalogue (../web/content/catalogue.ts) and permission matrix (../web/lib/rbac.ts) directly, so Metro must watch them.
const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);
config.watchFolders = [path.resolve(__dirname, "../web/content"), path.resolve(__dirname, "../web/lib/rbac.ts")];

module.exports = config;
