# 명함 스캐너 (newcard)

휴대폰으로 명함을 촬영하거나 갤러리에서 여러 장을 불러오면 AI가 연락처 정보를 인식하고,
내 폰 연락처에 저장하거나 타인에게 공유할 수 있는 모바일 웹앱(PWA).

- **로그인 없음** — Firebase 익명 인증이 백그라운드에서 동작하므로 로그인 화면이 없다
- **사용자당 일 100건** — 서버에서 KST 기준으로 집계, 트랜잭션으로 정확히 카운트
- **명함 정보는 기기에만 저장** — 서버는 사용 횟수(숫자)만 보유. 근거와 입증 방법은
  [PRIVACY.md](PRIVACY.md)

## 기술 구성

| 영역 | 선택 | 비고 |
|---|---|---|
| 프론트엔드 | Vite + React + TypeScript | Firebase Hosting(정적) |
| 인식 AI | Gemini 2.5 Flash | `responseSchema`로 구조화 출력, 추론 예산 0 |
| 서버 | Cloud Functions v2 (`asia-northeast3`) | Gemini 프록시 + 쿼터 집계 |
| 저장 | 기기 IndexedDB / Firestore(카운터만) | Cloud Storage 미사용 |
| 보호 | App Check(reCAPTCHA Enterprise) + 익명 Auth | 전체 일일 상한으로 비용 방어 |

## 현재 상태

| | 상태 |
|---|---|
| 타입 검사 · 빌드 · 린트 | ✅ 통과 |
| 테스트 | ✅ 29건 통과 (쿼터 14 + 보안 규칙 15), 변이 테스트로 실패 가능성 확인 |
| Firebase 프로젝트 | ✅ `newcard-kr-7f3a2` 연결 |
| Firestore `(default)` | ✅ `asia-northeast3`, PITR 비활성 |
| 보안 규칙 | ✅ 배포됨 |
| 익명 인증 | ✅ 사용 설정 (실제 UID 발급 확인) |
| reCAPTCHA Enterprise 키 ID | ✅ `.env.local` |
| Blaze 플랜 | ⬜ **미확인** |
| `GEMINI_API_KEY` 시크릿 | ⬜ 미등록 |
| 함수 · 호스팅 배포 | ⬜ 시크릿 등록 후 |

## 설정 (한 번만)

### 1. Firebase CLI

```bash
npm i -g firebase-tools
firebase login
```

### 2. 프로젝트 생성과 연결

Firebase 콘솔에서 프로젝트를 만들고, **Firestore를 `asia-northeast3`(서울)로 생성**한다.
리전은 생성 후 변경할 수 없다.

```bash
firebase use --add        # 생성한 프로젝트 선택
```

`firebase init`은 실행하지 않아도 된다. 설정 파일이 이미 모두 있다.
실행한다면 **Storage는 반드시 선택하지 않는다** — 버킷의 부재가 개인정보 보호 장치다.

### 3. Blaze 플랜으로 업그레이드

필요한 이유는 Gemini 비용이 아니라 **Spark에서는 Functions가 외부 네트워크를 호출할 수
없고 Secret Manager도 쓸 수 없기** 때문이다. 이 앱 규모에서는 Hosting·Functions·
Firestore·Auth가 모두 무료 한도 안에 들어온다.

업그레이드 직후 **예산 알림**을 설정한다(예: 5,000원).

### 4. 인증 · App Check

- Authentication → Sign-in method → **익명(Anonymous) 사용 설정**
- App Check → 웹 앱에 **reCAPTCHA Enterprise**(Fraud Defense) 등록 → 키 ID 확보
  - 키는 Google Cloud 콘솔 → 보안 → reCAPTCHA에서 만든다(웹사이트 / 점수 기반)
  - Enterprise 키에는 비밀키가 없다. 키 ID 하나가 등록의 전부다.
- `extractCard` 함수에 App Check **강제(enforce)** 설정

### 5. Gemini API 키

AI Studio에서 키를 발급받아 Secret Manager에 넣는다.

```bash
firebase functions:secrets:set GEMINI_API_KEY
```

> **중요**: 결제가 연결된 프로젝트의 키를 사용해 **유료 티어**로 운영한다. 무료 티어는
> 입력이 Google 제품 개선에 사용되고 사람이 검토할 수 있어 명함 앱에 적합하지 않다.
> 자세한 근거는 [PRIVACY.md](PRIVACY.md).

모델을 바꾸려면 배포 시 `GEMINI_MODEL` 값을 지정한다(기본값 `gemini-2.5-flash`).

### 6. 프론트엔드 환경변수

```bash
cp .env.example .env.local   # 값은 Firebase 콘솔 → 프로젝트 설정 → 내 앱
```

## 로컬 실행

```bash
npm install
npm --prefix functions install
npm run emulators      # Auth · Firestore · Functions
npm run dev            # http://localhost:5173
```

## 테스트

```bash
npm test               # 에뮬레이터를 띄우고 vitest 실행
```

29건이 돌아간다 — 쿼터 회계 14건(`tests/quota.test.ts`), 보안 규칙 15건
(`tests/rules.test.ts`). 다루는 내용은 일 100건 경계(99→100→101), 동시 10건 호출이
카운터를 정확히 10만 올리는지, 마지막 3칸을 10개가 경합할 때 3건만 통과하는지, 인식
실패 환불 후 카운터가 제자리인지, KST 자정 리셋, `assertQuotaShape()`가 명함 필드를
거부하는지(그리고 **값은 예외 메시지에 넣지 않는지**), 타인·전체 카운터 읽기 거부,
모든 클라이언트 쓰기 거부다.

> **Java 필요**: Firestore 에뮬레이터가 JVM에서 돌아간다. 없으면
> `Could not spawn java -version`으로 멈춘다. JRE 21 이상을 설치하거나,
> 설치 없이 쓰려면 [Adoptium](https://adoptium.net/) JRE를 풀어 두고
> `JAVA_HOME`과 `PATH`에 그 `bin`을 넣으면 된다.

개발 모드에서는 App Check 디버그 토큰이 자동으로 켜진다. 프로덕션 경로는 그대로 강제되므로
배포된 앱이 약해지지 않는다.

## 배포

```bash
npm run build
firebase deploy --only firestore:rules,functions   # 백엔드 먼저
firebase deploy --only hosting
```

배포 후 [PRIVACY.md](PRIVACY.md)의 감사 6개 항목을 실행하고 결과를 기록한다.

## 반드시 실기기에서 확인해야 하는 것

에뮬레이터로는 검증이 불가능하고, 이 앱에서 가장 눈에 띄는 실패가 발생하는 지점이다.

1. **iPhone Safari / Android Chrome에서 `.vcf`가 실제로 연락처 앱에 들어가는지**
   브라우저 Contact Picker API는 읽기 전용이고 iOS에는 없어서 `.vcf` 파일이 유일한 경로다
2. **한글 이름이 연락처 앱에서 깨지지 않는지** (vCard 3.0 + UTF-8, BOM 없음)
3. **iPhone 갤러리에서 고른 HEIC 사진이 인식되는지** (Canvas로 JPEG 재인코딩해 우회)
4. **카카오톡·메일로 공유했을 때 수신자 폰에서 저장되는지**

## 남은 작업

- [x] 에뮬레이터 쿼터 경계 테스트 (99 → 100 → 101건, 동시 10건, KST 자정 리셋)
- [x] 보안 규칙 테스트 (타인 카운터 읽기 거부, `_global_*` 읽기 거부, 쓰기 거부)
- [ ] 샘플 명함 10장 이상으로 필드별 정확도 측정 (Gemini 키 등록 후)
- [ ] PWA 아이콘 PNG 추가 (현재 SVG만 있어 일부 Android 런처에서 미표시 가능)
- [ ] 실기기 검증 4항목

## 프로젝트 전담 에이전트

`.claude/agents/`에 다섯 개가 정의되어 있다.

| 에이전트 | 역할 |
|---|---|
| `privacy-auditor` | 비저장 보장 전담. 배포 전·`functions/` 변경 후 감사 실행 |
| `quota-guard` | 일 100건 제한, App Check, 보안 규칙, 비용 방어 |
| `card-extractor` | 인식 정확도 — 프롬프트, 스키마, 한국 명함 필드 정규화 |
| `mobile-pwa` | 촬영·업로드·IndexedDB·vCard/QR/CSV/공유 UI |
| `firebase-ops` | 에뮬레이터, 빌드, 시크릿, 배포, 배포 후 스모크 테스트 |
