import {
  ArrowUp,
  Github,
  Linkedin,
  MapPin,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

const initialMessage = {
  id: "welcome",
  role: "assistant",
  local: true,
  content:
    "Hi — I’m Virtual Dipsan, Dipsan’s digital twin. Ask me about my experience, research, projects, skills, or what I enjoy outside work.",
};

function createId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function ThinkingIndicator() {
  return (
    <div className="thinking" aria-label="Virtual Dipsan is thinking">
      <span />
      <span />
      <span />
    </div>
  );
}

function Message({ message }) {
  const isAssistant = message.role === "assistant";

  return (
    <article className={`message ${message.role}`}>
      {isAssistant && (
        <div className="message-avatar" aria-hidden="true">
          D
        </div>
      )}
      <div className="message-content">
        <div className="message-label">
          {isAssistant ? "Virtual Dipsan" : "You"}
        </div>
        <div className="message-bubble">
          {message.loading && !message.content ? (
            <ThinkingIndicator />
          ) : (
            <p>{message.content}</p>
          )}
        </div>
      </div>
    </article>
  );
}

function ProfilePanel() {
  return (
    <aside className="profile-panel">
      <div className="profile-glow glow-one" />
      <div className="profile-glow glow-two" />

      <div className="profile-top">
        <a className="wordmark inverse" href="/" aria-label="Ask Dipsan home">
          <span className="wordmark-mark">D</span>
          <span>askdipsan</span>
        </a>
        <span className="profile-index">01 / PROFILE</span>
      </div>

      <div className="portrait-wrap" aria-hidden="true">
        <div className="orbit orbit-one" />
        <div className="orbit orbit-two" />
        <div className="portrait">
          <span>DB</span>
        </div>
        <div className="availability-dot" />
      </div>

      <div className="profile-copy">
        <p className="eyebrow light">I am</p>
        <h1>Virtual<br />Dipsan<span>.</span></h1>
        <p className="profile-role">
          AI researcher <i>×</i> software builder <i>×</i> systems thinker
        </p>
        <p className="profile-intro">
          Ask me about my journey—from edge AI research and production-ready
          software to life beyond work.
        </p>
      </div>

      <div className="profile-meta">
        <div>
          <MapPin size={16} />
          <span>Melbourne, Australia</span>
        </div>
        <div>
          <Sparkles size={16} />
          <span>Research Assistant at Deakin</span>
        </div>
      </div>

      <div className="skill-cloud" aria-label="Featured skills">
        {["Python", "LLMs", "RAG", "PyTorch", "Cloud", "Django"].map((skill) => (
          <span key={skill}>{skill}</span>
        ))}
      </div>

      <div className="profile-links">
        <a
          href="https://www.linkedin.com/in/dipsanbhattarai"
          target="_blank"
          rel="noreferrer"
          aria-label="Dipsan on LinkedIn"
        >
          <Linkedin size={17} />
        </a>
        <a
          href="https://github.com/Dipsan49"
          target="_blank"
          rel="noreferrer"
          aria-label="Dipsan on GitHub"
        >
          <Github size={17} />
        </a>
      </div>
    </aside>
  );
}

export default function App() {
  const [messages, setMessages] = useState([initialMessage]);
  const [question, setQuestion] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [config, setConfig] = useState({ ready: null, model: "" });
  const conversationRef = useRef(null);
  const textareaRef = useRef(null);
  const abortRef = useRef(null);

  useEffect(() => {
    fetch("/api/config")
      .then((response) => response.json())
      .then(setConfig)
      .catch(() => setConfig({ ready: false, model: "" }));

    return () => abortRef.current?.abort();
  }, []);

  useEffect(() => {
    const conversation = conversationRef.current;
    if (!conversation) return;
    conversation.scrollTo({
      top: conversation.scrollHeight,
      behavior: messages.length > 2 ? "smooth" : "auto",
    });
  }, [messages]);

  function resetConversation() {
    abortRef.current?.abort();
    setIsLoading(false);
    setMessages([initialMessage]);
    setQuestion("");
    textareaRef.current?.focus();
  }

  async function askQuestion(value = question) {
    const cleanQuestion = value.trim();
    if (!cleanQuestion || isLoading) return;

    const userMessage = {
      id: createId(),
      role: "user",
      content: cleanQuestion,
    };
    const assistantId = createId();
    const assistantMessage = {
      id: assistantId,
      role: "assistant",
      content: "",
      sources: [],
      loading: true,
    };
    const apiMessages = [...messages, userMessage]
      .filter((message) => !message.local && !message.error)
      .map(({ role, content }) => ({ role, content }));

    setMessages((current) => [...current, userMessage, assistantMessage]);
    setQuestion("");
    setIsLoading(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: apiMessages }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || "Virtual Dipsan could not answer right now.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value: chunk } = await reader.read();
        if (done) break;

        buffer += decoder.decode(chunk, { stream: true });
        let boundary = buffer.indexOf("\n\n");

        while (boundary !== -1) {
          const eventBlock = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);

          const eventName =
            eventBlock.match(/^event:\s*(.+)$/m)?.[1]?.trim() || "message";
          const data = eventBlock
            .split("\n")
            .filter((line) => line.startsWith("data:"))
            .map((line) => line.slice(5).trim())
            .join("\n");

          if (data) {
            const payload = JSON.parse(data);

            if (eventName === "sources") {
              setMessages((current) =>
                current.map((message) =>
                  message.id === assistantId
                    ? { ...message, sources: payload }
                    : message,
                ),
              );
            }

            if (eventName === "delta") {
              setMessages((current) =>
                current.map((message) =>
                  message.id === assistantId
                    ? {
                        ...message,
                        content: message.content + payload.delta,
                        loading: false,
                      }
                    : message,
                ),
              );
            }

            if (eventName === "error") {
              throw new Error(payload.error);
            }
          }

          boundary = buffer.indexOf("\n\n");
        }
      }
    } catch (error) {
      if (error.name === "AbortError") return;
      setMessages((current) =>
        current.map((message) =>
          message.id === assistantId
            ? {
                ...message,
                content: error.message,
                loading: false,
                error: true,
              }
            : message,
        ),
      );
    } finally {
      setIsLoading(false);
      abortRef.current = null;
      textareaRef.current?.focus();
    }
  }

  function handleKeyDown(event) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      askQuestion();
    }
  }

  return (
    <main className="app-shell">
      <div className="app-frame">
        <ProfilePanel />

        <section className="chat-panel">
          <header className="chat-header">
            <div className="mobile-wordmark">
              <span className="wordmark-mark">D</span>
              <span>askdipsan</span>
            </div>
            <div className="header-context">
              <span className={`status-dot ${config.ready === false ? "offline" : ""}`} />
              <div>
                <strong>Virtual Dipsan</strong>
                <span>
                  {config.ready === null
                    ? "Checking connection…"
                    : config.ready
                      ? "Online · Ready to chat"
                      : "Temporarily unavailable"}
                </span>
              </div>
            </div>
            <div className="header-actions">
              <button
                className="icon-button"
                onClick={resetConversation}
                aria-label="Start a new conversation"
                title="New conversation"
              >
                <RotateCcw size={17} />
              </button>
            </div>
          </header>

          <div className="conversation" ref={conversationRef}>
            <div className="conversation-inner">
              {messages.length === 1 && (
                <div className="chat-intro">
                  <div className="intro-icon">
                    <Sparkles size={21} />
                  </div>
                  <h2>Ask me anything.</h2>
                  <p>
                    I can talk about my work, research, skills, projects, and
                    interests beyond technology.
                  </p>
                </div>
              )}

              <div className="message-list" aria-live="polite">
                {messages.map((message) => (
                  <Message message={message} key={message.id} />
                ))}
              </div>

            </div>
          </div>

          <div className="composer-area">
            {config.ready === false && (
              <div className="setup-banner" role="status">
                <span>Virtual Dipsan is temporarily unavailable</span>
                <span>Try again shortly</span>
              </div>
            )}
            <div className="composer">
              <textarea
                ref={textareaRef}
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                onKeyDown={handleKeyDown}
                rows="1"
                maxLength="3000"
                placeholder="Ask me anything…"
                aria-label="Question for Virtual Dipsan"
              />
              <button
                className="send-button"
                onClick={() => askQuestion()}
                disabled={!question.trim() || isLoading}
                aria-label="Send question"
              >
                <ArrowUp size={19} strokeWidth={2.4} />
              </button>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
