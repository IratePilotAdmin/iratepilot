"use client";
import { useState } from "react";

export function TravelAssistant() {
  const [messages, setMessages] = useState<string[]>([
    "Tell me your destination, dates, and preferred experience."
  ]);
  const [input, setInput] = useState("");

  function send() {
    if (!input.trim()) return;
    setMessages([...messages, input, "Demo response: I found premium options that match your request. Connect OPENAI_API_KEY to enable live AI."]);
    setInput("");
  }

  return (
    <div className="card overflow-hidden">
      <div className="border-b border-slate-200 p-5 font-semibold">AI travel assistant</div>
      <div className="h-80 space-y-3 overflow-y-auto p-5">
        {messages.map((message, i) => <div key={i} className={i % 2 ? "ml-auto max-w-[80%] rounded-xl bg-brand-600 p-3 text-sm text-white" : "max-w-[80%] rounded-xl bg-slate-100 p-3 text-sm"}>{message}</div>)}
      </div>
      <div className="flex gap-2 border-t border-slate-200 p-4">
        <input className="input" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Plan my trip..." />
        <button className="btn-primary" onClick={send}>Send</button>
      </div>
    </div>
  );
}
