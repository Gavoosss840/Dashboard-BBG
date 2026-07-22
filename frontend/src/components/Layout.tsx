import type { ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { TickerTape } from "./TickerTape";
import { CommandBar } from "./CommandBar";

export function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[var(--surface-0)] text-[var(--text-primary)]">
      <div data-print="hide">
        <Sidebar />
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <div data-print="hide">
          <TopBar />
          <TickerTape />
        </div>
        <main className="flex-1 overflow-y-auto p-5">{children}</main>
      </div>
      <CommandBar />
    </div>
  );
}
