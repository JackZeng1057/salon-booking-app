import React from "react";
// import { motion } from "motion/react";
import { MapPin, Phone, MessageSquare, Clock, ArrowRight, User, Settings, Shield, Bell, LogOut, ChevronRight, Camera, QrCode, FileText } from "lucide-react";
import { cn } from "../../../lib/utils";
import { Button, NavBar, Input } from "../../components/ui/core";
import { SwipeActionRow } from "../../components/ui/swipe-action";

// 5. Order Detail (pages/order/detail)
export const OrderDetail = ({ onBack }: { onBack: () => void }) => {
  return (
    <div className="bg-slate-50 min-h-screen pb-24 relative flex flex-col">
      <NavBar title="预约详情" onBack={onBack} />
      
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        {/* Status Card */}
        <div className="bg-white p-6 rounded-3xl shadow-lg shadow-slate-200/50 text-center relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-400 to-teal-500" />
          <h2 className="text-xl font-bold text-slate-900 mb-1">待服务</h2>
          <p className="text-xs text-slate-400 mb-6">请向店员出示此二维码核销</p>
          
          <div className="w-48 h-48 mx-auto bg-slate-50 rounded-2xl p-4 border border-slate-100 flex items-center justify-center mb-4">
            <QrCode size={120} className="text-slate-900" />
          </div>
          <p className="text-sm font-mono text-slate-500 tracking-widest font-bold">NO.8392 1029</p>
        </div>

        {/* Info Card */}
        <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 space-y-4">
          <InfoRow label="门店" value="蕴含造型 (国贸店)" />
          <InfoRow label="发型师" value="Tony 总监" />
          <InfoRow label="服务项目" value="精细剪发" />
          <InfoRow label="预约时间" value="2023-10-24 14:00" highlight />
          <InfoRow label="支付金额" value="¥88.00" />
        </div>

        {/* Address Card */}
        <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex items-center justify-between">
          <div className="flex-1">
             <h3 className="text-sm font-bold text-slate-900 mb-1">蕴含造型 (国贸店)</h3>
             <p className="text-xs text-slate-500">朝阳区建国门外大街1号国贸商城3期</p>
          </div>
          <div className="flex gap-3 pl-4 border-l border-slate-100">
             <button className="w-8 h-8 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center">
               <Phone size={16} />
             </button>
             <button className="w-8 h-8 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center">
               <MapPin size={16} />
             </button>
          </div>
        </div>
      </div>

      {/* Action Bar */}
      <div className="bg-white border-t border-slate-100 p-4 pb-8 safe-area-bottom">
        <div className="grid grid-cols-2 gap-3">
          <Button variant="outline">取消预约</Button>
          <Button>修改时间</Button>
        </div>
      </div>
    </div>
  );
};

// 6. Notifications List (pages/user/notifications/index)
export const NotificationList = ({ onBack, onNavigate }: { onBack: () => void; onNavigate: (page: string) => void }) => {
  const [notifications, setNotifications] = React.useState([
    { id: 1, title: "预约提醒", desc: "您预约的剪发服务将在2小时后开始，请准时到店。", time: "10:00", read: false },
    { id: 2, title: "系统通知", desc: "系统维护升级通知，请点击查看详情。", time: "昨天", read: true },
    { id: 3, title: "优惠活动", desc: "双11特惠活动开启，全场5折起！", time: "10-20", read: true },
  ]);

  const handleDelete = (id: number) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  return (
    <div className="bg-slate-50 min-h-screen pb-24 relative flex flex-col">
      <NavBar 
        title="消息中心" 
        onBack={onBack} 
        rightAction={<button className="text-xs font-medium text-slate-500">全部已读</button>}
      />
      
      <div className="flex-1 overflow-y-auto pt-2">
        {notifications.map((item) => (
          <SwipeActionRow key={item.id} onDelete={() => handleDelete(item.id)} className="mb-[1px]">
            <div 
              onClick={() => onNavigate("notification_detail")}
              className={cn(
                "p-4 flex gap-3 items-start active:bg-slate-50 transition-colors",
                !item.read ? "bg-white" : "bg-slate-50/50"
              )}
            >
              <div className={cn(
                "w-10 h-10 rounded-full flex items-center justify-center shrink-0",
                !item.read ? "bg-emerald-100 text-emerald-600" : "bg-slate-200 text-slate-500"
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
        
        {notifications.length === 0 && (
          <div className="flex flex-col items-center justify-center pt-32 text-slate-400">
            <Bell size={48} className="mb-4 opacity-20" />
            <p className="text-xs">暂无消息</p>
          </div>
        )}
      </div>
    </div>
  );
};

// 7. Notification Detail
export const NotificationDetail = ({ onBack }: { onBack: () => void }) => {
  return (
    <div className="bg-slate-50 min-h-screen relative">
      <NavBar title="消息详情" onBack={onBack} />
      <div className="p-5">
        <h1 className="text-xl font-bold text-slate-900 mb-2">预约提醒</h1>
        <p className="text-xs text-slate-400 mb-6">2023-10-24 10:00</p>
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 text-sm text-slate-600 leading-relaxed">
          尊敬的用户，您预约的【精细剪发】服务将在今天下午 14:00 开始。
          <br /><br />
          请您提前 10 分钟到达门店：蕴含造型 (国贸店)。
          <br /><br />
          如需取消或改期，请至少提前 2 小时操作。祝您生活愉快！
        </div>
      </div>
    </div>
  );
};

// 8. Settings Index (pages/user/settings/index)
export const SettingsIndex = ({ onBack, onNavigate }: { onBack: () => void; onNavigate: (page: string) => void }) => {
  return (
    <div className="bg-slate-50 min-h-screen relative flex flex-col">
      <NavBar title="设置" onBack={onBack} />
      
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        {/* Profile Group */}
        <div className="bg-white rounded-2xl overflow-hidden shadow-sm border border-slate-100">
          <SettingsItem 
            icon={User} label="个人资料" 
            onClick={() => onNavigate("settings_profile")} 
          />
          <div className="h-px bg-slate-50 mx-4" />
          <SettingsItem 
            icon={Phone} label="绑定手机号" value="138****8000" 
            onClick={() => onNavigate("settings_phone")} 
          />
          <div className="h-px bg-slate-50 mx-4" />
          <SettingsItem 
            icon={Shield} label="修改密码" 
            onClick={() => onNavigate("settings_password")} 
          />
        </div>

        {/* App Info Group */}
        <div className="bg-white rounded-2xl overflow-hidden shadow-sm border border-slate-100">
          <SettingsItem icon={MessageSquare} label="意见反馈" />
          <div className="h-px bg-slate-50 mx-4" />
          <SettingsItem icon={FileText} label="用户协议" />
          <div className="h-px bg-slate-50 mx-4" />
          <SettingsItem icon={Settings} label="关于我们" value="v2.0.1" />
        </div>

        <Button variant="danger" fullWidth className="mt-8 bg-white border border-red-100 text-red-500 hover:bg-red-50 shadow-sm">
          退出登录
        </Button>
      </div>
    </div>
  );
};

// 9. Settings Subpages
export const SettingsProfile = ({ onBack }: { onBack: () => void }) => (
  <div className="bg-slate-50 min-h-screen relative">
    <NavBar title="个人资料" onBack={onBack} rightAction={<Button size="sm" variant="ghost" className="text-emerald-600 font-bold">保存</Button>} />
    <div className="p-5 space-y-6">
      <div className="flex flex-col items-center py-4">
        <div className="relative">
          <img 
            src="https://images.unsplash.com/photo-1527980965255-d3b416303d12?auto=format&fit=crop&q=80&w=200" 
            className="w-24 h-24 rounded-full border-4 border-white shadow-md object-cover" 
          />
          <button className="absolute bottom-0 right-0 w-8 h-8 bg-slate-900 rounded-full flex items-center justify-center text-white border-2 border-white">
            <Camera size={14} />
          </button>
        </div>
      </div>
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 space-y-4">
        <Input label="昵称" defaultValue="James" />
        <Input label="性别" defaultValue="男" />
        <Input label="生日" defaultValue="1995-08-20" />
      </div>
    </div>
  </div>
);

export const SettingsPhone = ({ onBack }: { onBack: () => void }) => (
  <div className="bg-slate-50 min-h-screen relative">
    <NavBar title="绑定手机号" onBack={onBack} />
    <div className="p-5 space-y-6">
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 space-y-4">
        <Input label="当前手机号" defaultValue="138****8000" disabled />
        <Input label="新手机号" placeholder="请输入新手机号" />
        <div className="flex gap-3 items-end">
          <Input label="验证码" placeholder="4位验证码" className="flex-1" />
          <Button variant="outline" className="h-12 w-28 text-xs">获取验证码</Button>
        </div>
      </div>
      <Button fullWidth>确认绑定</Button>
    </div>
  </div>
);

export const SettingsPassword = ({ onBack }: { onBack: () => void }) => (
  <div className="bg-slate-50 min-h-screen relative">
    <NavBar title="修改密码" onBack={onBack} />
    <div className="p-5 space-y-6">
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 space-y-4">
        <Input label="旧密码" type="password" placeholder="请输入旧密码" />
        <Input label="新密码" type="password" placeholder="请输入新密码 (6-20位)" />
        <Input label="确认新密码" type="password" placeholder="请再次输入新密码" />
      </div>
      <Button fullWidth>确认修改</Button>
    </div>
  </div>
);

// --- Helpers ---
const InfoRow = ({ label, value, highlight }: any) => (
  <div className="flex justify-between items-center py-1">
    <span className="text-xs text-slate-500">{label}</span>
    <span className={cn("text-sm font-medium text-slate-900", highlight && "text-emerald-600 font-bold")}>{value}</span>
  </div>
);

const SettingsItem = ({ icon: Icon, label, value, onClick }: any) => (
  <button onClick={onClick} className="w-full flex items-center justify-between p-4 active:bg-slate-50 transition-colors">
    <div className="flex items-center gap-3">
      <div className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center text-slate-500">
        <Icon size={16} />
      </div>
      <span className="text-sm font-medium text-slate-900">{label}</span>
    </div>
    <div className="flex items-center gap-2">
      {value && <span className="text-xs text-slate-400">{value}</span>}
      <ChevronRight size={16} className="text-slate-300" />
    </div>
  </button>
);
