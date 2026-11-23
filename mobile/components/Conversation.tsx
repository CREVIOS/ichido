import { Fragment, useContext, useRef, useState, type ComponentRef, type ReactNode } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { uuid } from "expo";
import { ArrowUp } from "lucide-react-native";
import { CHAT, callerLines, chatChoices, type Choice } from "@content/chat";
import { frontlineNumber } from "@content/numbers";
import type { CallerCase, Draft, Reply, Turn } from "@content/caller-session";
import { FACTS, FRONTLINE, JOURNEY, UI, VOICE_LANGS, callerPack, contentPack, errorText, urgentText, type FactKey, type Lang } from "@content/catalogue";
import { cmd } from "@/lib/supabase";
import { hasVoice } from "@/lib/voice";
import { color } from "@/theme";
import { VoiceIntake } from "./VoiceIntake";
import { ChatBubble } from "./ChatBubble";
import { Button, T, TextScale, familyFor } from "./ui";
import type { Sync } from "./CallerFaults";

type Props = {reply:Reply|null; answerChips:ReactNode; card:CallerCase; draft:Draft; turns:Turn[]; lang:Lang; generation:string; sync:Sync; refresh:()=>Promise<void>; alerts:ReactNode; children:ReactNode};
export function Conversation({card,draft,turns,lang,generation,sync,refresh,alerts,children,reply,answerChips}: Props) {
  const [text,setText] = useState("");
  const [note,setNote] = useState("");
  const [busy,setBusy] = useState("");
  const [attempt,setAttempt] = useState<{text:string;id:string;after:number} | null>(null);
  const [caption,setCaption] = useState("");
  const [question,setQuestion] = useState<FactKey | null>(null);
  const [inputHeight,setInputHeight] = useState(44);
  const k = useContext(TextScale);
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const follow = useRef(true);
  const lock = useRef(false);
  const pack = callerPack(card.fault);
  const ai = card.handler === "ai";
  const voice = hasVoice && !card.text_only && VOICE_LANGS.includes(lang);
  const started = turns.some(t => t.speaker === "caller" && t.wording === "start");
  const lines = callerLines(turns,lang,reply);
  const lastOwn = lines.findLast(l => l.from === "caller");
  const saved = attempt && turns.some(t => t.seq > attempt.after && t.speaker === "caller" && t.words === attempt.text.trim());
  const pending = attempt && !saved && !frontlineNumber(attempt.text) ? attempt : null;
  const warning = urgentText(card.fault,card.flags,lang);
  async function submit(act:string, fields:Record<string,unknown> = {}) {
    if (lock.current) return;
    lock.current = true; follow.current = true;
    setBusy(act); setNote("");
    const words = typeof fields.text === "string" ? fields.text : "";
    const send = act === "text" && attempt?.text === words ? attempt : {id:uuid.v4(),text:words,after:turns.at(-1)?.seq ?? 0};
    if (act === "text") setAttempt(send);
    try {
      const r = await cmd<{withheld?:boolean}>("frontline_turn",{act,request_id:send.id,base_rev:draft.rev,...fields});
      if (act === "text") {
        if (r.withheld) setNote(UI.numbersWithheld[lang]);
        else setText(current => current === words ? "" : current);
        setAttempt(null);
      }
      setQuestion(null);
      await refresh();
    } catch (e) { setNote(errorText((e as Error).message,lang)); }
    finally { lock.current = false; setBusy(""); }
  }
  function choose(c:Choice) {
    if (c.question || c.act === "options") { follow.current = true; setQuestion(c.question ?? null); }
    else void submit(c.act,c.fields);
  }
  return <>
    <ScrollView ref={scroll} style={{flex:1}} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.thread}
      onContentSizeChange={() => { if (follow.current) scroll.current?.scrollToEnd({animated:false}); }}
      onScroll={({nativeEvent:e}) => {follow.current=e.contentSize.height-e.layoutMeasurement.height-e.contentOffset.y<72;}} scrollEventThrottle={64}>
      <T v="label" style={styles.system}>{JOURNEY.privacy[lang]}</T>
      {alerts}
      {lines.map((l,i) => <Fragment key={l.id}>
        {l.from === "system" ? <T v="label" style={styles.system} accessibilityLiveRegion="polite">{l.text}</T> :
          <ChatBubble from={l.from} label={l.from === "operator" ? CHAT.operator[lang] : undefined} text={l.text} lang={l.lang} first={lines[i-1]?.from !== l.from} last={lines[i+1]?.from !== l.from}/>}
        {l === lastOwn && !pending && <T v="small" style={styles.delivery}>{CHAT.delivered[lang]}</T>}
      </Fragment>)}
      {card.transfer_reason === "suspected_risk" && !lines.some(l=>l.text===FRONTLINE.risk[lang]) && <T accessibilityRole="alert" style={styles.system}>{FRONTLINE.risk[lang]}</T>}
      {card.handler === "queued" && <T v="label" style={styles.system}>{!lines.some(l=>l.text===FRONTLINE.queued[lang]) && FRONTLINE.queued[lang]} {contentPack(card.fault)?.hint[lang] ?? FRONTLINE.inPerson[lang]}</T>}
      {card.handler === "human" && !lines.some(l=>l.text===FRONTLINE.connected[lang]) && <T style={styles.system}>{FRONTLINE.connected[lang]}</T>}
      {warning && <T accessibilityRole="alert" style={styles.system}>{warning}</T>}
      {pending && <><ChatBubble from="caller" text={pending.text}/>{busy === "text" ? <T style={styles.delivery} v="small">{CHAT.sending[lang]}</T>
        : <Button kind="ghost" label={CHAT.retry[lang]} onPress={() => submit("text",{text:pending.text})}/>}</>}
      {voice && caption && <ChatBubble from="caller" text={caption}/>}
      {ai && !!busy && busy !== "start" && <View style={styles.typing}><ActivityIndicator size="small"/><T v="small">{CHAT.typing[lang]}</T></View>}
      {!started && <T v="label" style={styles.system}>{FRONTLINE.disclosure[lang]} {voice && FRONTLINE.voicePrivacy[lang]}</T>}
      {started && pack.scope && <T v="label" style={styles.system}>{pack.scope[lang]}</T>}
      {draft.needs_clarification && <T v="label" style={styles.system}>{UI.unsure[lang]}</T>}
      {question && <ChatBubble from="ai" text={FACTS[question].question[lang]}/>}
      {children}
      {!!note && !lines.some(l=>l.text===note) && <T accessibilityLiveRegion="polite" style={styles.system}>{note}</T>}
    </ScrollView>
    <View style={styles.dock}>
      {sync.offline && <><T accessibilityLiveRegion="polite" style={styles.system}>{JOURNEY.offline[lang]}</T><Button label={JOURNEY.retry[lang]} onPress={sync.retry}/></>}
      <T v="small" style={{textAlign:"center"}}>{pack.neverAsk[lang]}</T>
      {!started ? <Button label={(ai ? FRONTLINE.start : FRONTLINE.write)[lang]} busy={!!busy} onPress={() => submit("start")} style={styles.chip}/> : <>
        <ScrollView horizontal style={{flexGrow:0}} keyboardShouldPersistTaps="handled" showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {answerChips}{chatChoices(card,draft,lang,question).map(c => <Button key={c.act+c.label} label={c.label} accessibilityLabel={c.name} selected={c.selected} kind={c.selected ? "primary" : "secondary"} style={styles.chip} disabled={!!busy} onPress={() => choose(c)}/>)}
        </ScrollView>
        <View style={styles.compose}>
          {voice && <VoiceIntake key={generation+lang} generation={generation} handler={card.handler} lang={lang} onCaption={setCaption}/>}
          <View style={styles.entry}><TextInput accessibilityLabel={UI.whatHappened[lang]} placeholder={CHAT.message[lang]} multiline value={text} onChangeText={setText} maxLength={500}
            onContentSizeChange={e=>setInputHeight(e.nativeEvent.contentSize.height)} style={{flex:1,height:Math.min(Math.max(44,inputHeight),96*k+16),fontSize:16*k,lineHeight:24*k,padding:8,fontFamily:familyFor(text,400),color:color.ink}}/>
            <Pressable accessibilityRole="button" accessibilityLabel={UI.send[lang]} disabled={!!busy || !text.trim()} accessibilityState={{disabled:!!busy || !text.trim()}} onPress={()=>submit("text",{text})}
              style={[styles.send,(!text.trim() || !!busy) && {backgroundColor:color.press}]}><ArrowUp size={20} color={text.trim() && !busy ? color.surface : color.muted}/></Pressable>
          </View>
        </View>
      </>}
    </View>
  </>;
}
const styles = StyleSheet.create({
  thread:{padding:16}, system:{textAlign:"center",marginVertical:8}, delivery:{alignSelf:"flex-end",paddingTop:2},
  typing:{flexDirection:"row",alignItems:"center",gap:8,margin:12}, dock:{paddingHorizontal:12,paddingVertical:8,gap:6},
  chips:{gap:6}, chip:{borderRadius:24,minHeight:44,maxWidth:300},
  compose:{flexDirection:"row",alignItems:"flex-end",gap:6}, entry:{flex:1,flexDirection:"row",alignItems:"flex-end",borderRadius:26,borderWidth:1,borderColor:color.track,padding:2},
  send:{width:44,height:44,borderRadius:22,alignItems:"center",justifyContent:"center",backgroundColor:"#246CB7"},
});
