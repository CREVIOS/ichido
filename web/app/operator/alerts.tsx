import { useEffect, useRef, useState } from "react";
import { Bell, BellOff } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DESK } from "@/content/staff";
import type { Desk } from "./types";

const STORAGE_KEY = "ichido.operator.case-alerts";

function savedPreference() {
  try {
    return localStorage.getItem(STORAGE_KEY) !== "off";
  } catch (error) {
    console.warn("Case alert preference is unavailable", error);
    return true;
  }
}

function tone(audio: AudioContext) {
  if (audio.state !== "running") return;
  const note = audio.createOscillator();
  const volume = audio.createGain();
  const start = audio.currentTime;
  note.frequency.value = 740;
  volume.gain.setValueAtTime(0.001, start);
  volume.gain.exponentialRampToValueAtTime(0.09, start + 0.015);
  volume.gain.exponentialRampToValueAtTime(0.001, start + 0.18);
  note.connect(volume).connect(audio.destination);
  note.start(start);
  note.stop(start + 0.19);
}

function notifyBrowser(message: string, id: string) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  try {
    new Notification(message, { tag: id });
  } catch (error) {
    // Some mobile browsers expose Notification but only support service worker notifications.
    if (!(error instanceof TypeError || error instanceof DOMException)) throw error;
    toast.error(DESK.alertsBrowser, { id: "browser-notification" });
  }
}

export function CaseAlerts({ open, labels }: { open: Desk[] | null; labels: Record<string, string> }) {
  const [enabled, setEnabled] = useState(savedPreference);
  const previous = useRef<Set<string> | null>(null);
  const audio = useRef<AudioContext | null>(null);

  useEffect(() => {
    if (!enabled || !window.AudioContext) return;
    function unlock() {
      audio.current ??= new AudioContext();
      if (audio.current.state === "suspended") {
        void audio.current.resume().catch(() => toast.error(DESK.alertsSound, { id: "case-tone" }));
      }
    }
    // Browsers can require a user gesture before an AudioContext will play.
    unlock();
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      void audio.current?.close();
      audio.current = null;
    };
  }, [enabled]);

  useEffect(() => {
    if (!open) return;
    const last = previous.current;
    previous.current = new Set(open.map((row) => row.id));
    if (!last || !enabled) return;
    for (const row of open) {
      if (last.has(row.id)) continue;
      const message = DESK.newCase(labels[row.station] ?? row.station);
      toast(message, { id: row.id });
      notifyBrowser(message, row.id);
      if (audio.current) tone(audio.current);
    }
  }, [open, labels, enabled]);

  function toggle() {
    setEnabled(!enabled);
    try {
      localStorage.setItem(STORAGE_KEY, enabled ? "off" : "on");
    } catch (error) {
      console.warn("Case alert preference could not be saved", error);
      toast.error(DESK.alertsStorage);
    }
    if (!enabled && window.AudioContext) {
      audio.current ??= new AudioContext();
      void audio.current.resume().catch(() => toast.error(DESK.alertsSound, { id: "case-tone" }));
    }
    if (!enabled && "Notification" in window && Notification.permission === "default") {
      void Notification.requestPermission().catch(() => toast.error(DESK.alertsBrowser));
    }
  }

  const Icon = enabled ? Bell : BellOff;
  return <Button variant="ghost" size="icon-sm" aria-label={DESK.alerts} title={DESK.alerts} aria-pressed={enabled} onClick={toggle}><Icon className="stroke-[1.5]" /></Button>;
}
