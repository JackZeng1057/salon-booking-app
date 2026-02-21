import React from "react";
import { cn } from "../../../lib/utils";
import { ChevronLeft } from "lucide-react";

// --- Design Tokens & Atoms ---

// 1. Typography & Colors (Mapped to Tailwind)
// Primary: bg-slate-900
// Background: bg-slate-50
// Accent: text-emerald-500 / bg-emerald-500
// Text Primary: text-slate-900
// Text Secondary: text-slate-500

// 2. Button Component
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "outline" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  fullWidth?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", fullWidth, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center rounded-xl font-medium transition-all active:scale-95 disabled:opacity-50 disabled:pointer-events-none",
          // Sizes
          size === "sm" && "h-8 px-4 text-xs",
          size === "md" && "h-12 px-6 text-sm", // Standard mobile button height (48px approx)
          size === "lg" && "h-14 px-8 text-base",
          // Variants
          variant === "primary" && "bg-slate-900 text-white shadow-lg shadow-slate-900/20 hover:bg-slate-800",
          variant === "secondary" && "bg-slate-100 text-slate-900 hover:bg-slate-200",
          variant === "outline" && "border border-slate-200 bg-transparent text-slate-900 hover:bg-slate-50",
          variant === "ghost" && "bg-transparent text-slate-600 hover:bg-slate-100",
          variant === "danger" && "bg-red-50 text-red-600 hover:bg-red-100",
          // Layout
          fullWidth && "w-full",
          className
        )}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

// 3. Input Component
interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  icon?: React.ReactNode;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, icon, ...props }, ref) => {
    return (
      <div className="space-y-1.5 w-full">
        {label && <label className="text-xs font-medium text-slate-700 ml-1">{label}</label>}
        <div className="relative">
          {icon && (
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
              {icon}
            </div>
          )}
          <input
            ref={ref}
            className={cn(
              "flex h-12 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900 disabled:cursor-not-allowed disabled:opacity-50 transition-colors",
              icon && "pl-10",
              error && "border-red-500 focus:border-red-500 focus:ring-red-500",
              className
            )}
            {...props}
          />
        </div>
        {error && <p className="text-xs text-red-500 ml-1">{error}</p>}
      </div>
    );
  }
);
Input.displayName = "Input";

// 4. Card Component
export const Card = ({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn("rounded-2xl border border-slate-100 bg-white shadow-sm p-4", className)}
    {...props}
  >
    {children}
  </div>
);

// 5. Status Badge
export const StatusBadge = ({ status }: { status: "pending" | "confirmed" | "completed" | "cancelled" }) => {
  const styles = {
    pending: "bg-amber-50 text-amber-600 border-amber-100",
    confirmed: "bg-emerald-50 text-emerald-600 border-emerald-100",
    completed: "bg-slate-100 text-slate-600 border-slate-200",
    cancelled: "bg-red-50 text-red-600 border-red-100",
  };
  
  const labels = {
    pending: "待确认",
    confirmed: "已预约",
    completed: "已完成",
    cancelled: "已取消",
  };

  return (
    <span className={cn("inline-flex items-center rounded-md border px-2 py-1 text-xs font-medium", styles[status])}>
      {labels[status]}
    </span>
  );
};

// 6. Section Header
export const SectionHeader = ({ title, action }: { title: string; action?: React.ReactNode }) => (
  <div className="flex items-center justify-between mb-3 px-1">
    <h2 className="text-base font-bold text-slate-900">{title}</h2>
    {action}
  </div>
);

// 7. Navigation Bar (Unified)
interface NavBarProps {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  rightAction?: React.ReactNode;
}

export const NavBar = ({ title, subtitle, onBack, rightAction }: NavBarProps) => {
  return (
    <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-slate-100 h-[52px] flex items-center px-4 justify-between">
      <div className="w-10 flex items-center justify-start">
        {onBack && (
          <button onClick={onBack} className="p-2 -ml-2 rounded-full hover:bg-slate-100 active:scale-95 transition-transform">
            <ChevronLeft size={24} className="text-slate-900" />
          </button>
        )}
      </div>
      
      <div className="flex-1 flex flex-col items-center justify-center">
        <h1 className="text-[17px] font-semibold text-slate-900 leading-tight">{title}</h1>
        {subtitle && <span className="text-[10px] text-slate-500 leading-tight">{subtitle}</span>}
      </div>

      <div className="w-10 flex items-center justify-end">
        {rightAction}
      </div>
    </header>
  );
};
