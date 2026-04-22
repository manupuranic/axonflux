"use client";

import { useRouter, usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import Link from "next/link";
import { clearToken, getUser } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { PipelineTriggerModal } from "@/components/pipeline/PipelineTriggerModal";
import { Zap } from "lucide-react";

interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
}

export function Sidebar({ isOpen = true, onClose }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<{ full_name: string | null; role: string } | null>(null);
  const [mounted, setMounted] = useState(false);
  const [isPipelineModalOpen, setIsPipelineModalOpen] = useState(false);

  useEffect(() => {
    setUser(getUser());
    setMounted(true);
  }, []);

  // Close sidebar on route change (mobile)
  useEffect(() => {
    onClose?.();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  const handleLogout = () => {
    clearToken();
    router.push("/login");
  };

  const links = [
    { href: "/dashboard", label: "Dashboard", icon: "📊" },
    { href: "/dashboard/health", label: "Product Health", icon: "❤️" },
    { href: "/dashboard/replenishment", label: "Replenishment", icon: "📦" },
    { href: "/customers", label: "Customers", icon: "👥" },
    { href: "/tools/cash-closure", label: "Cash Closure", icon: "💰" },
    { href: "/tools/pamphlet-generator", label: "Pamphlets", icon: "📄" },
    { href: "/docs", label: "System Design", icon: "🏗️" },
  ];

  return (
    <>
      {/* Mobile overlay backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 md:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={[
          // Base styles
          "fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-gray-200 bg-white transition-transform duration-200",
          // Mobile: slide in/out; Desktop: always visible
          "md:relative md:translate-x-0",
          isOpen ? "translate-x-0" : "-translate-x-full",
        ].join(" ")}
      >
        {/* Header */}
        <div className="p-6">
          <h1 className="text-2xl font-bold text-gray-900">AxonFlux</h1>
          <p className="text-sm text-gray-600">Analytics Dashboard</p>
        </div>

        <Separator />

        {/* Nav Links */}
        <nav className="space-y-2 p-4">
          {links.map((link) => {
            const isActive = pathname === link.href;
            return (
              <Link key={link.href} href={link.href}>
                <div
                  className={`flex items-center space-x-3 rounded-lg px-4 py-2 ${
                    isActive
                      ? "bg-blue-50 text-blue-700 font-semibold"
                      : "text-gray-700 hover:bg-gray-100"
                  }`}
                >
                  <span>{link.icon}</span>
                  <span>{link.label}</span>
                </div>
              </Link>
            );
          })}
        </nav>

        <Separator />

        {/* Pipeline Trigger */}
        <div className="p-4">
          <Button
            onClick={() => setIsPipelineModalOpen(true)}
            variant="outline"
            size="sm"
            className="w-full justify-start"
          >
            <Zap className="mr-2 h-4 w-4" />
            Run Pipeline
          </Button>
        </div>

        <Separator />

        {/* Footer — pinned to bottom */}
        <div className="mt-auto border-t border-gray-200 p-4">
          <div className="mb-4 text-sm">
            <p className="font-medium text-gray-900">
              {mounted ? (user?.full_name || "Staff") : "—"}
            </p>
            <p className="text-gray-600">{mounted ? (user?.role || "—") : "—"}</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleLogout}
            className="w-full"
          >
            Logout
          </Button>
        </div>
      </aside>

      {/* Pipeline Modal */}
      <PipelineTriggerModal
        isOpen={isPipelineModalOpen}
        onClose={() => setIsPipelineModalOpen(false)}
      />
    </>
  );
}
