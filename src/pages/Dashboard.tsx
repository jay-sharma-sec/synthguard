
import { Link } from "react-router-dom";
import {
  ArrowUpRight,
  Mail,
  AudioLines,
  ScanFace,
  Network,
  Activity,
  Cpu,
  ShieldCheck,
  ScanSearch,
} from "lucide-react";
import StatusDot from "../components/ui/StatusDot";

const sensors = [
  {
    title: "Email Intelligence",
    description: "Inspect suspicious communications for phishing, BEC, and social engineering.",
    path: "/app/email",
    icon: Mail,
    tag: "SEMANTIC ANALYSIS",
    color: "#00f0ff",
  },
  {
    title: "Audio Forensics",
    description: "Analyze speech features for potential synthetic audio signatures.",
    path: "/app/audio",
    icon: AudioLines,
    tag: "ACOUSTIC ANALYSIS",
    color: "#397bff",
  },
  {
    title: "Video Forensics",
    description: "Examine facial regions for potential synthetic video manipulation.",
    path: "/app/video",
    icon: ScanFace,
    tag: "VISUAL ANALYSIS",
    color: "#00ffa3",
  },
  {
    title: "Multimodal Fusion",
    description: "Combine available evidence into a unified threat assessment.",
    path: "/app/fusion",
    icon: Network,
    tag: "CROSS-MODAL ANALYSIS",
    color: "#bd93ff",
  },
];

export default function Dashboard() {
  return (
    <main className="page-content animate-in">
      <section className="dashboard-hero panel">
        <div className="hero-decoration" />
        <div className="hero-content">
          <div className="eyebrow">Threat intelligence / Overview</div>
          <h1 className="page-heading">
            Your command center<span className="cyan-period">.</span>
          </h1>
          <p>
            Investigate suspicious signals, analyze digital evidence, and
            correlate multimodal threats from one workspace.
          </p>

          <div className="hero-status">
            <StatusDot label="INTERFACE OPERATIONAL" color="green" />
            <span className="hero-divider" />
            <span>LOCAL DEVELOPMENT MODE</span>
          </div>
        </div>

        <div className="hero-emblem">
          <ShieldCheck size={86} strokeWidth={1} />
          <span />
        </div>
      </section>

      <div className="section-heading">Sensor network</div>

      <section className="sensor-grid">
        {sensors.map(({ title, description, path, icon: Icon, tag, color }) => (
          <Link
            to={path}
            className="sensor-card panel"
            key={path}
            style={{ "--sensor-color": color } as React.CSSProperties}
          >
            <div className="sensor-card-top">
              <div className="sensor-icon">
                <Icon size={22} strokeWidth={1.7} />
              </div>
              <ArrowUpRight className="sensor-arrow" size={19} />
            </div>

            <div className="sensor-tag">{tag}</div>
            <h2>{title}</h2>
            <p>{description}</p>

            <div className="sensor-card-bottom">
              <StatusDot label="OPEN MODULE" color="cyan" />
              <span className="sensor-open">OPEN <ArrowUpRight size={14} /></span>
            </div>
          </Link>
        ))}
      </section>

      <div className="section-heading">Workspace overview</div>

      <section className="overview-grid">
        <article className="overview-card panel">
          <div className="overview-icon"><Activity size={18} /></div>
          <div className="overview-label">Available modules</div>
          <div className="overview-value">04</div>
          <div className="overview-note">Email · Audio · Video · Fusion</div>
        </article>

        <article className="overview-card panel">
          <div className="overview-icon"><Cpu size={18} /></div>
          <div className="overview-label">Runtime</div>
          <div className="overview-value overview-value--small">LOCAL</div>
          <div className="overview-note">Backend connection pending</div>
        </article>

        <article className="overview-card panel">
          <div className="overview-icon"><ScanSearch size={18} /></div>
          <div className="overview-label">Analysis history</div>
          <div className="overview-value">--</div>
          <div className="overview-note">History will be added in a later phase</div>
        </article>
      </section>

      <footer className="dashboard-footer">
        <ShieldCheck size={15} />
        SYNTHGUARD · MULTIMODAL THREAT INTELLIGENCE
      </footer>
    </main>
  );
}
