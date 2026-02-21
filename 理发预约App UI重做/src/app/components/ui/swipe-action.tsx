import React, { useState } from "react";
// import { motion, useAnimation } from "motion/react";
import { Trash2 } from "lucide-react";
import { cn } from "../../../lib/utils";

interface SwipeActionRowProps {
  children: React.ReactNode;
  onDelete: () => void;
  className?: string;
}

export const SwipeActionRow = ({ children, onDelete, className }: SwipeActionRowProps) => {
  // Simplified version without motion for debugging
  return (
    <div className={cn("relative overflow-hidden group", className)}>
      <div className="absolute right-0 top-0 bottom-0 w-[80px] bg-red-500 flex items-center justify-center z-0">
        <button onClick={onDelete} className="w-full h-full flex items-center justify-center text-white">
          <Trash2 size={20} />
        </button>
      </div>
      {/* 
         We simulate the swipe by just placing the content on top. 
         Without motion, we lose the swipe gesture, but at least the app should render.
      */}
      <div className="relative bg-white z-10">
        {children}
      </div>
    </div>
  );
};
