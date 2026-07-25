import { AcademyNav } from "@/components/academy/AcademyNav";

export default function AcademyLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-6xl">
      <AcademyNav />
      {children}
    </div>
  );
}
