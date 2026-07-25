import { DocsLibrary } from "@/components/docs/DocsLibrary";

export const metadata = {
  title: "Library | AxonFlux Academy",
};

export default function AcademyLibraryPage() {
  return (
    <div className="space-y-4">
      <div>
        <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-gray-400">
          written records
        </div>
        <p className="mt-1 text-sm text-gray-500">
          Architecture references and design decision records — the repo&apos;s
          markdown, served live from docs/.
        </p>
      </div>
      <DocsLibrary />
    </div>
  );
}
