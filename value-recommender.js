/**
 * 저평가주 발굴 엔진 — 뉴스 기반 동적 저평가 그룹 생성
 *
 * 핵심 원칙:
 *   "싸게 사서 비싸게 판다" — PBR/P-ER 기준 가치 발굴
 *   매크로 이벤트로 영향받는 섹터의 저평가주를 우선 발굴
 *   이벤트가 바뀌면 저평가 그룹도 자동 변경됨
 *   "IT·광고" 같은 상관없는 그룹은 제외
 *
 * 구조:
 *   1. 섹터별 저평가주 풀 (PBR ≤ 0.65, PER ≤ 14 기준)
 *   2. 매크로 이벤트 → 영향 섹터 추출 → 관련 저평가 그룹 생성
 *   3. 수혜 섹터 = "싸게 살 기회", 피해 섹터 = "역발상 매수 기회"
 */

import { getMacroAnalysis } from './macro-news.js';

// ── 섹터별 저평가주 풀 ──
// key: macro-news.js sector_map 의 sector 명칭과 일치
const SECTOR_VALUE_POOL = {
  '은행': [
    { code: '024110', name: '우리금융지주', pbr: 0.32, per: 4.2, divYield: 6.8, strengths: ['PBR 0.32 극단적 저평가', '배당수익률 6.8%', '중소기업 대출 시장 지배력', '정부 정책 수혜'], grade: 'A' },
    { code: '139130', name: 'iM뱅크', pbr: 0.25, per: 5.1, divYield: 5.0, strengths: ['PBR 0.25 은행주 최저수준', '지방은행 M&A 프리미엄', '대구·경북 기반 안정성', '자사주 매입 검토'], grade: 'A' },
    { code: '316140', name: '우리금융캐피탈', pbr: 0.35, per: 6.0, divYield: 5.2, strengths: ['PBR 0.35 저평가', '완전민영화 프리미엄', '배당수익률 5.2%', '비은행 부문 확장'], grade: 'A' },
    { code: '086790', name: '하나은행', pbr: 0.38, per: 5.5, divYield: 5.8, strengths: ['PBR 0.38 저평가', '자사주 매입·소각 적극', 'IB 부문 강화', 'ROE 개선 추세'], grade: 'B+' },
    { code: '105560', name: 'KB금융', pbr: 0.48, per: 5.2, divYield: 5.5, strengths: ['PBR 0.48 저평가', '배당수익률 5.5%', '리딩뱅크 프리미엄', '비은행 수익 다각화'], grade: 'B+' },
  ],
  '보험': [
    { code: '000810', name: '삼성화재', pbr: 0.42, per: 4.8, divYield: 5.2, strengths: ['PBR 0.42 저평가', 'IFRS17 도입 수혜', '배당수익률 5.2%', '손해율 개선'], grade: 'A' },
    { code: '032830', name: '삼성생명', pbr: 0.45, per: 6.2, divYield: 5.8, strengths: ['PBR 0.45 저평가', '삼성전자 지분가치', '배당수익률 5.8%', '안정적 보험 포트폴리오'], grade: 'A' },
  ],
  '건설': [
    { code: '004990', name: '롯데지주', pbr: 0.29, per: 8.5, divYield: 5.0, strengths: ['PBR 0.29 지주사 할인 극심', '자회사 실적 턴어라운드', '배당수익률 5%대', '자사주 8% 보유'], grade: 'B+' },
    { code: '006360', name: 'GS건설', pbr: 0.38, per: 9.2, divYield: 4.2, strengths: ['PBR 0.38 저평가', '플랜트 수주 회복', '주택 분양 개선', 'GS이니마 IPO'], grade: 'B+' },
    { code: '000720', name: '현대건설', pbr: 0.32, per: 8.8, divYield: 4.5, strengths: ['PBR 0.32 역대 최저', '중동 수주 확대', '재건축·정비사업 수혜', '배당수익률 4.5%'], grade: 'B+' },
  ],
  '철강/소재': [
    { code: '034730', name: 'SK', pbr: 0.35, per: 6.5, divYield: 4.8, strengths: ['NAV 대비 65% 할인', 'SK하이닉스 지분가치 급증', '배당수익률 4.8%', '자사주 소각 정책'], grade: 'A' },
    { code: '402340', name: 'SK스퀘어', pbr: 0.30, per: 7.2, divYield: 4.0, strengths: ['NAV 대비 70% 할인', 'SK하이닉스 간접 보유', '자회사 IPO 모멘텀', '자사주 30% 확보'], grade: 'A' },
    { code: '005490', name: 'POSCO홀딩스', pbr: 0.60, per: 10.5, divYield: 3.5, strengths: ['PBR 0.60 저평가', '2차전지 소재 수직계열화', '리튬 상업생산 임박', '철강 본업 안정적'], grade: 'B+' },
  ],
  '에너지': [
    { code: '010950', name: 'S-Oil', pbr: 0.48, per: 6.5, divYield: 7.1, strengths: ['배당수익률 7.1%', '정유·윤활유 캐시카우', 'PBR 0.48 저평가', '수소·배터리 신사업'], grade: 'A' },
    { code: '096770', name: 'SK이노베이션', pbr: 0.45, per: 12.0, divYield: 2.5, strengths: ['LiBS 글로벌 1위', 'SK온 실적 턴어라운드', 'PBR 0.45 저평가', 'IRA 수혜 직결'], grade: 'B+' },
    { code: '047050', name: '포스코인터내셔널', pbr: 0.55, per: 9.8, divYield: 3.2, strengths: ['PBR 0.55 저평가', '곡물·에너지 트레이딩', '미얀마 가스전', '2차전지 소재 사업'], grade: 'B' },
  ],
  '화학': [
    { code: '051910', name: 'LG화학', pbr: 0.65, per: 14.0, divYield: 2.8, strengths: ['PBR 0.65 하단', '배터리 소재 성장', '석유화학 바닥 통과', 'R&D CAPA 확대'], grade: 'B+' },
    { code: '011170', name: '호남석유화학', pbr: 0.28, per: 10.2, divYield: 4.8, strengths: ['PBR 0.28 역대 최저', '화학 스프레드 개선', '배당수익률 4.8%', 'M&A 가능성'], grade: 'B' },
  ],
  '반도체': [
    { code: '000660', name: 'SK하이닉스', pbr: 0.78, per: 8.5, divYield: 1.2, strengths: ['HBM 시장 독점', 'PER 8.5배 저평가', '엔비디아향 매출 급증', 'DDR5 전환 수혜'], grade: 'B+' },
    { code: '009150', name: '삼성전기', pbr: 0.95, per: 12.0, divYield: 3.5, strengths: ['PER 12배 저평가', 'MLCC 업황 회복', '전장용 부품 성장', '배당수익률 3.5%'], grade: 'B' },
  ],
  '기술/성장주': [
    { code: '035420', name: 'NAVER', pbr: 0.75, per: 18.0, divYield: 1.5, strengths: ['PER 18배 역사적 저점', '커머스 턴어라운드', 'AI 검색 모멘텀', '자사주 소각 1조원'], grade: 'B+' },
    { code: '018260', name: '삼성SDS', pbr: 0.82, per: 9.0, divYield: 2.8, strengths: ['PER 9배 저평가', '삼성 클라우드 수혜', '물류·AI SaaS 전환', '현금성자산 4.5조원'], grade: 'B+' },
  ],
  '통신': [
    { code: '030200', name: 'KT', pbr: 0.45, per: 6.8, divYield: 6.5, strengths: ['배당수익률 6.5%', '통신 본업 안정적', 'IDC·클라우드 성장', '자사주 매입 지속'], grade: 'A' },
    { code: '017670', name: 'SK텔레콤', pbr: 0.52, per: 7.2, divYield: 6.1, strengths: ['배당수익률 6.1%', 'AI 인프라 수혜', '자회사 IPO 기대', '5G 가입자 확대'], grade: 'A' },
  ],
};

// ── 섹터 → 저평가 그룹명 매핑 ──
const GROUP_LABELS = {
  '은행': { group: '금융·은행 저평가주', icon: '🏦', desc: 'PBR 0.2~0.5x 극단적 저평가 + 고배당. 매크로 이벤트로 인한 금리 변동 시 선제 매수 기회' },
  '보험': { group: '보험·금융 저평가주', icon: '🛡️', desc: 'IFRS17 도입으로 숨은 이익 부각. PBR 0.4x대 극저평가 + 배당 매력' },
  '건설': { group: '건설·지주 할인주', icon: '🏗️', desc: 'NAV 대비 60~70% 할인. 금리 안정기 PF 부담 완화로 실적 턴어라운드 기대' },
  '철강/소재': { group: '지주·소재 저평가주', icon: '🏭', desc: '자회사 가치 대비 극단적 할인. 인프라 투자 확대로 업황 회복 전망' },
  '에너지': { group: '에너지·정유 고배당주', icon: '⚡', desc: '배당수익률 5~7% + 정유·배터리 캐시카우. 유가 변동 시 가치 매수 기회' },
  '화학': { group: '화학·소재 실적 턴어라운드', icon: '⚗️', desc: '실적 바닥 통과 + 업황 회복 초입. PBR 0.3x대 역대 최저 수준' },
  '반도체': { group: '반도체·IT 가치주', icon: '💾', desc: 'PER 8~12배 저평가 구간. AI·HBM 수요로 실적 모멘텀 강화' },
  '기술/성장주': { group: '플랫폼·IT 저평가주', icon: '🚀', desc: 'PER 역사적 저점. AI·클라우드 전환 모멘텀 보유한 가치주' },
  '통신': { group: '통신·유틸리티 고배당주', icon: '📡', desc: '배당수익률 5~7% + 방어적 비즈니스. AI 인프라 수혜 기대' },
};

// ── 항상 표시할 핵심 저평가 그룹 ──
function getCoreGroups() {
  return ['은행', '에너지']; // 은행(국민 관심 1순위), 에너지(고배당 1순위)
}

/**
 * 매크로 이벤트 영향 섹터 → 저평가 그룹 동적 생성
 */
function buildValueGroups(macroAnalysis) {
  const { sector_map = [], macro_event = '', impact_rating = 'MEDIUM' } = macroAnalysis;
  const eventLabel = macro_event.replace(/\s*\(.*?\)\s*/g, '').trim();

  // 1. 영향받는 섹터 추출 (수혜 + 피해 모두 → 저평가 기회)
  const affectedSectors = sector_map
    .filter(s => s.impact === '수혜' || s.impact === '피해')
    .map(s => s.sector);

  // 2. 항상 표시할 핵심 그룹
  const coreSectors = getCoreGroups();

  // 3. 모든 대상 섹터 (중복 제거, 핵심 + 이벤트 영향)
  const allSectors = [...new Set([...coreSectors, ...affectedSectors])];

  // 4. 통신은 항상 추가 (고배당 대표)
  if (!allSectors.includes('통신')) allSectors.push('통신');

  const groups = [];

  for (const sector of allSectors) {
    const label = GROUP_LABELS[sector];
    const stocks = SECTOR_VALUE_POOL[sector];
    if (!label || !stocks || stocks.length === 0) continue;

    // 이벤트 영향 설명 추가
    const isAffected = affectedSectors.includes(sector);
    const secInfo = sector_map.find(s => s.sector === sector);
    const contextNote = isAffected && secInfo
      ? `${secInfo.impact === '수혜' ? '✅' : '⚠️'} ${eventLabel} → ${secInfo.reason}`
      : '경기 방어적 가치주. 안정적 배당 수익';

    groups.push({
      group: label.group,
      icon: label.icon,
      description: `${label.desc}
${contextNote}`,
      source: isAffected ? 'macro' : 'core',
      strength: secInfo?.impact === '수혜' ? 'STRONG' : secInfo?.impact === '피해' ? 'CONTRARIAN' : 'NEUTRAL',
      stocks,
    });
  }

  return groups;
}

// ── 캐시 (macro-news와 동기화) ──
let cachedGroups = null;
let cacheTimestamp = 0;
const CACHE_TTL = 6 * 60 * 60 * 1000;

export async function getValueRecommendations(forceRefresh = false) {
  const now = Date.now();

  if (!forceRefresh && cachedGroups && (now - cacheTimestamp) < CACHE_TTL) {
    return {
      groups: cachedGroups,
      cached: true,
      generated_at: new Date(cacheTimestamp).toISOString(),
    };
  }

  const macroAnalysis = await getMacroAnalysis(forceRefresh);
  const groups = buildValueGroups(macroAnalysis);

  cachedGroups = groups;
  cacheTimestamp = now;

  return {
    groups,
    cached: false,
    generated_at: new Date().toISOString(),
    macro_event: macroAnalysis.macro_event,
    event_date: macroAnalysis.event_date,
  };
}
