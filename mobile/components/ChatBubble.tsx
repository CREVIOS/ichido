import { View } from "react-native";
import Svg, {Path} from "react-native-svg";
import { Mark, T } from "./ui";
import { color } from "@/theme";
import type { Lang } from "@content/catalogue";

export function ChatBubble({ from, text, lang, first = true, last = true, label }: {
  from:"caller"|"ai"|"operator"; text:string; lang?:Lang; first?:boolean; last?:boolean; label?:string;
}) {
  const own = from === "caller";
  const fill = own ? "#246CB7" : "#EEEEEF";
  return <View style={{flexDirection:"row",alignItems:"flex-start",justifyContent:own ? "flex-end" : "flex-start",gap:6,marginTop:first ? 12 : 3}}>
    {!own && <View style={{width:23,paddingTop:10}}>{from === "ai" && first && <Mark size={20}/>}</View>}
    <View style={{maxWidth:"82%",borderRadius:19,backgroundColor:fill,paddingVertical:8,paddingHorizontal:14}}>
      {last && <Svg width={9} height={12} viewBox="0 0 9 12" style={{position:"absolute",bottom:0,...(own ? {right:-4,transform:[{scaleX:-1}]} : {left:-4})}}>
        <Path d="M7 0Q7 8 0 12Q6 12 9 10Z" fill={fill}/></Svg>}
      {label && <T v="small" weight={500}>{label}</T>}
      <T accessibilityLanguage={lang} style={{color:own ? color.onPrimary : color.ink}}>{text}</T>
    </View>
  </View>;
}
