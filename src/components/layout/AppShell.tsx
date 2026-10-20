
import { useState, type ReactNode } from "react";
import Sidebar from "./Sidebar";
import TopBar from "./TopBar";

export default function AppShell({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="application-shell app-background">
      {mobileOpen && (
        <button
          className="mobile-backdrop"
          aria-label="Close navigation"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <div className={mobileOpen ? "sidebar-wrap sidebar-wrap--open" : "sidebar-wrap"}>
        <Sidebar />
      </div>

      <div className="application-main">
        <TopBar onMenuClick={() => setMobileOpen((open) => !open)} />
        <div onClick={() => mobileOpen && setMobileOpen(false)}>
          {children}
        </div>
      </div>
    </div>
  );
}
