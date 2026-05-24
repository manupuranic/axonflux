import { CheckCircle2, XCircle } from "lucide-react";
import { ToolCallInfo } from "@/lib/pamphlet/types";

interface Props {
  toolCall: ToolCallInfo;
}

const TOOL_LABELS: Record<string, string> = {
  set_theme: "Set theme", update_theme_tokens: "Update tokens", generate_theme: "Generate theme",
  insert_node: "Insert node", update_node: "Update node", remove_node: "Remove node",
  move_node: "Move node", duplicate_node: "Duplicate node", swap_product: "Swap product",
  sort_products: "Sort products", adjust_font_scale: "Adjust font", set_node_style: "Style node",
  suggest_titles: "Suggest titles", set_pamphlet_title: "Set title",
  list_available_items: "List items", ask_clarification: "Ask clarification",
};

export function ToolCallPill({ toolCall }: Props) {
  const label = TOOL_LABELS[toolCall.tool_name] ?? toolCall.tool_name;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${toolCall.is_error ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"}`}>
      {toolCall.is_error ? <XCircle className="w-3 h-3" /> : <CheckCircle2 className="w-3 h-3" />}
      {label}
    </span>
  );
}
