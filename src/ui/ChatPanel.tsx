import { useCallback, useMemo, useRef, useState } from "react";
import { BaziChart, DaYun, DecisionResult } from "../engine/index.ts";
import type { AiToolContext } from "../ai/tools.ts";
import type { ChatMessage, ChatSettings } from "../ai/chatClient.ts";

const KEY_STORE = "wei_ai_key";
const MODEL_STORE = "wei_ai_model";
const CONSENT_STORE = "wei_ai_consent";
const DEFAULT_MODEL = "claude-sonnet-5";

// A serverless relay can be wired in (VITE_AI_PROXY_URL — the local dev proxy in
// vite.config.ts, or the Vercel Edge function in production); when set, the key
// lives server-side and users need no key of their own. Absent → BYOK.
const PROXY_URL: string | undefined = import.meta.env.VITE_AI_PROXY_URL || undefined;

const MODELS = [
  { id: "claude-sonnet-5", label: "Sonnet 5 — balanced (recommended)" },
  { id: "claude-haiku-4-5", label: "Haiku 4.5 — fastest / cheapest" },
  { id: "claude-opus-4-8", label: "Opus 4.8 — most capable" },
];

const TOOL_LABEL: Record<string, string> = {
  list_objectives: "Listing what I can time",
  get_chart_summary: "Reading your chart",
  get_luck_pillars: "Checking your luck cycle",
  get_period_summary: "Looking at that period",
  find_best_days: "Finding your best days",
  evaluate_specific_day: "Checking that day",
};

interface Bubble {
  role: "user" | "assistant";
  text: string;
  tools: string[];
}

const readLS = (k: string): string | null => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const writeLS = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* private mode — settings just won't persist */
  }
};

/** Conversational AI layer over the deterministic reading. Additive: it never
 *  replaces the deterministic Q&A, and stays inert until the user opts in and
 *  configures a key (or a proxy is built in). */
export function ChatPanel({
  chart,
  dayun,
  birth,
  todayIso,
  evaluate,
  evaluateDay,
}: {
  chart: BaziChart;
  dayun: DaYun | null;
  birth: { year: number; month: number; day: number };
  todayIso: string;
  evaluate: (objectiveId: string, windowDays: number) => DecisionResult;
  evaluateDay: (objectiveId: string, isoDate: string) => DecisionResult;
}) {
  const [apiKey, setApiKey] = useState<string>(() => readLS(KEY_STORE) ?? "");
  const [model, setModel] = useState<string>(() => readLS(MODEL_STORE) ?? DEFAULT_MODEL);
  const [consented, setConsented] = useState<boolean>(() => readLS(CONSENT_STORE) === "1");
  const [keyDraft, setKeyDraft] = useState("");
  const [showSettings, setShowSettings] = useState(false);

  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const historyRef = useRef<ChatMessage[]>([]);
  const threadRef = useRef<HTMLDivElement>(null);

  const configured = Boolean(PROXY_URL || apiKey);

  const settings: ChatSettings = useMemo(() => ({ model, apiKey: apiKey || undefined, proxyUrl: PROXY_URL }), [model, apiKey]);

  const ctx: AiToolContext = useMemo(
    () => ({ chart, dayun, birth, todayIso, evaluate, evaluateDay }),
    [chart, dayun, birth, todayIso, evaluate, evaluateDay],
  );

  const enable = () => {
    const k = keyDraft.trim();
    if (!PROXY_URL && !k) return;
    if (k) {
      setApiKey(k);
      writeLS(KEY_STORE, k);
    }
    writeLS(MODEL_STORE, model);
    writeLS(CONSENT_STORE, "1");
    setConsented(true);
    setKeyDraft("");
  };

  const send = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (!text || busy) return;
      setError(null);
      setInput("");
      const assistantIdx = { current: -1 };
      setBubbles((prev) => {
        const next = [...prev, { role: "user" as const, text, tools: [] }, { role: "assistant" as const, text: "", tools: [] }];
        assistantIdx.current = next.length - 1;
        return next;
      });
      setBusy(true);
      const patch = (fn: (b: Bubble) => Bubble) =>
        setBubbles((prev) => prev.map((b, i) => (i === assistantIdx.current ? fn(b) : b)));
      try {
        const mod = await import("../ai/chatClient.ts");
        const updated = await mod.runChat(historyRef.current, text, settings, ctx, {
          onTextDelta: (t) => patch((b) => ({ ...b, text: b.text + t })),
          onToolStart: (name) => patch((b) => ({ ...b, tools: [...b.tools, TOOL_LABEL[name] ?? name] })),
        });
        historyRef.current = updated;
        patch((b) => (b.text ? b : { ...b, text: "(no reply)" }));
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
        // Drop the empty assistant bubble on failure.
        setBubbles((prev) => prev.filter((_, i) => i !== assistantIdx.current));
      } finally {
        setBusy(false);
        requestAnimationFrame(() => threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight }));
      }
    },
    [busy, ctx, settings],
  );

  // ── Setup / consent gate ───────────────────────────────────────────────────
  if (!configured || !consented) {
    return (
      <div className="card" style={{ padding: 20, marginTop: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span className="seal sm" aria-hidden="true">語</span>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Chat with your reading (AI)</h3>
        </div>
        <p style={{ margin: "10px 0 0", fontSize: 13.5, color: "var(--muted)", lineHeight: 1.55 }}>
          Ask open-ended questions and get a conversational explanation. The AI is a narrator over this engine — it
          <b> never calculates</b>; it calls the same deterministic tools you see here and cites what they return.
        </p>
        <div style={{ margin: "12px 0", padding: "10px 12px", background: "var(--warn-bg)", border: "1px solid var(--warn-border)", borderRadius: 10, fontSize: 12.5, color: "var(--warn-ink)", lineHeight: 1.5 }}>
          <b>Before you start:</b> chatting sends your question and your <i>derived chart summary</i> (Day Master, elements —
          not your birth date, time or city) to Anthropic's Claude to explain it. Everything else stays on your device.
        </div>

        {!PROXY_URL && (
          <div>
            <label style={{ fontSize: 12.5, color: "var(--ink)", display: "block", marginBottom: 4 }}>Your Anthropic API key (stored only in this browser)</label>
            <input
              className="qa-input"
              type="password"
              placeholder="sk-ant-…"
              value={keyDraft}
              onChange={(e) => setKeyDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && enable()}
              style={{ width: "100%" }}
            />
            <div style={{ fontSize: 11.5, color: "var(--faint)", marginTop: 5 }}>
              Get one at console.anthropic.com → API keys. It never leaves your browser; the request goes straight to Anthropic.
            </div>
          </div>
        )}

        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12 }}>
          <button className="btn" style={{ maxWidth: 220 }} disabled={!PROXY_URL && !keyDraft.trim()} onClick={enable}>
            {PROXY_URL ? "I understand — start chatting" : "Save key & start"}
          </button>
          <select value={model} onChange={(e) => setModel(e.target.value)} style={{ fontSize: 12.5, padding: "6px 8px", borderRadius: 8 }} aria-label="AI model">
            {MODELS.map((m) => (
              <option key={m.id} value={m.id}>{m.label}</option>
            ))}
          </select>
        </div>
      </div>
    );
  }

  // ── Chat thread ─────────────────────────────────────────────────────────────
  return (
    <div className="card" style={{ padding: 20, marginTop: 18 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span className="seal sm" aria-hidden="true">語</span>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Chat with your reading</h3>
        </div>
        <button className="btn-text" style={{ paddingRight: 0 }} onClick={() => setShowSettings((s) => !s)}>
          {showSettings ? "Close" : "Settings"}
        </button>
      </div>

      {showSettings && (
        <div style={{ margin: "10px 0", padding: 12, border: "1px solid var(--hairline)", borderRadius: 10, display: "flex", flexDirection: "column", gap: 8 }}>
          <label style={{ fontSize: 12.5, color: "var(--ink)" }}>
            Model
            <select value={model} onChange={(e) => { setModel(e.target.value); writeLS(MODEL_STORE, e.target.value); }} style={{ marginLeft: 8, fontSize: 12.5, padding: "4px 8px", borderRadius: 8 }}>
              {MODELS.map((m) => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </select>
          </label>
          {!PROXY_URL && (
            <button
              className="btn-text"
              style={{ alignSelf: "flex-start", paddingLeft: 0, color: "var(--cinnabar)" }}
              onClick={() => { setApiKey(""); writeLS(KEY_STORE, ""); setConsented(false); writeLS(CONSENT_STORE, ""); }}
            >
              Forget my API key
            </button>
          )}
          <span style={{ fontSize: 11.5, color: "var(--faint)" }}>
            {PROXY_URL ? "Using a hosted relay — no key stored." : "Your key is stored only in this browser."}
          </span>
        </div>
      )}

      <div className="qa-thread" ref={threadRef} style={{ maxHeight: 420, overflowY: "auto", marginTop: 12 }}>
        {bubbles.length === 0 && (
          <p style={{ fontSize: 13, color: "var(--muted)", margin: "4px 0 0", lineHeight: 1.55 }}>
            Ask me anything about your timing — I'll pull the numbers from the engine and explain them.
          </p>
        )}
        {bubbles.map((b, i) =>
          b.role === "user" ? (
            <div className="qa-pair" key={i}>
              <div className="qa-q">{b.text}</div>
            </div>
          ) : (
            <div className="qa-a" key={i} style={{ marginBottom: 12 }}>
              {b.tools.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 6 }}>
                  {b.tools.map((t, j) => (
                    <span key={j} style={{ fontSize: 11, color: "var(--muted)", border: "1px solid var(--hairline)", borderRadius: 999, padding: "1px 8px" }}>
                      ◷ {t}
                    </span>
                  ))}
                </div>
              )}
              {b.text ? (
                b.text.split("\n").filter(Boolean).map((line, j) => (
                  <p key={j} style={{ margin: "0 0 6px", lineHeight: 1.55 }}>{line}</p>
                ))
              ) : (
                <p style={{ margin: 0, color: "var(--muted)", fontStyle: "italic" }}>thinking…</p>
              )}
            </div>
          ),
        )}
      </div>

      {error && <div className="warn" style={{ marginTop: 10 }}><span aria-hidden="true">⚠</span> {error}</div>}

      <div className="qa-input-row" style={{ marginTop: 10 }}>
        <input
          className="qa-input"
          type="text"
          value={input}
          placeholder="e.g. “compare my two best wedding days next year”"
          aria-label="Chat with your reading"
          disabled={busy}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send(input)}
        />
        <button className="btn qa-send" disabled={busy || !input.trim()} onClick={() => send(input)}>
          {busy ? "…" : "Send"}
        </button>
      </div>

      {bubbles.length === 0 && (
        <div className="qa-suggest">
          {["When's my best day to sign a contract this year?", "What does my chart suit right now?", "How's 2027 looking for my career?"].map((s) => (
            <button key={s} className="chip ghost" disabled={busy} onClick={() => send(s)}>{s}</button>
          ))}
        </div>
      )}

      <div className="ask-note" style={{ marginTop: 10 }}>
        The AI narrates the engine's deterministic output — it never computes pillars, scores or dates itself. Tendencies, not predictions. One input among many.
      </div>
    </div>
  );
}
