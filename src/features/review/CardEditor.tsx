import { useState } from "react";
import type { CardFields } from "../../lib/types";

interface Props {
  initial: CardFields;
  previewUrl?: string;
  onSave: (fields: CardFields) => void;
  onDiscard: () => void;
}

interface FieldSpec {
  key: keyof CardFields;
  label: string;
  type?: "tel" | "email" | "url" | "text";
  /** Getting these wrong is the costly kind of error, so they are flagged. */
  critical?: boolean;
}

const FIELDS: FieldSpec[] = [
  { key: "name", label: "이름" },
  { key: "nameEn", label: "영문 이름" },
  { key: "company", label: "회사" },
  { key: "department", label: "부서" },
  { key: "title", label: "직급" },
  { key: "mobile", label: "휴대폰", type: "tel", critical: true },
  { key: "phone", label: "전화", type: "tel", critical: true },
  { key: "fax", label: "팩스", type: "tel" },
  { key: "email", label: "이메일", type: "email", critical: true },
  { key: "website", label: "웹사이트", type: "url" },
  { key: "address", label: "주소" },
];

/**
 * Review before saving. Recognition is good, not perfect, and a single wrong
 * digit in a phone number is worse than a blank field because nobody notices
 * it until the call fails. So this screen always appears, and the fields that
 * matter most are marked when the model was unsure.
 */
export default function CardEditor({ initial, previewUrl, onSave, onDiscard }: Props) {
  const [fields, setFields] = useState<CardFields>(initial);

  const lowConfidence = initial.confidence > 0 && initial.confidence < 0.7;
  const unreadable = initial.confidence === 0 && !initial.name && !initial.company;

  function update(key: keyof CardFields, value: string) {
    setFields((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <form
      className="card-editor"
      onSubmit={(event) => {
        event.preventDefault();
        onSave(fields);
      }}
    >
      {previewUrl && (
        <img className="card-preview" src={previewUrl} alt="촬영한 명함" loading="lazy" />
      )}

      {unreadable && (
        <p className="warn">
          명함을 읽지 못했습니다. 다시 촬영하거나 직접 입력해 주세요.
        </p>
      )}
      {!unreadable && lowConfidence && (
        <p className="warn">
          일부 글자가 선명하지 않았습니다. 전화번호와 이메일을 특히 확인해 주세요.
        </p>
      )}

      <div className="field-grid">
        {FIELDS.map((spec) => {
          const value = String(fields[spec.key] ?? "");
          const flagged = spec.critical && lowConfidence && value.length > 0;
          return (
            <label key={spec.key} className={`field ${flagged ? "flagged" : ""}`}>
              <span className="field-label">{spec.label}</span>
              <input
                type={spec.type === "tel" ? "tel" : spec.type === "email" ? "email" : "text"}
                inputMode={
                  spec.type === "tel" ? "tel" : spec.type === "email" ? "email" : undefined
                }
                autoComplete="off"
                autoCapitalize={spec.type === "email" ? "none" : undefined}
                spellCheck={false}
                value={value}
                onChange={(event) => update(spec.key, event.target.value)}
              />
            </label>
          );
        })}
      </div>

      <div className="editor-actions">
        <button type="button" className="ghost" onClick={onDiscard}>
          버리기
        </button>
        <button type="submit" className="primary">
          이 기기에 저장
        </button>
      </div>
    </form>
  );
}
