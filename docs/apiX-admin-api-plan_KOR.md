# APIX L1 운영 Admin API 기획안 (adminapi, Gin)

## 1. 목표
- 백엔드 서버를 상태 의존적으로 두지 않고, Admin API는 운영/감사/리스크 목적의 API만 담당한다.
- RPC URL 및 Webhook은 AvaCloud/노드/WS에서 들어오는 이벤트를 받아 검증하고, DB와 Kafka를 통해 운영 가시성, 추적성, 이상탐지를 수행한다.
- 사용자 SDK는 TX 생성/검증은 L1과 SDK에서 수행하고, 운영 API는 `이벤트 수집`, `리스크 점수 조회/알림`, `재처리 트리거` 같은 서버 운영 기능에만 집중한다.

## 2. 범위
- 대상 API: `cmd/adminapi` 신규 서버 (`/v1/...`)
- 저장소: PostgreSQL(선택, 미설치 시 무의존 모드)
- 메시징: Kafka 토픽 발행(선택, 미설치 시 무의존 모드)
- 알림/탐지: 규칙 기반 위험도 점수 계산(공격 탐지 지표: 요청 빈도, 실패율, API 다중 사용)

## 3. 사용자 시나리오
1. 운영자(Web / 운영 백오피스)가 `GET /v1/events`로 최근 L1 이벤트 조회
2. 운영자 `GET /v1/risk/score/{wallet}`로 지갑별 점수 확인
3. 지갑 이상 징후 발생 시 `GET /v1/risk/alerts`로 알림 목록 조회, `POST /v1/risk/alerts/{id}/ack` 처리
4. Webhook 공급자/노드가 `/webhooks/apix-l1`로 이벤트 전달 → 검증/적재/리스크 업데이트
5. DB/스키마 미구축 환경에서는 상태가 degraded로 표시되며, 핵심 API는 빈 응답(빈 리스트/기본값)으로 동작

## 4. 비기능 요구사항
- 보안: `/v1` 경로는 API 키 인증(운영 키) 적용
- Webhook 위·변조 방지: 서명 검증(HMAC-SHA256) + 타임스탬프 허용 오차 제한
- 장애 내성: DB/Kafka 미구성 시에도 API가 최소 기능으로 동작하도록 degradation
- 감사성: 요청 추적 ID, 수집된 이벤트는 Kafka로 발행

## 5. API/운영 요구사항
- `GET /v1/health`: 시스템 상태, Kafka 연결 상태, 체인 ID(402) 노출
- `GET /v1/events`: 지갑/타입/상태/시간대별 페이징 조회
- `GET /v1/risk/alerts`: 이상탐지 알림 조회
- `GET /v1/risk/score/{wallet}`: 지갑별 최신 risk score
- `POST /v1/risk/alerts/{alert_id}/ack`: 알림 상태/담당자/메모 갱신
- `GET /v1/ops/lag`: 블록/미스매치 대기 지표
- `POST /v1/ops/replay`: 리플레이 작업 등록
- `POST /v1/ops/rules/reload`: 규칙 재적용
- `POST /webhooks/apix-l1`: Webhook 이벤트 수신

## 6. 마일스톤
1. 1단계: 인증, health, 이벤트 조회, webhook 검증 및 raw 저장
2. 2단계: 리스크점수 API, 알림 ack/reload/lag/replay 구현
3. 3단계: 실서비스 연동(운영용 테이블/토픽/대시보드)
