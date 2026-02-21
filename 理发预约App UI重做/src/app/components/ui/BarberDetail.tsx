import React from "react";
// import { motion } from "motion/react";
import { Star, Clock, Scissors, Award, ChevronLeft, Calendar } from "lucide-react";
import { Button } from "./core";

export const BarberDetail = ({ onBack, onBook }: { onBack: () => void; onBook: () => void }) => {
  return (
    <div className="bg-slate-50 min-h-full pb-24 relative overflow-y-auto">
      {/* Hero Image */}
      <div className="relative h-96">
        <img 
          src="https://images.unsplash.com/photo-1599566150163-29194dcaad36?auto=format&fit=crop&q=80&w=600" 
          alt="Barber" 
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-transparent to-transparent opacity-90" />
        
        <button 
          onClick={onBack}
          className="absolute top-4 left-4 w-10 h-10 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center text-white border border-white/20 active:scale-95 transition-transform z-10"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>

        <div className="absolute bottom-0 left-0 right-0 p-6 text-white">
          <div className="flex items-center gap-2 mb-2">
            <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-full text-[10px] font-bold uppercase tracking-wider backdrop-blur-sm">
              Available
            </span>
            <div className="flex items-center gap-1 bg-amber-500/20 px-2 py-0.5 rounded-full border border-amber-500/30 backdrop-blur-sm">
              <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
              <span className="text-[10px] font-bold text-amber-100">4.9 (128)</span>
            </div>
          </div>
          <h1 className="text-3xl font-bold mb-1">Tony 老师</h1>
          <p className="text-slate-300 text-sm font-medium">高级发型总监 · 10年经验</p>
        </div>
      </div>

      {/* Content */}
      <div className="relative -mt-6 bg-slate-50 rounded-t-3xl px-6 pt-8 space-y-8 z-0">
        
        {/* About */}
        <section>
          <h2 className="text-lg font-bold text-slate-900 mb-3 flex items-center gap-2">
            <Scissors className="w-4 h-4 text-slate-400" />
            关于我
          </h2>
          <p className="text-slate-500 text-sm leading-relaxed">
            专注于男士精剪与潮流造型设计，擅长根据脸型定制发型。曾在伦敦沙宣学院进修，致力于为您打造最完美的个人形象。
          </p>
        </section>

        {/* Services */}
        <section>
          <h2 className="text-lg font-bold text-slate-900 mb-3 flex items-center gap-2">
            <Award className="w-4 h-4 text-slate-400" />
            服务项目
          </h2>
          <div className="space-y-3">
            {[
              { name: "精细剪发", time: "45 min", price: "¥88" },
              { name: "潮流烫染", time: "120 min", price: "¥388" },
              { name: "头皮护理", time: "60 min", price: "¥168" },
            ].map((service, i) => (
              <div key={i} className="flex items-center justify-between p-4 bg-white rounded-2xl border border-slate-100 shadow-sm active:scale-[0.99] transition-transform">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-500">
                    <Scissors className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 text-sm">{service.name}</h3>
                    <p className="text-xs text-slate-400">{service.time}</p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="block font-bold text-slate-900">{service.price}</span>
                  <button className="text-[10px] text-emerald-600 font-medium mt-1">选择</button>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Gallery */}
        <section className="pb-8">
          <h2 className="text-lg font-bold text-slate-900 mb-3 flex items-center gap-2">
            <Calendar className="w-4 h-4 text-slate-400" />
            作品集
          </h2>
          <div className="grid grid-cols-2 gap-3">
            {[1, 2, 3, 4].map((i) => (
              <img 
                key={i}
                src={`https://images.unsplash.com/photo-${1500000000000 + i}?auto=format&fit=crop&q=80&w=200`}
                className="rounded-xl w-full h-32 object-cover bg-slate-200"
                alt="Work"
              />
            ))}
          </div>
        </section>
      </div>

      {/* Floating Action Button */}
      <div className="fixed bottom-6 left-0 right-0 px-6 z-20">
        <Button 
          onClick={onBook} 
          size="lg" 
          fullWidth 
          className="shadow-xl shadow-slate-900/20"
        >
          立即预约
        </Button>
      </div>
    </div>
  );
};
