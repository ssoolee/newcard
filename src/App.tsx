import { Suspense, lazy, useCallback, useEffect, useState } from "react";
import { ensureSignedIn, fetchRemainingQuota } from "./lib/firebase";
import { listCards } from "./lib/db";
import { DAILY_LIMIT } from "./lib/types";
import type { SavedCard } from "./lib/types";
import CaptureScreen from "./features/capture/CaptureScreen";

// The scan tab is what opens first, so it ships with the app. The other two
// are fetched the moment they are tapped.
const CardListScreen = lazy(() => import("./features/list/CardListScreen"));
const NoticeScreen = lazy(() => import("./features/notice/NoticeScreen"));

type Tab = "scan" | "list" | "notice";

export default function App() {
  const [uid, setUid] = useState<string | null>(null);
  const [authError, setAuthError] = useState(false);
  const [remaining, setRemaining] = useState(DAILY_LIMIT);
  const [cards, setCards] = useState<SavedCard[]>([]);
  const [tab, setTab] = useState<Tab>("scan");

  // Sign-in happens silently on first load; the user never sees a login screen.
  useEffect(() => {
    let cancelled = false;
    ensureSignedIn()
      .then((user) => {
        if (!cancelled) setUid(user.uid);
      })
      .catch(() => {
        if (!cancelled) setAuthError(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Read once at sign-in. Every scan returns the new count with its result, so
  // the header stays current without holding a live subscription open.
  useEffect(() => {
    if (!uid) return undefined;
    let cancelled = false;
    void fetchRemainingQuota(uid).then((left) => {
      if (!cancelled) setRemaining(left);
    });
    return () => {
      cancelled = true;
    };
  }, [uid]);

  const reloadCards = useCallback(() => {
    void listCards().then(setCards);
  }, []);

  useEffect(reloadCards, [reloadCards]);

  return (
    <div className="app">
      <header className="app-header">
        <h1>
          <span className="title-emoji" aria-hidden="true">
            💌
          </span>
          명함 스캐너
        </h1>
        <span className="quota" title="한국 시간 자정에 초기화됩니다">
          <span aria-hidden="true">⚡</span>
          {remaining} / {DAILY_LIMIT}
        </span>
      </header>

      {authError && (
        <p className="warn banner">
          연결에 실패했습니다. 네트워크를 확인하고 새로 고쳐 주세요.
        </p>
      )}

      <main>
        {tab === "scan" && (
          <CaptureScreen
            remaining={remaining}
            onSaved={reloadCards}
            onQuotaChange={setRemaining}
          />
        )}
        <Suspense fallback={<p className="screen muted">불러오는 중…</p>}>
          {tab === "list" && <CardListScreen cards={cards} onChanged={reloadCards} />}
          {tab === "notice" && <NoticeScreen />}
        </Suspense>
      </main>

      <nav className="tabbar">
        <button
          type="button"
          className={tab === "scan" ? "active" : ""}
          onClick={() => setTab("scan")}
        >
          <span className="tab-emoji" aria-hidden="true">
            📸
          </span>
          촬영
        </button>
        <button
          type="button"
          className={tab === "list" ? "active" : ""}
          onClick={() => setTab("list")}
        >
          <span className="tab-emoji" aria-hidden="true">
            🗂️
          </span>
          내 명함{cards.length > 0 ? ` ${cards.length}` : ""}
        </button>
        <button
          type="button"
          className={tab === "notice" ? "active" : ""}
          onClick={() => setTab("notice")}
        >
          <span className="tab-emoji" aria-hidden="true">
            🛡️
          </span>
          안내
        </button>
      </nav>
    </div>
  );
}
