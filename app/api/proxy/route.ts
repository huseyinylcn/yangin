import { NextRequest, NextResponse } from "next/server";

const UPSTREAM_MS = 10_000;

function isAllowedHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === "localhost") return true;
  if (h.endsWith(".local")) return true;

  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
  if (!m) return false;
  const o = [1, 2, 3, 4].map((i) => parseInt(m[i], 10));
  if (o.some((n) => n > 255)) return false;
  const [a, b] = o;
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 127) return true;
  return false;
}

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("url");
  if (!raw?.trim()) {
    return NextResponse.json({ error: "url parametresi gerekli" }, { status: 400 });
  }

  let target: URL;
  try {
    target = new URL(raw.trim());
  } catch {
    return NextResponse.json({ error: "geçersiz adres" }, { status: 400 });
  }

  if (target.protocol !== "http:" && target.protocol !== "https:") {
    return NextResponse.json({ error: "sadece http/https" }, { status: 400 });
  }

  if (target.username || target.password) {
    return NextResponse.json({ error: "kimlik bilgisi içeren adres kabul edilmez" }, { status: 400 });
  }

  if (!isAllowedHost(target.hostname)) {
    return NextResponse.json(
      { error: "Sadece yerel ağ (10.x, 192.168.x, 172.16–31.x, 127.x, .local)" },
      { status: 403 }
    );
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), UPSTREAM_MS);

  try {
    const upstream = await fetch(target.toString(), {
      method: "GET",
      cache: "no-store",
      signal: ctrl.signal,
      headers: { Accept: "text/html,*/*" },
    });
    const text = await upstream.text();
    clearTimeout(timer);
    return new NextResponse(text, {
      status: upstream.status,
      headers: {
        "Content-Type": upstream.headers.get("content-type") || "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  } catch {
    clearTimeout(timer);
    return NextResponse.json(
      { error: "Cihaza ulaşılamadı (kapalı, farklı ağ veya yayında değil)" },
      { status: 502 }
    );
  }
}
