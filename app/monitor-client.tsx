"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const STORAGE_KEY = "yangin-monitor-url";
const ALEV_ALARM_BELOW = 1500;
const GAZ_ALARM_ABOVE = 800;
const FETCH_MS = 10_000;

/** Kullanıcı sadece IP veya IP:port girer; http(s) yoksa http eklenir, sondaki / temizlenir */
function normalizeUrl(s: string): string {
  let t = s.trim().replace(/^['"]|['"]$/g, "");
  if (!t) return "";
  if (t.startsWith("//")) t = "http:" + t;
  else if (!/^https?:\/\//i.test(t)) t = "http://" + t.replace(/^\/+/, "");
  try {
    const u = new URL(t);
    if (!u.hostname) return "";
    const path = u.pathname.replace(/\/+$/, "");
    const pathPart = path === "/" || path === "" ? "" : path;
    return u.origin + pathPart + u.search + u.hash;
  } catch {
    return t.replace(/\/+$/, "");
  }
}

function stripProtocolForDisplay(fullUrl: string): string {
  return fullUrl.replace(/^https?:\/\//i, "").replace(/\/+$/, "");
}

function parseHtml(html: string): { alev: number; gaz: number } {
  const a = /Alev:\s*([0-9.-]+)/i.exec(html);
  const g = /Gaz:\s*([0-9.-]+)/i.exec(html);
  return {
    alev: a ? parseFloat(a[1]) : NaN,
    gaz: g ? parseFloat(g[1]) : NaN,
  };
}

function isAlarm(alev: number, gaz: number): boolean | null {
  if (Number.isNaN(alev) || Number.isNaN(gaz)) return null;
  return alev < ALEV_ALARM_BELOW || gaz > GAZ_ALARM_ABOVE;
}

type HeadlineKind = "ok" | "alarm" | "err";

function stopAlarmLoop(ref: {
  intervalId: ReturnType<typeof setInterval> | null;
  ctx: AudioContext | null;
}) {
  if (ref.intervalId) {
    clearInterval(ref.intervalId);
    ref.intervalId = null;
  }
  if (ref.ctx) {
    void ref.ctx.close();
    ref.ctx = null;
  }
}

export default function MonitorClient() {
  const [baseUrl, setBaseUrl] = useState("");
  const [intervalSec, setIntervalSec] = useState(3);
  const [running, setRunning] = useState(false);
  const [connState, setConnState] = useState("Hazır");
  const [headline, setHeadline] = useState("Adresi girip başlatın");
  const [headlineKind, setHeadlineKind] = useState<HeadlineKind>("ok");
  const [alev, setAlev] = useState<number | null>(null);
  const [gaz, setGaz] = useState<number | null>(null);
  const [panelMode, setPanelMode] = useState<"idle" | "alarm" | "ok" | "loading">(
    "loading"
  );
  const [showMetrics, setShowMetrics] = useState(false);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const alarmAudioRef = useRef<{
    intervalId: ReturnType<typeof setInterval> | null;
    ctx: AudioContext | null;
  }>({ intervalId: null, ctx: null });

  useEffect(() => {
    try {
      const u = localStorage.getItem(STORAGE_KEY);
      if (u) setBaseUrl(stripProtocolForDisplay(u));
    } catch {
      /* ignore */
    }
  }, []);

  const applyReading = useCallback(
    (nextAlev: number, nextGaz: number, err: string | null) => {
      setShowMetrics(true);
      if (err) {
        setConnState("Hata");
        setHeadlineKind("err");
        setHeadline(err);
        setAlev(null);
        setGaz(null);
        setPanelMode("loading");
        return;
      }
      if (Number.isNaN(nextAlev) || Number.isNaN(nextGaz)) {
        setConnState("Veri okunamadı");
        setHeadlineKind("err");
        setHeadline("Sayfa içinde Alev/Gaz bulunamadı");
        setAlev(Number.isNaN(nextAlev) ? null : nextAlev);
        setGaz(Number.isNaN(nextGaz) ? null : nextGaz);
        setPanelMode("loading");
        return;
      }
      setAlev(nextAlev);
      setGaz(nextGaz);
      const alarm = isAlarm(nextAlev, nextGaz);
      if (alarm) {
        setConnState("Alarm");
        setPanelMode("alarm");
        setHeadlineKind("alarm");
        setHeadline("ALARM AKTİF!");
      } else {
        setConnState("Normal");
        setPanelMode("ok");
        setHeadlineKind("ok");
        setHeadline("Sistem normal");
      }
    },
    []
  );

  const tick = useCallback(() => {
    const url = normalizeUrl(baseUrl);
    if (!url) {
      applyReading(NaN, NaN, "IP girin");
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), FETCH_MS);
    fetch(url, {
      method: "GET",
      cache: "no-store",
      signal: ctrl.signal,
      headers: { Accept: "text/html,*/*" },
    })
      .then(async (res) => {
        clearTimeout(t);
        const body = await res.text();
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        return body;
      })
      .then((html) => {
        const p = parseHtml(html);
        applyReading(p.alev, p.gaz, null);
      })
      .catch((e: unknown) => {
        clearTimeout(t);
        let msg = e instanceof Error ? e.message : String(e);
        if (e instanceof DOMException && e.name === "AbortError") {
          msg = "Zaman aşımı (cihaz yanıt vermedi)";
        } else if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) {
          msg =
            "Ağ/CORS: tarayıcı cihaza ulaşamadı. Aynı Wi‑Fi’de misiniz? Cihaz Access-Control-Allow-Origin (ör. *) göndermeli.";
        }
        applyReading(NaN, NaN, msg);
      });
  }, [baseUrl, applyReading]);

  const stop = useCallback(() => {
    setRunning(false);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setConnState("Durduruldu");
    setHeadlineKind("ok");
    setHeadline("Başlat ile yeniden dinle");
    setPanelMode("loading");
  }, []);

  const start = useCallback(() => {
    const url = normalizeUrl(baseUrl);
    try {
      localStorage.setItem(STORAGE_KEY, url);
    } catch {
      /* ignore */
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setRunning(true);
    tick();
    let sec = Number(intervalSec);
    if (Number.isNaN(sec) || sec < 1) sec = 3;
    if (sec > 300) sec = 300;
    setIntervalSec(sec);
    timerRef.current = setInterval(tick, sec * 1000);
  }, [baseUrl, intervalSec, tick]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      stopAlarmLoop(alarmAudioRef.current);
    };
  }, []);

  useEffect(() => {
    const reduceMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (!running || panelMode !== "alarm" || reduceMotion) {
      stopAlarmLoop(alarmAudioRef.current);
      return;
    }

    const AC = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;

    const ctx = new AC();
    alarmAudioRef.current.ctx = ctx;

    const beep = () => {
      if (ctx.state === "suspended") void ctx.resume();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "square";
      o.frequency.value = 920;
      o.connect(g);
      g.connect(ctx.destination);
      const t0 = ctx.currentTime;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.11, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.12);
      o.start(t0);
      o.stop(t0 + 0.13);
    };

    beep();
    alarmAudioRef.current.intervalId = setInterval(beep, 520);

    return () => {
      stopAlarmLoop(alarmAudioRef.current);
    };
  }, [running, panelMode]);

  const panelClass =
    panelMode === "alarm"
      ? "status alarm"
      : panelMode === "ok"
        ? "status ok"
        : "status loading";

  const headlineClass =
    headlineKind === "alarm"
      ? "alarmTitle"
      : headlineKind === "err"
        ? "alarmTitle err"
        : "okTitle";

  const displayAlev = alev === null ? "—" : String(alev);
  const displayGaz = gaz === null ? "—" : String(gaz);

  return (
    <div className="pageRoot">
      <header>
        <h1>Sistem durumu</h1>
        <div className="row">
          <div className="grow">
            <label htmlFor="baseUrl">Cihaz IP (isteğe bağlı port, örn. :80)</label>
            <input
              id="baseUrl"
              type="text"
              placeholder="10.152.153.180 veya 10.152.153.180:800"
              autoComplete="off"
              spellCheck={false}
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              disabled={running}
            />
          </div>
          <div className="narrow">
            <label htmlFor="interval">Sn</label>
            <input
              id="interval"
              type="number"
              min={1}
              max={300}
              value={intervalSec}
              onChange={(e) => setIntervalSec(Number(e.target.value))}
              disabled={running}
            />
          </div>
          <button
            type="button"
            className={running ? "secondary" : undefined}
            onClick={() => (running ? stop() : start())}
          >
            {running ? "Durdur" : "Başlat"}
          </button>
        </div>
      </header>
      <main className={panelMode === "alarm" && running ? "mainAlarm" : undefined}>
        <div className={panelClass}>
          <p className="badge">{connState}</p>
          <p className={headlineClass}>{headline}</p>
          {showMetrics && (
            <div className="metrics">
              <div className="metric">
                <span>Alev</span>
                <strong>{displayAlev}</strong>
              </div>
              <div className="metric">
                <span>Gaz</span>
                <strong>{displayGaz}</strong>
              </div>
            </div>
          )}
        </div>
      </main>
      <footer>
        İstek doğrudan bu tarayıcıdan gider (Vercel sunucusu LAN IP’sine erişmez). Cihaz yanıtında CORS başlığı
        yoksa tarayıcı sayfayı engeller; firmware’de Access-Control-Allow-Origin ekleyin.
      </footer>
    </div>
  );
}
