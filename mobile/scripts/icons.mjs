// Renders the app icon, Android adaptive icon layers, favicon and splash image from the Ichido mark
// (components/mark.ts, the same paths as web/components/mark.tsx and web/app/icon.svg).
//
//   NODE_PATH=../web/node_modules node scripts/icons.mjs
//
// Uses sharp, which the web app already installs; the mobile app does not depend on it.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const sharp = require("sharp");

const src = readFileSync(new URL("../components/mark.ts", import.meta.url), "utf8");
const path = (name) => src.match(new RegExp(`${name} = "([^"]+)"`))[1];
const BUBBLE = path("BUBBLE");
const ICHI = path("ICHI");
const INK = "#0A0A0A";
const out = (f) => new URL(`../assets/images/${f}`, import.meta.url).pathname;

// The 20×17 mark, scaled to `w` px wide and centred in a `size` square, on an optional background.
function svg({ size, w, fg, bg, stroke = 1.8, h = size }) {
  const s = w / 20;
  const x = (size - w) / 2;
  const y = (h - 17 * s) / 2;
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${h}" viewBox="0 0 ${size} ${h}">
${bg ? `<rect width="${size}" height="${h}" fill="${bg}"/>` : ""}
<g transform="translate(${x} ${y}) scale(${s})">
<path d="${BUBBLE}" fill="none" stroke="${fg}" stroke-width="${stroke}" stroke-linejoin="round"/>
<path d="${ICHI}" fill="${fg}"/>
</g></svg>`);
}

const jobs = [
  // iOS masks the corners itself; same proportions as web/app/icon.svg (mark 20/32 of the tile).
  ["icon.png", svg({ size: 1024, w: 640, fg: "#FFFFFF", bg: INK })],
  ["favicon.png", svg({ size: 48, w: 30, fg: "#FFFFFF", bg: INK })],
  // Adaptive icon: the foreground keeps the mark inside the 66% safe zone.
  ["android-icon-foreground.png", svg({ size: 512, w: 230, fg: "#FFFFFF" })],
  ["android-icon-background.png", svg({ size: 512, w: 0, fg: INK, bg: INK })],
  ["android-icon-monochrome.png", svg({ size: 432, w: 194, fg: "#FFFFFF" })],
  // Splash: the ink mark on the canvas colour set in app.config.ts (drawn at imageWidth).
  ["splash-icon.png", svg({ size: 400, h: 340, w: 380, fg: INK, stroke: 1.5 })],
];

for (const [file, buf] of jobs) {
  await sharp(buf).png().toFile(out(file));
  console.log("wrote", file);
}
