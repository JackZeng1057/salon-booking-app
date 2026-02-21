import React, { useState } from "react";
import { MobileContainer, BottomTabBar, BarberTabBar, AdminTabBar } from "./components/ui/layout";
import { BarberList } from "./components/ui/BarberList";
import { BarberDetail } from "./components/ui/BarberDetail";
import { BookingForm, SuccessView } from "./components/ui/BookingForm";

// Batch 1 Pages
import { UserHome, StoreList, StoreDetail, OrderList } from "./pages/user/batch1";
import { AIConsultant } from "./pages/user/AIConsultant";

// Batch 2 Pages
import { 
  OrderDetail, NotificationList, NotificationDetail, 
  SettingsIndex, SettingsProfile, SettingsPhone, SettingsPassword 
} from "./pages/user/batch2";

// Barber Pages
import { BarberSchedule, BarberOrders, BarberNotificationList } from "./pages/barber/index";

// Admin Pages
import { 
  AdminManage, AdminDashboard, AdminVerify, AdminOrders, 
  AdminAfterSales, AdminStoreSettings, AdminBarberApprovals, AdminSettings 
} from "./pages/admin/index";

// Navigation State Types
type View = 
  // Core
  "home" | "barber_list" | "barber_detail" | "booking" | "success" |
  // Store
  "store_list" | "store_detail" |
  // AI Consultant
  "ai_consultant" |
  // Orders
  "order_list" | "order_detail" |
  // Notifications
  "notifications" | "notification_detail" |
  // Settings
  "profile" | "settings_index" | "settings_profile" | "settings_phone" | "settings_password" |
  // Barber Side
  "barber_schedule" | "barber_orders" | "barber_notifications" |
  // Admin Side
  "admin_manage" | "admin_dashboard" | "admin_verify" | "admin_orders" | 
  "admin_aftersales" | "admin_store_settings" | "admin_barber_approvals" | "admin_settings";

export default function App() {
  const [currentView, setCurrentView] = useState<View>("home");
  const [activeTab, setActiveTab] = useState("home");
  const [userRole, setUserRole] = useState<"user" | "barber" | "admin">("user");
  
  // Navigation Handler
  const navigate = (page: string) => {
    // Map string to View type safely
    setCurrentView(page as View);
  };

  const handleBack = () => {
    // Simple back logic stack simulation
    const backMap: Record<string, View> = {
      "barber_list": "store_detail",
      "barber_detail": "barber_list",
      "booking": "barber_detail",
      "success": "home",
      
      "store_detail": "store_list",
      "store_list": "home",

      "ai_consultant": "home",
      
      "order_detail": "order_list",
      "order_list": "home",
      
      "notifications": "home",
      "notification_detail": "notifications",
      
      "settings_index": "profile",
      "settings_profile": "settings_index",
      "settings_phone": "settings_index",
      "settings_password": "settings_index",
      
      "profile": "home", // Fallback

      // Barber Back Routes
      "barber_orders": "barber_schedule",
      "barber_notifications": "barber_schedule",

      // Admin Back Routes
      "admin_dashboard": "admin_manage",
      "admin_verify": "admin_manage",
      "admin_orders": "admin_manage",
      "admin_aftersales": "admin_orders", // Go back to order list
      "admin_store_settings": "admin_manage",
      "admin_barber_approvals": "admin_manage",
      "admin_settings": "admin_manage",
    };
    
    // If coming from specific flows
    if (currentView === "barber_detail" && activeTab === "home") setCurrentView("store_detail"); 
    else if (backMap[currentView]) setCurrentView(backMap[currentView]);
    else setCurrentView(userRole === "barber" ? "barber_schedule" : (userRole === "admin" ? "admin_manage" : "home"));
  };

  // Tab Switching Logic
  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    if (userRole === "user") {
        if (tab === "home") setCurrentView("home");
        if (tab === "ai_consultant") setCurrentView("ai_consultant");
        if (tab === "appointments") setCurrentView("order_list");
        if (tab === "profile") setCurrentView("settings_index"); 
    } else if (userRole === "barber") {
        if (tab === "schedule") setCurrentView("barber_schedule");
        if (tab === "orders") setCurrentView("barber_orders");
    } else {
        // Admin
        if (tab === "manage") setCurrentView("admin_manage");
        if (tab === "verify") setCurrentView("admin_verify");
        if (tab === "orders") setCurrentView("admin_orders");
        if (tab === "store") setCurrentView("admin_store_settings");
    }
  };

  // Switch Role Helper
  const toggleRole = () => {
    // Cycle: user -> barber -> admin -> user
    const nextRole = userRole === "user" ? "barber" : (userRole === "barber" ? "admin" : "user");
    setUserRole(nextRole);
    if (nextRole === "user") {
        setActiveTab("home");
        setCurrentView("home");
    } else if (nextRole === "barber") {
        setActiveTab("schedule");
        setCurrentView("barber_schedule");
    } else {
        setActiveTab("manage");
        setCurrentView("admin_manage");
    }
  };

  return (
    <div className="bg-slate-200 min-h-screen font-sans text-slate-900 selection:bg-emerald-100">
      <MobileContainer>
        <div className="h-full flex flex-col relative bg-slate-50">
          
          {/* --- Tab Views --- */}
          
          {/* Home Tab */}
          {currentView === "home" && <UserHome onNavigate={navigate} />}
          
          {/* Store Flow */}
          {currentView === "store_list" && <StoreList onBack={handleBack} onNavigate={navigate} />}
          {currentView === "store_detail" && <StoreDetail onBack={handleBack} onNavigate={navigate} />}

          {/* AI Consultant */}
          {currentView === "ai_consultant" && <AIConsultant onBack={handleBack} onNavigate={navigate} />}
          
          {/* Barber Flow (Reused) */}
          {currentView === "barber_list" && <BarberList onSelect={() => navigate("barber_detail")} />}
          {currentView === "barber_detail" && <BarberDetail onBack={handleBack} onBook={() => navigate("booking")} />}
          {currentView === "booking" && <BookingForm onBack={handleBack} onSuccess={() => navigate("success")} />}
          {currentView === "success" && <SuccessView onHome={() => { navigate("home"); setActiveTab("home"); }} />}

          {/* Order Flow */}
          {currentView === "order_list" && <OrderList onBack={() => { navigate("home"); setActiveTab("home"); }} onNavigate={navigate} />}
          {currentView === "order_detail" && <OrderDetail onBack={handleBack} />}

          {/* Notifications */}
          {currentView === "notifications" && <NotificationList onBack={handleBack} onNavigate={navigate} />}
          {currentView === "notification_detail" && <NotificationDetail onBack={handleBack} />}

          {/* Settings Flow */}
          {currentView === "settings_index" && <SettingsIndex onBack={() => { navigate("home"); setActiveTab("home"); }} onNavigate={navigate} />}
          {currentView === "settings_profile" && <SettingsProfile onBack={handleBack} />}
          {currentView === "settings_phone" && <SettingsPhone onBack={handleBack} />}
          {currentView === "settings_password" && <SettingsPassword onBack={handleBack} />}

          {/* Barber Side Views */}
          {currentView === "barber_schedule" && <BarberSchedule onBack={handleBack} onNavigate={navigate} />}
          {currentView === "barber_orders" && <BarberOrders onBack={handleBack} onNavigate={navigate} />}
          {currentView === "barber_notifications" && <BarberNotificationList onBack={handleBack} onNavigate={navigate} />}

          {/* Admin Side Views */}
          {currentView === "admin_manage" && <AdminManage onNavigate={navigate} />}
          {currentView === "admin_dashboard" && <AdminDashboard onBack={handleBack} />}
          {currentView === "admin_verify" && <AdminVerify onBack={handleBack} />}
          {currentView === "admin_orders" && <AdminOrders onBack={handleBack} onNavigate={navigate} />}
          {currentView === "admin_aftersales" && <AdminAfterSales onBack={handleBack} />}
          {currentView === "admin_store_settings" && <AdminStoreSettings onBack={handleBack} />}
          {currentView === "admin_barber_approvals" && <AdminBarberApprovals onBack={handleBack} />}
          {currentView === "admin_settings" && <AdminSettings onBack={handleBack} />}

          {/* Global Tab Bar (Visible on top-level views) */}
          {userRole === "user" && ["home", "order_list", "settings_index", "store_list", "ai_consultant"].includes(currentView) && (
            <BottomTabBar activeTab={activeTab} onTabChange={handleTabChange} />
          )}

          {userRole === "barber" && ["barber_schedule", "barber_orders", "barber_notifications"].includes(currentView) && (
            <BarberTabBar activeTab={activeTab === "notifications" ? "notifications" : (activeTab === "orders" ? "orders" : "schedule")} onTabChange={(t) => {
               if (t === "schedule") { setActiveTab("schedule"); setCurrentView("barber_schedule"); }
               if (t === "orders") { setActiveTab("orders"); setCurrentView("barber_orders"); }
               if (t === "notifications") { setActiveTab("notifications"); setCurrentView("barber_notifications"); }
            }} />
          )}

          {userRole === "admin" && ["admin_manage", "admin_orders", "admin_verify", "admin_store_settings"].includes(currentView) && (
             <AdminTabBar activeTab={activeTab} onTabChange={handleTabChange} />
          )}

          {/* Role Toggle for Demo */}
          <button 
            onClick={toggleRole}
            className="absolute top-20 right-0 bg-black/50 text-white text-[10px] px-2 py-1 rounded-l-md z-[100]"
          >
            {userRole === "user" ? "To Barber" : (userRole === "barber" ? "To Admin" : "To User")}
          </button>


        </div>
      </MobileContainer>
    </div>
  );
}