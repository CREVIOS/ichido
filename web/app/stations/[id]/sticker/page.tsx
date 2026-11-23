import { PrintableStation } from "./sticker";

export default function StickerPage() {
  const configured = process.env.BETTER_AUTH_URL;
  return <PrintableStation origin={configured ? new URL(configured).origin : null} />;
}
