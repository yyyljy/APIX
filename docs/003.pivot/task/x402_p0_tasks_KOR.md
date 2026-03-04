# APIX P0 실행 티켓 (x402 경쟁력 보강)

**기준 문서:** `docs/analysis/x402_competitive_comparison_KOR.md`  
**기간:** 2주 (P0)  
**최신 상태:** 2026-02-21

## Ticket P0-1: 표준 헤더 호환 레이어

- [x] 402 응답에 `PAYMENT-REQUIRED` 헤더 추가
- [x] `PAYMENT-SIGNATURE` 인증 플로우 수용
- [x] 기존 `Authorization: Apix ...` 경로와 동시 호환
- [ ] 파싱 우선순위/충돌 규칙 문서화
- [ ] 회귀 테스트 추가 (legacy/standard/mixed)

**완료 기준**
- [x] 기존 데모 클라이언트와 PAYMENT-* 호환 클라이언트가 모두 402 -> 200 플로우를 통과

## Ticket P0-2: 실체인 검증 도입 (1개 체인 MVP)

- [x] `apix-cloud/main.go`의 mock("always valid") 제거
- [x] RPC 기반 tx 검증 구현 (수신자/금액/확정수)
- [x] 체인 응답 지연/실패 대비 timeout + retry 정책 정의
- [x] 실패 사유를 안정된 에러 코드로 매핑
- [ ] 통합 테스트: 성공/금액부족/수신자불일치/미확정

**완료 기준**
- [x] 기본 런타임에서 mock 경로가 기본 OFF이며 검증 성공 시에만 토큰 발급

## Ticket P0-3: 시크릿 외부화 + 키 회전 기반

- [x] JWT secret 코드 하드코딩 제거
- [x] 환경변수 필수값 누락 시 서버 시작 실패(fail-fast) 확대
- [x] JWT `kid`(key id) 클레임 또는 헤더 도입
- [ ] dev/stage/prod 비밀관리 가이드 문서화

**완료 기준**
- [ ] 코드베이스에 하드코딩 시크릿 0건

## Ticket P0-4: 네트워크 식별 표준화

- [x] 결제 메타데이터에 CAIP-2 스타일 네트워크 식별자 반영
- [x] 체인별 설정(네트워크/자산/decimals) 정규화
- [x] 네트워크 불일치 재생 공격 차단 검증 추가

**완료 기준**
- [x] 요청 네트워크와 결제 네트워크 불일치 시 즉시 거절

## Ticket P0-5: P0 종료 게이트

- [x] 프로토콜 체크: PAYMENT-* + Apix legacy 동시 통과
- [ ] 운영 체크: 최소 로깅/오류코드/장애 원인 추적 가능

## 우선순위

1. P0-2 실체인 검증
2. P0-1 헤더 호환
3. P0-3 시크릿/키회전
4. P0-4 네트워크 표준화
5. P0-5 종료 게이트 검증
