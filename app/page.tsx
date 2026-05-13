"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const STORAGE_KEY = "yangin-monitor-url";
const ALEV_ALARM_BELOW = 1500;
const GAZ_ALARM_ABOVE = 800;

function normalizeUrl(s: string): string {
  let t = s.trim();
  if (!t) return "";
  if (!/^https?:\/\//i.test(t)) t = `http://${t}`;
  return t.replace(/\/+$/, "");
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

export default function Home() {
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

  useEffect(() => {
    try {
      const u = localStorage.getItem(STORAGE_KEY);
      if (u) setBaseUrl(u);
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
      applyReading(NaN, NaN, "Adres girin");
      return;
    }
    fetch(url, { method: "GET", cache: "no-store", mode: "cors" })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.text();
      })
      .then((html) => {
        const p = parseHtml(html);
        applyReading(p.alev, p.gaz, null);
      })
      .catch((e: unknown) => {
        let msg = e instanceof Error ? e.message : String(e);
        if (/Failed to fetch|NetworkError/i.test(msg)) {
          msg = "Bağlantı/CORS: tarayıcı engelledi veya cihaz kapalı";
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
    };
  }, []);

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
            <label htmlFor="baseUrl">Cihaz adresi (ör. http://10.152.113.18:800)</label>
            <input
              id="baseUrl"
              type="url"
              inputMode="url"
              placeholder="http://10.152.113.18:800"
              autoComplete="off"
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
      <main>
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
        ESP ile farklı kökenden açıyorsanız cihazda CORS veya aynı sunucudan bu sayfayı
        sunmanız gerekebilir.
      </footer>
    </div>
  );
}
