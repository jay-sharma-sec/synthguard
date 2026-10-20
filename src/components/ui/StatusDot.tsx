
type StatusDotProps = {
  label?: string;
  color?: "green" | "cyan" | "red" | "amber";
};

export default function StatusDot({
  label = "ONLINE",
  color = "green",
}: StatusDotProps) {
  const colors = {
    green: "#00ffa3",
    cyan: "#00f0ff",
    red: "#ff3b6b",
    amber: "#ffd166",
  };

  return (
    <span className="status-indicator">
      <span
        className="pulse-dot"
        style={{
          width: 7,
          height: 7,
          display: "inline-block",
          borderRadius: "50%",
          background: colors[color],
          color: colors[color],
          flexShrink: 0,
        }}
      />
      {label}
    </span>
  );
}
