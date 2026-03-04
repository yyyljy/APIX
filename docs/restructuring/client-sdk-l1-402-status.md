# APIX Client ↔ SDK ↔ Avalanche L1 Rebuild 상태 문서 (2026-03-04 기준)

## 1. 개요

SDK + L1 중심으로 재구성한 현재 작업 상태를 정리한다.  
판매자 백엔드는 기존처럼 존재하며, SDK는 백엔드 내부에서 동작한다.  
Cloud 검증 경로(`Apix Cloud`)는 기본값을 유지하되, `useCloudVerification=false`로 설정 시 L1 직접 검증이 가능하도록 적용했다.

## 2. 반영 완료 항목

- SDK 설정/타입 확장
  - `apix-sdk-node/index.ts`에 `ApixConfig` 확장 반영 (`rpcUrl`, `rpcTimeoutMs`, `rpcMaxRetries`, `defaultMinConfirmations`, `useCloudVerification`, `jwtTtlSeconds`, `jwtIssuer`, `jwtKid`).
  - `ApixMiddleware`에 L1 직접 검증용 플래그/타임아웃/재시도/확인 수 파라미터 적용.
  - `docs/restructuring/client-sdk-l1-402.md`의 전제 및 흐름을 SDK 개발자 관점으로 정합화.
  - `.d.ts`/`index.js` 계열도 타입/컴파일 산출물 동기화.

- 백엔드 연동 설정 반영
  - `demo/backend/index.ts`에 새로운 SDK 옵션 전달/파싱 추가.
  - `demo/backend/.env.example`에 SDK/L1/토큰 운영 변수 추가.

- 문서 정비
  - 기존 재구성 제안서와 일치하도록 [docs/restructuring/client-sdk-l1-402.md](/home/jeff/personal/APIX/docs/restructuring/client-sdk-l1-402.md) 업데이트.
  - 본 상태 문서 추가.

## 3. 현재 아키텍처 상태

- **클라이언트**: 402 Challenge 응답 수신 후 `Authorization: Apix <tx_hash>` 재요청.
- **판매자 백엔드 + SDK**:
  - 402 Challenge 생성/세션 시작/커밋/롤백은 기존 백엔드 라우팅 유지.
  - `ApixMiddleware.verifyPayment`에서 모드 분기:
    - 기본: Cloud 검증(`facilitatorUrl`의 `/v1/verify`)
    - `useCloudVerification=false`: RPC 기반 L1 직접 검증 경로로 동작
- **Avalanche L1**
  - `eth_getTransactionByHash`, `eth_getTransactionReceipt`, `eth_chainId`, `eth_blockNumber` 기반으로 tx 존재성, 영수증 상태, 수신자/금액/체인/확인 수를 검증.

## 4. 빌드/테스트 상태(최신 확인)

| 항목 | 명령 | 결과 |
|---|---|---|
| SDK 타입 빌드 | `cd apix-sdk-node && npm run build` | 성공 |
| 백엔드 타입 검사 | `./node_modules/typescript/bin/tsc index.ts index.test.ts ... --outDir .test-dist` | 성공 |
| 백엔드 통합 테스트 | `cd demo/backend && npm test` | 실패 (`supertest`가 null 서버에서 요청 시도) |

실패 메시지 핵심:

- `TypeError: Cannot read properties of null (reading 'port')`
- 위치: `supertest` 요청 수행부 (`node_modules/supertest/lib/test.js:67`), 호출 경로: `demo/backend/.test-dist/index.test.js:84`

## 5. 미해결/주의 항목

- `demo/backend` 테스트 스위트는 현재 앱 테스트 인프라 초기화(서버 바인딩) 순서/대상 핸들링 이슈로 통과되지 않음.
- 백엔드 `npm install`이 초기에는 네트워크 DNS(`EAI_AGAIN`)로 실패했다가 별도 실행으로 복구됨(현재는 `node_modules`에서 타입 검사 가능한 상태).
- 최종 배포 전 `npm test` 통과가 필요.

## 6. 다음 액션

- 테스트 헬퍼에서 `supertest` 요청 전 앱 서버를 안전하게 바인딩/전달하는 방식으로 수정.
- 동일 환경에서 `npm test` 재실행 후, 필요 시 실패 케이스를 보강.
- 백엔드 검증 성공 후 클라이언트 경로(`demo/frontend`) 402 재요청 플로우와 함께 통합 E2E 점검.
