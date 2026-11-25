import { type Lang } from "@/content/catalogue";
import { FRONTLINE } from "@/content/frontline";
import { approvedInfo, committedReadback, conversationText, type ReadbackFacts } from "@/content/frontline-policy";
import { frontlineNumber } from "@/content/numbers";
import { frontlineTurn } from "@/lib/frontline";
import { boundedText } from "@/lib/request-security";
import { HttpError, admin, priv, reply, rpc } from "@/lib/server";
import { signSpeech, verifyVoiceRequest } from "@/lib/speech";

type State = {rev:number; seq:number|null; pending:boolean; wording:string; confirmed:boolean; fault:string; flags:string[];
  facts:ReadbackFacts};
function speech(s: State, lang: Lang, device: boolean) {
  if (!s.pending || !s.seq) return null;
  if (s.wording === "SHELTER_INFO") return approvedInfo(s.wording,s.fault,s.flags,s.confirmed,lang);
  if (s.wording === "withheld" || s.wording === "greeting") return conversationText(s.wording,lang);
  if (s.wording !== "readback") return null;
  return committedReadback(s.facts,lang,device);
}

// A Help Point's own caller (supabase/migrations/*_device_voice.sql) confirms with the device button.
async function onDevice(scope:{incident:string;uid:string}) {
  const {data} = await priv().from("binding").select("device").eq("incident",scope.incident).eq("uid",scope.uid).maybeSingle();
  return Boolean(data?.device);
}

// A turn that hands the case to a person ends the AI's voice lease. A voice caller would otherwise hear nothing:
// return the hand-off once, in the approved words the screen shows, signed for this AI epoch. The agent says it and leaves.
async function handoff(scope:{incident:string;generation:string;uid:string;epoch:number;lang:Lang}) {
  const {data:d} = await admin.from("desk").select("handler").eq("id",scope.incident).single().throwOnError();
  if (d.handler === "ai") return null;
  // The AI's own line in this epoch ("I need a person's help" or the urgent notice) when it decided, then "I've asked a
  // person to join" from the queue's epoch. A caller who asked for a person gets only the second, as on screen.
  const {data:turns} = await admin.from("frontline_turn").select("seq,wording,epoch").eq("incident",scope.incident)
    .eq("generation",scope.generation).eq("speaker","ai").in("epoch",[scope.epoch,scope.epoch+1])
    .in("wording",["fallback","risk","queued"]).order("seq").throwOnError();
  const said = (turns ?? []).filter((t) => t.wording === "queued" ? t.epoch === scope.epoch + 1 : t.epoch === scope.epoch).slice(-2);
  if (!said.some((t) => t.wording === "queued")) return null;
  const words = said.map((t) => FRONTLINE[t.wording as "fallback"|"risk"|"queued"][scope.lang]).join(" ");
  const seq = said[said.length - 1].seq;
  return {seq,final:true,say:signSpeech(scope.generation,scope.uid,words,{seq,epoch:scope.epoch,lang:scope.lang})};
}

export async function POST(req:Request) {
  const raw = await boundedText(req,8192);
  if (raw instanceof Response) return raw;
  if (!verifyVoiceRequest(raw,req.headers.get("x-issued"),req.headers.get("x-job-signature"))) return reply(403,{error:"forbidden"});
  try {
    const {scope,action,seq,request_id,text} = JSON.parse(raw);
    if (!scope || !["state","turn","play","partial","full","failure","end"].includes(action)) return reply(400,{error:"bad_request"});
    const args = {p_scope:scope,p_seq:seq ?? null};
    if (action === "turn") {
      const state = await rpc<State>("voice_step",{...args,p_action:"state"});
      await frontlineTurn({kind:"caller",uid:scope.uid,lang:scope.lang,incident:scope.incident,voiceRoom:scope.generation,expires:null},
        {act:"text",request_id,text,base_rev:state.rev},scope,req.signal);
      const said = await handoff(scope);
      if (said) {
        await rpc("voice_farewell",{p_generation:scope.generation,p_epoch:scope.epoch});
        return reply(200,said);
      }
    }
    if (action !== "state" && action !== "turn") {
      await rpc("voice_step",{...args,p_action:action});
      return reply(200,{});
    }
    let state: State;
    try {
      state = await rpc<State>("voice_step",{...args,p_action:"state"});
    } catch (error) {
      // The lease ended because the case went to a person without a spoken turn (a Help Point button confirm, a
      // screen tap): the agent's poll gets the hand-off words once (voice_farewell), then the 403 as before.
      if (action === "state" && error instanceof HttpError && error.status === 403) {
        const said = await handoff(scope);
        if (said && await rpc<boolean>("voice_farewell",{p_generation:scope.generation,p_epoch:scope.epoch})) return reply(200,said);
      }
      throw error;
    }
    const wording = speech(state,scope.lang,state.wording === "readback" && await onDevice(scope));
    const say = wording && state.seq && !frontlineNumber(wording)
      ? signSpeech(scope.generation,scope.uid,wording,{seq:state.seq,epoch:scope.epoch,lang:scope.lang}) : null;
    return reply(200,{seq:state.seq,say});
  } catch (error) {
    if (error instanceof HttpError) return reply(error.status,{error:error.message});
    if (error instanceof SyntaxError) return reply(400,{error:"bad_request"});
    return reply(503,{error:"voice_unavailable"});
  }
}
