import React, { useState } from "react";
import { 
  LayoutDashboard, 
  Store, 
  Users, 
  FileText, 
  Settings, 
  LogOut, 
  ChevronRight, 
  Bell, 
  ScanLine, 
  TrendingUp, 
  DollarSign, 
  Calendar, 
  UserCheck, 
  AlertCircle, 
  CheckCircle, 
  XCircle, 
  Search, 
  ArrowUpRight, 
  ArrowDownRight,
  Filter,
  MoreHorizontal,
  Camera,
  MapPin,
  Clock,
  Phone
} from "lucide-react";
import { cn } from "../../../lib/utils";
import { Button, NavBar, Input } from "../../components/ui/core";
import { SwipeActionRow } from "../../components/ui/swipe-action";

// --- Types ---
interface Order {
  id: string;
  customer: string;
  service: string;
  amount: string;
  status: "pending" | "completed" | "cancelled" | "refund_pending";
  time: string;
  barber: string;
}

interface BarberRequest {
  id: string;
  name: string;
  type: "new_join" | "profile_update";
  time: string;
  status: "pending" | "approved" | "rejected";
  avatar: string;
}

// --- 1. Admin Home (Manage Index) ---
export const AdminManage = ({ onNavigate }: { onNavigate: (page: string) => void }) => {
  return (
    <div className="bg-slate-50 min-h-screen pb-24 relative flex flex-col">
      {/* Header */}
      <div className="bg-slate-900 text-white p-6 pb-12 rounded-b-[32px] shadow-lg shadow-slate-900/20 relative z-10">
        <div className="flex justify-between items-center mb-6">
          <div>
            <p className="text-xs text-slate-400 mb-1">管理员工作台</p>
            <h1 className="text-xl font-bold">蕴含造型 (国贸店)</h1>
          </div>
          <button onClick={() => onNavigate("admin_settings")} className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center backdrop-blur-sm border border-white/10">
            <Settings size={20} />
          </button>
        </div>

        {/* Quick Stats Summary */}
        <div className="flex justify-between items-end mb-2">
          <div>
            <p className="text-xs text-slate-400 mb-1">今日营收 (元)</p>
            <h2 className="text-3xl font-bold font-mono">¥2,880.00</h2>
          </div>
          <div className="text-right">
            <div className="flex items-center text-emerald-400 text-xs font-bold bg-emerald-400/10 px-2 py-1 rounded-lg border border-emerald-400/20">
              <TrendingUp size={12} className="mr-1" />
              +12.5%
            </div>
          </div>
        </div>
      </div>

      {/* Main Action Grid */}
      <div className="-mt-8 px-5 grid grid-cols-2 gap-3 relative z-20">
        <div 
          onClick={() => onNavigate("admin_verify")}
          className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex flex-col items-center justify-center gap-2 aspect-[4/3] active:scale-95 transition-transform"
        >
          <div className="w-12 h-12 rounded-full bg-slate-900 text-white flex items-center justify-center shadow-lg shadow-slate-900/20">
            <ScanLine size={24} />
          </div>
          <span className="font-bold text-slate-900">扫码核销</span>
        </div>
        <div 
          onClick={() => onNavigate("admin_dashboard")}
          className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex flex-col items-center justify-center gap-2 aspect-[4/3] active:scale-95 transition-transform"
        >
          <div className="w-12 h-12 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-100">
            <LayoutDashboard size={24} />
          </div>
          <span className="font-bold text-slate-900">数据看板</span>
        </div>
      </div>

      {/* Management Sections */}
      <div className="px-5 mt-6 space-y-6 flex-1 overflow-y-auto pb-4">
        {/* Store Management */}
        <section>
          <h3 className="text-sm font-bold text-slate-900 mb-3 px-1">门店管理</h3>
          <div className="bg-white rounded-2xl overflow-hidden shadow-sm border border-slate-100">
            <MenuItem icon={Store} label="门店信息设置" onClick={() => onNavigate("admin_store_settings")} />
            <div className="h-px bg-slate-50 mx-4" />
            <MenuItem icon={Users} label="理发师审核" badge="2" onClick={() => onNavigate("admin_barber_approvals")} />
          </div>
        </section>

        {/* Order Management */}
        <section>
          <h3 className="text-sm font-bold text-slate-900 mb-3 px-1">订单处理</h3>
          <div className="bg-white rounded-2xl overflow-hidden shadow-sm border border-slate-100">
            <MenuItem icon={FileText} label="订单列表" onClick={() => onNavigate("admin_orders")} />
            <div className="h-px bg-slate-50 mx-4" />
            <MenuItem icon={AlertCircle} label="售后处理" badge="1" onClick={() => onNavigate("admin_aftersales")} />
          </div>
        </section>
      </div>
    </div>
  );
};

// --- 2. Admin Dashboard (Stats) ---
export const AdminDashboard = ({ onBack }: { onBack: () => void }) => {
  return (
    <div className="bg-slate-50 min-h-screen relative flex flex-col">
      <NavBar title="数据看板" onBack={onBack} />
      
      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        {/* Date Filter */}
        <div className="flex gap-2 mb-2 overflow-x-auto no-scrollbar">
          {["今日", "昨日", "本周", "本月"].map((t, i) => (
            <button key={t} className={cn("px-4 py-1.5 rounded-full text-xs font-medium border", i === 0 ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-500 border-slate-200")}>
              {t}
            </button>
          ))}
        </div>

        {/* Overview Cards */}
        <div className="grid grid-cols-2 gap-3">
          <StatCard title="营业额" value="¥2,880" trend="+12%" positive />
          <StatCard title="订单量" value="32" trend="-5%" />
          <StatCard title="客单价" value="¥90" trend="+2%" positive />
          <StatCard title="新增会员" value="5" trend="+1" positive />
        </div>

        {/* Visual Chart Placeholder */}
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
          <div className="flex justify-between items-center mb-6">
            <h3 className="font-bold text-slate-900">实时客流趋势</h3>
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <span className="w-2 h-2 rounded-full bg-slate-900" />
              今日
              <span className="w-2 h-2 rounded-full bg-slate-200" />
              昨日
            </div>
          </div>
          
          <div className="h-40 flex items-end justify-between gap-2 px-2">
            {[40, 60, 30, 80, 50, 90, 70, 40, 60, 30, 80, 50].map((h, i) => (
              <div key={i} className="w-full bg-slate-100 rounded-t-sm relative group">
                <div 
                  className="absolute bottom-0 w-full bg-slate-900 rounded-t-sm transition-all duration-500" 
                  style={{ height: `${h}%` }} 
                />
              </div>
            ))}
          </div>
          <div className="flex justify-between mt-2 text-[10px] text-slate-400 px-1">
            <span>10:00</span>
            <span>14:00</span>
            <span>18:00</span>
            <span>22:00</span>
          </div>
        </div>

        {/* Barber Performance */}
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
          <h3 className="font-bold text-slate-900 mb-4">理发师业绩排名</h3>
          <div className="space-y-4">
            {[
              { name: "Tony 总监", amount: "¥1,280", count: 12, rank: 1 },
              { name: "Kevin 老师", amount: "¥880", count: 8, rank: 2 },
              { name: "Allen 老师", amount: "¥720", count: 12, rank: 3 },
            ].map((b) => (
              <div key={b.name} className="flex items-center gap-3">
                <div className={cn(
                  "w-5 h-5 rounded flex items-center justify-center text-xs font-bold",
                  b.rank === 1 ? "bg-yellow-100 text-yellow-700" : 
                  b.rank === 2 ? "bg-slate-200 text-slate-600" : "bg-orange-50 text-orange-600"
                )}>
                  {b.rank}
                </div>
                <div className="flex-1">
                  <div className="flex justify-between mb-1">
                    <span className="text-sm font-medium text-slate-900">{b.name}</span>
                    <span className="text-sm font-bold text-slate-900">{b.amount}</span>
                  </div>
                  <div className="w-full bg-slate-50 h-1.5 rounded-full overflow-hidden">
                    <div className="bg-emerald-500 h-full rounded-full" style={{ width: `${(parseInt(b.amount.slice(1).replace(',','')) / 1500) * 100}%` }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

// --- 3. Admin Verify (Check-in) ---
export const AdminVerify = ({ onBack }: { onBack: () => void }) => {
  return (
    <div className="bg-slate-900 min-h-screen flex flex-col relative">
      <div className="flex items-center justify-between p-4 text-white safe-area-top">
         <button onClick={onBack} className="p-2 -ml-2 rounded-full hover:bg-white/10">
           <ChevronRight className="rotate-180" />
         </button>
         <span className="font-bold">扫码核销</span>
         <div className="w-8" />
      </div>

      <div className="flex-1 flex flex-col items-center justify-center p-8 -mt-20">
        <div className="w-64 h-64 border-2 border-white/20 rounded-3xl relative flex items-center justify-center overflow-hidden bg-white/5 backdrop-blur-sm">
          <div className="absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 border-emerald-500 rounded-tl-xl" />
          <div className="absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 border-emerald-500 rounded-tr-xl" />
          <div className="absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 border-emerald-500 rounded-bl-xl" />
          <div className="absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 border-emerald-500 rounded-br-xl" />
          
          <div className="w-full h-1 bg-emerald-500/50 absolute top-0 animate-[scan_2s_ease-in-out_infinite]" />
          <p className="text-white/50 text-xs">将二维码放入框内</p>
        </div>
        
        <p className="text-white/70 text-sm mt-8 mb-8">或手动输入核销码</p>
        
        <div className="w-full max-w-xs bg-white rounded-xl p-1 flex pl-4">
          <input 
            type="text" 
            placeholder="输入12位核销码" 
            className="flex-1 bg-transparent outline-none text-slate-900 font-mono text-lg placeholder:text-slate-400 placeholder:text-sm"
          />
          <button className="bg-slate-900 text-white px-6 py-3 rounded-lg font-bold text-sm hover:bg-slate-800">
            确认
          </button>
        </div>
      </div>
    </div>
  );
};

// --- 4. Admin Orders List ---
export const AdminOrders = ({ onBack, onNavigate }: { onBack: () => void; onNavigate: (page: string) => void }) => {
  const [activeTab, setActiveTab] = useState("all");
  
  const orders: Order[] = [
    { id: "1023", customer: "张三", service: "精细剪发", amount: "¥88", status: "pending", time: "14:00", barber: "Tony" },
    { id: "1022", customer: "李四", service: "染发套餐", amount: "¥388", status: "completed", time: "10:30", barber: "Kevin" },
    { id: "1021", customer: "王五", service: "洗吹造型", amount: "¥58", status: "cancelled", time: "Yesterday", barber: "Allen" },
    { id: "1020", customer: "赵六", service: "烫发护理", amount: "¥588", status: "refund_pending", time: "Yesterday", barber: "Tony" },
  ];

  return (
    <div className="bg-slate-50 min-h-screen pb-24 relative flex flex-col">
      <NavBar 
        title="订单管理" 
        onBack={onBack} 
        rightAction={<Filter size={20} className="text-slate-600" />}
      />

      <div className="sticky top-[52px] z-20 bg-white border-b border-slate-100 flex overflow-x-auto no-scrollbar px-2">
        {[
          { id: "all", label: "全部" },
          { id: "pending", label: "待核销" },
          { id: "completed", label: "已完成" },
          { id: "refund_pending", label: "售后中" },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "px-4 py-3 text-sm font-medium whitespace-nowrap relative",
              activeTab === tab.id ? "text-slate-900" : "text-slate-500"
            )}
          >
            {tab.label}
            {activeTab === tab.id && <div className="absolute bottom-0 left-4 right-4 h-0.5 bg-slate-900 rounded-full" />}
          </button>
        ))}
      </div>

      <div className="p-5 space-y-4 flex-1 overflow-y-auto">
        {orders.filter(o => activeTab === "all" || o.status === activeTab).map((order) => (
          <div key={order.id} className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100">
            <div className="flex justify-between items-start mb-3 border-b border-slate-50 pb-3">
              <span className="text-xs font-mono text-slate-400">#{order.id}</span>
              <StatusBadge status={order.status} />
            </div>
            <div className="flex justify-between items-center mb-4">
              <div>
                <h3 className="font-bold text-slate-900 mb-0.5">{order.service}</h3>
                <p className="text-xs text-slate-500">顾客: {order.customer} · 理发师: {order.barber}</p>
              </div>
              <div className="text-lg font-bold text-slate-900">{order.amount}</div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="flex-1 h-8 text-xs">查看详情</Button>
              {order.status === "pending" && <Button size="sm" className="flex-1 h-8 text-xs bg-slate-900 text-white">核销订单</Button>}
              {order.status === "refund_pending" && <Button size="sm" className="flex-1 h-8 text-xs bg-red-50 text-red-500 border-red-100 hover:bg-red-100">处理退款</Button>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// --- 5. Admin After Sales ---
export const AdminAfterSales = ({ onBack }: { onBack: () => void }) => {
  return (
    <div className="bg-slate-50 min-h-screen relative flex flex-col">
      <NavBar title="售后处理" onBack={onBack} />
      <div className="p-5 space-y-4">
        <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100">
           <div className="flex justify-between mb-3">
             <div className="flex items-center gap-2">
               <span className="bg-red-50 text-red-500 text-[10px] font-bold px-1.5 py-0.5 rounded">退款申请</span>
               <span className="text-xs text-slate-400">2023-10-24 10:30</span>
             </div>
             <span className="font-bold text-slate-900">¥88.00</span>
           </div>
           <p className="text-sm text-slate-700 mb-2">顾客：赵六 (138****9999)</p>
           <p className="text-xs text-slate-500 bg-slate-50 p-2 rounded-lg mb-4">
             退款理由：临时有事无法到店，理发师未开始服务。
           </p>
           <div className="grid grid-cols-2 gap-3">
             <Button variant="outline" className="border-slate-200 text-slate-600">拒绝</Button>
             <Button className="bg-emerald-500 hover:bg-emerald-600 text-white border-none">同意退款</Button>
           </div>
        </div>
      </div>
    </div>
  );
};

// --- 6. Store Settings ---
export const AdminStoreSettings = ({ onBack }: { onBack: () => void }) => {
  return (
    <div className="bg-slate-50 min-h-screen relative flex flex-col">
      <NavBar title="门店信息设置" onBack={onBack} rightAction={<span className="text-sm font-bold text-emerald-600">保存</span>} />
      <div className="p-5 space-y-6 flex-1 overflow-y-auto">
        <div className="flex justify-center">
           <div className="w-full h-40 bg-slate-200 rounded-2xl flex items-center justify-center relative overflow-hidden group">
             <img src="https://images.unsplash.com/photo-1521590832169-dcb6f5465cbf?w=400" className="w-full h-full object-cover opacity-80" />
             <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
               <Button variant="secondary" size="sm" className="bg-white/90 backdrop-blur text-slate-900"><Camera size={14} className="mr-2" />更换封面</Button>
             </div>
           </div>
        </div>

        <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 space-y-4">
          <Input label="门店名称" defaultValue="蕴含造型 (国贸店)" />
          <Input label="联系电话" defaultValue="STORE_PHONE_PLACEHOLDER" />
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-900">营业时间</label>
            <div className="flex gap-2">
              <input type="time" defaultValue="10:00" className="flex-1 bg-slate-50 h-10 rounded-lg px-3 text-sm outline-none border border-slate-200" />
              <span className="self-center text-slate-400">-</span>
              <input type="time" defaultValue="22:00" className="flex-1 bg-slate-50 h-10 rounded-lg px-3 text-sm outline-none border border-slate-200" />
            </div>
          </div>
          <Input label="详细地址" defaultValue="朝阳区建国门外大街1号" icon={<MapPin size={14} />} />
        </div>
        
        <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-900">营业状态</span>
            <div className="w-10 h-6 bg-emerald-500 rounded-full relative cursor-pointer"><div className="absolute top-1 right-1 w-4 h-4 bg-white rounded-full shadow-sm" /></div>
          </div>
        </div>
      </div>
    </div>
  );
};

// --- 7. Barber Approvals ---
export const AdminBarberApprovals = ({ onBack }: { onBack: () => void }) => {
  return (
    <div className="bg-slate-50 min-h-screen relative flex flex-col">
      <NavBar title="理发师审核" onBack={onBack} />
      <div className="p-5 space-y-4">
        <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100">
           <div className="flex gap-3 mb-3">
             <img src="https://images.unsplash.com/photo-1633332755192-727a05c4013d?w=100" className="w-12 h-12 rounded-full object-cover bg-slate-100" />
             <div>
               <h3 className="font-bold text-slate-900">Simon</h3>
               <p className="text-xs text-slate-500">申请加入门店 · 资深发型师</p>
               <p className="text-xs text-slate-400 mt-1">申请时间: 2023-10-24 09:00</p>
             </div>
           </div>
           <div className="bg-slate-50 p-3 rounded-xl text-xs text-slate-600 mb-4">
             自我介绍: 5年从业经验，擅长日韩烫染，曾在知名连锁店任职。
           </div>
           <div className="flex gap-3">
             <Button variant="outline" className="flex-1 border-slate-200 text-slate-600">驳回</Button>
             <Button className="flex-1 bg-slate-900 text-white">通过申请</Button>
           </div>
        </div>
      </div>
    </div>
  );
};

// --- 8. Admin Settings ---
export const AdminSettings = ({ onBack }: { onBack: () => void }) => {
  return (
    <div className="bg-slate-50 min-h-screen relative flex flex-col">
      <NavBar title="账号设置" onBack={onBack} />
      <div className="p-5 space-y-4">
        <div className="bg-white rounded-2xl overflow-hidden shadow-sm border border-slate-100">
          <MenuItem icon={User} label="管理员资料" value="店长" />
          <div className="h-px bg-slate-50 mx-4" />
          <MenuItem icon={Shield} label="修改密码" />
          <div className="h-px bg-slate-50 mx-4" />
          <MenuItem icon={Bell} label="通知设置" />
        </div>
        <Button variant="danger" fullWidth className="mt-8 bg-white border border-red-100 text-red-500 hover:bg-red-50 shadow-sm">
          退出登录
        </Button>
      </div>
    </div>
  );
};

// --- Helpers ---
const MenuItem = ({ icon: Icon, label, value, badge, onClick }: any) => (
  <button onClick={onClick} className="w-full flex items-center justify-between p-4 active:bg-slate-50 transition-colors">
    <div className="flex items-center gap-3">
      <div className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center text-slate-500">
        <Icon size={16} />
      </div>
      <span className="text-sm font-medium text-slate-900">{label}</span>
      {badge && <span className="bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full ml-2">{badge}</span>}
    </div>
    <div className="flex items-center gap-2">
      {value && <span className="text-xs text-slate-400">{value}</span>}
      <ChevronRight size={16} className="text-slate-300" />
    </div>
  </button>
);

const StatCard = ({ title, value, trend, positive }: any) => (
  <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex flex-col justify-between h-24">
    <span className="text-xs text-slate-400">{title}</span>
    <div className="flex items-end justify-between">
      <span className="text-xl font-bold text-slate-900">{value}</span>
      <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded", positive ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-500")}>
        {trend}
      </span>
    </div>
  </div>
);

const StatusBadge = ({ status }: { status: Order["status"] }) => {
  const styles = {
    pending: "bg-emerald-50 text-emerald-600",
    completed: "bg-slate-100 text-slate-500",
    cancelled: "bg-red-50 text-red-400",
    refund_pending: "bg-orange-50 text-orange-600",
  };
  const labels = {
    pending: "待核销",
    completed: "已完成",
    cancelled: "已取消",
    refund_pending: "售后中",
  };
  return (
    <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full", styles[status])}>
      {labels[status]}
    </span>
  );
};
