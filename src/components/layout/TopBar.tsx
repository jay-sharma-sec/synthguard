
import { Menu, ShieldCheck } from "lucide-react";
import StatusDot from "../ui/StatusDot";

type TopBarProps = {
  onMenuClick: () => void;
};

export default function TopBar({ onMenuClick }: TopBarProps) {
  return (
    <header className="topbar">
      <button
        className="mobile-menu"
        onClick={onMenuClick}
        aria-label="Toggle navigation"
      >
        <Menu size={21} />
      </button>

      <div className="topbar-context">
        <ShieldCheck size={16} />
        <span>SECURE WORKSPACE</span>
      </div>

      <div className="topbar-right">
        <StatusDot label="INTERFACE ONLINE" color="green" />
        <div className="topbar-avatar" title="Local demo analyst">A</div>
      </div>
    </header>
  );
}
