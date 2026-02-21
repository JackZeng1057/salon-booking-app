import React, { useState } from "react";
import { 
  Calendar as CalendarIcon, 
  Clock, 
  ChevronLeft, 
  ChevronRight, 
  Save, 
  Check, 
  User, 
  Scissors, 
  Phone, 
  MapPin, 
  MoreHorizontal,
  Bell,
  LogOut
} from "lucide-react";
import { cn } from "../../../lib/utils";
import { Button, NavBar, Input } from "../../components/ui/core";
import { SwipeActionRow } from "../../components/ui/swipe-action";

// --- Types ---

interface TimeSlot {
  time: string;
  status: "available" | "booked" | "disabled";
}

interface Order {
  id: string;
  customerName: string;
  service: string;
  time: string;
  price: string;
  status: "pending" | "completed" | "cancelled";
  avatar: string;
  phone: string;
}

// --- 1. Barber Schedule (排班设置) ---

export const BarberSchedule = ({ onBack, onNavigate }: { onBack: () => void; onNavigate: (page: string) => void }) => {
  const [selectedDate, setSelectedDate] = useState(0); // 0 = Today
  const [autoGenerate, setAutoGenerate] = useState(true);
  
  // Mock Dates (Next 7 days)
  const dates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    return {
      day: d.getDate(),
      week: ["日", "一", "二", "三", "四", "五", "六"][d.getDay()],
      full: d.toISOString().split('T')[0]
    };
  });

  // Mock Time Slots (9:00 - 21:00)
  const [slots, setSlots] = useState<TimeSlot[]>(
    Array.from({ length: 13 }, (_, i) => ({
      time: `${9 + i}:00`,
      status: i === 5 || i === 6 ? "booked" : (i % 3 === 0 ? "disabled" : "available")
    }))
  );

  const toggleSlot = (index: number) => {
    if (slots[index].status === "booked") return; // Can't change booked
    setSlots(prev => prev.map((slot, i) => 
      i === index ? { ...slot, status: slot.status === "available" ? "disabled" : "available" } : slot
    ));
  };

  return (
    <div className="bg-slate-50 min-h-screen pb-24 relative flex flex-col">
      <NavBar title="排班设置" onBack={onBack} />

      {/* Profile / Header Section */}
      <div className="bg-white p-5 pb-6 shadow-sm border-b border-slate-100">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-slate-900 text-white flex items-center justify-center font-bold text-lg">
              T
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">Tony 总监</h2>
              <p className="text-xs text-slate-500">当前门店: 蕴含造型 (国贸店)</p>
            </div>
          </div>
          <button onClick={() => onNavigate("home")} className="text-slate-400 hover:text-slate-600">
            <LogOut size={20} />
          </button>
        </div>
        
        {/* Auto Generate Switch */}
        <div className="bg-slate-50 rounded-xl p-3 flex items-center justify-between border border-slate-100">
          <div className="flex items-center gap-2">
            <CalendarIcon size={16} className="text-emerald-600" />
            <span className="text-sm font-medium text-slate-700">自动生成未来7天排班</span>
          </div>
          <div 
            onClick={() => setAutoGenerate(!autoGenerate)}
            className={cn(
              "w-10 h-6 rounded-full relative transition-colors duration-300 cursor-pointer",
              autoGenerate ? "bg-emerald-500" : "bg-slate-300"
            )}
          >
            <div className={cn(
              "absolute top-1 w-4 h-4 bg-white rounded-full shadow-sm transition-all duration-300",
              autoGenerate ? "left-5" : "left-1"
            )} />
          </div>
        </div>
      </div>

      {/* Date Selector */}
      <div className="bg-white mt-2 px-2 py-3 border-b border-slate-100 sticky top-[52px] z-10 shadow-sm/5">
        <div className="flex overflow-x-auto no-scrollbar gap-2 px-2">
          {dates.map((date, index) => (
            <button
              key={index}
              onClick={() => setSelectedDate(index)}
              className={cn(
                "flex flex-col items-center min-w-[50px] py-2 rounded-xl border transition-all",
                selectedDate === index 
                  ? "bg-slate-900 text-white border-slate-900 shadow-md transform scale-105" 
                  : "bg-white text-slate-500 border-slate-100 hover:border-slate-300"
              )}
            >
              <span className="text-[10px] opacity-80">周{date.week}</span>
              <span className="text-lg font-bold">{date.day}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Time Grid */}
      <div className="p-5 flex-1 overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-bold text-slate-900">
             {dates[selectedDate].full} 排班
          </h3>
          <div className="flex gap-3 text-[10px]">
            <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-emerald-100 border border-emerald-500" /> 可预约</div>
            <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-slate-100 border border-slate-300" /> 休息</div>
            <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-amber-100 border border-amber-500" /> 已约</div>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-3">
          {slots.map((slot, index) => (
            <button
              key={index}
              disabled={slot.status === "booked"}
              onClick={() => toggleSlot(index)}
              className={cn(
                "py-3 rounded-xl border text-sm font-medium transition-all relative overflow-hidden",
                slot.status === "available" && "bg-white border-emerald-200 text-emerald-700 shadow-sm active:scale-95",
                slot.status === "disabled" && "bg-slate-50 border-slate-100 text-slate-300",
                slot.status === "booked" && "bg-amber-50 border-amber-200 text-amber-700 opacity-80 cursor-not-allowed"
              )}
            >
              {slot.time}
              {slot.status === "available" && (
                <div className="absolute top-0 right-0 w-3 h-3 bg-emerald-500 rounded-bl-lg" />
              )}
            </button>
          ))}
        </div>

        <div className="mt-8 p-4 bg-emerald-50 rounded-2xl border border-emerald-100 flex gap-3">
           <div className="w-5 h-5 rounded-full bg-emerald-200 flex items-center justify-center shrink-0 mt-0.5">
             <Check size={12} className="text-emerald-700" />
           </div>
           <div>
             <h4 className="text-xs font-bold text-emerald-800 mb-1">系统提示</h4>
             <p className="text-xs text-emerald-600 leading-relaxed">
               您已开启“自动生成”功能，系统将按照您的默认排班模板自动填充未来 7 天的时间表。如需修改特定日期，请直接点击上方时间块。
             </p>
           </div>
        </div>
      </div>

      {/* Footer Action */}
      <div className="bg-white p-4 border-t border-slate-100 safe-area-bottom">
        <Button fullWidth className="shadow-lg shadow-emerald-200/50">
          <Save size={16} className="mr-2" />
          保存今日排班
        </Button>
      </div>
    </div>
  );
};

// --- 2. Barber Orders (理发师订单列表) ---

export const BarberOrders = ({ onBack, onNavigate }: { onBack: () => void; onNavigate: (page: string) => void }) => {
  const [activeTab, setActiveTab] = useState("pending");

  const orders: Order[] = [
    { id: "1", customerName: "张先生", service: "精细剪发", time: "14:00 Today", price: "¥88", status: "pending", avatar: "https://images.unsplash.com/photo-1599566150163-29194dcaad36?w=100", phone: "PHONE_PLACEHOLDER" },
    { id: "2", customerName: "李女士", service: "潮流染发", time: "16:30 Today", price: "¥288", status: "pending", avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100", phone: "PHONE_PLACEHOLDER" },
    { id: "3", customerName: "王先生", service: "烫发护理", time: "Yesterday", price: "¥388", status: "completed", avatar: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100", phone: "PHONE_PLACEHOLDER" },
  ];

  const filteredOrders = orders.filter(o => 
    activeTab === "all" ? true : o.status === activeTab
  );

  return (
    <div className="bg-slate-50 min-h-screen pb-24 relative flex flex-col">
      <NavBar 
        title="订单管理" 
        onBack={onBack} 
        rightAction={<Bell size={20} className="text-slate-600" onClick={() => onNavigate("barber_notifications")} />}
      />

      {/* Tabs */}
      <div className="bg-white border-b border-slate-100 flex justify-around px-2 sticky top-[52px] z-20">
        {[
          { id: "pending", label: "待服务", count: 2 },
          { id: "completed", label: "已完成", count: 12 },
          { id: "cancelled", label: "已取消", count: 0 },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "py-3 text-sm font-medium relative transition-colors flex items-center gap-1",
              activeTab === tab.id ? "text-slate-900" : "text-slate-500"
            )}
          >
            {tab.label}
            {tab.count > 0 && (
              <span className={cn(
                "text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100",
                activeTab === tab.id && "bg-slate-900 text-white"
              )}>{tab.count}</span>
            )}
            {activeTab === tab.id && (
              <div className="absolute bottom-0 left-0 w-full h-0.5 bg-slate-900 rounded-full" />
            )}
          </button>
        ))}
      </div>

      <div className="px-5 py-4 space-y-4 flex-1 overflow-y-auto">
        {filteredOrders.map((order) => (
          <div key={order.id} className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 relative overflow-hidden">
            {/* Status Stripe */}
            <div className={cn(
              "absolute left-0 top-0 bottom-0 w-1",
              order.status === "pending" ? "bg-emerald-500" : "bg-slate-200"
            )} />

            <div className="flex justify-between items-start mb-4 pl-2">
              <div className="flex gap-3">
                <img src={order.avatar} className="w-10 h-10 rounded-full bg-slate-100 object-cover" />
                <div>
                  <h3 className="font-bold text-slate-900">{order.customerName}</h3>
                  <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
                    <Phone size={10} />
                    {order.phone}
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-lg font-bold text-slate-900">{order.price}</div>
                <div className={cn(
                  "text-xs font-medium px-2 py-0.5 rounded-full inline-block mt-1",
                  order.status === "pending" ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-500"
                )}>
                  {order.status === "pending" ? "待服务" : "已结束"}
                </div>
              </div>
            </div>

            <div className="bg-slate-50 rounded-xl p-3 mb-4 pl-4 border border-slate-100 space-y-2">
               <div className="flex justify-between text-sm">
                 <span className="text-slate-500">服务项目</span>
                 <span className="font-bold text-slate-900">{order.service}</span>
               </div>
               <div className="flex justify-between text-sm">
                 <span className="text-slate-500">预约时间</span>
                 <span className="font-bold text-slate-900 flex items-center gap-1">
                   <Clock size={12} className="text-slate-400" /> {order.time}
                 </span>
               </div>
            </div>

            {order.status === "pending" && (
              <div className="flex gap-3 pl-2">
                <Button variant="outline" size="sm" className="flex-1 h-9 border-slate-200 text-slate-600">
                  取消订单
                </Button>
                <Button size="sm" className="flex-1 h-9 bg-slate-900 text-white">
                  开始服务
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

// --- 3. Barber Notification List (Reuse style) ---

export const BarberNotificationList = ({ onBack, onNavigate }: { onBack: () => void; onNavigate: (page: string) => void }) => {
  // Barber specific notifications
  const [notifications, setNotifications] = React.useState([
    { id: 1, title: "新订单提醒", desc: "您收到一个新的剪发预约：10月24日 14:00，请及时确认���", time: "刚刚", read: false },
    { id: 2, title: "排班审核通过", desc: "您的下周排班申请已通过店长审核。", time: "昨天", read: true },
    { id: 3, title: "差评预警", desc: "订单 39281 收到用户反馈，请前往查看。", time: "10-20", read: true },
  ]);

  const handleDelete = (id: number) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  return (
    <div className="bg-slate-50 min-h-screen pb-24 relative flex flex-col">
      <NavBar 
        title="工作通知" 
        onBack={onBack} 
        rightAction={<button className="text-xs font-medium text-slate-500">全部已读</button>}
      />
      
      <div className="flex-1 overflow-y-auto pt-2">
        {notifications.map((item) => (
          <SwipeActionRow key={item.id} onDelete={() => handleDelete(item.id)} className="mb-[1px]">
            <div 
              onClick={() => {}} // Detail view not implemented for this demo
              className={cn(
                "p-4 flex gap-3 items-start active:bg-slate-50 transition-colors",
                !item.read ? "bg-white" : "bg-slate-50/50"
              )}
            >
              <div className={cn(
                "w-10 h-10 rounded-full flex items-center justify-center shrink-0",
                !item.read ? "bg-blue-100 text-blue-600" : "bg-slate-200 text-slate-500" // Blue for Barber Work
              )}>
                <Bell size={20} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-baseline mb-1">
                  <h3 className={cn("text-sm font-bold truncate", !item.read ? "text-slate-900" : "text-slate-500")}>
                    {item.title}
                  </h3>
                  <span className="text-[10px] text-slate-400 whitespace-nowrap ml-2">{item.time}</span>
                </div>
                <p className="text-xs text-slate-500 line-clamp-1">{item.desc}</p>
              </div>
              {!item.read && <div className="w-2 h-2 rounded-full bg-red-500 mt-2 shrink-0" />}
            </div>
          </SwipeActionRow>
        ))}
      </div>
    </div>
  );
};
