import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { buildVCard } from "../../lib/vcard";
import type { CardFields } from "../../lib/types";

interface Props {
  card: CardFields;
  onClose: () => void;
}

/**
 * Shows the contact as a QR code for face-to-face exchange: the other person
 * points their camera at the screen and their phone offers to add the contact.
 * Nothing is uploaded — the vCard text is encoded directly into the image.
 */
export default function QrDialog({ card, onClose }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    QRCode.toCanvas(canvas, buildVCard(card), {
      errorCorrectionLevel: "M",
      margin: 2,
      width: 280,
    }).catch(() => {
      // Happens when the card has so much text that it exceeds QR capacity.
      setError("내용이 너무 길어 QR로 만들 수 없습니다. 공유 기능을 사용해 주세요.");
    });
  }, [card]);

  return (
    <div
      className="dialog-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="QR 코드"
      onClick={onClose}
    >
      <div className="dialog" onClick={(event) => event.stopPropagation()}>
        <p className="dialog-title">{card.name || card.company || "연락처"}</p>
        {error ? <p className="warn">{error}</p> : <canvas ref={canvasRef} />}
        <p className="muted small">상대방이 카메라로 스캔하면 연락처가 추가됩니다.</p>
        <button type="button" className="primary" onClick={onClose}>
          닫기
        </button>
      </div>
    </div>
  );
}
