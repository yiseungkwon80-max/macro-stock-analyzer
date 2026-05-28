/**
 * 뉴스 기반 동적 테마 추천 엔진
 *
 * 작동 방식:
 *   macro-news.js 의 getMacroAnalysis() → sector_map, beneficiary_stocks 추출
 *   → sector_map의 "수혜" 섹터 → 동적 테마 자동 생성
 *   → beneficiary_stocks → 각 테마에 매핑
 *   → AI반도체, 2차전지 등 핵심 테마 항상 포함
 *
 * 캐시: macro-news.js 와 동일한 6시간 TTL
 */

import { getMacroAnalysis } from './macro-news.js';

// stock code → sector (macro-news.js 분석 템플릿에 등장하는 종목 기준)
const STOCK_SECTOR = {
  // 은행
  '105560': '은행', '055550': '은행', '086790': '은행', '024110': '은행',
  '139130': '은행', '316140': '은행', '016360': '은행',
  // 보험
  '000810': '보험', '032830': '보험',
  // 반도체
  '005930': '반도체', '000660': '반도체', '042700': '반도체', '058470': '반도체',
  '039030': '반도체', '240810': '반도체', '053690': '반도체',
  // 기술/성장주
  '035420': '기술/성장주', '035720': '기술/성장주', '018260': '기술/성장주',
  // 바이오
  '068270': '바이오', '207940': '바이오', '000100': '바이오', '302440': '바이오',
  // 건설
  '000720': '건설', '006360': '건설',
  // 방산
  '012450': '방산', '064350': '방산', '079550': '방산',
  // 에너지
  '010950': '에너지', '096770': '에너지', '267260': '에너지', '010120': '에너지',
  '001440': '에너지',
  // 자동차
  '005380': '자동차',
  // 조선
  '009540': '조선',
  // 철강/소재
  '005490': '철강/소재',
  // 항공
  '003490': '항공',
  // 화학
  '011170': '화학', '051910': '화학',
  // 2차전지 (core)
  '373220': '2차전지', '247540': '2차전지',
  // 로봇 (core)
  '277810': '로봇', '267270': '로봇',
  // 물류
  '086280': '물류', '028670': '물류', '001120': '물류',
};

// sector → theme 템플릿
const SECTOR_THEME = {
  '은행': {
    theme: '금융·은행 수혜주',
    icon: '🏦',
    strength: 'MEDIUM',
    descFn: (event, reason) =>
      `${event} → ${reason} 금리 안정기 안정적 예대마진과 고배당 매력이 부각됩니다.`,
  },
  '보험': {
    theme: '보험·금융 수혜주',
    icon: '🛡️',
    strength: 'MEDIUM',
    descFn: (event, reason) =>
      `${event} → ${reason} 투자수익률 개선과 안정적 현금흐름이 기대됩니다.`,
  },
  '반도체': {
    theme: '반도체·IT 수혜주',
    icon: '💾',
    strength: 'STRONG',
    descFn: (event, reason) =>
      `${event} → ${reason} AI 수요 폭발과 업황 회복이 실적 모멘텀을 강화합니다.`,
  },
  '기술/성장주': {
    theme: '기술·성장주 수혜',
    icon: '🚀',
    strength: 'MEDIUM',
    descFn: (event, reason) =>
      `${event} → ${reason} 밸류에이션 회복과 센티먼트 개선이 예상됩니다.`,
  },
  '바이오': {
    theme: '바이오·헬스케어 수혜주',
    icon: '🧬',
    strength: 'STRONG',
    descFn: (event, reason) =>
      `${event} → ${reason} R&D 모멘텀과 금리 민감도 완화 효과를 기대할 수 있습니다.`,
  },
  '건설': {
    theme: '건설·인프라 수혜주',
    icon: '🏗️',
    strength: 'MEDIUM',
    descFn: (event, reason) =>
      `${event} → ${reason} 금융비용 감소와 PF 부담 완화로 실적 개선이 기대됩니다.`,
  },
  '방산': {
    theme: 'K-방산 수혜주',
    icon: '🪖',
    strength: 'STRONG',
    descFn: (event, reason) =>
      `${event} → ${reason} 글로벌 방위비 증액과 K-방산 수출 호조가 지속됩니다.`,
  },
  '에너지': {
    theme: '에너지·인프라 수혜주',
    icon: '⚡',
    strength: 'MEDIUM',
    descFn: (event, reason) =>
      `${event} → ${reason} 유가·전력 수요 증가로 정제마진과 인프라 투자가 확대됩니다.`,
  },
  '자동차': {
    theme: '자동차·수출 수혜주',
    icon: '🚗',
    strength: 'MEDIUM',
    descFn: (event, reason) =>
      `${event} → ${reason} 수출 경쟁력 강화와 환율 효과가 긍정적입니다.`,
  },
  '조선': {
    theme: '조선·해운 수혜주',
    icon: '🚢',
    strength: 'MEDIUM',
    descFn: (event, reason) =>
      `${event} → ${reason} 수주 잔고 증가와 해운 운임 강세가 지속됩니다.`,
  },
  '철강/소재': {
    theme: '철강·소재 수혜주',
    icon: '🏭',
    strength: 'MEDIUM',
    descFn: (event, reason) =>
      `${event} → ${reason} 인프라 투자 확대와 경기 회복이 실적을 뒷받침합니다.`,
  },
  '항공': {
    theme: '항공·여행 수혜주',
    icon: '✈️',
    strength: 'MEDIUM',
    descFn: (event, reason) =>
      `${event} → ${reason} 유가 안정과 여행 수요 회복이 긍정적입니다.`,
  },
  '화학': {
    theme: '화학·에너지 수혜주',
    icon: '⚗️',
    strength: 'MEDIUM',
    descFn: (event, reason) =>
      `${event} → ${reason} 원자재 가격 안정과 수요 회복이 업황 개선을 이끕니다.`,
  },
};

/**
 * beneficiary_stocks 를 섹터별로 그룹화
 */
function groupStocksBySector(beneficiaryStocks) {
  const groups = {};
  for (const st of beneficiaryStocks) {
    const sector = STOCK_SECTOR[st.code] || '기타';
    if (!groups[sector]) groups[sector] = [];
    groups[sector].push(st);
  }
  return groups;
}

/**
 * 매크로 분석 결과 → 동적 테마 리스트 생성
 */
function buildDynamicThemes(macroAnalysis) {
  const themes = [];
  const {
    sector_map = [],
    beneficiary_stocks = [],
    macro_event = '',
    event_date = '',
    event_type = '',
    impact_rating = 'MEDIUM',
  } = macroAnalysis;

  const eventLabel = macro_event.replace(/\s*\(.*?\)\s*/g, '').trim();
  const stockGroups = groupStocksBySector(beneficiary_stocks);

  // 1. sector_map의 "수혜" 섹터 → 테마 생성
  const benefitSectors = sector_map.filter(s => s.impact === '수혜');

  for (const sec of benefitSectors) {
    const template = SECTOR_THEME[sec.sector];
    if (!template) continue;

    // 해당 섹터에 속한 종목 추출
    const sectorStocks = stockGroups[sec.sector] || [];

    // 또는 매칭되지 않은 beneficiary_stocks 에서 benefit_reason 키워드로 검색
    const extraStocks = beneficiary_stocks.filter(st => {
      if (stockGroups[sec.sector]?.includes(st)) return false;
      // 키워드 기반 느슨한 매칭
      const keywordMap = {
        '은행': /금융|은행|대출|예대|배당/,
        '보험': /보험|IFRS|손해율/,
        '반도체': /반도체|HBM|AI|메모리|파운드리|칩/,
        '기술/성장주': /성장주|밸류에이션|할인율|PER|인터넷|플랫폼/,
        '바이오': /바이오|제약|의약품|시밀러|CDMO|R&D/,
        '건설': /건설|PF|분양|수주|플랜트/,
        '방산': /방산|방위|무기|전차|자주포|유도/,
        '에너지': /에너지|정유|변압|케이블|전력|석유|유가/,
        '자동차': /자동차|완성차|전기차|수출|부품/,
        '조선': /조선|선박|수주|잔고|해운/,
        '철강/소재': /철강|소재|인프라|금속|포스코/,
        '항공': /항공|여행|운송|유류|연료/,
        '화학': /화학|석유|원료|나프타|스프레드/,
      };
      const regex = keywordMap[sec.sector];
      return regex && regex.test(st.benefit_reason || '');
    });

    const allSectorStocks = [...sectorStocks, ...extraStocks];
    // 중복 제거
    const seen = new Set();
    const uniqueStocks = [];
    for (const st of allSectorStocks) {
      if (!seen.has(st.code)) {
        seen.add(st.code);
        uniqueStocks.push(st);
      }
    }

    if (uniqueStocks.length === 0) continue;

    const reasonMap = {};
    for (const st of uniqueStocks) {
      reasonMap[st.code] = st.benefit_reason || st.expected_upside || '매크로 이벤트 수혜';
    }

    // 이벤트 강도 → 테마 강도
    const themeStrength = impact_rating === 'HIGH' ? 'STRONG' : template.strength;

    themes.push({
      theme: `${eventLabel} — ${template.theme}`,
      icon: template.icon,
      description: template.descFn(eventLabel, sec.reason),
      strength: themeStrength,
      source: 'macro',
      event_type,
      event_date,
      codes: uniqueStocks.map(s => s.code),
      reasons: reasonMap,
    });
  }

  // 2. 수혜 섹터가 없으면 전체 beneficiary_stocks 를 하나의 범용 테마로
  if (themes.length === 0 && beneficiary_stocks.length > 0) {
    const reasonMap = {};
    for (const st of beneficiary_stocks) {
      reasonMap[st.code] = st.benefit_reason;
    }
    themes.push({
      theme: `${eventLabel} — 종합 수혜주`,
      icon: '📈',
      description: `현재 감지된 매크로 이벤트(${eventLabel})에 따른 주요 수혜 종목입니다.`,
      strength: impact_rating === 'HIGH' ? 'STRONG' : 'MEDIUM',
      source: 'macro',
      event_type,
      event_date,
      codes: beneficiary_stocks.map(s => s.code),
      reasons: reasonMap,
    });
  }

  return themes;
}

// ── 캐시 ──
let cachedThemes = null;
let cacheTimestamp = 0;
const CACHE_TTL = 6 * 60 * 60 * 1000; // macro-news.js 와 동기화

/**
 * 테마 추천 조회 (캐시 적용)
 */
export async function getThemeRecommendations(forceRefresh = false) {
  const now = Date.now();

  if (!forceRefresh && cachedThemes && (now - cacheTimestamp) < CACHE_TTL) {
    return {
      themes: cachedThemes,
      cached: true,
      generated_at: new Date(cacheTimestamp).toISOString(),
      source: 'macro-news + sector_map',
    };
  }

  const macroAnalysis = await getMacroAnalysis(forceRefresh);
  const themes = buildDynamicThemes(macroAnalysis);

  cachedThemes = themes;
  cacheTimestamp = now;

  return {
    themes,
    cached: false,
    generated_at: new Date().toISOString(),
    source: 'macro-news + sector_map',
    macro_event: macroAnalysis.macro_event,
    event_date: macroAnalysis.event_date,
  };
}
