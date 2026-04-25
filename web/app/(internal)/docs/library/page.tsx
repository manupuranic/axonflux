import { DocsLibrary } from "@/components/docs/DocsLibrary";

export const metadata = {
  title: "Docs Library | AxonFlux",
};

export default function DocsLibraryPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Docs Library</h1>
        <p className="text-sm text-gray-500 mt-1">
          Architecture references and design decision records.
        </p>
      </div>
      <DocsLibrary />
    </div>
  );
}
