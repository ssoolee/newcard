/**
 * The privacy notice.
 *
 * Written in plain Korean, stating both what this app does not do and the two
 * things it unavoidably does. Overclaiming here would be the worst failure in
 * the project: the cards describe other people who were never asked.
 */
export default function NoticeScreen() {
  return (
    <div className="screen notice">
      <section>
        <h2>명함 정보는 이 기기에만 저장됩니다</h2>
        <p>
          인식된 명함 데이터는 이 휴대폰 안에만 보관됩니다. 서버에 복사되지 않고, 다른
          기기와 동기화되지도 않습니다.
        </p>
        <p className="muted">
          그래서 브라우저 데이터를 지우거나 휴대폰을 바꾸면 목록이 사라집니다. 불편하지만
          의도된 동작입니다. 중요한 명함은 연락처에 저장하거나 CSV로 내보내 두세요.
        </p>
      </section>

      <section>
        <h2>촬영한 사진은 저장되지 않습니다</h2>
        <p>
          사진은 글자를 읽는 동안에만 사용되고 어디에도 기록되지 않습니다. 업로드용 저장소
          자체를 만들지 않았습니다.
        </p>
        <p className="muted">
          전송 전에 사진을 다시 압축하기 때문에 촬영 위치(GPS) 같은 사진 정보도 함께
          제거됩니다.
        </p>
      </section>

      <section>
        <h2>서버에 남는 것은 사용 횟수뿐입니다</h2>
        <p>
          하루 100건 제한을 지키기 위해 <strong>숫자 하나</strong>만 기록합니다. 이름,
          전화번호, 회사명은 기록되지 않으며 기록에 남길 수 있는 항목 자체가 코드로
          제한되어 있습니다.
        </p>
      </section>

      <section className="disclosure">
        <h2>정확히 알려드려야 하는 두 가지</h2>
        <p>
          <strong>1. 글자 인식은 Google Gemini가 수행합니다.</strong> 사진이 인식을 위해
          Google로 전송됩니다. 유료 서비스로 이용하기 때문에 전송된 내용이 AI 학습에
          사용되지는 않지만, 명함 사진이 외부 서비스로 전달된다는 사실은 그대로입니다.
        </p>
        <p>
          <strong>2. 사진은 저희 서버를 거쳐 갑니다.</strong> 인식을 중계하는 과정에서
          메모리를 지나갑니다. 디스크나 데이터베이스, 기록에 쓰지 않으므로 보관되지는
          않지만 &quot;휴대폰을 벗어나지 않는다&quot;고 말할 수는 없습니다.
        </p>
        <p className="muted">
          봇 차단을 위해 Google reCAPTCHA가 함께 동작합니다. reCAPTCHA는 명함 내용을 받지
          않습니다.
        </p>
      </section>

      <section>
        <h2>타인의 개인정보를 다루고 있습니다</h2>
        <p className="muted">
          명함에 적힌 정보는 그 사람의 개인정보입니다. 받은 목적 범위에서만 사용하고,
          필요가 없어지면 전체 삭제로 지워 주세요.
        </p>
      </section>
    </div>
  );
}
