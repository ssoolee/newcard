import { useEffect, useState } from "react";

/**
 * Two ways to keep the app around: pass it on, or put it on the home screen.
 *
 * What gets shared is the address of this app and nothing else. No card, no
 * contact, no identifier of the person sharing — the same link anyone could
 * copy from the address bar.
 */

/** Chrome fires this so a site can offer installation at its own moment. */
interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const SHARE_TEXT = "사진 한 장이면 명함을 연락처로 만들어 주는 앱이에요.";

function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

/** True once the app is running from the home screen rather than a browser tab. */
function isStandalone(): boolean {
  if (window.matchMedia("(display-mode: standalone)").matches) return true;
  // iOS Safari predates display-mode and reports it here instead.
  return "standalone" in navigator && navigator.standalone === true;
}

export default function InviteActions() {
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(() => isStandalone());
  const [iosHintOpen, setIosHintOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    function handlePrompt(event: Event) {
      // Chrome would otherwise show its own install bar at a moment of its
      // choosing; holding the event lets the button below do it instead.
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    }
    function handleInstalled() {
      setInstalled(true);
      setInstallPrompt(null);
    }
    window.addEventListener("beforeinstallprompt", handlePrompt);
    window.addEventListener("appinstalled", handleInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", handlePrompt);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  async function shareApp() {
    const url = `${window.location.origin}/`;
    if (navigator.share) {
      try {
        await navigator.share({ title: "명함 스캐너", text: SHARE_TEXT, url });
        return;
      } catch {
        // Cancelling the sheet lands here; fall through to the clipboard so
        // the tap still does something useful.
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2400);
    } catch {
      // Clipboard blocked (http, old browser). The address bar still works.
    }
  }

  async function install() {
    if (!installPrompt) return;
    await installPrompt.prompt();
    await installPrompt.userChoice;
    // The event is single-use whatever the answer was.
    setInstallPrompt(null);
  }

  const canInstall = installPrompt !== null;
  const showIosRoute = !installed && !canInstall && isIos();

  return (
    <section className="invite">
      <h2 className="invite-title">
        <span aria-hidden="true">🎁 </span>
        이 앱, 쓸 만하셨나요?
      </h2>

      <div className="invite-actions">
        <button type="button" onClick={() => void shareApp()}>
          <span aria-hidden="true">🔗 </span>
          {copied ? "주소 복사됨" : "친구에게 공유"}
        </button>

        {canInstall && (
          <button type="button" onClick={() => void install()}>
            <span aria-hidden="true">📲 </span>홈 화면에 추가
          </button>
        )}

        {showIosRoute && (
          <button type="button" onClick={() => setIosHintOpen((open) => !open)}>
            <span aria-hidden="true">📲 </span>홈 화면에 추가
          </button>
        )}

        {installed && (
          <span className="invite-done">
            <span aria-hidden="true">✅ </span>홈 화면에 추가됨
          </span>
        )}
      </div>

      {iosHintOpen && (
        <p className="invite-hint">
          아이폰은 사파리에서만 추가할 수 있습니다. 아래 <strong>공유 버튼</strong>(↑)을
          누른 뒤 <strong>홈 화면에 추가</strong>를 고르세요.
        </p>
      )}

      <p className="invite-note">공유되는 것은 앱 주소뿐입니다. 명함 정보는 함께 가지 않습니다.</p>
    </section>
  );
}
