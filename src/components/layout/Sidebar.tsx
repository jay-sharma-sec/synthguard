
import { NavLink, useNavigate } from "react-router-dom";
import {
  ShieldCheck,
  LayoutDashboard,
  Mail,
  AudioLines,
  ScanFace,
  Network,
  FileText,
  Settings,
  LogOut,
} from "lucide-react";
import StatusDot from "../ui/StatusDot";

const navigation = [
  { label: "Overview", path: "/app/dashboard", icon: LayoutDashboard },
  { label: "Email Intelligence", path: "/app/email", icon: Mail },
  { label: "Audio Forensics", path: "/app/audio", icon: AudioLines },
  { label: "Video Forensics", path: "/app/video", icon: ScanFace },
  { label: "Multimodal Fusion", path: "/app/fusion", icon: Network },
];

export default function Sidebar() {
  const navigate = useNavigate();

  function logout() {
    sessionStorage.removeItem("synthguard-demo-session");
    navigate("/login", { replace: true });
  }

  return (
    <aside className="sidebar">
      <button
        className="sidebar-brand"
        onClick={() => navigate("/app/dashboard")}
        aria-label="Go to SynthGuard dashboard"
      >
        <span className="sidebar-logo"><ShieldCheck size={25} /></span>
        <span>
          <strong>SYNTHGUARD</strong>
          <small>THREAT INTELLIGENCE</small>
        </span>
      </button>

      <div className="sidebar-label">Workspace</div>

      <nav className="sidebar-nav" aria-label="Main navigation">
        {navigation.map(({ label, path, icon: Icon }) => (
          <NavLink
            key={path}
            to={path}
            className={({ isActive }) =>
              `nav-link${isActive ? " nav-link--active" : ""}`
            }
          >
            <Icon size={18} strokeWidth={1.8} />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="sidebar-label">Management</div>

      <NavLink to="/app/report" className="nav-link">
        <FileText size={18} />
        <span>Threat Reports</span>
      </NavLink>

      <NavLink to="/app/settings" className="nav-link">
        <Settings size={18} />
        <span>Settings</span>
      </NavLink>

      <div className="sidebar-bottom">
        <div className="sidebar-system panel">
          <div className="eyebrow">Environment</div>
          <div className="sidebar-system-status">
            <StatusDot label="UI READY" color="cyan" />
          </div>
          <p>Backend connectivity will be enabled in a later phase.</p>
        </div>

        <button className="logout-button" onClick={logout}>
          <LogOut size={17} /> Sign out
        </button>
      </div>
    </aside>
  );
}
