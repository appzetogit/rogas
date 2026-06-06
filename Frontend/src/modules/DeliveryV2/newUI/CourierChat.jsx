import { useState, useRef, useEffect } from "react";
import { ArrowLeft, Phone, Send, Plus } from "lucide-react";
const CourierChat = ({ onGoBack, vendorName }) => {
  const [messages, setMessages] = useState([
    {
      id: "msg_1",
      sender: "merchant",
      senderName: `${vendorName} (Automated)`,
      text: "Hello! Your order has been received and we're starting to prep it now. We'll let you know when it's ready for pickup.",
      timeText: "11:45 AM"
    },
    {
      id: "msg_2",
      sender: "driver",
      text: "Thanks! I'm about 5 minutes away.",
      timeText: "11:47 AM",
      isRead: true
    },
    {
      id: "msg_3",
      sender: "merchant",
      senderName: `${vendorName} replied`,
      text: "Perfect! It should be ready right as you arrive. See you soon!",
      timeText: "11:48 AM"
    },
    {
      id: "msg_4",
      sender: "system",
      text: "Order status updated: Ready for Pickup",
      timeText: "11:50 AM"
    }
  ]);
  const [inputValue, setInputValue] = useState("");
  const chatBottomRef = useRef(null);
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);
  const handleSendMessage = (text) => {
    if (!text.trim()) return;
    const newMessage = {
      id: `msg_${Date.now()}`,
      sender: "driver",
      text: text.trim(),
      timeText: "Just now",
      isRead: false
    };
    setMessages((prev) => [...prev, newMessage]);
    setInputValue("");
    setTimeout(() => {
      const automatedReply = {
        id: `msg_${Date.now() + 1}`,
        sender: "merchant",
        senderName: `${vendorName} replied`,
        text: "Thank you for the update! We are holding the bags safely for you at the pick-up counter.",
        timeText: "Just now"
      };
      setMessages((prev) => [...prev, automatedReply]);
    }, 1500);
  };
  const handleQuickMessageClick = (msg) => {
    handleSendMessage(msg);
  };
  const quickMessages = [
    "On my way!",
    "Arrived at pickup",
    "Running late",
    "Parking now",
    "Where should I park?"
  ];
  return <div className="flex flex-col h-[600px] bg-[#F5F5F0] rounded-2xl border border-[#bec9c3] overflow-hidden shadow-sm animate-fadeIn">
      {
    /* Header Info Panel */
  }
      <header className="bg-white border-b border-[#e0e3e0] px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
    onClick={onGoBack}
    className="p-1 rounded-full hover:bg-gray-100 text-[#00604c] transition-colors"
  >
            <ArrowLeft className="w-5 h-5 stroke-[2.5]" />
          </button>
          <div>
            <h1 className="text-sm font-bold text-gray-900 leading-tight">Message - {vendorName}</h1>
            <p className="text-[10px] text-[#3e4945] font-semibold">Active communications channel</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <a
    href="tel:+48500200300"
    className="p-2 bg-gray-50 border border-gray-100 rounded-full hover:bg-gray-100 text-[#00604c]"
  >
            <Phone className="w-4 h-4" />
          </a>
          <div className="w-8 h-8 rounded-full overflow-hidden border border-[#bec9c3]">
            <img
    alt={vendorName}
    className="w-full h-full object-cover"
    src="https://lh3.googleusercontent.com/aida-public/AB6AXuD-oZnR-rzhM8-46y-TULyTSKJpkvRHSGyYkKvfjQuYGanSrryMdHmgzcjMy3yivNfBlxjK1MSWxNFOLt3Jad3Dw4TELCaiY0ezPjQ_Ej5wQ7DeAvN1SgQj0lyhWRWquo3aam6mzakpn_SQeACuxxVG3vajEfdYlW2gfXgyN_Lkj-zm0-_13BBIfqpEKSXA2c6K_i74ltlqVnXQ_ZCPyevHU5Opb9DL1cFAMG-SIgpeJX-lBvvl9KS2pGhxSKNzKF7d-IO3EFzP2KJY"
  />
          </div>
        </div>
      </header>

      {
    /* Message Log Thread */
  }
      <div className="flex-1 overflow-y-auto p-4 space-y-3.5">
        <div className="flex justify-center my-1.5">
          <span className="bg-[#e0e0db] text-[#1a1c19] px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider">
            TODAY 11:45 AM
          </span>
        </div>

        {messages.map((msg) => {
    if (msg.sender === "system") {
      return <div key={msg.id} className="flex justify-center py-2.5">
                <div className="bg-[#e5e9e5] px-4 py-2 rounded-xl border border-[#bec9c3] text-center">
                  <p className="text-[11px] font-bold text-[#005140] italic leading-tight">
                    {msg.text}
                  </p>
                </div>
              </div>;
    }
    const isDriver = msg.sender === "driver";
    return <div
      key={msg.id}
      className={`flex flex-col max-w-[85%] ${isDriver ? "ml-auto items-end" : "items-start"}`}
    >
              {!isDriver && <span className="text-[10px] font-bold text-gray-500 ml-1.5 mb-1 block">
                  {msg.senderName}
                </span>}
              
              <div
      className={`p-3.5 shadow-xs border ${isDriver ? "bg-[#00604c] text-white border-[#016b55] rounded-t-2xl rounded-bl-2xl rounded-br-sm" : "bg-white text-gray-900 border-[#bec9c3] rounded-t-2xl rounded-br-2xl rounded-bl-sm"}`}
    >
                <p className="text-xs leading-relaxed font-semibold">{msg.text}</p>
              </div>
              
              <span className={`text-[9px] text-gray-400 mt-1 font-bold ${isDriver ? "mr-1.5" : "ml-1.5"}`}>
                {msg.timeText} {isDriver && msg.isRead && "\u2022 Read"}
              </span>
            </div>;
  })}
        <div ref={chatBottomRef} />
      </div>

      {
    /* Quick Messages Select Bar */
  }
      <section className="bg-white border-t border-[#e0e3e0] px-4 py-3">
        <p className="text-[10px] font-bold text-[#5d5f5b] uppercase tracking-wider mb-2">QUICK MESSAGES</p>
        <div className="flex gap-2 overflow-x-auto pb-1.5 no-scrollbar whitespace-nowrap">
          {quickMessages.map((val) => <button
    key={val}
    onClick={() => handleQuickMessageClick(val)}
    className="bg-[#ebefeb] border border-[#bec9c3] text-[#00604c] font-semibold text-xs px-3.5 py-1.5 rounded-full hover:bg-[#00604c]/10 transition-colors active:scale-95"
  >
              {val}
            </button>)}
        </div>
      </section>

      {
    /* Text Message Form Field Input */
  }
      <div className="bg-white px-4 py-3 pb-safe border-t border-[#e0e3e0]">
        <div className="flex items-center gap-2">
          <button className="bg-[#ebefeb] hover:bg-[#e0e3e0] text-[#3e4945] p-3 rounded-full flex-shrink-0 transition-colors">
            <Plus className="w-4 h-4" />
          </button>
          
          <form
    onSubmit={(e) => {
      e.preventDefault();
      handleSendMessage(inputValue);
    }}
    className="flex-1 bg-[#ebefeb] border border-[#bec9c3] rounded-full px-4 py-2 flex items-center gap-2 focus-within:border-[#00604c] focus-within:bg-white transition-colors"
  >
            <input
    type="text"
    value={inputValue}
    onChange={(e) => setInputValue(e.target.value)}
    className="flex-1 bg-transparent border-none focus:ring-0 text-xs py-1.5 outline-none font-semibold text-gray-800"
    placeholder="Type a message..."
  />
            <button
    type="submit"
    className="text-[#00604c] hover:scale-110 active:scale-95 transition-transform p-1.5 flex-shrink-0"
  >
              <Send className="w-4 h-4 fill-current stroke-none" />
            </button>
          </form>
        </div>
      </div>
    </div>;
};
export {
  CourierChat
};
