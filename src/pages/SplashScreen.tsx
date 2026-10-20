
import { useEffect } from "react";
import { ShieldCheck, Activity, AudioLines, ScanFace, Network } from "lucide-react";

type SplashScreenProps = {
  onComplete: () => void;
};

export default function SplashScreen({ onComplete }: SplashScreenProps) {
  useEffect(() => {
    const timer = window.setTimeout(onComplete, 2400);
    return () => window.clearTimeout(timer);
  }, [onComplete]);

  const checks = [
    { icon: Activity, label: "Initializing threat engine" },
    { icon: AudioLines, label: "Loading audio subsystem" },
    { icon: ScanFace, label: "Preparing visual forensics" },
    { icon: Network, label: "Initializing fusion interface" },
  ];

  return (
    <main className="splash-screen app-background">
      <div className="splash-content animate-in">
        <div className="splash-logo">
          <ShieldCheck size={38} strokeWidth={1.6} />
        </div>

        <div className="eyebrow">Multimodal Threat Intelligence</div>
        <h1 className="splash-title">SYNTH<span>GUARD</span></h1>
        <p className="muted">Digital evidence. Intelligent defense.</p>

        <div className="boot-panel panel">
          <div className="boot-heading">
            <span>INITIALIZING INTERFACE</span>
            <span className="boot-percent">BOOT / 01</span>
          </div>

          {checks.map(({ icon: Icon, label }, index) => (
            <div className="boot-row" key={label}>
              <Icon size={15} />
              <span>{label}</span>
              <span
                className="boot-check"
                style={{ animationDelay: `${index * 250}ms` }}
              >
                READY
              </span>
            </div>
          ))}

          <div className="boot-progress">
            <span />
          </div>
        </div>

        <div className="splash-footnote">
          SYNTHGUARD · LOCAL DEVELOPMENT ENVIRONMENT
        </div>
      </div>
    </main>
  );
}
