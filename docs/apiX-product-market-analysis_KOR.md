# APIX Product and Market Gap Analysis

작성일: 2026-03-16  
범위: README, docs, frontend, backend, SDK, tests를 포함한 저장소 전반 검토

## 1. 목적
이 문서는 저장소 안에 이미 존재하는 내용, 요구된 평가 영역 대비 빠진 내용, 그리고 무엇을 먼저 개선해야 하는지를 요약한다.

## 2. 현재 강점
- 저장소에는 이미 API monetization, HTTP 402, on-chain verification, entitlement evolution에 대한 명확한 기술 서사가 존재한다.
- launch-readiness 작업 항목이 checklist 형태로 문서화되어 있다.
- Admin API, persistence, reconciliation, control-plane 계획을 통해 scaling 방향성이 존재한다.

## 3. 주요 공백
1. **성장 전략이 전략 문서로 정리되어 있지 않다** — checklist 조각 수준에 머물러 있다.
2. **경쟁 분석이 없다.**
3. **장기 제품 비전이 없다.**
4. **타깃 persona가 ICP 수준을 넘어서 충분히 정의되어 있지 않다.**
5. **public messaging이 일관되지 않다** — middleware vs marketplace, pay-per-call vs subscription framing이 혼재한다.

## 4. 가장 중요한 불일치
- README는 APIX를 monetization middleware로 포지셔닝하지만, frontend 일부는 marketplace처럼 보이게 만든다.
- pricing 언어가 pay-per-call과 subscription-style plan 사이에서 일관되지 않다.
- 일부 public docs는 현재 demo route와 맞지 않는 API 패턴을 설명한다.

## 5. 우선순위 권고
### P0
- 제품 정체성을 API monetization middleware로 고정
- GTM 전략 및 user persona 문서 공개
- public pricing 및 positioning language 수정

### P1
- 경쟁 분석과 장기 제품 비전 공개
- landing page, docs page, dashboard 언어를 하나의 제품 스토리로 정렬

### P2
- test 및 onboarding 신뢰도를 높여 제품이 demo-only가 아니라 production-bound처럼 느껴지게 만들기

## 6. 요약
이 저장소는 이미 강한 기술 방향성을 갖고 있었지만, 평가자가 market, growth, competition, product direction을 자신 있게 점수화할 수 있도록 설명하는 전략 문서가 필요했다.
