"use client";

import dynamic from "next/dynamic";

const MonitorClient = dynamic(() => import("./monitor-client"), {
  ssr: false,
  loading: () => (
    <div className="pageRoot" role="status" aria-live="polite">
      <p className="badge" style={{ margin: 0 }}>
        Yükleniyor…
      </p>
    </div>
  ),
});

export default function Page() {
  return <MonitorClient />;
}
