import React, { useState, useRef, useEffect } from "react";
import { Send, Camera, Image as ImageIcon, Sparkles, User, Bot, ArrowLeft } from "lucide-react";
import { cn } from "../../../lib/utils";
import { Button } from "../../components/ui/core";

interface Message {
  id: string;
  type: "user" | "ai";
  content: string;
  image?: string;
  options?: string[];
}

export const AIConsultant = ({ onBack, onNavigate }: { onBack: () => void; onNavigate: (page: string) => void }) => {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "1",
      type: "ai",
      content: "你好！我是您的专属 AI 造型顾问。我可以帮您分析脸型、推荐发型，或者解答关于头发护理的问题。",
      options: ["分析我的脸型", "推荐适合我的发型", "2026 流行趋势"],
    },
  ]);
  const [inputValue, setInputValue] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = () => {
    if (!inputValue.trim()) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      type: "user",
      content: inputValue,
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputValue("");

    // Simulate AI response
    setTimeout(() => {
      const aiMsg: Message = {
        id: (Date.now() + 1).toString(),
        type: "ai",
        content: "收到！正在为您分析... (这是一个演示回复，实际功能将连接 AI 模型)",
      };
      setMessages((prev) => [...prev, aiMsg]);
    }, 1000);
  };

  const handleOptionClick = (option: string) => {
    const userMsg: Message = {
      id: Date.now().toString(),
      type: "user",
      content: option,
    };
    setMessages((prev) => [...prev, userMsg]);

    // Simulate specific AI response
    setTimeout(() => {
      let responseContent = "好的，让我们开始吧！";
      if (option.includes("脸型")) {
        responseContent = "请上传一张正面无遮挡的照片，我会为您分析脸型特征。";
      } else if (option.includes("推荐")) {
        responseContent = "您更倾向于长发还是短发？或者想要尝试染发吗？";
      } else if (option.includes("趋势")) {
        responseContent = "2026年的流行趋势包括：\n1. 层次感极强的狼尾剪\n2. 冷棕色系染发\n3. 复古羊毛卷\n\n您对哪个感兴趣？";
      }

      const aiMsg: Message = {
        id: (Date.now() + 1).toString(),
        type: "ai",
        content: responseContent,
      };
      setMessages((prev) => [...prev, aiMsg]);
    }, 1000);
  };

  return (
    <div className="bg-slate-50 h-full flex flex-col relative">
      {/* Header - Fixed */}
      <div className="bg-slate-900 pt-12 pb-4 px-4 shadow-lg z-10 sticky top-0">
        <div className="flex items-center justify-between">
            <h1 className="text-lg font-bold text-white flex items-center gap-2">
              <Sparkles className="text-emerald-400" size={20} />
              AI 造型顾问
            </h1>
            <button className="text-xs text-slate-400 border border-slate-700 rounded-full px-3 py-1">
                重置对话
            </button>
        </div>
        <p className="text-xs text-slate-400 mt-1 pl-7">基于您的个人特征提供专业建议</p>
      </div>

      {/* Chat Area - Scrollable */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6 pb-24">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={cn(
              "flex gap-3 max-w-[85%]",
              msg.type === "user" ? "ml-auto flex-row-reverse" : ""
            )}
          >
            {/* Avatar */}
            <div className={cn(
              "w-8 h-8 rounded-full flex items-center justify-center shrink-0",
              msg.type === "ai" ? "bg-slate-900 text-emerald-400 border border-slate-800" : "bg-emerald-100 text-emerald-700"
            )}>
              {msg.type === "ai" ? <Bot size={18} /> : <User size={18} />}
            </div>

            {/* Bubble */}
            <div className="space-y-2">
                <div
                  className={cn(
                    "p-3 rounded-2xl text-sm leading-relaxed shadow-sm",
                    msg.type === "ai"
                      ? "bg-white text-slate-800 rounded-tl-none border border-slate-100"
                      : "bg-emerald-500 text-white rounded-tr-none"
                  )}
                >
                  {msg.content.split('\n').map((line, i) => (
                    <p key={i} className={i > 0 ? "mt-1" : ""}>{line}</p>
                  ))}
                </div>
                
                {/* Options (Only for AI) */}
                {msg.options && (
                    <div className="flex flex-wrap gap-2">
                        {msg.options.map((opt, idx) => (
                            <button
                                key={idx}
                                onClick={() => handleOptionClick(opt)}
                                className="bg-emerald-50 text-emerald-700 text-xs px-3 py-1.5 rounded-full border border-emerald-100 active:scale-95 transition-transform"
                            >
                                {opt}
                            </button>
                        ))}
                    </div>
                )}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area - Fixed Bottom (above TabBar) */}
      <div className="bg-white border-t border-slate-100 p-3 pb-safe sticky bottom-0 z-20">
        <div className="flex gap-2 items-center bg-slate-50 px-3 py-2 rounded-2xl border border-slate-200">
          <button className="text-slate-400 p-1 hover:text-emerald-600 transition-colors">
            <Camera size={20} />
          </button>
          <button className="text-slate-400 p-1 hover:text-emerald-600 transition-colors">
            <ImageIcon size={20} />
          </button>
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder="输入您的问题..."
            className="flex-1 bg-transparent outline-none text-sm text-slate-900 placeholder:text-slate-400"
          />
          <button
            onClick={handleSend}
            disabled={!inputValue.trim()}
            className={cn(
              "p-2 rounded-xl transition-all",
              inputValue.trim() 
                ? "bg-slate-900 text-emerald-400 shadow-md active:scale-90" 
                : "bg-slate-200 text-slate-400 cursor-not-allowed"
            )}
          >
            <Send size={18} />
          </button>
        </div>
      </div>
    </div>
  );
};
