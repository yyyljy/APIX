# APIX Admin API TODO (PostgreSQL + Kafka 연동)

상태 코드: `1=완료`, `2=진행중`, `3=보류`

## 1. DB 마이그레이션
- [3] PostgreSQL 연결 계정/권한 생성
- [3] DDL 적용 (`docs/apiX-admin-postgresql-ddl.sql` 실행)
- [3] 서비스 스키마 점검
  - [3] `l1_events_raw` 인덱스/제약조건 확인
  - [3] `l1_events_normalized` 인덱스/제약조건 확인
  - [3] `risk_alerts`, `risk_scores`, `webhook_mismatch`, `replay_jobs` 생성 확인
- [3] 파티셔닝/보존 정책 적용 여부 결정(선택)
  - [3] raw/normalized 이벤트 보존 기간 규칙 설정
  - [3] 오래된 리스크 점수/알림 정리 정책 추가

## 2. adminapi 서버 환경변수 설정
- [3] `.env` 또는 배포 환경 변수 주입
- [3] `APIX_ADMIN_DATABASE_URL` 설정
- [3] `APIX_ADMIN_KAFKA_BROKERS` 설정
- [3] `APIX_ADMIN_KAFKA_ENABLED` 설정
- [3] `APIX_ADMIN_WEBHOOK_SECRET` 설정
- [3] `APIX_ADMIN_WEBHOOK_VERIFY` 정책(`true/false`) 설정
- [3] `APIX_ADMIN_WEBHOOK_SIGNATURE_HEADER` 설정(기본값: `X-Webhook-Signature`)
- [3] `APIX_ADMIN_API_KEYS`, `APIX_ADMIN_API_KEY_HEADER` 설정
- [3] `APIX_ADMIN_TOPIC_*` 토픽명 검증

## 3. Kafka 토픽/운영
- [3] 토픽 생성
  - [3] `apix.l1.events.raw.v1`
  - [3] `apix.l1.events.normalized.v1`
  - [3] `apix.risk.score.v1`
  - [3] `apix.risk.alert.v1`
  - [3] `apix.l1.events.mismatch.v1`
  - [3] `apix.l1.events.deadletter.v1`
- [3] Consumer/후처리 파이프라인 설계
  - [3] raw → normalized 변환기 연동
  - [3] risk score/alert consumer 상태 모니터링

## 4. Webhook 운영 체크
- [3] AvaCloud Webhook URL 등록
  - [3] `POST /webhooks/apix-l1` 경로 라우트 연결 확인
- [3] HMAC 서명 규약 확정
  - [3] 키/헤더 규칙 문서화
  - [3] 타임스탬프 허용 오차 테스트
- [3] 재전송/중복 처리 검증
  - [3] `dedupe_key` 동작 점검
  - [3] 지연·중복 요청 재현 테스트

## 5. 운영 API 검증
- [3] 인증/권한
  - [3] `/v1/*` 호출 시 API 키 필수 동작
  - [3] 미인증 호출 401 반환 확인
- [3] 건강상태
  - [3] `/v1/health` 응답 및 `DEGRADED` 전환 조건 점검
- [3] 조회 API
  - [3] `/v1/events` 필터 및 페이지네이션
  - [3] `/v1/risk/alerts` 필터/정렬
  - [3] `/v1/risk/score/{wallet}` 정상/미존재 지갑 케이스
- [3] 운영 API
  - [3] `/v1/ops/replay` 검증
  - [3] `/v1/ops/lag` 모니터링 지표 점검
  - [3] `/v1/risk/alerts/{id}/ack` 상태 변경
  - [3] `/v1/ops/rules/reload` 정책 반영

## 6. 안정성/운영 보완
- [3] DB 미스매치/미구성 대비
  - [3] DB 미연결시 `DEGRADED`/기본 응답 동작 확인
- [3] Kafka 미연결/발행 실패 대응
  - [3] publish 실패 로그/알림 정책 적용
- [3] 로그/모니터링
  - [3] 이벤트 수신률, webhook mismatch 수, risk alert 생성 추세 대시보드 구축
