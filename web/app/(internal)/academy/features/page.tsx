import { redirect } from "next/navigation";

// Merged into the Atlas (Features tab). Individual case studies still live at
// /academy/features/[id] — only the list view moved.
export default function FeaturesRedirect() {
  redirect("/academy/atlas");
}
