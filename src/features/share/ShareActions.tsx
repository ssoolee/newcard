import { useState } from "react";
import {
  buildVCard,
  downloadBlob,
  shareVCard,
  vcardBlob,
  vcardFileName,
} from "../../lib/vcard";
import type { CardFields } from "../../lib/types";
import QrDialog from "./QrDialog";

interface Props {
  card: CardFields;
  compact?: boolean;
}

/**
 * The three ways a contact leaves this app, all of them local to the device.
 *
 * There is no "copy a share link" option. A link would mean uploading another
 * person's contact details to a server, which this project does not do.
 */
export default function ShareActions({ card, compact }: Props) {
  const [qrOpen, setQrOpen] = useState(false);

  function saveToPhone() {
    // On iOS this opens the contacts import sheet; on Android it lands in
    // Downloads and the user taps it to import.
    downloadBlob(vcardBlob(buildVCard(card)), vcardFileName(card));
  }

  return (
    <>
      <div className={`share-actions ${compact ? "compact" : ""}`}>
        <button type="button" onClick={saveToPhone}>
          내 폰에 저장
        </button>
        <button type="button" onClick={() => void shareVCard([card])}>
          공유
        </button>
        <button type="button" onClick={() => setQrOpen(true)}>
          QR
        </button>
      </div>
      {qrOpen && <QrDialog card={card} onClose={() => setQrOpen(false)} />}
    </>
  );
}
