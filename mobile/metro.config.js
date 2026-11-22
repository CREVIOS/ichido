// The app imports the web app's catalogue directly (../web/content/catalogue.ts), so Metro must watch it.
const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);
config.watchFolders = [path.resolve(__dirname, "../web/content")];

module.exports = config;
