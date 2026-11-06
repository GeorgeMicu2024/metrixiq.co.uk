"use client";

import { useEffect, useRef, useState } from "react";
import { getSupabaseBrowserClient } from "../../lib/supabase/client";
import { summarizeMetricMatrix } from "../../lib/ai-lab/metric-summary.mjs";
import { AI_LAB_STATE_TABLE, normalizeChatHistory } from "../../lib/ai-lab/user-state.mjs";
import { sanitizeLearningNote } from "../../lib/ai-lab/brain-insights.mjs";
import { ASSISTANT_STARTERS, assistantFollowUps } from "../../lib/ai-lab/assistant-experience.mjs";
import { connectedEvidence, localEvidenceAnswer, needsStationEvidence } from "../../lib/ai-lab/grounded-chat.mjs";
import styles from "./AiLabChat.module.css";

const CHAT_KEY = "metrixiq.aiLab.chatHistory.v1";
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

export default function AiLabChat({ reportContext = "", connectedContext = "", commandContext = "", brainContext = "", suggestedPrompt = null }) {
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
  const [activeSource, setActiveSource] = useState("connected");
  const uploadedContext = metricSummary ? JSON.stringify({ ...JSON.parse(metricSummary), station: reportSite || "not provided", period: reportPeriod || "not provided", scopeSource: "Station and period are user-entered, not verified from the file" }) : "";
  const activeContext = activeSource === "connected" ? connectedContext : activeSource === "live" ? liveReport : activeSource === "upload" ? uploadedContext : activeSource === "command" ? commandContext : activeSource === "brain" ? brainContext : reportContext;
  const evidence = activeSource === "connected" ? connectedEvidence(connectedContext) : null;
  const [messages, setMessages] = useState([]);
  const [cloudUserId, setCloudUserId] = useState("");
  const [firstName, setFirstName] = useState("");
  const [syncState, setSyncState] = useState("Connecting private history…");
  const [loaded, setLoaded] = useState(false);
  const [input, setInput] = useState("");
  const [includeReport, setIncludeReport] = useState(false);
  const [includeMemory, setIncludeMemory] = useState(false);
  const [memoryStatus, setMemoryStatus] = useState("");
  const [learningOpen, setLearningOpen] = useState(false);
  const [learningText, setLearningText] = useState("");
  const [learningSite, setLearningSite] = useState("");
  const [learningBusy, setLearningBusy] = useState(false);
  const [learningMessage, setLearningMessage] = useState("");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const abortRef = useRef(null);
  const recognitionRef = useRef(null);
  const [listening, setListening] = useState(false);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);
  const handledPromptId = useRef("");
  // Conversation continuity is scoped to the currently consented evidence.
  // Never replay old report-derived replies from saved history to an AI provider.
  const modelHistoryRef = useRef([]);
  const modelScopeRef = useRef("");

  useEffect(() => {
    setIncludeReport(false);
    if (reportContext) setActiveSource("wave");
    else setActiveSource(current => current === "wave" ? "connected" : current);
  }, [reportContext]);
  useEffect(() => {
    setIncludeReport(false);
    if (connectedContext) setActiveSource(current => current === "wave" && !reportContext ? "connected" : current);
    else setActiveSource(current => current === "connected" ? "wave" : current);
  }, [connectedContext, reportContext]);
  useEffect(() => { setIncludeReport(false); }, [commandContext]);
  useEffect(() => { setIncludeReport(false); }, [brainContext]);
  useEffect(() => {
    if (!suggestedPrompt?.id || !suggestedPrompt.text || handledPromptId.current === suggestedPrompt.id) return;
    handledPromptId.current = suggestedPrompt.id;
    setInput(suggestedPrompt.text);
    setActiveSource(suggestedPrompt.source === "connected" && connectedContext ? "connected"
      : suggestedPrompt.source === "brain" && brainContext ? "brain"
      : suggestedPrompt.source === "command" && commandContext ? "command" : "wave");
    setIncludeReport(false);
    inputRef.current?.focus();
  }, [suggestedPrompt, commandContext, brainContext, connectedContext]);

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
        const displayName = String(user.user_metadata?.full_name || user.user_metadata?.name || "").trim().split(/\s+/)[0];
        setFirstName(/^[\p{L}'-]{2,30}$/u.test(displayName) ? displayName : "");
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
      setInput("Analyse the " + site + " " + livePeriod.trim() + " report. Separate confirmed findings, missing evidence and practical recommendations.");
      inputRef.current?.focus();
    } catch (cause) { setError(cause.message || "Could not load report summary."); }
    finally { setLiveBusy(false); }
  }

  async function sendMessage() {
    const question = input.trim().slice(0, 2000);
    if (!question || working || reportBusy || liveBusy || !loaded) return;
    if (needsStationEvidence(question) && !(includeReport && activeContext)) {
      const response = activeSource === "connected" && evidence ? localEvidenceAnswer(connectedContext)
        : activeContext
          ? "Your selected report is ready, but sharing is off. Enable **Share selected report summary with AI** to discuss actual figures. I won't guess your station's performance."
          : "I don't have a verified station report selected yet. Open **Intelligence → Daily Briefing**, choose your station and week, and return to Ask IQ. I won't invent results.";
      setMessages(current => [...current,
        { id: makeId(), role: "user", content: question },
        { id: makeId(), role: "assistant", content: response },
      ].slice(-32));
      // Keep the drafted question so one consent click and Send can continue it.
      setError("");
      return;
    }
    const user = { id: makeId(), role: "user", content: question };
    const assistantId = makeId();
    const draft = { id: assistantId, role: "assistant", content: "" };
    const scope = includeReport && activeContext ? activeSource + ":" + activeContext : "general";
    if (modelScopeRef.current !== scope) { modelScopeRef.current = scope; modelHistoryRef.current = []; }
    const history = modelHistoryRef.current.slice(-9);
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
            : includeReport && activeSource === "upload" ? reportSite
            : includeReport && activeSource === "connected" ? (() => { try { return JSON.parse(connectedContext).site || ""; } catch { return ""; } })() : "",
        }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || "The free AI model is unavailable.");
      }
      if (!response.body) throw new Error("AI did not return a stream.");
      if (includeMemory) {
        const notes = Number(response.headers.get("X-MetrixIQ-Memory-Count") || "0");
        const layouts = Number(response.headers.get("X-MetrixIQ-Format-Count") || "0");
        setMemoryStatus(notes + layouts > 0
          ? `Used ${notes} approved note(s) and ${layouts} approved format layout(s) for this answer.`
          : "No relevant approved notes or layouts found; AI used general guidance.");
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
      if (modelScopeRef.current === scope) modelHistoryRef.current = [...history,
        { role: "user", content: question }, { role: "assistant", content: full.slice(0, 1300) }].slice(-10);
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
    recognizer.lang = "en-GB";
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
    speech.lang = "en-GB";
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
    modelHistoryRef.current = [];
    modelScopeRef.current = "";
    setMessages([]);
    setError("");
  }

  function prepareQuestion(question) {
    setInput(question);
    inputRef.current?.focus();
  }

  async function rememberCorrection() {
    if (!cloudUserId || learningBusy) return;
    setLearningMessage("");
    let lesson;
    try {
      lesson = sanitizeLearningNote(learningText);
      if (learningSite && !/^[A-Z0-9]{3,6}$/.test(learningSite)) throw new Error("Enter a valid station code or leave it blank for a general rule.");
    } catch (cause) { setLearningMessage(cause.message); return; }
    setLearningBusy(true);
    try {
      const client = getSupabaseBrowserClient();
      const { data, error: insertError } = await client.from("ai_lab_learning_notes")
        .insert({ user_id: cloudUserId, site: learningSite || null, lesson })
        .select("id").single();
      if (insertError || !data?.id) throw insertError || new Error("Could not save this rule.");
      setLearningOpen(false);
      setLearningText("");
      setLearningSite("");
      let indexed = false;
      try {
        const { data: result, error: indexError } = await client.functions.invoke("ai-lab-semantic-memory", {
          body: { action: "index", lessonId: data.id },
        });
        indexed = !indexError && result?.indexed === true;
      } catch { /* Approved note is saved even when optional indexing fails. */ }
      setLearningMessage(indexed
        ? "Approved correction saved and indexed. Enable approved knowledge below to use it in AI replies."
        : "Approved correction saved. Semantic indexing is unavailable; keyword memory still works when enabled.");
    } catch { setLearningMessage("Could not save the correction to private memory. Please try again."); }
    finally { setLearningBusy(false); }
  }

  const followUps = assistantFollowUps(messages);

  return <section className={styles.panel} aria-label="MetrixIQ AI chat">
    <header className={styles.head}>
      <div className={styles.title}>
        <span className={styles.orb} aria-hidden="true">✦</span>
        <div><h2>Meet IQ, your operations co-pilot</h2><p>Practical answers, honest analysis and a plan for what comes next · English only</p></div>
      </div>
      <span className={styles.tag}>HERE TO HELP · READ-ONLY</span>
    </header>
    <div className={styles.messages} ref={scrollRef} aria-live="polite" aria-relevant="additions text">
      {!messages.length && <div className={styles.empty}>
        <strong>{firstName ? `Hi ${firstName}!` : "Hi there!"} I'm IQ. What can I take off your plate?</strong>
        <p>Pick something to work on, or tell me what's happening at your station. I'll help you decide what matters first.</p>
        <div className={styles.examples}>{ASSISTANT_STARTERS.map(starter => <button className={styles.chip} key={starter.label} type="button" onClick={() => prepareQuestion(starter.prompt)}>{starter.label}</button>)}
          {activeContext && <button className={styles.chip} type="button" onClick={() => { setIncludeReport(true); prepareQuestion("Analyse the current report and approved formats. What gaps or risks should I check?"); }}>✦ Analyse my report</button>}</div>
      </div>}
      {messages.map(message => <div key={message.id} className={styles.message + " " + (message.role === "user" ? styles.user : styles.assistant)}>
        <span className={styles.role}>{message.role === "user" ? "YOU" : "METRIXIQ AI"}</span>
        {message.content ? renderText(message.content) : <span>Thinking…</span>}
        {message.role === "assistant" && message.content && <button type="button" className={styles.speak} onClick={() => readAloud(message.content)} aria-label="Read AI response aloud">🔊 Listen</button>}
      </div>)}
      {!working && followUps.length > 0 && <div className={styles.nextSteps} aria-label="Suggested next steps">
        <small>Keep going with IQ</small>
        <div className={styles.examples}>{followUps.map(item => <button key={item.label} className={styles.chip} type="button" onClick={() => prepareQuestion(item.prompt)}>{item.label} ↗</button>)}</div>
      </div>}
    </div>
    <div className={styles.composer}>
      {evidence && <div className={styles.evidenceStrip}>
        <div><strong>● Verified MetrixIQ data · {evidence.site} W{evidence.week} {evidence.year}</strong>
          <small>Official score: {evidence.score == null ? "unavailable" : evidence.score.toFixed(2)}{evidence.tier ? " · " + evidence.tier : ""}
            {evidence.previous && evidence.score != null ? " · " + (evidence.score - evidence.previous.score >= 0 ? "+" : "") + (evidence.score - evidence.previous.score).toFixed(2) + " vs W" + evidence.previous.week : ""}</small>
        </div>
        <label className={styles.check}><input type="checkbox" checked={includeReport} disabled={working}
          onChange={event => setIncludeReport(event.target.checked)}/>
          Use verified report data in IQ answers <span>(anonymised summary)</span>
        </label>
      </div>}
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
        ? "AI evidence: " + (activeSource === "connected" ? "selected Connected Intelligence weekly briefing" : activeSource === "live" ? "authorised read-only aggregate" : activeSource === "upload" ? "uploaded numeric summary" : activeSource === "command" ? "authorised multi-report Command Center analysis" : activeSource === "brain" ? "authorised historical AI Brain aggregates" : "selected Wave Plan preview")
        : evidence ? "Verified station data is loaded locally; AI sharing is off until you enable it above." : "General guidance · no report shared with AI"}
        {connectedContext && activeSource !== "connected" && <button type="button" className={styles.chip} onClick={() => { setActiveSource("connected"); setIncludeReport(false); }}>Use Connected Briefing</button>}
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
        {suggestedPrompt?.source === "connected" && activeSource === "connected" && !includeReport &&
          <p className={styles.small} role="status">IQ Action Center context is ready. Tick “Share selected report summary with AI” to include the evidence; otherwise IQ can only give general advice.</p>}
        {!evidence && <label className={styles.check}>
          <input type="checkbox" checked={includeReport} disabled={!activeContext || working} onChange={event => setIncludeReport(event.target.checked)}/>
          Share selected report summary with AI {activeContext ? "(no names/TRIDs)" : "(prepare a report first)"}
        </label>}
        <label className={styles.check}>
          <input type="checkbox" checked={includeMemory} disabled={working || !cloudUserId} onChange={event => {setIncludeMemory(event.target.checked);setMemoryStatus("");}}/>
          Use my approved knowledge in AI replies (private memory)
        </label>
        <span className={styles.small}>Voice: English (UK)</span>
        <button type="button" className={styles.clear} disabled={working || !messages.length} onClick={clearChat}>Clear chat</button>
      </div>
      <div className={styles.learningArea}>
        <button type="button" className={styles.learnToggle} disabled={!cloudUserId || learningBusy}
          aria-expanded={learningOpen} onClick={() => { setLearningOpen(current => !current); setLearningMessage(""); }}>
          <span aria-hidden="true">✦</span> Teach IQ a correction <span aria-hidden="true">{learningOpen ? "−" : "+"}</span>
        </button>
        {learningOpen && <div className={styles.learningForm}>
          <p>Save a general rule you've verified. IQ can recall it in future chats when you enable approved knowledge. Never include personal data.</p>
          <textarea rows={2} maxLength={350} value={learningText} disabled={learningBusy}
            onChange={event => setLearningText(event.target.value)}
            placeholder="Example: At DZM1, staging lanes must be checked separately from wave numbers." aria-label="Approved correction"/>
          <div className={styles.learningActions}>
            <label>Station (optional) <input maxLength={6} placeholder="DZM1" value={learningSite} disabled={learningBusy}
              onChange={event => setLearningSite(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}/></label>
            <button type="button" className={styles.send} disabled={learningBusy || !cloudUserId || learningText.trim().length < 10}
              onClick={rememberCorrection}>{learningBusy ? "Saving…" : "Approve & remember"}</button>
          </div>
          <small>Only approved text is saved. Reports, driver details, UK tracking numbers and contact details must not be added.</small>
        </div>}
        {learningMessage && <p className={styles.learningStatus} role="status">{learningMessage}</p>}
      </div>
      {error && <p className={styles.error} role="alert">{error}</p>}
      <p className={styles.small}>{memoryStatus || "Approved notes and format structures stay private unless you tick the learning-memory checkbox."}</p>
      <p className={styles.small}>{syncState}. Only your verified Super Admin account can access the private history. Verify operational decisions.</p>
    </div>
    <div className={styles.privacy}>Privacy: messages are sent to NVIDIA's free AI model through Vercel. The provider may retain prompts for model improvement. Private chat history and approved layouts sync to your Supabase account; report source files are not stored. Browser dictation can use its own speech service. Do not share personal data unnecessarily. Report summaries and relevant approved learning notes/format structures are sent to the AI only after their separate explicit opt-ins.</div>
  </section>;
}
