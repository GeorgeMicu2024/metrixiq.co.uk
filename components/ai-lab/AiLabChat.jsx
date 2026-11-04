"use client";

import { useEffect, useRef, useState } from "react";
import { getSupabaseBrowserClient } from "../../lib/supabase/client";
import { summarizeMetricMatrix } from "../../lib/ai-lab/metric-summary.mjs";
import styles from "./AiLabChat.module.css";

const CHAT_KEY = "metrixiq.aiLab.chatHistory.v1";
const STARTERS = [
  "Explică-mi cum verific un Wave Plan nou.",
  "Cum pot reduce CDF negativ la DZM1?",
  "Ce trebuie să verific la IADC și POD?",
];
function safeStoredChat() {
  try {
    const value = JSON.parse(window.localStorage.getItem(CHAT_KEY) || "[]");
    if (!Array.isArray(value)) return [];
    return value.filter(item => item && ["user", "assistant"].includes(item.role) && typeof item.content === "string" && item.content.trim())
      .slice(-30).map(item => ({ id: String(item.id || Date.now()), role: item.role, content: item.content.slice(0, 6000) }));
  } catch { return []; }
}
function makeId() {
  return typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + "-" + Math.random().toString(36).slice(2);
}
function readDelta(eventBlock) {
  const line = eventBlock.split("\n").filter(row => row.startsWith("data:")).map(row => row.slice(5).trim()).join("");
  if (!line || line === "[DONE]") return "";
  try {
    const entry = JSON.parse(line);
    const delta = entry.choices?.[0]?.delta?.content;
    if (typeof delta === "string") return delta;
    if (Array.isArray(delta)) return delta.map(part => typeof part === "string" ? part : part?.text || "").join("");
  } catch {}
  return "";
}

export default function AiLabChat({ reportContext = "" }) {
  const [metricBook, setMetricBook] = useState(null);
  const [metricSheet, setMetricSheet] = useState("");
  const [metricHeader, setMetricHeader] = useState(1);
  const [metricSummary, setMetricSummary] = useState("");
  const [reportSite, setReportSite] = useState("");
  const [reportPeriod, setReportPeriod] = useState("");
  const [reportBusy, setReportBusy] = useState(false);
  const activeContext = metricSummary ? JSON.stringify({ ...JSON.parse(metricSummary), station: reportSite || "not provided", period: reportPeriod || "not provided", scopeSource: "Station and period are user-entered, not verified from the file" }) : reportContext;
  const [messages, setMessages] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [input, setInput] = useState("");
  const [includeReport, setIncludeReport] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const abortRef = useRef(null);
  const recognitionRef = useRef(null);
  const [listening, setListening] = useState(false);
  const [speechLang, setSpeechLang] = useState("ro-RO");
  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => { setIncludeReport(false); }, [reportContext]);

  useEffect(() => {
    setMessages(safeStoredChat());
    setLoaded(true);
    return () => { abortRef.current?.abort(); recognitionRef.current?.stop(); window.speechSynthesis?.cancel(); };
  }, []);
  useEffect(() => {
    if (!loaded || working) return;
    try { window.localStorage.setItem(CHAT_KEY, JSON.stringify(messages.slice(-30))); } catch {}
  }, [loaded, working, messages]);
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  async function loadMetrics(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setMetricBook(null); setMetricSummary(""); setIncludeReport(false); setError(""); setReportBusy(true);
    try {
      if (file.size > 5 * 1024 * 1024) throw new Error("Maximum metric report size is 5 MB.");
      const XLSX = await import("xlsx");
      const book = XLSX.read(await file.arrayBuffer(), { type: "array", dense: true, sheetRows: 5002 });
      const sheets = Object.fromEntries(book.SheetNames.slice(0, 20).map(name => [name, XLSX.utils.sheet_to_json(book.Sheets[name], { header: 1, raw: false, defval: "", blankrows: false })]));
      setMetricBook(sheets); setMetricSheet(book.SheetNames[0]); setMetricHeader(1);
    } catch (cause) { setError(cause.message || "Could not read spreadsheet."); }
    finally { setReportBusy(false); event.target.value = ""; }
  }
  function prepareMetrics() {
    setMetricSummary(""); setIncludeReport(false); setError("");
    try { setMetricSummary(JSON.stringify(summarizeMetricMatrix(metricBook?.[metricSheet], Number(metricHeader) - 1))); }
    catch (cause) { setError(cause.message); }
  }

  async function sendMessage() {
    const question = input.trim().slice(0, 2000);
    if (!question || working || reportBusy) return;
    const user = { id: makeId(), role: "user", content: question };
    const assistantId = makeId();
    const draft = { id: assistantId, role: "assistant", content: "" };
    const history = messages.filter(item => item.content.trim()).slice(-9)
      .map(item => ({ role: item.role, content: item.content.slice(0, 1300) }));
    setInput("");
    setError("");
    setWorking(true);
    setMessages(current => [...current, user, draft].slice(-32));

    const controller = new AbortController();
    abortRef.current = controller;
    let full = "";
    try {
      const { data: { session } } = await getSupabaseBrowserClient().auth.getSession();
      if (!session?.access_token) throw new Error("Your session expired. Please sign in again.");
      const response = await fetch("/api/ai-lab/chat", {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + session.access_token },
        body: JSON.stringify({
          messages: [...history, { role: "user", content: question }],
          includeReport: Boolean(includeReport && activeContext),
          reportContext: includeReport ? activeContext : "",
        }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || "The free AI model is unavailable.");
      }
      if (!response.body) throw new Error("AI did not return a stream.");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      function consume(block) {
        const delta = readDelta(block);
        if (!delta) return;
        full = (full + delta).slice(0, 12000);
        setMessages(current => current.map(item => item.id === assistantId ? { ...item, content: full } : item));
      }
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
          let boundary = buffer.indexOf("\n\n");
          while (boundary >= 0) {
            consume(buffer.slice(0, boundary));
            buffer = buffer.slice(boundary + 2);
            boundary = buffer.indexOf("\n\n");
          }
        }
        if (buffer.trim()) consume(buffer);
      } finally {
        reader.releaseLock();
      }
      if (!full.trim()) throw new Error("The model returned no readable response. Please try a shorter question.");
    } catch (cause) {
      if (controller.signal.aborted) {
        if (!full) setMessages(current => current.filter(item => item.id !== assistantId));
      } else {
        if (!full) setMessages(current => current.filter(item => item.id !== assistantId));
        setError(cause instanceof Error ? cause.message : "Chat failed. Try again.");
      }
    } finally {
      abortRef.current = null;
      setWorking(false);
    }
  }

  function toggleMicrophone() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) { setError("Voice dictation is not supported in this browser. You can still type your message."); return; }
    if (listening) { recognitionRef.current?.stop(); return; }
    const recognizer = new SpeechRecognition();
    recognizer.lang = speechLang;
    recognizer.interimResults = false;
    recognizer.maxAlternatives = 1;
    recognizer.onresult = event => {
      const transcript = event.results?.[0]?.[0]?.transcript || "";
      if (transcript) setInput(previous => (previous ? previous.trimEnd() + " " : "") + transcript);
    };
    recognizer.onerror = () => { setListening(false); setError("Microphone recognition ended. Check browser permission if it did not capture speech."); };
    recognizer.onend = () => setListening(false);
    try { recognizer.start(); recognitionRef.current = recognizer; setListening(true); setError(""); }
    catch { setError("Could not start voice dictation. Check microphone permission."); }
  }

  function readAloud(content) {
    if (!window.speechSynthesis || !window.SpeechSynthesisUtterance) { setError("Text-to-speech is not supported in this browser."); return; }
    window.speechSynthesis.cancel();
    const speech = new SpeechSynthesisUtterance(content.slice(0, 3500));
    speech.lang = /[ăâîșț]/i.test(content) ? "ro-RO" : "en-GB";
    speech.rate = 1;
    window.speechSynthesis.speak(speech);
  }

  function renderText(content) {
    return content.split(/(\*\*[^*]+\*\*)/g).map((part, index) =>
      part.startsWith("**") && part.endsWith("**") ? <strong key={index}>{part.slice(2, -2)}</strong> : part
    );
  }

  function clearChat() {
    if (!window.confirm("Clear your AI Lab chat history from this browser?")) return;
    setMessages([]);
    setError("");
  }

  return <section className={styles.panel} aria-label="MetrixIQ AI chat">
    <header className={styles.head}>
      <div className={styles.title}>
        <span className={styles.orb} aria-hidden="true">✦</span>
        <div><h2>Talk to MetrixIQ AI</h2><p>Ask questions in Romanian or English · follow-up conversations supported</p></div>
      </div>
      <span className={styles.tag}>NEMOTRON · FREE MODEL</span>
    </header>
    <div className={styles.messages} ref={scrollRef} aria-live="polite" aria-relevant="additions text">
      {!messages.length && <div className={styles.empty}>
        <strong>Salut, George! Cu ce te pot ajuta?</strong>
        <p>Pot explica rapoarte, Wave Plans și probleme de performanță. Nu modific datele platformei sau codul.</p>
        <div className={styles.examples}>{STARTERS.map(starter => <button className={styles.chip} key={starter} type="button" onClick={() => { setInput(starter); inputRef.current?.focus(); }}>{starter}</button>)}
          {activeContext && <button className={styles.chip} type="button" onClick={() => { setIncludeReport(true); setInput("Analizează formatele aprobate și raportul curent. Ce probleme, lipsuri sau riscuri observi?"); inputRef.current?.focus(); }}>✦ Analyze my report</button>}</div>
      </div>}
      {messages.map(message => <div key={message.id} className={styles.message + " " + (message.role === "user" ? styles.user : styles.assistant)}>
        <span className={styles.role}>{message.role === "user" ? "YOU" : "METRIXIQ AI"}</span>
        {message.content ? renderText(message.content) : <span>Thinking…</span>}
        {message.role === "assistant" && message.content && <button type="button" className={styles.speak} onClick={() => readAloud(message.content)} aria-label="Read AI response aloud">🔊 Listen</button>}
      </div>)}
    </div>
    <div className={styles.composer}>
      <details className={styles.reportTools}>
        <summary>Analyse a performance report · Excel / CSV</summary>
        <p>Processed in this browser. Choose a sheet and header row, then review the numeric summary. Remove total/subtotal rows first. Only the summary is shared when you tick the checkbox.</p>
        <input type="file" accept=".xlsx,.xls,.csv" aria-label="Upload performance report" disabled={working || reportBusy} onChange={loadMetrics}/>
        {reportBusy && <p>Reading spreadsheet…</p>}
        {metricBook && <>
          <label>Sheet <select value={metricSheet} disabled={working} onChange={e => { setMetricSheet(e.target.value); setMetricSummary(""); setIncludeReport(false); }}>{Object.keys(metricBook).map(name => <option key={name}>{name}</option>)}</select></label>
          <label>Header row (non-empty rows) <input type="number" min="1" max="50" value={metricHeader} disabled={working} onChange={e => { setMetricHeader(e.target.value); setMetricSummary(""); setIncludeReport(false); }}/></label>
          <button type="button" className={styles.chip} disabled={working} onClick={prepareMetrics}>Prepare summary</button>
        </>}
        {metricSummary && <>
          <label>Station <input placeholder="DLS2" maxLength={4} value={reportSite} disabled={working} onChange={e => setReportSite(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}/></label>
          <label>Period <input placeholder="2026-W44" maxLength={24} value={reportPeriod} disabled={working} onChange={e => setReportPeriod(e.target.value.replace(/[^0-9Ww /:.–-]/g, ""))}/></label>
          <pre className={styles.reportPreview}>{metricSummary}</pre>
          <button type="button" className={styles.chip} disabled={working} onClick={() => { setMetricSummary(""); setMetricBook(null); setIncludeReport(false); }}>Remove performance report</button>
        </>}
      </details>
      <p className={styles.small}>{includeReport && activeContext ? "Evidence: selected report summary only · no live database access" : "General guidance · no report shared with AI"}</p>
      <form className={styles.form} onSubmit={event => { event.preventDefault(); sendMessage(); }}>
        <textarea ref={inputRef} className={styles.input} rows={2} maxLength={2000} value={input} onChange={event => setInput(event.target.value)}
          placeholder="Ask MetrixIQ anything about your operations…"
          aria-label="Message to MetrixIQ AI"
          onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); sendMessage(); } }}/>
        <button type="button" className={styles.mic} disabled={working} aria-label={listening ? "Stop microphone" : "Dictate message"} onClick={toggleMicrophone}>{listening ? "■" : "🎤"}</button>
        {working
          ? <button type="button" className={styles.send + " " + styles.stop} onClick={() => abortRef.current?.abort()}>Stop</button>
          : <button type="submit" disabled={!input.trim() || reportBusy} className={styles.send}>Send ↗</button>}
      </form>
      <div className={styles.meta}>
        <label className={styles.check}>
          <input type="checkbox" checked={includeReport} disabled={!activeContext || working} onChange={event => setIncludeReport(event.target.checked)}/>
          Share selected report summary with AI {activeContext ? "(no names/TRIDs)" : "(prepare a report first)"}
        </label>
        <label className={styles.check}>Voice <select className={styles.langSelect} value={speechLang} onChange={event => setSpeechLang(event.target.value)}><option value="ro-RO">Română</option><option value="en-GB">English</option></select></label>
        <button type="button" className={styles.clear} disabled={working || !messages.length} onClick={clearChat}>Clear chat</button>
      </div>
      {error && <p className={styles.error} role="alert">{error}</p>}
      <p className={styles.small}>Chat history is saved only in this browser. This assistant can make mistakes; verify operational decisions.</p>
    </div>
    <div className={styles.privacy}>Privacy: messages are sent to NVIDIA's free AI model through Vercel. The provider may retain prompts for model improvement. Browser speech recognition may use its own speech service. Avoid personal or confidential data. Report details are shared only if you enable the checkbox.</div>
  </section>;
}
