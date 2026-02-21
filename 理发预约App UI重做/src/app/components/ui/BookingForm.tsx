import React, { useState } from "react";
// import { motion } from "motion/react";
import { Calendar, Clock, MapPin, CheckCircle, ChevronLeft } from "lucide-react";
import { Button, Input } from "./core";

export const BookingForm = ({ onBack, onSuccess }: { onBack: () => void; onSuccess: () => void }) => {
  const [selectedDate, setSelectedDate] = useState("today");
  const [selectedTime, setSelectedTime] = useState("14:00");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSuccess();
  };

  return (
    <div className="bg-slate-50 min-h-full pb-24 relative overflow-y-auto">
      {/* Header */}
      <header className="px-5 pt-8 pb-4 flex items-center justify-between sticky top-0 z-20 bg-slate-50 shadow-sm/50">
        <button onClick={onBack} className="p-2 -ml-2 rounded-full hover:bg-slate-100 active:scale-95 transition-transform">
          <ChevronLeft className="w-6 h-6 text-slate-900" />
        </button>
        <h1 className="text-xl font-bold text-slate-900">填写预约信息</h1>
        <div className="w-8" />
      </header>

      {/* Form */}
      <form onSubmit={handleSubmit} className="px-5 space-y-6 mt-4">
        
        {/* Service Info */}
        <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
            <span className="text-xl">💇</span>
          </div>
          <div>
            <h3 className="font-bold text-slate-900 text-sm">精细剪发</h3>
            <p className="text-xs text-slate-500">Tony 老师 · 45 min</p>
            <div className="text-emerald-600 font-bold text-sm mt-1">¥88</div>
          </div>
        </div>

        {/* Date Selection */}
        <section>
          <label className="block text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
            <Calendar className="w-4 h-4 text-slate-400" />
            选择日期
          </label>
          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide -mx-2 px-2">
            {["今天", "明天", "周三", "周四", "周五"].map((day, i) => (
              <button
                key={day}
                type="button"
                onClick={() => setSelectedDate(day)}
                className={`
                  flex-shrink-0 w-16 h-20 rounded-xl flex flex-col items-center justify-center border transition-all active:scale-95
                  ${selectedDate === day 
                    ? "bg-slate-900 text-white border-slate-900 shadow-md shadow-slate-900/20" 
                    : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"}
                `}
              >
                <span className="text-xs font-medium mb-1">{day}</span>
                <span className="text-lg font-bold">{24 + i}</span>
              </button>
            ))}
          </div>
        </section>

        {/* Time Selection */}
        <section>
          <label className="block text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
            <Clock className="w-4 h-4 text-slate-400" />
            选择时间
          </label>
          <div className="grid grid-cols-4 gap-2">
            {["10:00", "11:00", "13:00", "14:00", "15:30", "16:00", "17:00", "18:00"].map((time) => (
              <button
                key={time}
                type="button"
                onClick={() => setSelectedTime(time)}
                disabled={time === "11:00"} // Disabled state example
                className={`
                  h-10 rounded-lg text-xs font-medium border transition-all active:scale-95
                  ${selectedTime === time
                    ? "bg-emerald-50 text-emerald-600 border-emerald-200 ring-2 ring-emerald-100"
                    : time === "11:00" 
                      ? "bg-slate-100 text-slate-300 border-transparent cursor-not-allowed decoration-slice" 
                      : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"}
                `}
              >
                {time}
              </button>
            ))}
          </div>
        </section>

        {/* Contact Info */}
        <section className="space-y-4">
          <label className="block text-sm font-bold text-slate-900 mb-1 flex items-center gap-2">
            <MapPin className="w-4 h-4 text-slate-400" />
            联系方式
          </label>
          <Input label="姓名" placeholder="请输入您的姓名" defaultValue="James" />
          <Input label="手机号" placeholder="用于接收预约提醒" defaultValue="PHONE_PLACEHOLDER" type="tel" />
          <Input label="备注" placeholder="如有特殊需求请填写" />
        </section>

        {/* Submit Button */}
        <div className="pt-4 pb-8 safe-area-bottom">
          <Button type="submit" size="lg" fullWidth className="shadow-xl shadow-emerald-500/20 bg-slate-900 text-white">
            确认预约 ¥88
          </Button>
          <p className="text-[10px] text-center text-slate-400 mt-3">
            点击即代表同意《用户服务协议》
          </p>
        </div>
      </form>
    </div>
  );
};

export const SuccessView = ({ onHome }: { onHome: () => void }) => {
  return (
    <div className="h-full bg-slate-50 flex flex-col items-center justify-center p-8 text-center relative overflow-hidden">
      {/* Confetti / Decoration */}
      <div className="absolute top-0 left-0 w-full h-full pointer-events-none opacity-50">
        <div className="absolute top-1/4 left-1/4 w-4 h-4 bg-yellow-400 rounded-full animate-bounce delay-100" />
        <div className="absolute top-1/3 right-1/4 w-3 h-3 bg-red-400 rounded-full animate-bounce delay-300" />
        <div className="absolute bottom-1/3 left-1/3 w-2 h-2 bg-blue-400 rounded-full animate-bounce delay-500" />
      </div>

      <div className="w-24 h-24 bg-emerald-100 rounded-full flex items-center justify-center mb-6 text-emerald-600 shadow-lg shadow-emerald-200">
        <CheckCircle size={48} strokeWidth={3} />
      </div>

      <h1 className="text-2xl font-bold text-slate-900 mb-2">
        预约成功！
      </h1>
      
      <p className="text-sm text-slate-500 mb-8 max-w-[240px]">
        您的预约已确认，请留意短信通知，并提前10分钟到达门店。
      </p>

      <div className="w-full space-y-3">
        <Button onClick={onHome} fullWidth variant="primary">返回首页</Button>
        <Button variant="ghost" fullWidth className="text-slate-500">查看订单详情</Button>
      </div>
    </div>
  );
};
