import React from "react";
// import { motion } from "motion/react";
import { Search, MapPin, Star, Calendar, ArrowRight, User, Settings, FileText, Bell, Clock, Store } from "lucide-react";
import { cn } from "../../../lib/utils";
import { Button, NavBar } from "../../components/ui/core";

// 1. User Home (pages/user/home/index)
export const UserHome = ({ onNavigate }: { onNavigate: (page: string) => void }) => {
  return (
    <div className="bg-slate-50 min-h-screen pb-24 relative flex flex-col">
      {/* Sticky Header */}
      <header className="sticky top-0 z-40 bg-slate-50/95 backdrop-blur-md px-5 pt-12 pb-2">
        <div className="flex justify-between items-center mb-4">
          <div>
            <p className="text-xs text-slate-500 mb-0.5 font-medium">下午好，张三</p>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">开启今日造型</h1>
          </div>
          <button onClick={() => onNavigate("notifications")} className="bg-white border border-slate-100 p-2 rounded-full shadow-sm active:scale-95 transition-transform relative">
            <Bell size={20} className="text-slate-700" />
            <span className="absolute top-2 right-2.5 w-2 h-2 bg-red-500 rounded-full ring-2 ring-white" />
          </button>
        </div>

        {/* Search Bar */}
        <div 
          onClick={() => onNavigate("store_list")}
          className="bg-white h-12 flex items-center px-4 rounded-xl shadow-sm border border-slate-200 active:scale-[0.98] transition-all cursor-pointer"
        >
          <Search className="text-slate-400 w-4 h-4 mr-3" />
          <span className="text-sm text-slate-400">搜索附近的门店、发型师...</span>
        </div>
      </header>

      <div className="px-5 space-y-6 mt-2 overflow-y-auto flex-1 pb-24">
        {/* Banner */}
        <div className="relative h-40 rounded-2xl overflow-hidden shadow-lg shadow-slate-900/10">
          <img 
            src="https://images.unsplash.com/photo-1560066984-138dadb4c035?auto=format&fit=crop&q=80&w=600" 
            alt="Promotion" 
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-slate-900/80 to-transparent flex flex-col justify-center p-6">
            <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider mb-1">New Arrival</span>
            <h2 className="text-xl font-bold text-white mb-2 leading-tight">夏日清爽特惠<br/>全场 8.5 折</h2>
            <Button size="sm" variant="secondary" className="w-fit bg-white/20 text-white backdrop-blur-md border border-white/30 hover:bg-white/30">
              立即查看
            </Button>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-4 gap-2">
          {[
            { icon: Store, label: "找门店", page: "store_list", color: "bg-blue-50 text-blue-600" },
            { icon: Calendar, label: "我的预约", page: "order_list", color: "bg-emerald-50 text-emerald-600" },
            { icon: FileText, label: "价目表", page: "home", color: "bg-amber-50 text-amber-600" }, // Placeholder
            { icon: User, label: "个人中心", page: "profile", color: "bg-purple-50 text-purple-600" },
          ].map((action, i) => (
            <button 
              key={i}
              onClick={() => onNavigate(action.page)}
              className="flex flex-col items-center gap-2 py-2 active:opacity-60 transition-opacity"
            >
              <div className={cn("w-12 h-12 rounded-2xl flex items-center justify-center shadow-sm", action.color)}>
                <action.icon size={20} />
              </div>
              <span className="text-xs font-medium text-slate-600">{action.label}</span>
            </button>
          ))}
        </div>

        {/* Nearby Stores */}
        <div>
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-base font-bold text-slate-900">附近推荐</h3>
            <button onClick={() => onNavigate("store_list")} className="text-xs text-slate-400 font-medium flex items-center gap-0.5">
              更多 <ArrowRight size={12} />
            </button>
          </div>
          
          <div className="space-y-3">
            <StoreCard 
              name="蕴含造型 (国贸店)" 
              distance="0.8km" 
              rating={4.9} 
              tags={["需预约", "停车免费"]}
              image="https://images.unsplash.com/photo-1521590832169-dcb6f5465cbf?auto=format&fit=crop&q=80&w=200"
              onClick={() => onNavigate("store_detail")}
            />
            <StoreCard 
              name="蕴含造型 (三里屯店)" 
              distance="2.5km" 
              rating={4.8} 
              tags={["需预约", "网红店"]}
              image="https://images.unsplash.com/photo-1633681926022-84c23e8cb2d6?auto=format&fit=crop&q=80&w=200"
              onClick={() => onNavigate("store_detail")}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

// 2. Store List (pages/store/list)
export const StoreList = ({ onBack, onNavigate }: { onBack: () => void; onNavigate: (page: string) => void }) => {
  return (
    <div className="bg-slate-50 min-h-screen pb-24 relative flex flex-col">
      <NavBar title="选择门店" onBack={onBack} />
      
      <div className="sticky top-[52px] z-30 bg-slate-50 px-5 py-2 shadow-sm/5">
        <div className="flex gap-2">
          <div className="flex-1 bg-white h-10 flex items-center px-3 rounded-lg border border-slate-200">
            <Search className="text-slate-400 w-4 h-4 mr-2" />
            <input type="text" placeholder="输入店名或地址" className="flex-1 bg-transparent text-sm outline-none" />
          </div>
          <button className="px-4 h-10 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-600">
            筛选
          </button>
        </div>
      </div>

      <div className="px-5 py-4 space-y-4 flex-1 overflow-y-auto">
        {[1, 2, 3, 4].map((i) => (
          <StoreCard 
            key={i}
            name={`蕴含造型 (分店 ${i})`} 
            distance={`${(i * 0.5 + 0.3).toFixed(1)}km`} 
            rating={4.9 - i * 0.1} 
            tags={["需预约", i % 2 === 0 ? "停车免费" : "地铁直达"]}
            image={`https://images.unsplash.com/photo-${1500000000000 + i}?auto=format&fit=crop&q=80&w=200`} // Placeholder
            onClick={() => onNavigate("store_detail")}
          />
        ))}
      </div>
    </div>
  );
};

// 3. Store Detail (pages/store/detail)
export const StoreDetail = ({ onBack, onNavigate }: { onBack: () => void; onNavigate: (page: string) => void }) => {
  return (
    <div className="bg-slate-50 min-h-screen pb-24 relative">
      <div className="relative h-64">
        <img 
          src="https://images.unsplash.com/photo-1521590832169-dcb6f5465cbf?auto=format&fit=crop&q=80&w=800" 
          className="w-full h-full object-cover"
          alt="Store"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-900/80 via-transparent to-transparent" />
        <button onClick={onBack} className="absolute top-12 left-5 bg-white/20 backdrop-blur-md p-2 rounded-full text-white">
          <ArrowRight className="rotate-180" size={20} />
        </button>
      </div>

      <div className="relative -mt-6 bg-slate-50 rounded-t-[32px] px-5 pt-8 pb-24 min-h-[500px]">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 mb-1">蕴含造型 (国贸店)</h1>
            <div className="flex items-center text-sm text-slate-500 gap-1">
              <MapPin size={14} />
              <span>朝阳区建国门外大街1号</span>
            </div>
          </div>
          <div className="flex flex-col items-end">
            <div className="flex items-center gap-1 bg-amber-50 px-2 py-1 rounded-lg">
              <Star size={14} className="fill-amber-400 text-amber-400" />
              <span className="text-sm font-bold text-amber-700">4.9</span>
            </div>
            <span className="text-[10px] text-slate-400 mt-1">2k+ 评价</span>
          </div>
        </div>

        <div className="flex gap-4 mb-6 border-b border-slate-100 pb-6">
          <div className="flex-1 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-600">
              <Clock size={20} />
            </div>
            <div>
              <div className="text-xs text-slate-500">营业时间</div>
              <div className="text-sm font-bold text-slate-900">10:00 - 22:00</div>
            </div>
          </div>
          <div className="w-px bg-slate-100" />
          <button className="flex-1 flex items-center gap-3 active:opacity-60">
            <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center text-blue-600">
              <MapPin size={20} />
            </div>
            <div className="text-left">
              <div className="text-xs text-slate-500">距离您</div>
              <div className="text-sm font-bold text-slate-900">0.8km</div>
            </div>
          </button>
        </div>

        <h2 className="text-lg font-bold text-slate-900 mb-4">精选发型师</h2>
        {/* Reusing Barber Logic somewhat simplified */}
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div 
              key={i} 
              onClick={() => onNavigate("barber_detail")} // Goes to the BarberDetail created previously
              className="bg-white p-3 rounded-2xl shadow-sm border border-slate-100 flex gap-3 active:scale-[0.99] transition-transform"
            >
              <img 
                src={`https://images.unsplash.com/photo-${1599566150163 + i}?auto=format&fit=crop&q=80&w=100`} 
                className="w-16 h-16 rounded-xl object-cover bg-slate-100" 
              />
              <div className="flex-1 flex flex-col justify-center">
                <div className="flex justify-between">
                  <h3 className="font-bold text-slate-900">Tony 老师</h3>
                  <Button size="sm" className="h-7 px-3 text-xs bg-slate-900 text-white">预约</Button>
                </div>
                <p className="text-xs text-slate-400 mt-1 line-clamp-1">擅长日韩潮流烫染，10年经验...</p>
                <div className="flex gap-1 mt-2">
                  <span className="text-[10px] bg-slate-50 text-slate-500 px-1.5 py-0.5 rounded border border-slate-100">剪发 ¥88</span>
                  <span className="text-[10px] bg-slate-50 text-slate-500 px-1.5 py-0.5 rounded border border-slate-100">烫发 ¥388</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// 4. Order List (pages/order/list)
export const OrderList = ({ onBack, onNavigate }: { onBack: () => void; onNavigate: (page: string) => void }) => {
  const [activeTab, setActiveTab] = React.useState("all");
  
  return (
    <div className="bg-slate-50 min-h-screen pb-24 relative flex flex-col">
      <NavBar title="我的预约" onBack={onBack} />
      
      {/* Tabs */}
      <div className="bg-white border-b border-slate-100 flex justify-around px-2">
        {[
          { id: "all", label: "全部" },
          { id: "pending", label: "待服务" },
          { id: "completed", label: "已完成" },
          { id: "cancelled", label: "已取消" },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "py-3 text-sm font-medium relative transition-colors",
              activeTab === tab.id ? "text-slate-900" : "text-slate-500"
            )}
          >
            {tab.label}
            {activeTab === tab.id && (
              // <motion.div layoutId="underline" className="absolute bottom-0 left-0 w-full h-0.5 bg-slate-900 rounded-full" />
              <div className="absolute bottom-0 left-0 w-full h-0.5 bg-slate-900 rounded-full" />
            )}
          </button>
        ))}
      </div>

      <div className="px-5 py-4 space-y-4 flex-1 overflow-y-auto">
        <OrderCard 
          status="pending" 
          store="蕴含造型 (国贸店)" 
          service="精细剪发" 
          time="2023-10-24 14:00" 
          price="¥88"
          onClick={() => onNavigate("order_detail")}
        />
        <OrderCard 
          status="completed" 
          store="蕴含造型 (三里屯店)" 
          service="潮流染发" 
          time="2023-09-15 10:00" 
          price="¥288"
          onClick={() => onNavigate("order_detail")}
        />
        <OrderCard 
          status="cancelled" 
          store="蕴含造型 (国贸店)" 
          service="精细剪发" 
          time="2023-08-01 16:00" 
          price="¥88"
          onClick={() => onNavigate("order_detail")}
        />
      </div>
    </div>
  );
};

// --- Helper Components ---

const StoreCard = ({ name, distance, rating, tags, image, onClick }: any) => (
  <div onClick={onClick} className="bg-white p-3 rounded-2xl shadow-sm border border-slate-100 flex gap-3 active:scale-[0.99] transition-transform cursor-pointer">
    <div className="relative w-24 h-24 shrink-0">
      <img src={image} className="w-full h-full object-cover rounded-xl bg-slate-100" />
      <div className="absolute top-1.5 left-1.5 bg-slate-900/80 backdrop-blur-sm px-1.5 py-0.5 rounded text-[10px] text-white font-medium">
        {distance}
      </div>
    </div>
    <div className="flex-1 flex flex-col justify-between py-0.5">
      <div>
        <div className="flex justify-between items-start">
          <h3 className="font-bold text-slate-900 text-sm">{name}</h3>
        </div>
        <div className="flex items-center gap-1 mt-1">
          <Star size={10} className="fill-amber-400 text-amber-400" />
          <span className="text-xs font-bold text-slate-900">{rating}</span>
          <span className="text-[10px] text-slate-400 ml-1">月售 500+</span>
        </div>
      </div>
      <div className="flex flex-wrap gap-1 mt-2">
        {tags.map((tag: string) => (
          <span key={tag} className="text-[10px] text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100">
            {tag}
          </span>
        ))}
      </div>
    </div>
  </div>
);

const OrderCard = ({ status, store, service, time, price, onClick }: any) => {
  const statusStyles = {
    pending: { color: "text-emerald-600", bg: "bg-emerald-50", label: "待服务" },
    completed: { color: "text-slate-500", bg: "bg-slate-100", label: "已完成" },
    cancelled: { color: "text-red-500", bg: "bg-red-50", label: "已取消" },
  };
  const s = statusStyles[status as keyof typeof statusStyles];

  return (
    <div onClick={onClick} className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 active:scale-[0.99] transition-transform">
      <div className="flex justify-between items-center mb-3 border-b border-slate-50 pb-2">
        <div className="flex items-center gap-2">
          <Store size={14} className="text-slate-400" />
          <span className="text-xs font-bold text-slate-700">{store}</span>
          <ArrowRight size={12} className="text-slate-300" />
        </div>
        <span className={cn("text-xs font-medium px-2 py-0.5 rounded-full", s.bg, s.color)}>
          {s.label}
        </span>
      </div>
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-base font-bold text-slate-900 mb-1">{service}</h3>
          <p className="text-xs text-slate-400 font-medium mb-0.5">预约时间: {time}</p>
        </div>
        <div className="text-base font-bold text-slate-900">{price}</div>
      </div>
      
      {status === 'pending' && (
        <div className="mt-3 flex justify-end gap-2">
          <Button size="sm" variant="outline" className="h-8 text-xs">取消</Button>
          <Button size="sm" variant="outline" className="h-8 text-xs">改期</Button>
        </div>
      )}
    </div>
  );
};
