import { CALLER_FLAGS, FRONTLINE, readBackText, type Fact, type Lang } from "@/content/catalogue";
import { approvedInfo, conversationText } from "@/content/frontline-policy";
import { frontlineNumber } from "@/content/numbers";
import { frontlineTurn } from "@/lib/frontline";
import { boundedText } from "@/lib/request-security";
import { HttpError, reply, rpc } from "@/lib/server";
import { signSpeech, verifyVoiceRequest } from "@/lib/speech";

type State = {rev:number; seq:number|null; pending:boolean; wording:string; confirmed:boolean; fault:string; flags:string[];
  facts:{card_back:Fact; cash_received:Fact; triage?:{taps:string[]}}};
function speech(s: State, lang: Lang) {
  if (!s.pending || !s.seq) return null;
  if (s.wording === "SHELTER_INFO") return approvedInfo(s.wording,s.fault,s.flags,s.confirmed,lang);
  if (s.wording === "withheld" || s.wording === "greeting") return conversationText(s.wording,lang);
  if (s.wording !== "readback") return null;
  const taps = s.facts.triage?.taps ?? [];
  return [readBackText(lang,s.facts), ...taps.map(t => CALLER_FLAGS[t]?.label[lang]), FRONTLINE.readback[lang]].filter(Boolean).join(" ");
}

export async function POST(req:Request) {
  const raw = await boundedText(req,8192);
  if (raw instanceof Response) return raw;
  if (!verifyVoiceRequest(raw,req.headers.get("x-issued"),req.headers.get("x-job-signature"))) return reply(403,{error:"forbidden"});
  try {
    const {scope,action,seq,request_id,text} = JSON.parse(raw);
    if (!scope || !["state","turn","play","partial","full","failure"].includes(action)) return reply(400,{error:"bad_request"});
    const args = {p_scope:scope,p_seq:seq ?? null};
    if (action === "turn") {
      const state = await rpc<State>("voice_step",{...args,p_action:"state"});
      await frontlineTurn({kind:"caller",uid:scope.uid,lang:scope.lang,incident:scope.incident,voiceRoom:scope.generation,expires:null},
        {act:"text",request_id,text,base_rev:state.rev},scope);
    }
    if (action !== "state" && action !== "turn") {
      await rpc("voice_step",{...args,p_action:action});
      return reply(200,{});
    }
    const state = await rpc<State>("voice_step",{...args,p_action:"state"});
    const wording = speech(state,scope.lang);
    const say = wording && state.seq && !frontlineNumber(wording)
      ? signSpeech(scope.generation,scope.uid,wording,{seq:state.seq,epoch:scope.epoch,lang:scope.lang}) : null;
    return reply(200,{seq:state.seq,say});
  } catch (error) {
    if (error instanceof HttpError) return reply(error.status,{error:error.message});
    if (error instanceof SyntaxError) return reply(400,{error:"bad_request"});
    return reply(503,{error:"voice_unavailable"});
  }
}
