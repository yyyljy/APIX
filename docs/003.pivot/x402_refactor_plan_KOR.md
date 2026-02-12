# x402 리팩토링 계획 (x402 Refactor Plan)

**일자:** 2026-02-11
**목표:** 헤더 기반의 인증과 챌린지 방식을 도입하여 Apix x402 구현을 HTTP 표준에 맞게 조정합니다.

## 사용자 검토 필요 (User Review Required)
> [!IMPORTANT]
> 이는 API에 대한 **Breaking Change**입니다. 코드베이스 분석 결과, 현재는 내부 `demo/frontend`만이 이 API를 사용하고 있으므로 영향 범위는 제한적입니다.

## 변경 제안 (Proposed Changes)

### 1. 백엔드 (`demo/backend/index.ts`)

**목표:** 커스텀 헤더/바디 방식에서 표준 HTTP 인증 헤더 방식으로 전환합니다.

*   **챌린지 (402):**
    *   402 응답에 `WWW-Authenticate` 헤더를 추가합니다.
    *   형식: `WWW-Authenticate: Apix realm="Apix Protected", request_id="<uuid>", price="<amount>", currency="AVAX", pay_to="<address>"`
    *   *참고:* 프론트엔드 파싱 편의를 위해 이번 단계에서는 JSON 바디도 유지하지만, "표준" 방식은 헤더임을 명시합니다.

*   **검증 (Auth):**
    *   `x-apix-auth` 헤더 확인 로직을 제거합니다.
    *   `Authorization` 헤더를 확인하도록 변경합니다.
    *   예상 형식: `Authorization: Apix <tx_hash>`

### 2. 프론트엔드 (`demo/frontend/src/pages/DemoPage.jsx`)

**목표:** 새로운 인증 스킴을 준수하도록 클라이언트를 업데이트합니다.

*   **결제 요청:**
    *   `callApixApi` 함수를 업데이트하여 `x-apix-auth` 대신 `Authorization: Apix <tx_hash>`를 전송하도록 합니다.

### 3. 향후 "무상태(Stateless)" 고려사항 (브레인스토밍)

*   **현행:** 결제 검증을 위해 `request_id`를 DB에 저장하고 있습니다.
*   **제안 (향후):**
    *   서버가 결제 세부정보를 서명(Macaroon/JWT)하여 402 응답(예: `payment_token`)으로 보냅니다.
    *   클라이언트는 재시도 시 이 `payment_token`과 `tx_hash`를 함께 보냅니다.
    *   서버는 토큰 서명을 검증(무상태)하고 L1에서 트랜잭션을 확인(무상태)합니다.
    *   *결정:* 이번 리팩토링 범위에서는 제외하고 Phase 2 계획으로 문서화합니다.

## 검증 계획 (Verification Plan)

### 자동화 테스트
*   로컬에서 데모를 실행하여 변경된 플로우가 정상 작동하는지 확인합니다.

### 수동 검증
1.  **서비스 시작:**
    *   `apix-cloud` (Go)
    *   `demo/backend` (Node)
    *   `demo/frontend` (React)
2.  **브라우저 테스트:**
    *   `http://localhost:5173` 접속.
    *   "Buy with Crypto" 클릭.
    *   **402 검증:** 네트워크 탭에서 `WWW-Authenticate` 헤더 확인.
    *   **성공 검증:** 플로우 완료 후 네트워크 탭에서 `Authorization: Apix ...` 요청 헤더 확인.
