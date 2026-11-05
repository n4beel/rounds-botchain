"use client";

import { ButtonHTMLAttributes, CSSProperties, forwardRef } from "react";

type Variant = "primary" | "secondary" | "danger" | "outline" | "ghost";
type Size = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

const variantStyles: Record<Variant, CSSProperties> = {
  primary: { backgroundColor: "var(--accent)", color: "var(--accent-ink)", border: "1px solid var(--accent)" },
  secondary: { backgroundColor: "var(--bg-elevated)", color: "var(--text-primary)", border: "1px solid var(--border-default)" },
  outline: { backgroundColor: "transparent", color: "var(--text-primary)", border: "1px solid var(--border-strong)" },
  ghost: { backgroundColor: "transparent", color: "var(--text-secondary)", border: "1px solid var(--border-default)" },
  danger: { backgroundColor: "transparent", color: "var(--danger)", border: "1px solid var(--danger)" },
};

const sizeClasses: Record<Size, string> = {
  sm: "px-3 py-1.5 text-xs font-semibold rounded-sm",
  md: "px-4.5 py-2.5 text-sm font-semibold rounded",
  lg: "px-6 py-3.5 text-base font-bold rounded-md",
};

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "primary", size = "md", loading, disabled, children, className = "", style, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={[
          "inline-flex items-center justify-center gap-2 cursor-pointer font-sans transition-all duration-150 active:scale-[0.99]",
          "disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100",
          sizeClasses[size],
          className,
        ].join(" ")}
        style={{ ...variantStyles[variant], ...style }}
        {...props}
      >
        {loading ? (
          <>
            <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
            <span>{children}</span>
          </>
        ) : (
          children
        )}
      </button>
    );
  }
);

Button.displayName = "Button";
export default Button;
