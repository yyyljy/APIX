# Phase 1 문서 분석 및 통합 (Analysis & Synthesis)

본 문서는 Phase 1 개발 문서(`Sequence Diagram`, `API Specification`, `DB Schema`)에 대한 Grok과 Gemini의 독립적인 분석 결과를 취합하여 정리한 통합 보고서입니다.

대상 문서:
- `001.sequence_diagram.md`
- `002.api_specification.md`
- `003.db_schema.md`

## 1. 종합 평가
**검증 결과**: **개발 진행 가능 (High Quality) / 일부 중요 수정 필요**

두 AI의 분석 결과, x402 프로토콜의 논리적 흐름(요청 → 402 응답 → TX 생성 → 검증 → 리디렉트)이 모든 문서에서 일관성 있게 구현되었으며, Avalanche 및 PostgreSQL 기술 스택 선정도 적절한 것으로 확인되었습니다.

그러나 **개발 착수 전 반드시 해결해야 할 중요한 누락 사항**과 **문서 간 불일치**가 발견되었습니다. 이를 반영하여 문서를 보완해야 합니다.

---

## 2. 상세 분석 및 개선 사항

### A. 데이터베이스 스키마 (`003.db_schema.md`)
**상태**: ⛔ **수정 필수 (Critical)**

1.  **[중요] Origin/Proxy 인증 정보 누락** 
    *   **문제점**: Gateway는 판매자의 원본(Origin) API로 요청을 대리 전달(Proxy)하는 역할을 합니다. 현재 `listings` 테이블에는 `base_url`만 있고, 해당 URL을 호출할 때 필요한 **인증 정보(API Key 등)**를 저장할 필드가 없습니다. 이대로는 Gateway가 정상 작동할 수 없습니다.
    *   **해결 방안**: `listings` 테이블에 `origin_auth_header`(예: "Authorization")와 `origin_auth_value`(암호화된 키 값) 컬럼을 추가해야 합니다.

2.  **데이터 타입 정밀도** 
    *   **문제점**: `transactions` 테이블의 `amount_paid`가 `NUMERIC(78,0)`으로 정의되어 있습니다.
    *   **해결 방안**: AVAX의 18 소수점(decimals)을 정확히 처리하고 연산 오차를 방지하기 위해 `DECIMAL(78, 18)`로 변경을 권장합니다.

3.  **추가 제안** 
    *   **제안**: 기획안에 언급된 결제 메모 기능을 지원하기 위해 `transactions` 테이블에 `memo` 필드 추가를 고려하십시오.

### B. API 명세서 (`002.api_specification.md`)
**상태**: ⚠️ **일관성 통일 필요**

1.  **필드명 불일치** 
    *   **문제점**: **시퀀스 다이어그램**은 검증 응답으로 `access_token`, `resource_url`을 사용하는 반면, **API 명세서**는 `tempToken`, `redirectUrl`을 사용하고 있습니다.
    *   **해결 방안**: 프론트엔드/백엔드 혼선을 막기 위해 **`access_token`**과 **`redirect_url`**로 통일(Snake Case 권장)하십시오.

2.  **라우팅 구조 개선** 
    *   **문제점**: 현재 `GET /api/resource?resourceId={id}` 구조는 RESTful하지 않고, Gateway 라우팅 설정 시 복잡해질 수 있습니다.
    *   **해결 방안**: Path Parameter 방식인 **`GET /proxy/{listing_id}/...`** 형태로 변경하면 Gateway의 Wildcard Proxy 설정이 훨씬 직관적이 됩니다.

3.  **보안 및 기타** 
    *   **제안**: 검증 응답(VerifyResponse)에 **`expires_in`** (유효 시간, 초 단위) 필드를 추가하여 클라이언트가 토큰 만료를 인지하도록 개선하십시오.

### C. 시퀀스 다이어그램 (`001.sequence_diagram.md`)
**상태**: ✅ **양호 (소폭 개선)**

1.  **"Pending" 상태 처리 명시** 
    *   **제안**: 다이어그램의 Payment Verification 루프 내에, 설정(Optimistic Mode)에 따라 "Pending(대기)" 상태도 승인될 수 있음을 텍스트로 명시하십시오.

2.  **재시도(Retry) 로직** 
    *   **제안**: 트랜잭션 조회 실패 시 즉시 에러처리하기보다, 지수 백오프(Exponential Backoff) 등의 재시도 로직이 필요함을 주석으로 추가하십시오.

---

## 3. 통합 조치 계획 (Action Plan)

문서 고도화를 위해 다음 단계를 수행하십시오.

### Step 1: `003.db_schema.md` 업데이트
다음 DDL 변경 사항을 반영하십시오:
```sql
ALTER TABLE listings 
ADD COLUMN origin_auth_header VARCHAR(100) DEFAULT 'Authorization',
ADD COLUMN origin_auth_value TEXT; -- 주의: 실제 저장 시 암호화 필요

-- amount_paid 정밀도 수정
ALTER TABLE transactions 
ALTER COLUMN amount_paid TYPE DECIMAL(78, 18);
```

### Step 2: `002.api_specification.md` 업데이트
1.  필드명 변경: `tempToken` -> `access_token`
2.  필드명 변경: `redirectUrl` -> `redirect_url`
3.  응답 스키마에 `expires_in` (integer) 추가
4.  엔드포인트 변경: `GET /api/resource` -> `GET /proxy/{listing_id}`

### Step 3: `001.sequence_diagram.md` 업데이트
1.  Verification Success 응답 바디를 새로운 필드명(`access_token`)으로 일치
2.  "Optimistic Verification (Allow Pending)" 및 Retry 관련 메모 추가

---

**결론**: 위 3가지를 반영하면 문서는 즉시 개발 가능한(Ready-to-Code) 수준으로 완성됩니다.
