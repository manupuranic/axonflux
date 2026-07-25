import { redirect } from "next/navigation";

// Merged into the Academy — old bookmarks land on the new home.
export default function DocsRedirect() {
  redirect("/academy/deep-dive");
}
