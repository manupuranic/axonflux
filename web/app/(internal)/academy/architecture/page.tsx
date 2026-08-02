import { redirect } from "next/navigation";

// Merged into the Atlas (Architecture tab) — old bookmarks land on the new home.
export default function ArchitectureRedirect() {
  redirect("/academy/atlas");
}
