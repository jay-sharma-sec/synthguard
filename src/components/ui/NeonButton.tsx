
import type { ButtonHTMLAttributes, ReactNode } from "react";

type NeonButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  variant?: "primary" | "secondary" | "danger";
};

export default function NeonButton({
  children,
  variant = "primary",
  className = "",
  ...props
}: NeonButtonProps) {
  return (
    <button
      className={`neon-button neon-button--${variant} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
