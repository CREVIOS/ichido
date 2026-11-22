"use client";
import { useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { sb } from "@/lib/supabase";

export type Peer = { uid: string; name: string; viewing: string | null };

export function usePresence(me: { uid: string; name: string }, viewing: string | null) {
  const [peers, setPeers] = useState<Peer[]>([]);
  const [joined, setJoined] = useState(false);
  const channel = useRef<RealtimeChannel | null>(null);
  useEffect(() => {
    const ch = sb().channel("ichido:operator-presence", { config: { private: true, presence: { key: me.uid } } });
    ch.on("presence", { event: "sync" }, () => {
      const state = ch.presenceState<Peer>();
      setPeers(Object.values(state).map((list) => list[list.length - 1]).filter((p) => p && p.uid !== me.uid));
    });
    ch.subscribe((status) => setJoined(status === "SUBSCRIBED"));
    channel.current = ch;
    return () => { channel.current = null; setJoined(false); sb().removeChannel(ch); };
  }, [me.uid]);
  useEffect(() => {
    if (joined) channel.current?.track({ uid: me.uid, name: me.name, viewing }).catch(() => undefined);
  }, [joined, me.uid, me.name, viewing]);
  return peers;
}
