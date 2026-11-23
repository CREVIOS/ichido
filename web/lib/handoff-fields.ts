export function shareFlag(recipient: string, flag: string, flags: string[]) {
  switch (recipient) {
    case "medical_interpreter": case "consult_desk": return flag === "need_interpreter" || flag === "need_explain";
    case "department": return !/^(ins_|pay_|need_pay$)/.test(flag);
    case "railway": return flag === "leave_soon" || (flags.includes("share_item") && flag.startsWith("item_"));
    case "health_team": return /^(need_medicine|diet_allergy|red_|who_)/.test(flag);
    case "disaster_hq": return !/allergy|medicine|red_|pain_|ins_/.test(flag);
    case "bank": case "city_section": return true;
    default: return false;
  }
}
