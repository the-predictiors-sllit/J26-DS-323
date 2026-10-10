import type { ButtonHTMLAttributes } from "react";

// Shared by every button and button-like download link. Change a variant here once.
const variants = {
  primary:
    "bg-blue-600 text-white hover:bg-blue-700 focus-visible:ring-blue-500",
  secondary:
    "border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 focus-visible:ring-blue-500",
  ghost: "text-slate-600 hover:bg-slate-100 focus-visible:ring-blue-500",
};
type Variant = keyof typeof variants;
export function buttonStyles(variant: Variant = "primary", className = "") {
  return `inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${className}`;
}
export function Button({
  variant = "primary",
  className = "",
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type={type}
      className={buttonStyles(variant, className)}
      {...props}
    />
  );
}
