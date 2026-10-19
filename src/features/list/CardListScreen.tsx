import { useMemo, useState } from "react";
import { clearAllCards, deleteCard, searchCards } from "../../lib/db";
import { buildCsv, csvBlob, downloadBlob, shareVCard } from "../../lib/vcard";
import { formatDateTime } from "../../lib/date";
import type { SavedCard } from "../../lib/types";
import ShareActions from "../share/ShareActions";

interface Props {
  cards: SavedCard[];
  onChanged: () => void;
}

/**
 * A stable pastel per person, picked from the display name.
 *
 * The app never keeps the card photo, so a coloured initial is the only
 * portrait it can honestly show. Same name always lands on the same colour,
 * which makes a long list easier to scan.
 */
function hueFor(label: string): number {
  let sum = 0;
  for (let i = 0; i < label.length; i += 1) sum += label.charCodeAt(i);
  return sum % 6;
}

export default function CardListScreen({ cards, onChanged }: Props) {
  const [query, setQuery] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);

  const visible = useMemo(() => searchCards(cards, query), [cards, query]);

  async function handleDelete(id: string) {
    await deleteCard(id);
    onChanged();
  }

  async function handleClearAll() {
    await clearAllCards();
    setConfirmClear(false);
    onChanged();
  }

  if (cards.length === 0) {
    return (
      <div className="screen">
        <div className="empty-hint">
          <span className="empty-emoji" aria-hidden="true">
            🗂️
          </span>
          <p>저장된 명함이 없습니다.</p>
          <p className="muted">촬영 탭에서 명함을 찍으면 여기에 모입니다.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="screen">
      <input
        className="search"
        type="search"
        placeholder="이름 · 회사 · 부서 검색"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />

      <p className="muted small">
        {visible.length}명 · 이 기기에만 저장되어 있습니다
      </p>

      <ul className="card-list">
        {visible.map((card) => {
          const label = card.name || card.nameEn || "(이름 없음)";
          return (
            <li key={card.id} className="list-card">
              <div className="list-card-head">
                <div className="list-id">
                  <span
                    className={`avatar hue-${hueFor(label)}`}
                    aria-hidden="true"
                  >
                    {label.slice(0, 1)}
                  </span>
                  <div>
                    <p className="list-name">{label}</p>
                    <p className="list-sub">
                      {[card.company, card.department, card.title]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  className="icon-button"
                  aria-label="삭제"
                  onClick={() => void handleDelete(card.id)}
                >
                  ×
                </button>
              </div>

              {(card.mobile || card.phone) && (
                <p className="list-contact">
                  {card.mobile && (
                    <a href={`tel:${card.mobile}`}>{card.mobile}</a>
                  )}
                  {card.mobile && card.phone && " · "}
                  {card.phone && <a href={`tel:${card.phone}`}>{card.phone}</a>}
                </p>
              )}
              {card.email && (
                <p className="list-contact">
                  <a href={`mailto:${card.email}`}>{card.email}</a>
                </p>
              )}
              <p className="muted small">{formatDateTime(card.createdAt)}</p>

              <ShareActions card={card} compact />
            </li>
          );
        })}
      </ul>

      <div className="bulk-actions">
        <button
          type="button"
          onClick={() => void shareVCard(visible)}
          disabled={visible.length === 0}
        >
          <span aria-hidden="true">📤 </span>
          {visible.length}명 한 번에 공유
        </button>
        <button
          type="button"
          onClick={() =>
            downloadBlob(csvBlob(buildCsv(visible)), "명함목록.csv")
          }
          disabled={visible.length === 0}
        >
          <span aria-hidden="true">📄 </span>
          CSV 내보내기
        </button>
      </div>

      {confirmClear ? (
        <div className="danger-confirm">
          <p>
            저장된 명함 {cards.length}건을 모두 삭제합니다. 되돌릴 수 없습니다.
          </p>
          <div className="editor-actions">
            <button
              type="button"
              className="ghost"
              onClick={() => setConfirmClear(false)}
            >
              취소
            </button>
            <button
              type="button"
              className="danger"
              onClick={() => void handleClearAll()}
            >
              모두 삭제
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="danger-link"
          onClick={() => setConfirmClear(true)}
        >
          전체 삭제
        </button>
      )}
    </div>
  );
}
