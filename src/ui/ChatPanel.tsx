import { ReactNode, useCallback, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  BaziChart,
  DaYun,
  DecisionResult,
  analyzeProfile,
  composeProfileAnswer,
  composeTimingAnswer,
  composeUnknownAnswer,
  objectiveById,
  objectivePlain,
  parseAdvisorQuery,
} from "../engine/index.ts";
import type { AdvisorAnswer, BoundaryAlternative } from "../engine/index.ts";
import { useAuth } from "./profile/AuthContext.tsx";
import { useEntitlements } from "./profile/EntitlementsContext.tsx";
import { buildChatChips } from "./chatChips.ts";
import { splitDateTokens } from "./chatDates.ts";
import type { AiToolContext } from "../ai/tools.ts";
import type { ChatMessage, ChatSettings } from "../ai/chatClient.ts";

const KEY_STORE = "wei_ai_key";
const MODEL_STORE = "wei_ai_model";
const CONSENT_STORE = "wei_ai_consent";
const DEFAULT_MODEL = "claude-sonnet-5";

// VITE_AI_PROXY_URL wires the chat through a relay that holds the key server-side
// (the local dev proxy in vite.config.ts). On the static GitHub Pages build it is
// unset, so the deployed app uses BYOK — each user enters their own key.
const PROXY_URL: string | undefined = import.meta.env.VITE_AI_PROXY_URL || undefined;

const MODELS = [
  { id: "claude-sonnet-5", label: "Sonnet 5 — balanced (recommended)" },
  { id: "claude-haiku-4-5", label: "Haiku 4.5 — fastest / cheapest" },
  { id: "claude-opus-4-8", label: "Opus 4.8 — most capable" },
];

const TOOL_LABEL: Record<string, string> = {
  list_objectives: "Listing what I can time",
  get_chart_summary: "Reading your chart",
  get_natal_chart: "Reading your full natal chart",
  get_profile_fits: "Ranking your best fits",
  get_luck_pillars: "Checking your luck cycle",
  get_period_summary: "Looking at that period",
  find_best_days: "Finding your best days",
  evaluate_specific_day: "Checking that day",
};

/** Search horizon for the offline (no-key) deterministic advisor. */
const OFFLINE_WINDOW_DAYS = 92;

/** Sentence verb for an objective, for building suggestion chips. */
const offlineVerb = (id: string) => objectivePlain(id).verb;

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
  boundary,
}: {
  chart: BaziChart;
  dayun: DaYun | null;
  birth: { year: number; month: number; day: number };
  todayIso: string;
  evaluate: (objectiveId: string, windowDays: number) => DecisionResult;
  evaluateDay: (objectiveId: string, isoDate: string) => DecisionResult;
  /** Passed through to the advisor so it can't narrate an ambiguous chart as settled. */
  boundary?: BoundaryAlternative[];
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
  const [outOfQuota, setOutOfQuota] = useState(false);
  const [retryText, setRetryText] = useState<string | null>(null);
  const historyRef = useRef<ChatMessage[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const threadRef = useRef<HTMLDivElement>(null);

  const auth = useAuth();
  const { quota, entitlement, noteAiMessage, releaseAiMessage, billingAvailable, can, clamp } = useEntitlements();
  const configured = Boolean(PROXY_URL || apiKey);
  // Metering only exists behind the hosted relay. A BYOK user is spending their
  // own Anthropic key, so it isn't ours to ration.
  const metered = Boolean(PROXY_URL) && auth.enabled && Boolean(auth.user);
  const blocked = metered && (outOfQuota || !quota.allowed);

  const settings: ChatSettings = useMemo(() => ({ model, apiKey: apiKey || undefined, proxyUrl: PROXY_URL }), [model, apiKey]);

  const ctx: AiToolContext = useMemo(
    () => ({ chart, dayun, birth, todayIso, evaluate, evaluateDay, boundary, can }),
    [chart, dayun, birth, todayIso, evaluate, evaluateDay, boundary, can],
  );

  // Suggested chips come from the user's ACTUAL chart (their top fit, their
  // weakest fit) — and a free user is never handed a chip that paywalls.
  const isPro = can("luck_pillars");
  const chips = useMemo(() => buildChatChips(chart, isPro), [chart, isPro]);

  // ── Offline deterministic advisor (no key, no proxy — never a dead end) ────
  const profile = useMemo(() => analyzeProfile(chart), [chart]);
  const [offlineExchanges, setOfflineExchanges] = useState<{ id: number; question: string; answer: AdvisorAnswer }[]>([]);
  const offlineId = useRef(1);
  const askOffline = useCallback(
    (raw: string) => {
      const q = raw.trim();
      if (!q) return;
      const intent = parseAdvisorQuery(q);
      let answer: AdvisorAnswer;
      if (intent.kind === "timing" && intent.objectiveId) {
        // The answer must describe the window that was actually SEARCHED — the
        // plan clamp caps length, so claiming the requested horizon would lie
        // to a free user who asked about "next year".
        const requested = intent.windowDays ?? OFFLINE_WINDOW_DAYS;
        const { days: win, capped } = clamp(requested);
        answer = composeTimingAnswer(objectiveById(intent.objectiveId), evaluate(intent.objectiveId, win), todayIso, win);
        if (capped) {
          answer = {
            ...answer,
            paragraphs: [
              ...answer.paragraphs,
              `Searched the next ${win} days — your plan's horizon. A Pro plan searches up to five years out.`,
            ],
          };
        }
      } else if (intent.kind === "profile") {
        answer = composeProfileAnswer(profile);
      } else {
        answer = composeUnknownAnswer(profile);
      }
      setOfflineExchanges((prev) => [...prev, { id: offlineId.current++, question: q, answer }]);
      setInput("");
    },
    [evaluate, profile, todayIso, clamp],
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
      if (!text || busy || blocked) return;
      setError(null);
      setRetryText(null);
      setInput("");
      if (metered) noteAiMessage(); // move the local counter now; the server is authoritative
      const assistantIdx = { current: -1 };
      setBubbles((prev) => {
        const next = [...prev, { role: "user" as const, text, tools: [] }, { role: "assistant" as const, text: "", tools: [] }];
        assistantIdx.current = next.length - 1;
        return next;
      });
      setBusy(true);
      const controller = new AbortController();
      abortRef.current = controller;
      const patch = (fn: (b: Bubble) => Bubble) =>
        setBubbles((prev) => prev.map((b, i) => (i === assistantIdx.current ? fn(b) : b)));
      try {
        // A secured Cloud-Function proxy verifies the caller's Firebase ID token.
        const authToken = PROXY_URL ? (await auth.getIdToken()) ?? undefined : undefined;
        const mod = await import("../ai/chatClient.ts");
        const updated = await mod.runChat(
          historyRef.current,
          text,
          { ...settings, authToken },
          ctx,
          {
            onTextDelta: (t) => patch((b) => ({ ...b, text: b.text + t })),
            onToolStart: (name) => patch((b) => ({ ...b, tools: [...b.tools, TOOL_LABEL[name] ?? name] })),
          },
          controller.signal,
        );
        historyRef.current = updated;
        patch((b) => (b.text ? b : { ...b, text: "(no reply)" }));
      } catch (e) {
        const aborted = controller.signal.aborted || (e instanceof DOMException && e.name === "AbortError");
        if (aborted) {
          // A stop still consumed the upstream call, but the user got nothing
          // useful — don't bill the local counter for it either.
          if (metered) releaseAiMessage();
          // Keep whatever streamed before the stop.
          patch((b) => ({ ...b, text: b.text ? `${b.text} …(stopped)` : "(stopped)" }));
        } else {
          const quotaHit = e instanceof Error && e.name === "QuotaError";
          // Give the optimistic message back unless the SERVER said we're out —
          // otherwise five failed sends silently lock the session until reload.
          if (metered && !quotaHit) releaseAiMessage();
          setError(e instanceof Error ? e.message : String(e));
          // A quota block isn't retryable — offering "Retry" would just fail again.
          setOutOfQuota(quotaHit);
          setRetryText(quotaHit ? null : text);
          // Roll back the just-added user + empty assistant bubbles; restore the input.
          setBubbles((prev) => prev.slice(0, Math.max(0, assistantIdx.current - 1)));
          setInput(text);
        }
      } finally {
        abortRef.current = null;
        setBusy(false);
        requestAnimationFrame(() => threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight }));
      }
    },
    [busy, ctx, settings, auth],
  );

  const stop = () => abortRef.current?.abort();
  const newChat = () => {
    stop();
    historyRef.current = [];
    setBubbles([]);
    setError(null);
    setRetryText(null);
    // Clear the latch too. The server stamps "quota_exceeded" on its fail-CLOSED
    // path as well as a genuine limit, so a Firestore blip used to switch the
    // advisor off for the rest of the session with no way back but a reload.
    setOutOfQuota(false);
    setInput("");
  };

  // ── Not configured / not consented → offline deterministic advisor ─────────
  // No key wall: the same input answers questions through the deterministic
  // advisor (advisor.ts), clearly labelled. Full AI chat is a collapsible setup.
  if (!configured || !consented) {
    const offlineChips = [
      ...(profile.top[0] ? [`When should I ${offlineVerb(profile.top[0].objectiveId)}?`] : []),
      ...(profile.top[1] ? [`Best time to ${offlineVerb(profile.top[1].objectiveId)} in the next 6 months?`] : []),
      "What does my chart suit?",
    ];
    return (
      <div className="card" style={{ padding: 20, marginTop: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span className="seal sm" aria-hidden="true">語</span>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Ask about your reading</h3>
          <span style={{ fontSize: 11, color: "var(--muted)", border: "1px solid var(--hairline)", borderRadius: 999, padding: "1px 8px" }}>
            Offline advisor — deterministic, no AI
          </span>
        </div>
        <p style={{ margin: "10px 0 0", fontSize: 13.5, color: "var(--muted)", lineHeight: 1.55 }}>
          Ask in your own words — answers come straight from the engine on your device. Same question, same answer,
          every time. Nothing leaves your browser.
        </p>

        {offlineExchanges.length > 0 && (
          <div className="qa-thread" style={{ marginTop: 12 }}>
            {offlineExchanges.map((ex) => (
              <div className="qa-pair" key={ex.id}>
                <div className="qa-q">{ex.question}</div>
                <div className="qa-a">
                  <div className="qa-a-title">{ex.answer.title}</div>
                  {ex.answer.paragraphs.map((p, i) => (
                    <p key={i}>{p}</p>
                  ))}
                  {ex.answer.action?.pickIso && (
                    <Link className="btn-text" style={{ paddingLeft: 0 }} to={`/day/${ex.answer.action.pickIso}`}>
                      Open that day's full reading ›
                    </Link>
                  )}
                  <div style={{ fontSize: 10.5, color: "var(--faint)", marginTop: 4 }}>Offline advisor — deterministic, no AI</div>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="qa-input-row" style={{ marginTop: 10 }}>
          <input
            className="qa-input"
            type="text"
            value={input}
            placeholder={'e.g. "when should I sign the contract?"'}
            aria-label="Ask about your reading (offline advisor)"
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && askOffline(input)}
          />
          <button className="btn qa-send" disabled={!input.trim()} onClick={() => askOffline(input)}>Ask</button>
        </div>

        {offlineExchanges.length === 0 && (
          <div className="qa-suggest">
            {offlineChips.map((s) => (
              <button key={s} className="chip ghost" onClick={() => askOffline(s)}>{s}</button>
            ))}
          </div>
        )}

        <details className="dossier" style={{ marginTop: 14 }}>
          <summary>Want the conversational version? Set up AI chat</summary>
          <div className="dossier-body">
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

            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
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
        </details>
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
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {metered && (
            <span className="quota-chip" title={`${quota.used} of ${quota.limit} used today`}>
              {quota.remaining} left today
            </span>
          )}
          {bubbles.length > 0 && (
            <button className="btn-text" onClick={newChat}>New chat</button>
          )}
          <button className="btn-text" style={{ paddingRight: 0 }} onClick={() => setShowSettings((s) => !s)}>
            {showSettings ? "Close" : "Settings"}
          </button>
        </div>
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
                <RichText text={b.text} />
              ) : (
                <p style={{ margin: 0, color: "var(--muted)", fontStyle: "italic" }}>thinking…</p>
              )}
            </div>
          ),
        )}
      </div>

      {error && (
        <div className="warn" style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span><span aria-hidden="true">⚠</span> {error}</span>
          {retryText && (
            <button className="btn-text" style={{ padding: 0, color: "var(--warn-ink)", fontWeight: 600 }} onClick={() => send(retryText)}>
              Retry
            </button>
          )}
          {outOfQuota && !entitlement.active && billingAvailable && (
            <Link className="btn-text" style={{ padding: 0, color: "var(--warn-ink)", fontWeight: 600 }} to="/pricing">
              See Pro
            </Link>
          )}
        </div>
      )}

      <div className="qa-input-row" style={{ marginTop: 10 }}>
        <input
          className="qa-input"
          type="text"
          value={input}
          placeholder={blocked ? "You're out of advisor messages for today" : "e.g. “compare my two best wedding days next year”"}
          aria-label="Chat with your reading"
          disabled={busy || blocked}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send(input)}
        />
        {busy ? (
          <button className="btn qa-send" onClick={stop} title="Stop generating">■ Stop</button>
        ) : (
          <button className="btn qa-send" disabled={!input.trim() || blocked} onClick={() => send(input)}>Send</button>
        )}
      </div>

      {blocked && !entitlement.active && (
        <p className="ask-note" style={{ marginTop: 8 }}>
          Your free allowance resets at midnight UTC. The rest of the app — every reading, score and forecast — keeps
          working; only the AI narration is metered.
        </p>
      )}

      {bubbles.length === 0 && (
        <div className="qa-suggest">
          {chips.map((c) => (
            <button key={c.label} className="chip ghost" disabled={busy || blocked} onClick={() => send(c.prompt)}>
              {c.pro ? <><b>Pro</b> · {c.label}</> : c.label}
            </button>
          ))}
        </div>
      )}

      <div className="ask-note" style={{ marginTop: 10 }}>
        The AI narrates the engine's deterministic output — it never computes pillars, scores or dates itself. Tendencies, not predictions. One input among many.
      </div>
    </div>
  );
}

// ── minimal markdown: **bold** inline + `- ` / `• ` bullets + date links ─────

/** Render text with [YYYY-MM-DD] tokens (and bare ISO dates) as tappable
 *  day-reading chips — any date the advisor names is one tap from its evidence. */
function renderDates(text: string, keyPrefix: string): ReactNode[] {
  return splitDateTokens(text).map((seg, i) =>
    seg.kind === "date" ? (
      <Link
        key={`${keyPrefix}d${i}`}
        to={`/day/${seg.iso}`}
        title="Open this day's full reading"
        style={{
          display: "inline-block",
          border: "1px solid var(--hairline)",
          borderRadius: 999,
          padding: "0 8px",
          fontSize: "0.92em",
          fontWeight: 600,
          color: "var(--ink)",
          textDecoration: "none",
          whiteSpace: "nowrap",
        }}
      >
        {seg.display}
      </Link>
    ) : (
      <span key={`${keyPrefix}t${i}`}>{seg.text}</span>
    ),
  );
}

function renderInline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? (
      <strong key={i}>{renderDates(part.slice(2, -2), `s${i}`)}</strong>
    ) : (
      <span key={i}>{renderDates(part, `p${i}`)}</span>
    ),
  );
}

function RichText({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  let bullets: string[] = [];
  const flush = (key: string) => {
    if (!bullets.length) return;
    blocks.push(
      <ul key={`u${key}`} style={{ margin: "2px 0 6px", paddingLeft: 18 }}>
        {bullets.map((b, i) => (
          <li key={i} style={{ marginBottom: 2, lineHeight: 1.5 }}>{renderInline(b)}</li>
        ))}
      </ul>,
    );
    bullets = [];
  };
  text.split("\n").forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return flush(`b${i}`);
    const m = line.match(/^[-*•]\s+(.*)/);
    if (m) {
      bullets.push(m[1]);
      return;
    }
    flush(`b${i}`);
    blocks.push(
      <p key={`p${i}`} style={{ margin: "0 0 6px", lineHeight: 1.55 }}>{renderInline(line)}</p>,
    );
  });
  flush("end");
  return <>{blocks}</>;
}
