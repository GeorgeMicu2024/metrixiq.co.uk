"use client";

import { useEffect, useRef, useState } from "react";
import { getSupabaseBrowserClient } from "../../lib/supabase/client";
import { summarizeMetricMatrix } from "../../lib/ai-lab/metric-summary.mjs";
import { AI_LAB_STATE_TABLE, normalizeChatHistory } from "../../lib/ai-lab/user-state.mjs";
import styles from "./AiLabChat.module.css";

const CHAT_KEY = "metrixiq.aiLab.chatHistory.v1";
const STARTERS = [
  "Explică-mi cum verific un Wave Plan nou.",
  "Cum pot reduce CDF negativ la DZM1?",
  "Ce trebuie să verific la IADC și POD?",
];
function safeStoredChat(userId) {
  try {
    return normalizeChatHistory(JSON.parse(window.localStorage.getItem(CHAT_KEY + "." + userId) || "[]"));
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

export default function AiLabChat({ reportContext = "", commandContext = "", brainContext = "", suggestedPrompt = null }) {
  const [metricBook, setMetricBook] = useState(null);
  const [metricSheet, setMetricSheet] = useState("");
  const [metricHeader, setMetricHeader] = useState(1);
  const [metricSummary, setMetricSummary] = useState("");
  const [reportSite, setReportSite] = useState("");
  const [reportPeriod, setReportPeriod] = useState("");
  const [reportBusy, setReportBusy] = useState(false);
  const [liveSites, setLiveSites] = useState([]);
  const [liveSiteKey, setLiveSiteKey] = useState("");
  const [livePeriod, setLivePeriod] = useState("W44");
  const [liveBusy, setLiveBusy] = useState(false);
  const [liveReport, setLiveReport] = useState("");
  const [activeSource, setActiveSource] = useState("wave");
  const uploadedContext = metricSummary ? JSON.stringify({ ...JSON.parse(metricSummary), station: reportSite || "not provided", period: reportPeriod || "not provided", scopeSource: "Station and period are user-entered, not verified from the file" }) : "";
  const activeContext = activeSource === "live" ? liveReport : activeSource === "upload" ? uploadedContext : activeSource === "command" ? commandContext : activeSource === "brain" ? brainContext : reportContext;
  const [messages, setMessages] = useState([]);
  const [cloudUserId, setCloudUserId] = useState("");
  const [syncState, setSyncState] = useState("Connecting private history…");
  const [loaded, setLoaded] = useState(false);
  const [input, setInput] = useState("");
  const [includeReport, setIncludeReport] = useState(false);
  const [includeMemory, setIncludeMemory] = useState(false);
  const [memoryStatus, setMemoryStatus] = useState("");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const abortRef = useRef(null);
  const recognitionRef = useRef(null);
  const [listening, setListening] = useState(false);
  const [speechLang, setSpeechLang] = useState("ro-RO");
  const scrollRef = useRef(null);
  const inputRef = useRef(null);
  const handledPromptId = useRef("");

  useEffect(() => { setIncludeReport(false); setActiveSource("wave"); }, [reportContext]);
  useEffect(() => { setIncludeReport(false); }, [commandContext]);
  useEffect(() => { setIncludeReport(false); }, [brainContext]);
  useEffect(() => {
    if (!suggestedPrompt?.id || !suggestedPrompt.text || handledPromptId.current === suggestedPrompt.id) return;
    handledPromptId.current = suggestedPrompt.id;
    setInput(suggestedPrompt.text);
    setActiveSource(suggestedPrompt.source === "brain" && brainContext ? "brain" : suggestedPrompt.source === "command" && commandContext ? "command" : "wave");
    setIncludeReport(false);
    inputRef.current?.focus();
  }, [suggestedPrompt, commandContext, brainContext]);

  useEffect(() => {
    let active = true;
    async function loadHistory() {
      try {
        const client = getSupabaseBrowserClient();
        const { data: { user }, error: authError } = await client.auth.getUser();
        if (authError || !user?.id || !active) return;
        const local = safeStoredChat(user.id);
        const { data: cloud, error: fetchError } = await client.from(AI_LAB_STATE_TABLE)
          .select("chat_history").eq("user_id", user.id).maybeSingle();
        if (!active) return;
        const saved = !fetchError && cloud ? normalizeChatHistory(cloud.chat_history) : local;
        setMessages(saved);
        setCloudUserId(user.id);
        setSyncState(fetchError ? "Private history · local fallback" : "Private history · synced across devices");
      } catch {
        if (active) setSyncState("History unavailable · chat still works");
      } finally {
        if (active) setLoaded(true);
      }
    }
    loadHistory();
    return () => { active = false; abortRef.current?.abort(); recognitionRef.current?.stop(); window.speechSynthesis?.cancel(); };
  }, []);
  useEffect(() => {
    if (!loaded || working || !cloudUserId) return;
    const safe = normalizeChatHistory(messages);
    try { window.localStorage.setItem(CHAT_KEY + "." + cloudUserId, JSON.stringify(safe)); } catch {}
    const timeout = window.setTimeout(async () => {
      try {
        const { error } = await getSupabaseBrowserClient().from(AI_LAB_STATE_TABLE).upsert({
          user_id: cloudUserId, chat_history: safe, updated_at: new Date().toISOString(),
        }, { onConflict: "user_id" });
        setSyncState(error ? "Private history · local fallback" : "Private history · synced across devices");
      } catch { setSyncState("Private history · local fallback"); }
    }, 500);
    return () => window.clearTimeout(timeout);
  }, [loaded, working, cloudUserId, messages]);
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  async function loadMetrics(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setMetricBook(null); setMetricSummary(""); setIncludeReport(false); setActiveSource("upload"); setError(""); setReportBusy(true);
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
    try { setMetricSummary(JSON.stringify(summarizeMetricMatrix(metricBook?.[metricSheet], Number(metricHeader) - 1))); setActiveSource("upload"); }
    catch (cause) { setError(cause.message); }
  }

  async function privateToken() {
    const { data: { session } } = await getSupabaseBrowserClient().auth.getSession();
    if (!session?.access_token) throw new Error("Your session expired. Please sign in again.");
    return session.access_token;
  }

  async function connectSites() {
    if (working || liveBusy) return;
    setLiveBusy(true); setError("");
    try {
      const response = await fetch("/api/ai-lab/live-report?list=sites", {
        headers: { Authorization: "Bearer " + await privateToken() }, cache: "no-store",
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Authorised sites are unavailable.");
      const sites = Array.isArray(body.sites) ? body.sites : [];
      setLiveSites(sites);
      if (sites.length) setLiveSiteKey(sites[0].organizationId + "|" + sites[0].site);
      else setError("No authorised site profiles found.");
    } catch (cause) { setError(cause.message || "Could not connect to reports."); }
    finally { setLiveBusy(false); }
  }

  async function loadLiveSummary() {
    if (!liveSiteKey || working || liveBusy) return;
    const [organizationId, site] = liveSiteKey.split("|");
    setLiveBusy(true); setError(""); setIncludeReport(false); setLiveReport("");
    try {
      const params = new URLSearchParams({ organization: organizationId, site, period: livePeriod.trim() });
      const response = await fetch("/api/ai-lab/live-report?" + params, {
        headers: { Authorization: "Bearer " + await privateToken() }, cache: "no-store",
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.report) throw new Error(body.error || "No authorised report was returned.");
      setLiveReport(JSON.stringify(body.report));
      setActiveSource("live");
      setInput("Analizează raportul " + site + " " + livePeriod.trim() + ". Separă observațiile confirmate, datele lipsă și recomandările practice.");
      inputRef.current?.focus();
    } catch (cause) { setError(cause.message || "Could not load report summary."); }
    finally { setLiveBusy(false); }
  }

  async function sendMessage() {
    const question = input.trim().slice(0, 2000);
    if (!question || working || reportBusy || liveBusy || !loaded) return;
    const user = { id: makeId(), role: "user", content: question };
    const assistantId = makeId();
    const draft = { id: assistantId, role: "assistant", content: "" };
    const history = messages.filter(item => item.content.trim()).slice(-9)
      .map(item => ({ role: item.role, content: item.content.slice(0, 1300) }));
    setInput("");
    setError("");
    setMemoryStatus("");
    setWorking(true);
    setMessages(current => [...current, user, draft].slice(-32));

    const controller = new AbortController();
    abortRef.current = controller;
    let full = "";
    try {
      const token = await privateToken();
      const response = await fetch("/api/ai-lab/chat", {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
        body: JSON.stringify({
          messages: [...history, { role: "user", content: question }],
          includeReport: Boolean(includeReport && activeContext),
          reportContext: includeReport ? activeContext : "",
          includeMemory: Boolean(includeMemory),
          memorySite: includeReport && activeSource === "live" ? liveSiteKey.split("|")[1]
            : includeReport && activeSource === "upload" ? reportSite : "",
        }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || "The free AI model is unavailable.");
      }
      if (!response.body) throw new Error("AI did not return a stream.");
      if (includeMemory) {
        const count = Number(response.headers.get("X-MetrixIQ-Memory-Count") || "0");
        setMemoryStatus(count > 0 ? `Used ${count} relevant, approved private note(s).` : "No relevant approved notes found; AI used general guidance.");
      }
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
    if (!window.confirm("Clear your private AI Lab chat history on all synced devices?")) return;
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
        <summary>Live report analysis · DCR / POD / IADC / CDF / Concessions</summary>
        <p>Authorised read-only summaries only. Choose a station and an exact Amazon week label. No raw driver/customer records are shared with the AI.</p>
        <button type="button" className={styles.chip} disabled={working || liveBusy} onClick={connectSites}>{liveSites.length ? "Refresh authorised sites" : "Connect authorised sites"}</button>
        {liveSites.length > 0 && <>
          <label>Station <select value={liveSiteKey} disabled={working || liveBusy} onChange={e => { setLiveSiteKey(e.target.value); setLiveReport(""); setIncludeReport(false); }}>
            {liveSites.map(site => <option key={site.organizationId + "|" + site.site} value={site.organizationId + "|" + site.site}>{site.site} · {site.label}</option>)}
          </select></label>
          <label>Amazon period <input value={livePeriod} maxLength={20} placeholder="W44 or W44:2026-10-30" disabled={working || liveBusy}
            onChange={e => { setLivePeriod(e.target.value.toUpperCase().replace(/[^A-Z0-9:-]/g, "")); setLiveReport(""); setIncludeReport(false); }}/></label>
          <button type="button" className={styles.chip} disabled={working || liveBusy || !liveSiteKey || !livePeriod.trim()} onClick={loadLiveSummary}>Load private summary</button>
        </>}
        {liveBusy && <p>Loading authorised report context…</p>}
        {liveReport && <>
          <p className={styles.small}>Summary loaded. Review below and tick the share checkbox before asking the AI.</p>
          <pre className={styles.reportPreview}>{liveReport}</pre>
          <button type="button" className={styles.chip} onClick={() => { setActiveSource("live"); setIncludeReport(false); }}>Use this live summary</button>
          <button type="button" className={styles.chip} onClick={() => { setLiveReport(""); setIncludeReport(false); setActiveSource("wave"); }}>Remove private summary</button>
        </>}
      </details>
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
          <button type="button" className={styles.chip} onClick={() => { setActiveSource("upload"); setIncludeReport(false); }}>Use uploaded summary</button>
          <button type="button" className={styles.chip} disabled={working} onClick={() => { setMetricSummary(""); setMetricBook(null); setIncludeReport(false); }}>Remove performance report</button>
        </>}
      </details>
      <p className={styles.small}>{includeReport && activeContext
        ? "AI evidence: " + (activeSource === "live" ? "authorised read-only aggregate" : activeSource === "upload" ? "uploaded numeric summary" : activeSource === "command" ? "authorised multi-report Command Center analysis" : activeSource === "brain" ? "authorised historical AI Brain aggregates" : "selected Wave Plan preview")
        : "General guidance · no report shared with AI"}
        {reportContext && activeSource !== "wave" && <button type="button" className={styles.chip} onClick={() => { setActiveSource("wave"); setIncludeReport(false); }}>Use Wave Plan context</button>}
        {commandContext && activeSource !== "command" && <button type="button" className={styles.chip} onClick={() => { setActiveSource("command"); setIncludeReport(false); }}>Use AI Command Center context</button>}
        {brainContext && activeSource !== "brain" && <button type="button" className={styles.chip} onClick={() => { setActiveSource("brain"); setIncludeReport(false); }}>Use AI Brain context</button>}</p>
      <form className={styles.form} onSubmit={event => { event.preventDefault(); sendMessage(); }}>
        <textarea ref={inputRef} className={styles.input} rows={2} maxLength={2000} value={input} onChange={event => setInput(event.target.value)}
          placeholder="Ask MetrixIQ anything about your operations…"
          aria-label="Message to MetrixIQ AI"
          onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); sendMessage(); } }}/>
        <button type="button" className={styles.mic} disabled={working} aria-label={listening ? "Stop microphone" : "Dictate message"} onClick={toggleMicrophone}>{listening ? "■" : "🎤"}</button>
        {working
          ? <button type="button" className={styles.send + " " + styles.stop} onClick={() => abortRef.current?.abort()}>Stop</button>
          : <button type="submit" disabled={!input.trim() || reportBusy || liveBusy || !loaded} className={styles.send}>Send ↗</button>}
      </form>
      <div className={styles.meta}>
        <label className={styles.check}>
          <input type="checkbox" checked={includeReport} disabled={!activeContext || working} onChange={event => setIncludeReport(event.target.checked)}/>
          Share selected report summary with AI {activeContext ? "(no names/TRIDs)" : "(prepare a report first)"}
        </label>
        <label className={styles.check}>
          <input type="checkbox" checked={includeMemory} disabled={working || !cloudUserId} onChange={event => {setIncludeMemory(event.target.checked);setMemoryStatus("");}}/>
          Include my relevant approved learning notes in AI replies (private memory)
        </label>
        <label className={styles.check}>Voice <select className={styles.langSelect} value={speechLang} onChange={event => setSpeechLang(event.target.value)}><option value="ro-RO">Română</option><option value="en-GB">English</option></select></label>
        <button type="button" className={styles.clear} disabled={working || !messages.length} onClick={clearChat}>Clear chat</button>
      </div>
      {error && <p className={styles.error} role="alert">{error}</p>}
      <p className={styles.small}>{memoryStatus || "Approved notes stay private unless you tick the learning-memory checkbox."}</p>
      <p className={styles.small}>{syncState}. Only your verified Super Admin account can access the private history. Verify operational decisions.</p>
    </div>
    <div className={styles.privacy}>Privacy: messages are sent to NVIDIA's free AI model through Vercel. The provider may retain prompts for model improvement. Private chat history and approved layouts sync to your Supabase account; report source files are not stored. Browser dictation can use its own speech service. Do not share personal data unnecessarily. Report summaries and relevant approved learning notes are each sent to the AI only after their separate explicit opt-ins.</div>
  </section>;
}
