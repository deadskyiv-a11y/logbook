import { useState, useEffect, useRef } from “react”;

const STORAGE_KEY = “logbook_entries”;

function formatTime(date) {
return date.toLocaleTimeString(“en-GB”, { hour: “2-digit”, minute: “2-digit” });
}

function formatDate(date) {
return date.toLocaleDateString(“en-GB”, { weekday: “long”, day: “numeric”, month: “long”, year: “numeric” });
}

function formatDateShort(dateStr) {
const d = new Date(dateStr);
return d.toLocaleDateString(“en-GB”, { day: “numeric”, month: “short” });
}

function groupByDate(entries) {
const groups = {};
entries.forEach(entry => {
const key = new Date(entry.timestamp).toDateString();
if (!groups[key]) groups[key] = [];
groups[key].push(entry);
});
return groups;
}

export default function App() {
const [entries, setEntries] = useState(() => {
try {
return JSON.parse(localStorage.getItem(STORAGE_KEY) || “[]”);
} catch { return []; }
});
const [text, setText] = useState(””);
const [location, setLocation] = useState(””);
const [locLoading, setLocLoading] = useState(false);
const [now, setNow] = useState(new Date());
const [justAdded, setJustAdded] = useState(null);
const [view, setView] = useState(“log”); // “log” | “write”
const textRef = useRef(null);

useEffect(() => {
const t = setInterval(() => setNow(new Date()), 1000);
return () => clearInterval(t);
}, []);

useEffect(() => {
try {
localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
} catch {}
}, [entries]);

function getLocation() {
if (!navigator.geolocation) return;
setLocLoading(true);
navigator.geolocation.getCurrentPosition(
async pos => {
const { latitude, longitude } = pos.coords;
try {
const res = await fetch(
`https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`
);
const data = await res.json();
const addr = data.address;
const place =
addr.suburb || addr.neighbourhood || addr.quarter ||
addr.city_district || addr.city || addr.town || addr.village || “”;
const city = addr.city || addr.town || addr.county || “”;
setLocation(place && city && place !== city ? `${place}, ${city}` : place || city || “Unknown”);
} catch {
setLocation(`${latitude.toFixed(3)}, ${longitude.toFixed(3)}`);
}
setLocLoading(false);
},
() => { setLocLoading(false); }
);
}

function addEntry() {
if (!text.trim()) return;
const entry = {
id: Date.now(),
timestamp: new Date().toISOString(),
text: text.trim(),
location: location.trim(),
};
setEntries(prev => [entry, …prev]);
setJustAdded(entry.id);
setText(””);
setLocation(””);
setView(“log”);
setTimeout(() => setJustAdded(null), 2000);
}

function deleteEntry(id) {
setEntries(prev => prev.filter(e => e.id !== id));
}

const grouped = groupByDate(entries);
const sortedDates = Object.keys(grouped).sort((a, b) => new Date(b) - new Date(a));

return (
<div style={{
fontFamily: “‘Lora’, ‘Georgia’, serif”,
background: “#faf9f6”,
minHeight: “100vh”,
color: “#1a1a18”,
}}>
<style>{`
@import url(‘https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400;0,500;0,600;1,400&family=DM+Mono:wght@300;400&display=swap’);

```
    * { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      --paper: #faf9f6;
      --ink: #1a1a18;
      --ink-light: #5c5c56;
      --ink-faint: #9a9a90;
      --rule: #e4e2db;
      --accent: #c0392b;
      --accent-soft: #f0e8e6;
    }

    body { background: var(--paper); }

    .header {
      position: sticky; top: 0; z-index: 10;
      background: var(--paper);
      border-bottom: 1px solid var(--rule);
      padding: 16px 20px 12px;
      display: flex; align-items: baseline; justify-content: space-between;
    }

    .wordmark {
      font-family: 'Lora', serif;
      font-size: 13px;
      font-weight: 600;
      letter-spacing: 0.15em;
      text-transform: uppercase;
      color: var(--ink);
    }

    .live-clock {
      font-family: 'DM Mono', monospace;
      font-size: 11px;
      font-weight: 300;
      color: var(--ink-faint);
      letter-spacing: 0.05em;
    }

    .tab-bar {
      display: flex;
      border-bottom: 1px solid var(--rule);
      padding: 0 20px;
    }

    .tab {
      font-family: 'Lora', serif;
      font-size: 12px;
      font-weight: 400;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--ink-faint);
      padding: 10px 0 9px;
      margin-right: 24px;
      cursor: pointer;
      border-bottom: 1.5px solid transparent;
      background: none; border-left: none; border-right: none; border-top: none;
      transition: color 0.15s, border-color 0.15s;
    }
    .tab.active {
      color: var(--ink);
      border-bottom-color: var(--ink);
    }
    .tab:hover { color: var(--ink); }

    .write-panel {
      padding: 28px 20px 20px;
      max-width: 640px;
      margin: 0 auto;
    }

    .date-label {
      font-family: 'DM Mono', monospace;
      font-size: 10px;
      font-weight: 300;
      color: var(--ink-faint);
      letter-spacing: 0.1em;
      text-transform: uppercase;
      margin-bottom: 16px;
    }

    .textarea {
      width: 100%;
      font-family: 'Lora', serif;
      font-size: 17px;
      line-height: 1.65;
      color: var(--ink);
      background: transparent;
      border: none;
      outline: none;
      resize: none;
      min-height: 120px;
      border-bottom: 1px solid var(--rule);
      padding-bottom: 12px;
      caret-color: var(--accent);
    }
    .textarea::placeholder { color: var(--ink-faint); font-style: italic; }

    .location-row {
      display: flex; align-items: center; gap: 10px;
      margin-top: 14px; margin-bottom: 20px;
    }

    .location-input {
      flex: 1;
      font-family: 'DM Mono', monospace;
      font-size: 11px;
      font-weight: 300;
      color: var(--ink-light);
      background: transparent;
      border: none; outline: none;
      border-bottom: 1px solid var(--rule);
      padding: 4px 0 5px;
      letter-spacing: 0.04em;
    }
    .location-input::placeholder { color: var(--ink-faint); }

    .loc-btn {
      font-family: 'DM Mono', monospace;
      font-size: 10px;
      color: var(--accent);
      background: none; border: none;
      cursor: pointer; letter-spacing: 0.05em;
      padding: 0; white-space: nowrap;
      opacity: 0.85;
      transition: opacity 0.15s;
    }
    .loc-btn:hover { opacity: 1; }

    .submit-btn {
      font-family: 'Lora', serif;
      font-size: 13px;
      font-weight: 500;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--paper);
      background: var(--ink);
      border: none; cursor: pointer;
      padding: 11px 28px;
      display: block;
      margin-left: auto;
      transition: background 0.15s;
    }
    .submit-btn:hover { background: #2d2d2a; }
    .submit-btn:disabled { background: var(--rule); color: var(--ink-faint); cursor: default; }

    .log-panel {
      max-width: 640px;
      margin: 0 auto;
      padding-bottom: 60px;
    }

    .day-group { padding: 0 20px; }

    .day-header {
      font-family: 'DM Mono', monospace;
      font-size: 10px;
      font-weight: 300;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--ink-faint);
      padding: 24px 0 10px;
      border-bottom: 1px solid var(--rule);
      display: flex; justify-content: space-between; align-items: baseline;
    }

    .day-count {
      font-size: 9px;
      color: var(--rule);
    }

    .entry {
      display: grid;
      grid-template-columns: 52px 1fr 20px;
      gap: 0 14px;
      padding: 16px 0;
      border-bottom: 1px solid var(--rule);
      animation: fadeSlide 0.3s ease;
    }
    .entry.new { background: var(--accent-soft); animation: highlight 2s ease forwards; }

    @keyframes fadeSlide {
      from { opacity: 0; transform: translateY(-6px); }
      to { opacity: 1; transform: translateY(0); }
    }
    @keyframes highlight {
      0% { background: var(--accent-soft); }
      100% { background: transparent; }
    }

    .entry-time {
      font-family: 'DM Mono', monospace;
      font-size: 12px;
      font-weight: 300;
      color: var(--ink-faint);
      letter-spacing: 0.04em;
      padding-top: 2px;
      line-height: 1.4;
    }

    .entry-body { }

    .entry-text {
      font-family: 'Lora', serif;
      font-size: 15px;
      line-height: 1.6;
      color: var(--ink);
      margin-bottom: 4px;
    }

    .entry-location {
      font-family: 'DM Mono', monospace;
      font-size: 10px;
      font-weight: 300;
      color: var(--ink-faint);
      letter-spacing: 0.04em;
    }
    .entry-location::before {
      content: '↳ ';
      color: var(--accent);
      font-size: 9px;
    }

    .delete-btn {
      background: none; border: none;
      color: var(--rule);
      cursor: pointer;
      font-size: 14px;
      line-height: 1;
      padding: 0;
      transition: color 0.15s;
      align-self: start;
      padding-top: 3px;
    }
    .delete-btn:hover { color: var(--accent); }

    .empty-state {
      padding: 60px 20px;
      text-align: center;
      color: var(--ink-faint);
      font-family: 'Lora', serif;
      font-size: 15px;
      font-style: italic;
      line-height: 1.8;
    }

    .count-badge {
      font-family: 'DM Mono', monospace;
      font-size: 10px;
      color: var(--ink-faint);
    }
  `}</style>

  {/* Header */}
  <div className="header">
    <span className="wordmark">Log</span>
    <span className="live-clock">{formatTime(now)}</span>
  </div>

  {/* Tabs */}
  <div className="tab-bar">
    <button className={`tab ${view === "log" ? "active" : ""}`} onClick={() => setView("log")}>
      Entries {entries.length > 0 && <span className="count-badge">({entries.length})</span>}
    </button>
    <button className={`tab ${view === "write" ? "active" : ""}`} onClick={() => { setView("write"); setTimeout(() => textRef.current?.focus(), 50); }}>
      + New
    </button>
  </div>

  {/* Write Panel */}
  {view === "write" && (
    <div className="write-panel">
      <div className="date-label">{formatDate(now)}</div>
      <textarea
        ref={textRef}
        className="textarea"
        value={text}
        onChange={e => setText(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) addEntry(); }}
        placeholder="What's happening right now..."
        rows={5}
        autoFocus
      />
      <div className="location-row">
        <input
          className="location-input"
          value={location}
          onChange={e => setLocation(e.target.value)}
          placeholder="Location (optional)"
        />
        <button className="loc-btn" onClick={getLocation} disabled={locLoading}>
          {locLoading ? "Locating..." : "Use GPS"}
        </button>
      </div>
      <button
        className="submit-btn"
        onClick={addEntry}
        disabled={!text.trim()}
      >
        Log it
      </button>
    </div>
  )}

  {/* Log Panel */}
  {view === "log" && (
    <div className="log-panel">
      {entries.length === 0 ? (
        <div className="empty-state">
          Nothing logged yet.<br />Tap <em>+ New</em> to record your first entry.
        </div>
      ) : (
        sortedDates.map(dateKey => (
          <div key={dateKey} className="day-group">
            <div className="day-header">
              <span>{formatDate(new Date(dateKey))}</span>
              <span className="day-count">{grouped[dateKey].length} {grouped[dateKey].length === 1 ? "entry" : "entries"}</span>
            </div>
            {grouped[dateKey].map(entry => (
              <div key={entry.id} className={`entry ${justAdded === entry.id ? "new" : ""}`}>
                <div className="entry-time">{formatTime(new Date(entry.timestamp))}</div>
                <div className="entry-body">
                  <div className="entry-text">{entry.text}</div>
                  {entry.location && (
                    <div className="entry-location">{entry.location}</div>
                  )}
                </div>
                <button className="delete-btn" onClick={() => deleteEntry(entry.id)} title="Delete">×</button>
              </div>
            ))}
          </div>
        ))
      )}
    </div>
  )}
</div>
```

);
}
