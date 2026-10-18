import { useRef, useState } from "react";
import { extractCard } from "../../lib/firebase";
import { prepareImage } from "../../lib/image";
import { saveCard } from "../../lib/db";
import type { CardFields, ScanResult } from "../../lib/types";
import CardEditor from "../review/CardEditor";

interface Props {
  remaining: number;
  onSaved: () => void;
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
  return "인식에 실패했습니다. 다시 촬영해 주세요.";
}

export default function CaptureScreen({ remaining, onSaved }: Props) {
  const [results, setResults] = useState<ScanResult[]>([]);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  /**
   * Processes the chosen photos one at a time.
   *
   * Sequential on purpose: it keeps per-card progress honest, avoids hitting
   * the model's per-minute limit on a ten-photo import, and means one bad
   * photo cannot take the others down with it.
   */
  async function handleFiles(files: FileList | null) {
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
        const { card } = await extractCard(prepared.base64, prepared.mimeType);
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
    if (inputRef.current) inputRef.current.value = "";
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
  const pendingCount = results.filter((r) => r.status === "pending" || r.status === "working")
    .length;

  return (
    <div className="screen">
      <label className={`capture-button ${exhausted ? "disabled" : ""}`}>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          capture="environment"
          disabled={exhausted || busy}
          onChange={(event) => void handleFiles(event.target.files)}
        />
        <span className="capture-icon" aria-hidden="true">
          +
        </span>
        <span className="capture-label">
          {exhausted ? "오늘 사용량을 모두 사용했습니다" : "명함 촬영 · 사진 불러오기"}
        </span>
        <span className="capture-hint">
          {exhausted ? "한국 시간 자정에 초기화됩니다" : "여러 장을 한 번에 선택할 수 있습니다"}
        </span>
      </label>

      {pendingCount > 0 && (
        <p className="progress-line" role="status">
          인식 중… {results.filter((r) => r.status === "done").length} /{" "}
          {results.length} 완료
        </p>
      )}

      {results.length === 0 && !exhausted && (
        <div className="empty-hint">
          <p>촬영하면 바로 인식이 시작됩니다. 버튼을 한 번 더 누를 필요가 없습니다.</p>
          <p className="muted">
            인식된 내용은 저장 전에 직접 수정할 수 있습니다. 전화번호와 이메일은 꼭 확인해
            주세요.
          </p>
        </div>
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
                <p>{result.errorMessage}</p>
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
