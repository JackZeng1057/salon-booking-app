import React from "react";
import { cn } from "../../../lib/utils";
import { Home, Search, Calendar, User, Store, Bell, CheckSquare, LayoutDashboard, ScanLine, FileText, Sparkles } from "lucide-react";
// import { motion } from "motion/react"; // Commenting out motion to debug

export const MobileContainer = ({ children }: { children: React.ReactNode }) => {
  return (
    <div className="mx-auto w-full max-w-[480px] h-screen bg-slate-50 relative overflow-hidden shadow-2xl flex flex-col">
      {children}
    </div>
  );
};

interface BottomTabBarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

export const BottomTabBar = ({ activeTab, onTabChange }: BottomTabBarProps) => {
  const tabs = [
    { id: "home", label: "首页", icon: Home },
    { id: "ai_consultant", label: "AI顾问", icon: Sparkles },
    { id: "appointments", label: "预约", icon: Calendar },
    { id: "profile", label: "我的", icon: User },
  ];

  return (
    <div className="sticky bottom-0 z-50 bg-white/90 backdrop-blur-lg border-t border-slate-200 pb-safe">
      <div className="flex justify-around items-center h-[60px] px-2">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className="flex-1 flex flex-col items-center justify-center gap-1 active:scale-90 transition-transform relative py-2"
            >
              <div className={cn("relative p-1 rounded-xl transition-colors", isActive ? "text-slate-900" : "text-slate-400")}>
                <tab.icon size={24} strokeWidth={isActive ? 2.5 : 2} />
              </div>
              <span className={cn("text-[10px] font-medium transition-colors", isActive ? "text-slate-900" : "text-slate-400")}>
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export const BarberTabBar = ({ activeTab, onTabChange }: BottomTabBarProps) => {
  const tabs = [
    { id: "schedule", label: "排班", icon: Calendar },
    { id: "orders", label: "订单", icon: CheckSquare },
    { id: "notifications", label: "通知", icon: Bell },
  ];

  return (
    <div className="sticky bottom-0 z-50 bg-slate-900 text-white pb-safe">
      <div className="flex justify-around items-center h-[60px] px-2">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className="flex-1 flex flex-col items-center justify-center gap-1 active:scale-90 transition-transform relative py-2"
            >
              <div className={cn("relative p-1 rounded-xl transition-colors", isActive ? "text-emerald-400" : "text-slate-500")}>
                <tab.icon size={24} strokeWidth={isActive ? 2.5 : 2} />
              </div>
              <span className={cn("text-[10px] font-medium transition-colors", isActive ? "text-emerald-400" : "text-slate-500")}>
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export const AdminTabBar = ({ activeTab, onTabChange }: BottomTabBarProps) => {
  const tabs = [
    { id: "manage", label: "工作台", icon: LayoutDashboard },
    { id: "verify", label: "核销", icon: ScanLine },
    { id: "orders", label: "订单", icon: FileText },
    { id: "store", label: "门店", icon: Store },
  ];

  return (
    <div className="sticky bottom-0 z-50 bg-slate-900 text-white pb-safe">
      <div className="flex justify-around items-center h-[60px] px-2">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className="flex-1 flex flex-col items-center justify-center gap-1 active:scale-90 transition-transform relative py-2"
            >
              <div className={cn("relative p-2 rounded-xl transition-all", isActive ? "bg-white/10 text-white" : "text-slate-500")}>
                <tab.icon size={20} strokeWidth={isActive ? 2.5 : 2} />
              </div>
              <span className={cn("text-[10px] font-medium transition-colors", isActive ? "text-white" : "text-slate-500")}>
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
