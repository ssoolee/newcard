import { useState } from "react";
import { extractCard } from "../../lib/firebase";
import { prepareImage } from "../../lib/image";
import { saveCard } from "../../lib/db";
import type { CardFields, ScanResult } from "../../lib/types";
import CardEditor from "../review/CardEditor";
import ScanHero from "./ScanHero";
import InviteActions from "../invite/InviteActions";

interface Props {
  remaining: number;
  onSaved: () => void;
  /** Each scan comes back with the server's own count of what is left. */
  onQuotaChange: (remaining: number) => void;
}

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Turns a callable error into something a person can act on. */
function messageFor(err: unknown): string {
  const code = typeof err === "object" && err && "code" in err ? String(err.code) : "";
  if (code.includes("resource-exhausted")) return "오늘 사용량을 모두 사용했습니다.";
  if (code.includes("unavailable")) return "서버가 혼잡합니다. 잠시 후 다시 시도해 주세요.";
  if (code.includes("unauthenticated")) return "세션이 끊겼습니다. 새로 고쳐 주세요.";
  if (err instanceof Error && err.message === "image-decode-failed") {
    return "이미지를 열 수 없습니다. 다른 사진으로 시도해 주세요.";
  }
  return "인식에 실패했습니다. 다시 시도해 주세요.";
}

export default function CaptureScreen({ remaining, onSaved, onQuotaChange }: Props) {
  const [results, setResults] = useState<ScanResult[]>([]);
  const [busy, setBusy] = useState(false);

  /**
   * Processes the chosen photos one at a time.
   *
   * Sequential on purpose: it keeps per-card progress honest, avoids hitting
   * the model's per-minute limit on a ten-photo import, and means one bad
   * photo cannot take the others down with it.
   *
   * Takes the input element rather than its FileList because the camera and
   * the gallery have separate inputs, and only the one that was actually used
   * should be reset afterwards.
   */
  async function handleFiles(input: HTMLInputElement) {
    const files = input.files;
    if (!files || files.length === 0) return;

    const queued: ScanResult[] = Array.from(files).map((file) => ({
      id: newId(),
      fileName: file.name,
      previewUrl: "",
      status: "pending",
    }));
    setResults((prev) => [...queued, ...prev]);
    setBusy(true);

    const fileList = Array.from(files);
    for (let i = 0; i < fileList.length; i += 1) {
      const entry = queued[i];
      setResults((prev) =>
        prev.map((r) => (r.id === entry.id ? { ...r, status: "working" } : r)),
      );
      try {
        const prepared = await prepareImage(fileList[i]);
        const { card, quotaRemaining } = await extractCard(prepared.base64, prepared.mimeType);
        onQuotaChange(quotaRemaining);
        setResults((prev) =>
          prev.map((r) =>
            r.id === entry.id
              ? { ...r, status: "done", card, previewUrl: prepared.previewUrl }
              : r,
          ),
        );
      } catch (err) {
        setResults((prev) =>
          prev.map((r) =>
            r.id === entry.id ? { ...r, status: "error", errorMessage: messageFor(err) } : r,
          ),
        );
      }
    }

    setBusy(false);
    // Let the same file be picked again after a retry.
    input.value = "";
  }

  async function handleSave(resultId: string, fields: CardFields) {
    await saveCard(fields);
    setResults((prev) => {
      const target = prev.find((r) => r.id === resultId);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((r) => r.id !== resultId);
    });
    onSaved();
  }

  function handleDiscard(resultId: string) {
    setResults((prev) => {
      const target = prev.find((r) => r.id === resultId);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((r) => r.id !== resultId);
    });
  }

  const exhausted = remaining <= 0;
  const locked = exhausted || busy;
  const pendingCount = results.filter((r) => r.status === "pending" || r.status === "working")
    .length;

  return (
    <div className="screen">
      {exhausted && (
        <p className="warn banner">
          <span aria-hidden="true">🌙 </span>
          오늘 사용량을 모두 사용했습니다. 한국 시간 자정에 초기화됩니다.
        </p>
      )}

      {results.length === 0 && !exhausted && <ScanHero />}

      {/*
        Two inputs, not one. The camera needs capture="environment", and that
        same attribute makes a phone skip the gallery entirely — so a single
        input cannot offer both. The camera hands back one photo at a time;
        only the gallery gets multiple.
      */}
      <label className={`capture-button ${locked ? "disabled" : ""}`}>
        <input
          type="file"
          accept="image/*"
          capture="environment"
          disabled={locked}
          onChange={(event) => void handleFiles(event.target)}
        />
        <span className="capture-icon" aria-hidden="true">
          📸
        </span>
        <span className="capture-label">명함 촬영</span>
        <span className="capture-hint">카메라로 바로 찍습니다</span>
      </label>

      <label className={`capture-secondary ${locked ? "disabled" : ""}`}>
        <input
          type="file"
          accept="image/*"
          multiple
          disabled={locked}
          onChange={(event) => void handleFiles(event.target)}
        />
        <span className="capture-icon-sm" aria-hidden="true">
          🖼️
        </span>
        <span className="capture-secondary-text">
          <span className="capture-label">사진 불러오기</span>
          <span className="capture-hint">갤러리에서 여러 장을 한 번에 선택</span>
        </span>
      </label>

      {pendingCount > 0 && (
        <p className="progress-line" role="status">
          <span aria-hidden="true">✨ </span>
          인식 중… {results.filter((r) => r.status === "done").length} /{" "}
          {results.length} 완료
        </p>
      )}

      {results.length === 0 && !exhausted && (
        <>
          <p className="muted hint-line">
            고르면 바로 인식이 시작됩니다. 저장 전에 직접 수정할 수 있으니, 전화번호와
            이메일은 꼭 확인해 주세요.
          </p>
          <InviteActions />
        </>
      )}

      <div className="result-list">
        {results.map((result) => {
          if (result.status === "pending") {
            return (
              <div key={result.id} className="result-card waiting">
                <span className="spinner" aria-hidden="true" />
                <span>대기 중</span>
              </div>
            );
          }
          if (result.status === "working") {
            return (
              <div key={result.id} className="result-card waiting">
                <span className="spinner spinning" aria-hidden="true" />
                <span>인식 중…</span>
              </div>
            );
          }
          if (result.status === "error") {
            return (
              <div key={result.id} className="result-card error">
                <p>
                  <span aria-hidden="true">😥 </span>
                  {result.errorMessage}
                </p>
                <button type="button" onClick={() => handleDiscard(result.id)}>
                  닫기
                </button>
              </div>
            );
          }
          return (
            <CardEditor
              key={result.id}
              initial={result.card!}
              previewUrl={result.previewUrl}
              onSave={(fields) => void handleSave(result.id, fields)}
              onDiscard={() => handleDiscard(result.id)}
            />
          );
        })}
      </div>
    </div>
  );
}
