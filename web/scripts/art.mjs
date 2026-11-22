// Builds the ink-on-white artwork from Hasegawa Tōhaku's "Pine Trees" (松林図屏風, c. 1595, public domain,
// Tokyo National Museum; images via Wikimedia Commons). Usage: node scripts/art.mjs <dir with right.jpg and left.jpg>
import sharp from "sharp";
const [D] = process.argv.slice(2);
const OUT = new URL("../public/art/", import.meta.url).pathname;
const MOB = new URL("../../mobile/assets/images/", import.meta.url).pathname;

// Remove the brocade frame, desaturate, and lift the aged paper to white so only the ink remains.
async function ink(file) {
  const { width, height } = await sharp(`${D}/${file}`).metadata();
  const left = Math.round(width * 0.026), top = Math.round(height * 0.052);
  return sharp(`${D}/${file}`).extract({ left, top, width: width - 2 * left, height: height - 2 * top })
    .grayscale().linear(1.44, -38).toBuffer({ resolveWithObject: true });
}
const right = await ink("right.jpg");
const left = await ink("left.jpg");
const [W, H] = [right.info.width, right.info.height];
await sharp(right.data).resize(2400).webp({ quality: 80 }).toFile(`${OUT}pines-wide.webp`);
// Tall crop of the left screen's dark central pines, for the sign-in panel.
const [LW, LH] = [left.info.width, left.info.height];
await sharp(left.data).extract({ left: Math.round(LW * 0.2), top: 0, width: Math.round(LW * 0.36), height: LH }).resize({ height: 1800 }).webp({ quality: 80 }).toFile(`${OUT}pines-tall.webp`);
// Portrait crop of the right screen's main pine, for the phone splash.
const crop = await sharp(right.data).extract({ left: Math.round(W * 0.27), top: 0, width: Math.round(W * 0.25), height: H }).toBuffer();
await sharp(crop).resize({ height: 2400 }).png({ compressionLevel: 9 }).toFile(`${MOB}splash-art.png`);
console.log("art written");
