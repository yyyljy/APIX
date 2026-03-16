# APIX User Personas

작성일: 2026-03-16  
상태: Draft v0.2

## 1. 목적
이 문서는 APIX의 핵심 사용자 페르소나를 정의하고, 각 페르소나의 목표, pain point, 도입 트리거, objection, 권장 메시지를 정리한다.

**중요 원칙:** MVP의 타깃은 일반적인 marketplace 소비자가 아니다. 초기 타깃은 API를 운영하거나 agent 기반 시스템을 만드는 기술 팀이다.

---

## 2. 페르소나 요약

| Persona | 역할 | APIX와의 관계 | 도입 동기 | 주요 장애물 |
|---|---|---|---|---|
| P1. API Product Owner | API monetization를 총괄 | 주요 챔피언 | API를 빠르게 수익화하고 싶음 | pricing 및 settlement 모델 불명확 |
| P2. AI Agent Builder | agent 또는 automation 시스템 구축 | 핵심 기술 사용자 | programmatic payment와 access가 필요 | 결제, retry, failure 복잡성 |
| P3. Web3 Infra Provider | RPC, data, infra API 운영 | 초기 해변두렁 고객 | crypto-native monetization과 quota 상품 필요 | 운영 신뢰성과 abuse 방지 |
| P4. Platform / Security Lead | 보안 및 production readiness 검토 | 승인 이해관계자 | 통제, 감사 가능성, 운영 안정성 필요 | 보안, 컴플라이언스, SLA 우려 |

---

## 3. Persona 1 — API Product Owner

### Profile
- SaaS, data, AI tooling, API-first 회사에서 일함
- packaging, adoption, partner access, pricing 결정을 담당
- product와 engineering 언어를 모두 이해함

### Jobs-to-be-Done
- “billing stack을 처음부터 다시 만들지 않고도 API를 수익화하고 싶다.”
- “새로운 API package를 빠르게 출시하고 싶다.”
- “pay-per-call과 quota package를 모두 실험하고 싶다.”

### Pain Points
- 내부 billing infrastructure 구축이 느리다
- pricing 실험 주기가 길다
- marketplace는 고객 관계와 브랜드 통제력을 약화시킬 수 있다
- trial, overage, quota 설계가 운영상 복잡하다

### Buying Triggers
- 새로운 유료 API 출시
- AI 기능을 별도 상품으로 패키징해야 할 때
- API-key + invoice 모델에 마찰이 생길 때

### Objections
- “실제로 integration이 얼마나 빠른가?”
- “기존 billing stack과 충돌하지 않는가?”
- “고객이 crypto-native payment 경로를 받아들일까?”

### Success Metrics
- 첫 paid endpoint 출시까지 걸린 시간
- paid conversion rate
- pricing experiment cycle time
- protected endpoint당 revenue

### Recommended Message
**“APIX는 billing stack을 다시 만들지 않고도 API를 빠르게 수익화하게 해줍니다.”**

### Best Acquisition Channels
- launch communications
- comparison content
- partner referrals
- case studies

---

## 4. Persona 2 — AI Agent Builder

### Profile
- agent startup, automation product, internal AI platform team에서 일함
- tool-calling, retrieval, orchestration, execution flow를 구축함
- SDK와 runtime integration에 익숙함

### Jobs-to-be-Done
- “사람 개입 없이 agent가 API에 결제하고 접근하게 해야 한다.”
- “account-based onboarding보다 더 짧은 machine-to-machine 경로가 필요하다.”
- “payment, retry, proof handling이 코드 친화적이어야 한다.”

### Pain Points
- 인간 중심 checkout flow는 automation과 맞지 않는다
- provider마다 onboarding과 payment 방식이 다르다
- retry와 failure semantics가 일관되지 않다
- usage와 비용 통제가 자동화하기 어렵다

### Buying Triggers
- 새 agent 기능이 유료 external API에 의존할 때
- tool execution cost를 request 단위로 관리해야 할 때
- autonomous workflow에 machine payment를 넣어야 할 때

### Objections
- “latency가 너무 커지지 않나?”
- “요청 실패 시 rollback이 신뢰 가능한가?”
- “quota와 credit 모델을 지원할 수 있나?”

### Success Metrics
- 첫 성공적인 402 -> pay -> retry flow
- end-to-end payment success rate
- automation completion rate
- payment issue 후 retry recovery rate

### Recommended Message
**“APIX는 AI agent가 API에 programmatically 결제하고 접근하는 가장 짧은 HTTP-native 경로를 제공합니다.”**

### Best Acquisition Channels
- GitHub와 README
- technical quickstart
- x402 및 agent-commerce content
- example repository

---

## 5. Persona 3 — Web3 Infra Provider

### Profile
- RPC provider, indexing platform, analytics API, wallet infra 회사에서 일함
- infrastructure monetization 또는 business development를 담당
- crypto-native payment와 wallet flow에 익숙함

### Jobs-to-be-Done
- “subscription만으로는 부족하니 더 유연한 monetization이 필요하다.”
- “pay-per-call 또는 prepaid quota로 premium API access를 판매하고 싶다.”
- “payment proof와 abuse prevention을 같은 시스템에서 처리하고 싶다.”

### Pain Points
- 전통적인 billing은 latency-sensitive API monetization과 잘 맞지 않는다
- on-chain settlement와 off-chain usage enforcement를 연결하기 어렵다
- replay, double-spend, risk operation이 운영 부담을 만든다

### Buying Triggers
- RPC 또는 data API의 상용화 런치
- premium monetized endpoint를 만들어야 할 때
- partner-facing API consumption을 통제해야 할 때

### Objections
- “replay와 double-spend protection은 얼마나 강한가?”
- “chain, confirmation, policy rule을 정밀하게 정의할 수 있나?”
- “settlement mismatch를 어떻게 모니터링하나?”

### Success Metrics
- monetized traffic volume
- replay-prevention effectiveness
- settlement mismatch 감소
- paid endpoint gross margin

### Recommended Message
**“APIX는 Web3 infra 팀이 crypto-native payment와 API enforcement를 하나의 흐름으로 연결하도록 돕습니다.”**

### Best Acquisition Channels
- ecosystem partnership
- chain foundation introduction
- technical architecture content
- design partner motion

---

## 6. Persona 4 — Platform / Security Lead

### Profile
- platform engineering, security, infra governance, enterprise architecture 조직에서 일함
- 보통 승인 게이트 또는 주요 blocker 역할을 함
- reliability, auditability, operational control을 우선시함

### Jobs-to-be-Done
- “이 결제 경로가 production에서 통제 가능한지 확인해야 한다.”
- “security, observability, incident response에 대한 확신이 필요하다.”
- “우리 operations 팀이 이 시스템을 안전하게 지원할 수 있어야 한다.”

### Pain Points
- demo처럼 보이는 제품은 승인받기 어렵다
- billing, settlement, authorization이 분절되면 incident 분석이 어렵다
- replay 대응, logging, recovery 절차가 약하면 도입이 막힌다

### Approval Triggers
- 명확한 admin API와 observability 방향성
- durable persistence와 reconciliation 설계
- SLA, support, incident-response 모델

### Objections
- “session store가 production-grade인가?”
- “audit log와 replay trace를 남길 수 있는가?”
- “dependency 장애 시 degraded mode는 안전한가?”

### Success Metrics
- security review 통과율
- incident MTTR
- reconciliation lag
- audit completeness

### Recommended Message
**“APIX는 단순한 payment SDK가 아니라, monetized API access를 안전하게 운영하기 위한 control layer로 발전하고 있습니다.”**

### Best Acquisition Channels
- security review packet
- architecture documentation
- technical due diligence session
- enterprise sales engineering

---

## 7. 구매 위원회 관점

| 이해관계자 | 관심사 | 설득 메시지 |
|---|---|---|
| Technical champion | integration 속도, DX, retry semantics | SDK, quickstart, sample app |
| Product owner | monetization 속도, packaging flexibility | pay-per-call + quota strategy |
| Security / ops approver | control, auditability, resilience | admin API, observability, runbook 방향성 |
| Business stakeholder | revenue opportunity, GTM fit | new monetization channel, partner motion |

---

## 8. Non-MVP Targets
APIX는 초기 메시지를 다음 사용자에게 최적화하면 안 된다.
- API를 그냥 찾아서 구매하고 싶은 casual user,
- marketplace-first discovery behavior,
- 비기술적 procurement-first enterprise buyer.

MVP는 broad marketplace experience가 아니라 monetization infrastructure에 집중해야 한다.

---

## 9. 요약
APIX의 가장 현실적인 초기 고객 구조는 다음과 같다.
- **Primary economic buyer:** API Product Owner / Infra owner
- **Primary technical user:** AI Agent Builder / Backend engineer
- **Primary early market:** Web3 infra / AI infra provider
- **Primary approval stakeholder:** Platform / Security Lead

제품 메시지, 데모, 랜딩 페이지, 문서는 먼저 이 네 집단을 위해 작성되어야 한다.
