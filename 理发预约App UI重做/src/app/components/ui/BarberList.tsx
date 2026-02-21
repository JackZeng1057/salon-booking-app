import React from "react";
// import { motion } from "motion/react";
import { Search, Star, MapPin, Clock } from "lucide-react";
import { cn } from "../../../lib/utils";
import { Button } from "./core";
import { Input } from "./core";

interface Barber {
  id: string;
  name: string;
  rating: number;
  reviewCount: number;
  tags: string[];
  avatar: string;
  status: "Available" | "Busy";
}

const mockBarbers: Barber[] = [
  {
    id: "1",
    name: "Tony",
    rating: 4.9,
    reviewCount: 128,
    tags: ["剪发", "烫染", "造型"],
    avatar: "https://images.unsplash.com/photo-1599566150163-29194dcaad36?auto=format&fit=crop&q=80&w=200",
    status: "Available",
  },
  {
    id: "2",
    name: "Kevin",
    rating: 4.8,
    reviewCount: 96,
    tags: ["男士精剪", "胡须护理"],
    avatar: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&q=80&w=200",
    status: "Busy",
  },
  {
    id: "3",
    name: "Allen",
    rating: 4.7,
    reviewCount: 204,
    tags: ["潮流设计", "色彩专家"],
    avatar: "https://images.unsplash.com/photo-1633332755192-727a05c4013d?auto=format&fit=crop&q=80&w=200",
    status: "Available",
  },
];

export const BarberList = ({ onSelect }: { onSelect: (id: string) => void }) => {
  return (
    <div className="bg-slate-50 min-h-full pb-24 relative">
      {/* Sticky Header Container */}
      <header className="sticky top-0 z-40 bg-slate-50 shadow-sm/50 transition-all">
        {/* Top Row: Title & User/Action */}
        <div className="px-5 pt-4 pb-2 flex justify-between items-center bg-slate-50 relative z-50">
          <div>
            <p className="text-xs text-slate-500 mb-0.5">下午好</p>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">寻找你的发型师</h1>
          </div>
          <div className="bg-slate-200 p-2 rounded-full">
            <img 
              src="https://images.unsplash.com/photo-1527980965255-d3b416303d12?auto=format&fit=crop&q=80&w=100" 
              alt="User" 
              className="w-8 h-8 rounded-full object-cover border-2 border-white"
            />
          </div>
        </div>

        {/* Middle Row: Search */}
        <div className="px-5 pb-2 bg-slate-50 relative z-50">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
            <input 
              type="text" 
              placeholder="搜索理发师、服务..." 
              className="w-full bg-white h-11 pl-10 pr-4 rounded-xl text-sm shadow-sm border border-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10 transition-all"
            />
          </div>
        </div>

        {/* Bottom Row: Categories */}
        <div className="bg-slate-50 pb-3 relative z-50">
          <div className="flex gap-3 overflow-x-auto px-5 scrollbar-hide">
            {["全部", "剪发", "染发", "护理", "造型"].map((cat, i) => (
              <button 
                key={cat}
                className={cn(
                  "whitespace-nowrap px-4 py-1.5 rounded-full text-xs font-medium transition-colors border shadow-sm",
                  i === 0 
                    ? "bg-slate-900 text-white border-slate-900" 
                    : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
                )}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
        
        {/* Mask/Fade at the bottom of header for smooth transition (Optional) */}
        <div className="absolute bottom-0 left-0 w-full h-4 bg-gradient-to-b from-slate-50 to-transparent pointer-events-none translate-y-full" />
      </header>

      {/* Scrollable Content List */}
      <div className="px-5 space-y-4 mt-4">
        <div className="flex justify-between items-end mb-2">
          <h2 className="text-lg font-bold text-slate-900">推荐理发师</h2>
          <span className="text-xs text-slate-400 font-medium">查看全部</span>
        </div>

        {mockBarbers.map((barber, index) => (
          <div
            key={barber.id}
            onClick={() => onSelect(barber.id)}
            className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex gap-4 active:scale-[0.98] transition-transform cursor-pointer"
          >
            <div className="relative shrink-0">
              <img 
                src={barber.avatar} 
                alt={barber.name} 
                className="w-20 h-24 object-cover rounded-xl bg-slate-100"
              />
              <div className="absolute top-1.5 right-1.5 bg-white/90 backdrop-blur-sm px-1.5 py-0.5 rounded-md flex items-center gap-0.5 shadow-sm">
                <Star className="w-2.5 h-2.5 fill-amber-400 text-amber-400" />
                <span className="text-[10px] font-bold text-slate-900">{barber.rating}</span>
              </div>
            </div>

            <div className="flex-1 flex flex-col justify-between py-0.5">
              <div>
                <div className="flex justify-between items-start">
                  <h3 className="text-base font-bold text-slate-900">{barber.name}</h3>
                  {barber.status === "Available" ? (
                    <span className="text-[10px] text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full font-medium">
                      可预约
                    </span>
                  ) : (
                    <span className="text-[10px] text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full font-medium">
                      忙碌中
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-400 mt-1">{barber.reviewCount} 条评价 · 5年经验</p>
              </div>

              <div className="flex flex-wrap gap-1.5 mt-2">
                {barber.tags.map(tag => (
                  <span key={tag} className="px-2 py-0.5 bg-slate-50 text-slate-500 text-[10px] rounded-md border border-slate-100">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          </div>
        ))}

        {/* Promotion Card */}
        <div className="mt-6 bg-slate-900 rounded-2xl p-5 text-white relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/20 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none" />
          <div className="relative z-10">
            <h3 className="font-bold text-lg mb-1">首次预约享 8 折</h3>
            <p className="text-slate-400 text-xs mb-4 max-w-[200px]">新用户专享福利，包含剪发与造型服务。</p>
            <button className="bg-white text-slate-900 px-4 py-2 rounded-lg text-xs font-bold active:bg-slate-100 transition-colors">
              立即领取
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
