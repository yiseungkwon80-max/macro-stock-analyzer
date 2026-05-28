import { useState, useEffect, useRef, useCallback } from 'react';
import './App.css';
import { getQuotes, getStockInfo, lookupCode, KOSPI_STOCKS, TOKEN_KEY, USER_KEY,
  register, login, logout, getMe, getStoredAuth, clearStoredAuth,
  fetchPosts, fetchPost, createPost, updatePost, deletePost, addComment,
  fetchMacroAnalysis, fetchThemes } from './api.js';

// ==================== MACRO ANALYSIS (동적 API 기반) ====================

// API 실패 시 fallback (하드코딩 최소화)
const MACRO_FALLBACK = {
  summary: '현재 시장 데이터를 불러오는 중입니다. 매크로 분석을 위해 서버에서 최신 뉴스를 수집 중입니다...',
  macro_event: '매크로 분석 로딩 중',
  event_date: new Date().toISOString().slice(0, 10),
  event_type: 'loading',
  impact_rating: 'MEDIUM',
  key_data: { rate_decision: '로딩 중...', policy_stance: '로딩 중...', inflation_outlook: '로딩 중...', gdp_outlook: '로딩 중...', unemployment: '로딩 중...' },
  beneficiary_stocks: [],
  damage_stocks: [],
  sector_map: [],
  hedge_strategy: '분석 데이터를 불러오는 중입니다. 잠시만 기다려주세요.',
  watch_points: [],
};

const THEME_CONFIG = [
  {
    theme: 'AI·반도체 슈퍼사이클',
    icon: '🤖',
    description: '글로벌 AI 투자 확대로 반도체 수요 폭발. HBM, AI 가속기 관련주 집중 조명',
    strength: 'STRONG',
    codes: ['000660', '005930', '042700', '058470'],
    reasons: {
      '000660': 'HBM3E 독점 공급. 엔비디아向 매출 급증',
      '005930': '파운드리 수주 확대. HBM 양산 본격화',
      '042700': 'HBM 패키징 장비 독점. 수주 잔고 사상 최대',
      '058470': 'AI 반도체 테스트 소켓 글로벌 1위',
    },
  },
  {
    theme: 'K-방산 르네상스',
    icon: '🛡️',
    description: '글로벌 방위비 증액 추세 + 폴란드·중동 수출 호조. 국내 방산주 실적 모멘텀 최고조',
    strength: 'STRONG',
    codes: ['012450', '064350', '079550'],
    reasons: {
      '012450': 'K9 자주포·천무 수출 확대. 루마니아 추가 수주 기대',
      '064350': 'K2 전차 폴란드 2차 계약. 매출 성장 가속',
      '079550': '천궁-II 중동 수출. 유도무기 포트폴리오 확대',
    },
  },
  {
    theme: '전력 인프라 슈퍼사이클',
    icon: '⚡',
    description: 'AI 데이터센터 + 전기차 충전 수요로 전력망 투자 급증. 변압기·케이블 품귀 현상',
    strength: 'MEDIUM',
    codes: ['267260', '010120', '001440'],
    reasons: {
      '267260': '변압기 수출 호조. 美 전력망 교체 수혜',
      '010120': '초고압 변압기·차단기 글로벌 점유율 확대',
      '001440': '해저케이블 수주 확대. 美·유럽 진출 가속',
    },
  },
  {
    theme: '바이오·헬스케어 혁명',
    icon: '🧬',
    description: '글로벌 인구 고령화 + mRNA·세포치료제 기술 도약. K-바이오 CDMO 경쟁력 부각',
    strength: 'STRONG',
    codes: ['207940', '068270', '000100', '302440'],
    reasons: {
      '207940': '글로벌 CDMO 1위. 바이오의약품 위탁생산 수주 폭증. 4공장 완공으로 CAPA 2배',
      '068270': '바이오시밀러 글로벌 점유율 확대. 짐펜트라 美 FDA 승인으로 신규 매출원 확보',
      '000100': '렉라자 FDA 승인 (국내 최초 항암제). 오픈이노베이션 R&D 성과 가시화',
      '302440': '백신·바이오 CDMO 확장. 안동공장 증설로 글로벌 백신 허브 도약',
    },
  },
  {
    theme: '2차전지·전기차 밸류체인',
    icon: '🔋',
    description: '美 IRA 수혜 + 유럽 배터리 규제 강화. K-배터리 3사의 글로벌 점유율 50% 돌파',
    strength: 'MEDIUM',
    codes: ['373220', '005490', '247540', '096770'],
    reasons: {
      '373220': '글로벌 배터리 점유율 2위. 美 GM 합작공장 양산 본격화. IRA AMPC 세액공제 수혜',
      '005490': '리튬·니켈 등 2차전지 소재 수직계열화. 아르헨티나 염수리튬 상업생산 임박',
      '247540': '하이니켈 양극재 글로벌 1위. 헝가리·캐나다 증설로 생산능력 3배 확장',
      '096770': 'SK온 배터리 + 리튬이온분리막(LiBS) 글로벌 1위. 소재 부문 IPO 기대감',
    },
  },
  {
    theme: '글로벌 공급망 재편',
    icon: '🚢',
    description: '美·中 디커플링 가속 + 해상운임 강세 지속. 공급망 다변화 수혜주 집중',
    strength: 'MEDIUM',
    codes: ['086280', '028670', '001120'],
    reasons: {
      '086280': '현대차·기아 물량 독점. 해상운임 상승기 실적 레버리지 극대화. 美 조지아 물류센터 가동',
      '028670': '벌크선 운임 강세 수혜. 하림그룹과의 시너지로 곡물 물류 확대',
      '001120': '자원 트레이딩 + 물류 플랫폼. 인도네시아 니켈·석탄 광산 투자 성과 가시화',
    },
  },
  {
    theme: '양자·차세대 컴퓨팅',
    icon: '⚛️',
    description: '양자컴퓨터 상용화 임박 + 반도체 미세공정 한계 돌파. EUV·첨단 공정 장비주 수혜',
    strength: 'MEDIUM',
    codes: ['039030', '240810', '053690'],
    reasons: {
      '039030': '반도체 레이저 마킹·그루빙 장비 글로벌 1위. HBM·어드밴스드 패키징 필수 공정',
      '240810': '반도체 증착·식각 장비 국산화 선두. 3D NAND 적층수 증가 수혜',
      '053690': 'CMP 슬러리·EUV 소재 국산화. 2나노 이하 초미세공정 필수 소재 공급',
    },
  },
  {
    theme: '로봇·스마트팩토리',
    icon: '🦾',
    description: '제조업 자동화 가속 + 협동로봇 시장 연평균 35% 성장. AI 로봇 시대 개막',
    strength: 'MEDIUM',
    codes: ['277810', '267270'],
    reasons: {
      '277810': '국내 유일 인간형 로봇 플랫폼 보유. 삼성전자 투자 유치로 글로벌 확장 기대',
      '267270': 'HD현대그룹 로봇 계열사. 조선소 자동화 솔루션 글로벌 수출 본격화',
    },
  },
];

// API 실패 시 사용할 폴백 (THEME_CONFIG와 동일)
const THEME_FALLBACK = THEME_CONFIG;

const VALUE_GROUPS = [
  {
    group: '금융·은행 저평가주',
    icon: '🏦',
    description: 'PBR 0.2~0.5x 극단적 저평가 + 고배당',
    stocks: [
      { code: '024110', strengths: ['절대 저평가 (PBR 0.32)', '배당수익률 6.8%', '중소기업 대출 시장 지배력', '정부 정책 수혜'], grade: 'A' },
      { code: '139130', strengths: ['PBR 0.25 국내 은행주 최저', 'iM뱅크 전환 성장성', '대구·경북 기반 안정적', '자사주 매입 검토'], grade: 'A' },
      { code: '316140', strengths: ['PBR 0.35 저평가', '완전민영화 프리미엄', '배당수익률 5.2%', '비은행 부문 확장'], grade: 'A' },
      { code: '086790', strengths: ['PBR 0.38 저평가', '자사주 매입·소각 적극', 'IB 부문 강화', 'ROE 개선 추세'], grade: 'B+' },
      { code: '016360', strengths: ['ROE 10%대 견조', 'PBR 0.55 저평가', '배당성향 40%', 'IB 수익 다각화'], grade: 'B' },
    ],
  },
  {
    group: '지주·건설 할인주',
    icon: '🏗️',
    description: 'NAV 대비 60~70% 할인 + 자회사 가치 미반영',
    stocks: [
      { code: '004990', strengths: ['PBR 0.29 지주사 할인 극심', '자회사 실적 턴어라운드', '배당수익률 5%대', '자사주 8% 보유'], grade: 'B+' },
      { code: '006360', strengths: ['PBR 0.38 업종 평균 하회', '플랜트 수주 회복', '주택 분양 개선', '자회사 GS이니마 IPO'], grade: 'B+' },
      { code: '034730', strengths: ['NAV 대비 65% 할인', 'SK하이닉스 지분가치 급증', '배당수익률 4.8%', '자사주 소각 정책'], grade: 'A' },
      { code: '402340', strengths: ['NAV 대비 70% 할인', 'SK하이닉스 간접 보유', '자회사 IPO 모멘텀', '자사주 30% 확보'], grade: 'B+' },
      { code: '000720', strengths: ['PBR 0.32 역대 최저', '중동 수주 확대 기대', '정비사업·재건축 수혜', '배당수익률 4.5%'], grade: 'B' },
    ],
  },
  {
    group: '통신·유틸리티 고배당',
    icon: '📡',
    description: '배당수익률 5~7% + 방어적 비즈니스',
    stocks: [
      { code: '030200', strengths: ['배당수익률 6.5%', '통신 본업 안정적', 'IDC·클라우드 성장', '자사주 매입 지속'], grade: 'A' },
      { code: '017670', strengths: ['배당수익률 6.1%', 'AI 인프라 수혜', '자회사 IPO 기대', '5G 가입자 확대'], grade: 'A' },
      { code: '032830', strengths: ['배당수익률 5.8%', 'PBR 0.45 저평가', '삼성전자 지분가치', '안정적 보험 포트폴리오'], grade: 'B+' },
      { code: '000810', strengths: ['배당수익률 5.2%', 'IFRS17 도입 수혜', 'PBR 0.42 저평가', '자동차보험 손해율 개선'], grade: 'B+' },
      { code: '010950', strengths: ['배당수익률 7.1%', '정유·윤활유 캐시카우', 'PBR 0.48 저평가', '수소·배터리 신사업'], grade: 'B' },
    ],
  },
  {
    group: '화학·에너지 실적주',
    icon: '⚗️',
    description: '실적 바닥 통과 + 업황 턴어라운드 기대',
    stocks: [
      { code: '051910', strengths: ['PBR 0.65 하단', '배터리 소재 성장', '석유화학 바닥 통과', 'R&D CAPA 확대'], grade: 'B+' },
      { code: '011170', strengths: ['PBR 0.28 역대 최저', '화학 스프레드 개선', '배당수익률 4.8%', 'M&A 가능성'], grade: 'B' },
      { code: '096770', strengths: ['LiBS 글로벌 1위', 'SK온 실적 턴어라운드', 'PBR 0.45 저평가', 'IRA 수혜 직결'], grade: 'B+' },
      { code: '047050', strengths: ['PBR 0.55 저평가', '곡물·에너지 트레이딩', '미얀마 가스전', '2차전지 소재 사업'], grade: 'B' },
      { code: '005490', strengths: ['PBR 0.60 저평가', '2차전지 소재 수직계열화', '아르헨티나 리튬 상업생산', '철강 본업 안정적'], grade: 'B+' },
    ],
  },
  {
    group: 'IT·광고 저평가 가치주',
    icon: '💻',
    description: '현금흐름 우수 + 숨겨진 자산가치',
    stocks: [
      { code: '030000', strengths: ['PER 8배 저평가', '삼성전자 광고 물량 확대', '배당수익률 5.5%', '현금성자산 2조원'], grade: 'A' },
      { code: '035420', strengths: ['PER 18배 (역사적 저점)', '커머스 턴어라운드', 'AI 검색 모멘텀', '자사주 소각 1조원'], grade: 'B+' },
      { code: '018260', strengths: ['PER 9배 저평가', '삼성 클라우드 수혜', '물류·AI SaaS 전환', '현금성자산 4.5조원'], grade: 'B+' },
      { code: '009150', strengths: ['PER 12배 저평가', 'MLCC 업황 회복', '전장용 부품 성장', '배당수익률 3.5%'], grade: 'B' },
      { code: '012450', strengths: ['PER 14배 (방산 평균 하회)', '수출 모멘텀 지속', 'PBR 1.8 적정 평가', '실적 가시성 높음'], grade: 'B' },
    ],
  },
];

const REBALANCE_DATA = {
  context: {
    title: '2026년 5월 포트폴리오 점검 리포트',
    background: '연준(Fed)의 매파적 금리 동결 이후 국내 증시가 단기 급등하면서 포트폴리오 내 국내 주식 비중이 목표를 크게 초과했습니다. 반면 해외 주식과 채권 비중은 목표에 미달하여 자산배분 왜곡도가 14%p 수준으로 확대되었습니다. 통상 왜곡도 10%p 초과 시 리밸런싱을 권고하며, 현재 시점이 적기입니다.',
    rationale: [
      { icon: '📈', text: '국내 주식: KOSPI가 3,200p 돌파하며 단기 과열 양상. 밸류에이션 부담 증가로 차익실현 적기' },
      { icon: '🌍', text: '해외 주식: S&P 500 PER 19배로 밸류에이션 정상화 구간. AI·기술주 중심 분할 매수 유효' },
      { icon: '💰', text: '국내 채권: 금리 인하 사이클 진입 시 듀레이션 효과 극대화. 국고채 3년·10년물 금리 매력적' },
      { icon: '🥇', text: '금/원자재: 달러 약세 전환 시 금 가격 추가 상승 기대. 포트폴리오 변동성 완충재 역할' },
    ],
  },
  current: [
    { asset: '국내 주식', weight: 52, target: 45, diff: '+7%', action: '축소', risk: '높음', detail: 'KOSPI 초과 수익으로 비중 급증. PER 14.2배 (5년 평균 11.5배)' },
    { asset: '해외 주식', weight: 18, target: 25, diff: '-7%', action: '확대', risk: '중간', detail: 'S&P 500, NASDAQ ETF 중심. 환노출 vs 환헤지 병행 전략 필요' },
    { asset: '국내 채권', weight: 12, target: 15, diff: '-3%', action: '확대', risk: '낮음', detail: '국고채 3년물 3.2%, 10년물 3.5%. 금리 인하 사이클 선제 대응' },
    { asset: '현금/예금', weight: 14, target: 10, diff: '+4%', action: '축소', risk: '낮음', detail: '과도한 현금 보유로 기회비용 발생. MMF→채권 ETF 전환 검토' },
    { asset: '금/원자재', weight: 4, target: 5, diff: '-1%', action: '확대', risk: '중간', detail: '금 $2,450/oz. 인플레 헤지 + 지정학적 리스크 대비 최적 자산' },
  ],
  suggestions: [
    {
      from: '국내 주식 (비중축소)',
      to: '해외 주식 (비중확대)',
      amount: '700만원',
      priority: 'HIGH',
      rationale: '국내 증시 초과 수익분을 해외로 분산하여 지역 리스크를 완화합니다. AI·반도체 섹터에 대한 노출을 유지하면서도 글로벌 분산 효과를 얻을 수 있습니다.',
      execution: [
        'TIGER 미국S&P500 ETF (환헤지형): 400만원 — 환율 리스크 최소화',
        'KODEX 미국나스닥100 ETF: 200만원 — AI·기술주 집중 투자',
        'TIGER 미국배당다우존스 ETF: 100만원 — 안정적 배당 수익 확보',
      ],
      timing: '2~3회 분할 매수 (주 1회, 3주간)',
      tax_tip: '국내 상장 해외 ETF는 매매차익 비과세 (단, 보유기간 과세는 양도세 15.4%)',
      risk_note: '환율 변동 위험. 원화 강세 시 수익률 희석 가능 → 환헤지형 비중 60% 이상 권장',
    },
    {
      from: '현금/예금',
      to: '국내 채권',
      amount: '400만원',
      priority: 'HIGH',
      rationale: '현재 MMF/예금 금리(2.5~3.0%)는 금리 인하 시 추가 하락이 예상됩니다. 채권 ETF로 이동 시 자본차익(듀레이션 효과) + 이자수익을 동시에 기대할 수 있습니다.',
      execution: [
        'KODEX 국고채3년 ETF: 200만원 — 금리 하락기 안정적 자본차익',
        'KODEX 국고채10년 ETF: 100만원 — 듀레이션 8년, 금리 1%p 하락 시 +8% 기대',
        'TIGER 종합채권(AAA) ETF: 100만원 — 우량 회사채 포함 분산 효과',
      ],
      timing: '즉시 전액 집행 가능 (시장가 매수)',
      tax_tip: '채권 ETF 매매차익 15.4% 과세. 단, 보유기간 1년 이상 시 장기보유특별공제 검토',
      risk_note: '금리 반등 시 채권 가격 하락. 평균 듀레이션 4~5년으로 중기적 관점 접근',
    },
    {
      from: '국내 주식 (비중축소)',
      to: '금/원자재',
      amount: '100만원',
      priority: 'MEDIUM',
      rationale: '포트폴리오 내 실물자산 비중이 목표 대비 1%p 부족합니다. 금은 달러 약세·지정학적 리스크·중앙은행 매수세 등 복합적 상승 요인을 보유하고 있어 최적의 포트폴리오 헤지 수단입니다.',
      execution: [
        'KODEX 골드선물(H) ETF: 100만원 — 금 현물 가격 추종. 환헤지 적용',
      ],
      timing: '분할 매수 불필요 (비중이 작아 일시 매수 권장)',
      tax_tip: '금 ETF 매매차익 15.4% 과세. 금 현물(골드바)은 부가세 10% 별도',
      risk_note: '금 가격 $2,500 이상에서는 단기 조정 가능성. 전체 포트폴리오의 5~7% 이내 유지',
    },
  ],
  alternative_scenarios: [
    {
      scenario: '금리 인상 재개 시',
      action: '채권 비중 축소, 현금 비중 확대. 변동금리채(FRN) ETF로 대체',
      trigger: '美 CPI 3.5%↑, 연준 점도표 금리 인상 시사',
    },
    {
      scenario: '원/달러 환율 1,350원 하회 시',
      action: '해외 주식 환헤지형 비중 축소, 환노출형 확대. 달러 약세 국면 수익 극대화',
      trigger: '원/달러 환율 1,330원 이하 안착',
    },
    {
      scenario: '국내 증시 급락 (-10%↑) 시',
      action: '국내 주식 비중 목표치까지 재확대. 가치주·배당주 중심 저점 매수',
      trigger: 'KOSPI 2,800p 이하 붕괴',
    },
  ],
};

const DEFAULT_ANALYSIS_CODES = ['005930', '000660', '035420'];

// ==================== TABS ====================

const TABS = [
  { id: 'macro', label: '매크로 분석', icon: '📊' },
  { id: 'theme', label: '테마별 추천주', icon: '🔥' },
  { id: 'value', label: '저평가주 발굴', icon: '💎' },
  { id: 'rebalance', label: '리밸런싱', icon: '⚖️' },
  { id: 'analysis', label: '종목 분석', icon: '🔍' },
  { id: 'board', label: '게시판', icon: '💬' },
];

// ==================== UTILITY ====================

function fmtWon(val) {
  if (val == null || isNaN(val)) return 'N/A';
  if (val >= 1000000) return (val / 10000).toFixed(0) + '만원';
  return val.toLocaleString() + '원';
}

function fmtNum(val) {
  if (val == null || isNaN(val)) return 'N/A';
  return val.toLocaleString();
}

function fmtPct(val) {
  if (val == null || isNaN(val)) return 'N/A';
  return (val >= 0 ? '+' : '') + val.toFixed(2) + '%';
}

function fmtChange(val) {
  if (val == null || isNaN(val)) return 'N/A';
  return (val >= 0 ? '+' : '') + val.toLocaleString();
}

// ==================== HOOK: useStockQuotes ====================

function useStockQuotes(codes) {
  const [quotes, setQuotes] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const codesKey = JSON.stringify(codes);

  useEffect(() => {
    let cancelled = false;
    if (!codes || codes.length === 0) return;

    setLoading(true);
    setError(null);
    getQuotes(codes)
      .then(data => {
        if (cancelled) return;
        const map = {};
        data.forEach(q => { map[q.code] = q; });
        setQuotes(map);
        setLastUpdated(new Date());
      })
      .catch(e => {
        if (cancelled) return;
        setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [codesKey]);

  return { quotes, loading, error, lastUpdated, refetch: null };
}

// ==================== COMPONENTS ====================

function LoadingSpinner() {
  return <div className="loading-spinner"><div className="spinner" /><span>실시간 데이터 로딩 중...</span></div>;
}

function ErrorBanner({ msg }) {
  return <div className="error-banner">⚠️ 데이터 로딩 실패: {msg}</div>;
}

function LastUpdated({ time }) {
  if (!time) return null;
  const t = time.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  return <div className="last-updated">🕐 마지막 업데이트: {t} (네이버 증권 · 실시간)</div>;
}

// ==================== MACRO VIEW ====================

function MacroView({ data, quotes, loading, error, onRefresh, lastUpdated }) {
  if (loading && !data?.beneficiary_stocks?.length) {
    return <LoadingSpinner />;
  }

  return (
    <>
      {/* Refresh + status bar */}
      <div className="macro-toolbar">
        <div className="macro-status">
          {error && <span className="macro-status-error">⚠️ {error}</span>}
          {data?.source && <span className="macro-status-source">📡 {data.source}</span>}
          {data?.session && <span className="macro-status-session">🕐 {data.session} 분석</span>}
          {lastUpdated && <span className="macro-status-updated">갱신: {lastUpdated.toLocaleTimeString('ko-KR', { hour:'2-digit', minute:'2-digit' })}</span>}
        </div>
        <button
          className="refetch-btn macro-refresh-btn"
          onClick={onRefresh}
          disabled={loading}
        >
          {loading ? '⏳ 분석 중...' : '🔄 매크로 분석 갱신'}
        </button>
      </div>

      {error && data?.summary && <ErrorBanner msg={'⚠️ 최신 데이터 로딩 실패. 캐시된 분석을 표시합니다: ' + error} />}

      <div className="event-summary-card">
        <div className="event-header">
          <div className="event-badge">
            <span className={`impact-badge ${(data.impact_rating || '').toLowerCase() === 'high' ? 'high' : 'medium'}`}>
              ⚠️ {data.impact_rating || 'MEDIUM'} IMPACT
            </span>
            <span className="event-type">{data.event_type === 'rate_decision' ? '🏦 금리 결정' : data.event_type}</span>
          </div>
          <h2 className="event-title">{data.macro_event}</h2>
          <span className="event-date">📅 {data.event_date}</span>
        </div>
        <p className="event-summary-text">{data.summary}</p>
        <div className="key-metrics">
          <div className="metrics-grid">
            {Object.entries(data.key_data).map(([key, val], i) => (
              <div key={i} className="metric-item">
                <span className="metric-label">{key.replace(/_/g, ' ')}</span>
                <span className="metric-value">{val}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="stocks-grid">
        <div className="stock-section beneficiary">
          <div className="section-title beneficiary-title">✅ 수혜 종목 ({data.beneficiary_stocks.length}개)</div>
          {data.beneficiary_stocks.map((st, i) => {
            const q = quotes[st.code];
            return (
              <div key={i} className="stock-card beneficiary-card">
                <div className="stock-card-header">
                  <div className="stock-info">
                    <span className="stock-name">{st.name}</span>
                    <span className="stock-code beneficiary-code">{st.code}</span>
                  </div>
                  <div className="stock-meta">
                    {q?.price ? <span className="stock-live-price">실시간 {fmtWon(q.price)}</span> : null}
                    <span className="stock-upside beneficiary-upside">{st.expected_upside}</span>
                    <span className="stock-action beneficiary-action">{st.action}</span>
                  </div>
                </div>
                {q?.price && <div className="stock-live-change">
                  <span className={q.changePercent >= 0 ? 'positive' : 'negative'}>{fmtChange(q.change)} ({fmtPct(q.changePercent)})</span>
                </div>}
                <div className="stock-reason">{st.benefit_reason}</div>
              </div>
            );
          })}
        </div>
        <div className="stock-section damaged">
          <div className="section-title damaged-title">⚠️ 피해 종목 ({data.damage_stocks.length}개)</div>
          {data.damage_stocks.map((st, i) => {
            const q = quotes[st.code];
            return (
              <div key={i} className="stock-card damaged-card">
                <div className="stock-card-header">
                  <div className="stock-info">
                    <span className="stock-name">{st.name}</span>
                    <span className="stock-code damaged-code">{st.code}</span>
                  </div>
                  <div className="stock-meta">
                    {q?.price ? <span className="stock-live-price">실시간 {fmtWon(q.price)}</span> : null}
                    <span className="stock-downside">{st.expected_downside}</span>
                    <span className="stock-action damaged-action">{st.action}</span>
                  </div>
                </div>
                {q?.price && <div className="stock-live-change">
                  <span className={q.changePercent >= 0 ? 'positive' : 'negative'}>{fmtChange(q.change)} ({fmtPct(q.changePercent)})</span>
                </div>}
                <div className="stock-reason damaged-reason">{st.damage_reason}</div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="sector-map-section">
        <div className="section-title">🗺️ 섹터별 영향</div>
        <div className="sector-grid">
          {data.sector_map.map((s, i) => {
            const impactClass = s.impact === '수혜' ? 'positive' : s.impact === '피해' ? 'negative' : 'neutral';
            const impactIcon = s.impact === '수혜' ? '✅' : s.impact === '피해' ? '❌' : '➡️';
            return (
              <div key={i} className={`sector-card ${impactClass}`}>
                <div className="sector-name">{impactIcon} {s.sector}</div>
                <div className="sector-reason">{s.reason}</div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="hedge-section">
        <div className="section-title">🛡️ 헤지 전략</div>
        <div className="hedge-content">{data.hedge_strategy}</div>
      </div>

      <div className="watch-section">
        <div className="section-title">👀 핵심 모니터링</div>
        <div className="watch-tags">
          {data.watch_points.map((w, i) => (
            <span key={i} className="watch-tag">{w}</span>
          ))}
        </div>
      </div>
    </>
  );
}

// ==================== THEME VIEW (API 기반 동적 테마) ====================
function ThemeView() {
  const [themes, setThemes] = useState([]);
  const [themesLoading, setThemesLoading] = useState(true);
  const [themesError, setThemesError] = useState(null);
  const [themesMeta, setThemesMeta] = useState(null);
  const [themesFetchId, setThemesFetchId] = useState(0);

  const [selectedIdx, setSelectedIdx] = useState(null);
  const [quotes, setQuotes] = useState({});
  const [quotesLoading, setQuotesLoading] = useState(false);
  const [quotesError, setQuotesError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  // ── 서버에서 동적 테마 불러오기 ──
  useEffect(() => {
    let cancelled = false;
    setThemesLoading(true);
    setThemesError(null);
    fetchThemes(themesFetchId > 0)
      .then(data => {
        if (cancelled) return;
        setThemes(data.themes || []);
        setThemesMeta({
          macro_event: data.macro_event,
          event_date: data.event_date,
          generated_at: data.generated_at,
          source: data.source,
          cached: data.cached,
        });
      })
      .catch(e => {
        if (cancelled) return;
        setThemesError(e.message);
        setThemes(THEME_FALLBACK);
      })
      .finally(() => {
        if (!cancelled) setThemesLoading(false);
      });
    return () => { cancelled = true; };
  }, [themesFetchId]);

  // ── 선택된 테마의 종목 시세 조회 ──
  const selected = selectedIdx !== null ? themes[selectedIdx] : null;
  const codes = selected ? selected.codes : [];

  useEffect(() => {
    let cancelled = false;
    if (codes.length === 0) return;
    setQuotesLoading(true);
    setQuotesError(null);
    getQuotes(codes)
      .then(data => {
        if (cancelled) return;
        const map = {};
        data.forEach(q => { map[q.code] = q; });
        setQuotes(map);
        setLastUpdated(new Date());
      })
      .catch(e => {
        if (cancelled) return;
        setQuotesError(e.message);
      })
      .finally(() => {
        if (!cancelled) setQuotesLoading(false);
      });
    return () => { cancelled = true; };
  }, [selectedIdx, themesFetchId]);

  if (themesLoading && themes.length === 0) {
    return <LoadingSpinner />;
  }

  return (
    <>
      {/* 테마 메타 정보 */}
      <div className="macro-toolbar">
        <div className="macro-status">
          {themesMeta?.macro_event && (
            <span className="macro-status-source">📡 {themesMeta.macro_event}</span>
          )}
          {themesMeta?.source && (
            <span className="macro-status-session">🕐 {themesMeta.cached ? '캐시' : '실시간 생성'} · {themesMeta.source}</span>
          )}
          {themesMeta?.generated_at && (
            <span className="macro-status-updated">
              갱신: {new Date(themesMeta.generated_at).toLocaleString('ko-KR', { hour:'2-digit', minute:'2-digit', day:'numeric', month:'short' })}
            </span>
          )}
        </div>
        <button
          className="refetch-btn macro-refresh-btn"
          onClick={() => setThemesFetchId(c => c + 1)}
          disabled={themesLoading}
        >
          {themesLoading ? '⏳ 생성 중...' : '🔄 테마 재생성'}
        </button>
      </div>

      {themesError && <ErrorBanner msg={'⚠️ 최신 테마 로딩 실패. 기본 테마를 표시합니다: ' + themesError} />}

      {/* 테마 선택 카드 그리드 */}
      <div className="selector-label-row">
        <span className="selector-label-icon">🎯</span>
        <span className="selector-label-text">매크로 분석 기반 동적 테마</span>
        <span className="selector-label-count">{themes.length}개 테마</span>
      </div>
      <div className="theme-card-grid">
        {themes.map((t, i) => {
          const strengthClass = t.strength === 'STRONG' ? 'strong' : 'medium';
          const isActive = selectedIdx === i;
          const sourceTag = t.source === 'core' ? '핵심' : t.source === 'macro' ? '매크로' : '';
          return (
            <button
              key={i}
              className={`theme-card ${isActive ? 'active' : ''}`}
              onClick={() => setSelectedIdx(isActive ? null : i)}
            >
              <div className="theme-card-icon">{t.icon}</div>
              <div className="theme-card-body">
                <div className="theme-card-header">
                  <span className="theme-card-name">{t.theme}</span>
                  <div className="theme-card-badges">
                    {sourceTag && <span className={`theme-source-badge ${t.source}`}>{sourceTag}</span>}
                    <span className={`theme-strength-badge ${strengthClass}`}>
                      {t.strength === 'STRONG' ? '강력 추천' : '관심'}
                    </span>
                  </div>
                </div>
                <p className="theme-card-desc">{t.description}</p>
                <div className="theme-card-meta">
                  <span className="theme-card-stock-count">
                    📌 {t.codes.length}종목 분석
                  </span>
                  {isActive && <span className="theme-card-check">✓ 선택됨</span>}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {selectedIdx === null && (
        <div className="theme-placeholder">
          <span className="placeholder-icon">👆</span>
          <p>위에서 분석하고 싶은 테마를 선택해주세요</p>
          <p className="placeholder-hint">매일 새로운 매크로 뉴스 분석으로 테마가 자동 생성됩니다</p>
        </div>
      )}

      {selectedIdx !== null && selected && (
        <>
          <LastUpdated time={lastUpdated} />
          {quotesLoading && <LoadingSpinner />}
          {quotesError && <ErrorBanner msg={quotesError} />}
          <div className="theme-section">
            <div className="theme-header">
              <div className="theme-title-row">
                <span className="theme-icon">{selected.icon}</span>
                <div>
                  <h2 className="theme-name">{selected.theme}</h2>
                  <span className={`theme-strength ${selected.strength.toLowerCase()}`}>{selected.strength}</span>
                  {selected.source && (
                    <span className={`theme-source-tag ${selected.source}`} style={{marginLeft: 8}}>
                      {selected.source === 'core' ? '🔒 핵심 테마' : selected.source === 'macro' ? '📡 매크로 분석' : ''}
                    </span>
                  )}
                </div>
              </div>
              <p className="theme-desc">{selected.description}</p>
              {selected.event_date && (
                <p className="theme-event-date">📅 기준일: {selected.event_date}</p>
              )}
              <button
                className="refetch-btn"
                onClick={() => setThemesFetchId(c => c + 1)}
                disabled={themesLoading}
              >
                {themesLoading ? '⏳ 재생성 중...' : '🔄 실시간 재검색'}
              </button>
            </div>
            <div className="theme-stocks-grid">
              {selected.codes.map((code, i) => {
                const q = quotes[code];
                const info = getStockInfo(code);
                const reason = selected.reasons?.[code] || '—';
                return (
                  <div key={i} className="theme-stock-card">
                    <div className="theme-stock-top">
                      <div className="theme-stock-info">
                        <span className="theme-stock-name">{info.name}</span>
                        <span className="theme-stock-code">{code}</span>
                      </div>
                      <div className="theme-stock-price-area">
                        <span className="theme-stock-price">{q ? fmtWon(q.price) : '로딩 중...'}</span>
                        {q && (
                          <span className={`theme-stock-change ${q.changePercent >= 0 ? 'positive' : 'negative'}`}>
                            {fmtPct(q.changePercent)}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="theme-stock-reason">{reason}</div>
                    {q && (
                      <div className="theme-stock-extra">
                        {q.per && <span className="extra-tag">PER {q.per.toFixed(1)}</span>}
                        {q.pbr && <span className="extra-tag">PBR {q.pbr.toFixed(2)}</span>}
                        {q.divYield && <span className="extra-tag">배당 {q.divYield.toFixed(1)}%</span>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </>
  );
}

// ==================== VALUE VIEW ====================
// ==================== VALUE VIEW (grouped, selectable) ====================
function ValueView() {
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [quotes, setQuotes] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [refetchCounter, setRefetchCounter] = useState(0);

  const group = selectedGroup !== null ? VALUE_GROUPS[selectedGroup] : null;
  const codes = group ? group.stocks.map((s) => s.code) : [];

  useEffect(() => {
    let cancelled = false;
    if (codes.length === 0) return;
    setLoading(true);
    setError(null);
    getQuotes(codes)
      .then((data) => {
        if (cancelled) return;
        const map = {};
        data.forEach((q) => { map[q.code] = q; });
        setQuotes(map);
        setLastUpdated(new Date());
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [selectedGroup, refetchCounter]);

  return (
    <>
      <div className="selector-label-row">
        <span className="selector-label-icon">💎</span>
        <span className="selector-label-text">저평가 그룹을 선택하세요</span>
        <span className="selector-label-count">{VALUE_GROUPS.length}개 그룹</span>
      </div>
      <div className="value-card-grid">
        {VALUE_GROUPS.map((g, i) => {
          const isActive = selectedGroup === i;
          return (
            <button
              key={i}
              className={`value-card ${isActive ? 'active' : ''}`}
              onClick={() => setSelectedGroup(isActive ? null : i)}
            >
              <div className="value-card-icon">{g.icon}</div>
              <div className="value-card-body">
                <span className="value-card-name">{g.group}</span>
                <p className="value-card-desc">{g.description}</p>
                <div className="value-card-meta">
                  <span className="value-card-stock-count">
                    📌 {g.stocks.length}종목
                  </span>
                  {isActive && <span className="value-card-check">✓ 선택됨</span>}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {selectedGroup === null && (
        <div className="theme-placeholder">
          <span className="placeholder-icon">👆</span>
          <p>위에서 분석하고 싶은 저평가 그룹을 선택해주세요</p>
          <p className="placeholder-hint">선택한 그룹의 실시간 시세와 투자 포인트가 표시됩니다</p>
        </div>
      )}

      {selectedGroup !== null && (
        <div className="value-table-wrap">
          <div className="value-group-title">
            <span>{group.icon}</span>
            <span>{group.group}</span>
          </div>
          <p className="theme-desc" style={{ marginBottom: 14 }}>{group.description}</p>
          <div className="value-refetch-row">
            <button
              className="refetch-btn"
              onClick={() => setRefetchCounter(c => c + 1)}
              disabled={loading}
            >
              {loading ? '⏳ 재발굴 중...' : '🔄 실시간 재발굴'}
            </button>
            <LastUpdated time={lastUpdated} />
          </div>
          {loading && <LoadingSpinner />}
          {error && <ErrorBanner msg={error} />}
          <table className="value-table">
            <thead>
              <tr>
                <th>종목</th>
                <th>현재가</th>
                <th>PER</th>
                <th>PBR</th>
                <th>배당</th>
                <th>52주 최고</th>
                <th>52주 최저</th>
                <th>등급</th>
              </tr>
            </thead>
            <tbody>
              {group.stocks.map((st, i) => {
                const q = quotes[st.code];
                const info = getStockInfo(st.code);
                return (
                  <tr key={i} className="value-row">
                    <td>
                      <div className="value-stock-cell">
                        <span className="value-stock-name">{info.name}</span>
                        <span className="value-stock-code">{st.code}</span>
                      </div>
                    </td>
                    <td className="value-price">{q ? fmtWon(q.price) : '...'}</td>
                    <td className="value-num">{q?.per ? q.per.toFixed(1) : 'N/A'}</td>
                    <td className="value-num highlight">{q?.pbr ? q.pbr.toFixed(2) : 'N/A'}</td>
                    <td className="value-num">{q?.divYield ? q.divYield.toFixed(1) + '%' : 'N/A'}</td>
                    <td className="value-num">{q?.high52 ? fmtWon(q.high52) : 'N/A'}</td>
                    <td className="value-num">{q?.low52 ? fmtWon(q.low52) : 'N/A'}</td>
                    <td><span className={`value-grade grade-${st.grade.replace('+','').toLowerCase()}`}>{st.grade}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {group.stocks.map((st, i) => (
            <div key={i} className="value-detail-card">
              <div className="value-detail-header">
                <span className="value-detail-name">{getStockInfo(st.code).name}</span>
                <span className={`value-grade grade-${st.grade.replace('+','').toLowerCase()}`}>{st.grade}</span>
              </div>
              <div className="value-strengths">
                {st.strengths.map((s, j) => (
                  <span key={j} className="value-strength-tag">{s}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

// ==================== REBALANCE VIEW ====================
function RebalanceView({ data }) {
  return (
    <>
      {/* 컨텍스트: 점검 배경 & 근거 */}
      <div className="rebalance-context-card">
        <div className="rebalance-context-header">
          <span className="rebalance-report-icon">📋</span>
          <div>
            <h2 className="rebalance-report-title">{data.context.title}</h2>
            <p className="rebalance-context-text">{data.context.background}</p>
          </div>
        </div>
        <div className="rebalance-rationale-grid">
          {data.context.rationale.map((r, i) => (
            <div key={i} className="rationale-item">
              <span className="rationale-icon">{r.icon}</span>
              <span className="rationale-text">{r.text}</span>
            </div>
          ))}
        </div>
        <div className="rebalance-trigger-badge">
          ⚠️ 자산배분 왜곡도 14%p → 리밸런싱 트리거 발동 (기준: 10%p)
        </div>
      </div>

      {/* 비중 바 차트 */}
      <div className="rebalance-grid">
        <div className="rebalance-chart-section">
          <div className="section-title">📊 현재 vs 목표 비중</div>
          <div className="rebalance-bars">
            {data.current.map((item, i) => {
              const barColor = item.action === '확대' ? '#22763a' : item.action === '축소' ? '#c0392b' : '#888';
              return (
                <div key={i} className="rebalance-bar-row">
                  <div className="rebalance-label-group">
                    <span className="rebalance-label">{item.asset}</span>
                    <span className={`rebalance-risk risk-${item.risk}`}>{item.risk} 리스크</span>
                  </div>
                  <div className="rebalance-bar-track">
                    <div className="rebalance-bar current-bar" style={{ width: `${item.weight}%` }}>
                      <span>{item.weight}%</span>
                    </div>
                    <div className="rebalance-target-marker" style={{ left: `${item.target}%` }}>
                      <span className="target-dot" style={{ background: barColor }} />
                    </div>
                  </div>
                  <span className={`rebalance-diff ${item.action === '확대' ? 'positive' : 'negative'}`}>{item.diff}</span>
                </div>
              );
            })}
          </div>
          <div className="rebalance-detail-list">
            {data.current.map((item, i) => (
              <div key={i} className={`rebalance-detail-row ${item.action === '확대' ? 'expand' : 'reduce'}`}>
                <span className="detail-asset">{item.asset}</span>
                <span className="detail-desc">{item.detail}</span>
                <span className={`detail-action ${item.action === '확대' ? 'positive' : 'negative'}`}>{item.action}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 실행 제안 */}
      <div className="rebalance-suggestions">
        <div className="section-title">💡 리밸런싱 실행 제안</div>
        {data.suggestions.map((s, i) => (
          <div key={i} className={`rebalance-suggestion-card priority-${s.priority.toLowerCase()}`}>
            <div className="rebalance-suggestion-header">
              <div className="rebalance-arrow">
                <span className="from-asset">{s.from}</span>
                <span className="arrow-icon">→</span>
                <span className="to-asset">{s.to}</span>
              </div>
              <div className="rebalance-meta">
                <span className={`priority-badge ${s.priority.toLowerCase()}`}>{s.priority} 우선순위</span>
                <span className="rebalance-amount">{s.amount}</span>
              </div>
            </div>
            <div className="rebalance-rationale-box">
              <span className="rationale-label">📌 실행 배경</span>
              <p>{s.rationale}</p>
            </div>
            <div className="rebalance-execution-box">
              <span className="execution-label">🎯 세부 실행 방안</span>
              <ul className="execution-list">
                {s.execution.map((e, j) => (
                  <li key={j} className="execution-item">{e}</li>
                ))}
              </ul>
            </div>
            <div className="rebalance-meta-row">
              <div className="meta-chip timing">
                <span className="chip-icon">⏱️</span>
                <span className="chip-label">실행 타이밍</span>
                <span className="chip-value">{s.timing}</span>
              </div>
              <div className="meta-chip tax">
                <span className="chip-icon">🧾</span>
                <span className="chip-label">세금</span>
                <span className="chip-value">{s.tax_tip}</span>
              </div>
            </div>
            <div className="rebalance-risk-box">
              <span className="risk-label">⚠️ 리스크 요인</span>
              <p>{s.risk_note}</p>
            </div>
          </div>
        ))}
      </div>

      {/* 대안 시나리오 */}
      <div className="rebalance-scenarios">
        <div className="section-title">🔄 대안 시나리오</div>
        <div className="scenarios-grid">
          {data.alternative_scenarios.map((sc, i) => (
            <div key={i} className="scenario-card">
              <div className="scenario-header">
                <span className="scenario-icon">{i === 0 ? '📉' : i === 1 ? '💱' : '📊'}</span>
                <span className="scenario-title">{sc.scenario}</span>
              </div>
              <div className="scenario-action">
                <span className="scenario-action-label">🛡️ 대응:</span> {sc.action}
              </div>
              <div className="scenario-trigger">
                <span className="trigger-label">🔔 트리거:</span> {sc.trigger}
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

// ==================== ANALYSIS VIEW ====================
function AnalysisView({ quotes, loading, error, lastUpdated, searchCode, setSearchCode, searchInput, setSearchInput }) {
  const info = getStockInfo(searchCode);
  const q = quotes[searchCode];

  const handleSearch = (input) => {
    const result = lookupCode(input);
    if (result) {
      setSearchCode(result.code);
      setSearchInput(result.code);
    }
  };

  return (
    <>
      <div className="analysis-search-bar">
        <input
          type="text"
          placeholder="종목코드 또는 종목명 입력 (예: 삼성전자, 005930)"
          value={searchInput}
          onChange={e => setSearchInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleSearch(searchInput); }}
          className="analysis-search-input"
        />
        <button className="analysis-search-btn" onClick={() => handleSearch(searchInput)} disabled={loading}>
          {loading ? '검색 중...' : '🔍 조회'}
        </button>
        <div className="analysis-quick-btns">
          {DEFAULT_ANALYSIS_CODES.map(c => (
            <button key={c} className={`quick-btn ${searchCode === c ? 'active' : ''}`}
              onClick={() => { setSearchCode(c); setSearchInput(c); }}>
              {getStockInfo(c).name}
            </button>
          ))}
        </div>
      </div>

      <LastUpdated time={lastUpdated} />
      {loading && <LoadingSpinner />}
      {error && <ErrorBanner msg={error} />}

      <div className="analysis-header-card">
        <div className="analysis-top">
          <div className="analysis-title-row">
            <h2 className="analysis-stock-name">{info.name}</h2>
            <span className="analysis-stock-code">{searchCode}</span>
          </div>
          {q && (
            <div className="analysis-price-row">
              <span className="analysis-price">{fmtWon(q.price)}</span>
              <span className={`analysis-change ${q.changePercent >= 0 ? 'positive' : 'negative'}`}>
                {fmtChange(q.change)} ({fmtPct(q.changePercent)})
              </span>
            </div>
          )}
        </div>
      </div>

      {q && (
        <>
          <div className="analysis-fundamentals">
            <div className="section-title">📈 주요 지표 (실시간)</div>
            <div className="fundamentals-grid">
              <div className="fundamental-item">
                <span className="fundamental-label">시가총액</span>
                <span className="fundamental-value">{q.marketCap ? (q.marketCap / 1e12).toFixed(1) + '조원' : 'N/A'}</span>
              </div>
              <div className="fundamental-item">
                <span className="fundamental-label">PER</span>
                <span className="fundamental-value">{q.per ? q.per.toFixed(1) + '배' : 'N/A'}</span>
              </div>
              <div className="fundamental-item">
                <span className="fundamental-label">PBR</span>
                <span className="fundamental-value">{q.pbr ? q.pbr.toFixed(2) + '배' : 'N/A'}</span>
              </div>
              <div className="fundamental-item">
                <span className="fundamental-label">배당수익률</span>
                <span className="fundamental-value">{q.divYield ? q.divYield.toFixed(2) + '%' : 'N/A'}</span>
              </div>
              <div className="fundamental-item">
                <span className="fundamental-label">52주 최고</span>
                <span className="fundamental-value">{q.high52 ? fmtWon(q.high52) : 'N/A'}</span>
              </div>
              <div className="fundamental-item">
                <span className="fundamental-label">52주 최저</span>
                <span className="fundamental-value">{q.low52 ? fmtWon(q.low52) : 'N/A'}</span>
              </div>
              <div className="fundamental-item">
                <span className="fundamental-label">거래량</span>
                <span className="fundamental-value">{q.volume ? fmtNum(q.volume) : 'N/A'}</span>
              </div>
              <div className="fundamental-item">
                <span className="fundamental-label">추정PER</span>
                <span className="fundamental-value highlight">{q.cnsPer ? q.cnsPer.toFixed(2) + '배' : 'N/A'}</span>
              </div>
              <div className="fundamental-item">
                <span className="fundamental-label">추정EPS</span>
                <span className="fundamental-value">{q.cnsEps ? fmtWon(q.cnsEps) : 'N/A'}</span>
              </div>
              <div className="fundamental-item">
                <span className="fundamental-label">BPS</span>
                <span className="fundamental-value">{q.bps ? fmtWon(q.bps) : 'N/A'}</span>
              </div>
              <div className="fundamental-item">
                <span className="fundamental-label">외인소진율</span>
                <span className="fundamental-value">{q.foreignRate ? q.foreignRate.toFixed(2) + '%' : 'N/A'}</span>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}

// ==================== LOGIN MODAL ====================

function LoginModal({ onClose, onAuthSuccess }) {
  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (mode === 'register') {
        await register(username, password, nickname || undefined);
        // auto-login after register
        const data = await login(username, password);
        onAuthSuccess(data.user, data.token);
      } else {
        const data = await login(username, password);
        onAuthSuccess(data.user, data.token);
      }
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{mode === 'login' ? '🔑 로그인' : '📝 회원가입'}</h2>
          <button className="modal-close-btn" onClick={onClose}>✕</button>
        </div>
        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="auth-form-group">
            <label>아이디</label>
            <input type="text" value={username} onChange={e => setUsername(e.target.value)}
              placeholder="아이디를 입력하세요" required autoFocus />
          </div>
          <div className="auth-form-group">
            <label>비밀번호</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
              placeholder="비밀번호를 입력하세요" required />
          </div>
          {mode === 'register' && (
            <div className="auth-form-group">
              <label>닉네임 <span className="optional">(선택)</span></label>
              <input type="text" value={nickname} onChange={e => setNickname(e.target.value)}
                placeholder="표시할 닉네임" />
            </div>
          )}
          {error && <div className="auth-error">{error}</div>}
          <button type="submit" className="auth-submit-btn" disabled={loading}>
            {loading ? '처리 중...' : mode === 'login' ? '로그인' : '회원가입'}
          </button>
        </form>
        <div className="auth-mode-switch">
          {mode === 'login' ? (
            <>계정이 없으신가요? <button onClick={() => { setMode('register'); setError(''); }}>회원가입</button></>
          ) : (
            <>이미 계정이 있으신가요? <button onClick={() => { setMode('login'); setError(''); }}>로그인</button></>
          )}
        </div>
      </div>
    </div>
  );
}

// ==================== BOARD LIST VIEW ====================

function BoardListView({ posts, loading, error, onPostClick, onNewPost, currentPage, totalPages, onPageChange }) {
  if (loading) return <LoadingSpinner />;

  return (
    <>
      {error && <ErrorBanner msg={error} />}
      <div className="board-toolbar">
        <h3 className="board-toolbar-title">📋 게시글 목록</h3>
        <button className="board-new-btn" onClick={onNewPost}>✏️ 글쓰기</button>
      </div>
      {posts.length === 0 ? (
        <div className="board-empty">아직 게시글이 없습니다. 첫 게시글을 작성해보세요!</div>
      ) : (
        <>
          <div className="board-table-wrap">
            <table className="board-table">
              <thead>
                <tr>
                  <th className="col-no">번호</th>
                  <th className="col-title">제목</th>
                  <th className="col-author">작성자</th>
                  <th className="col-date">작성일</th>
                  <th className="col-views">조회</th>
                </tr>
              </thead>
              <tbody>
                {posts.map((p, i) => (
                  <tr key={p.id} className="board-row" onClick={() => onPostClick(p.id)}>
                    <td className="col-no">{posts.length - i}</td>
                    <td className="col-title">
                      <span className="board-post-title">{p.title}</span>
                      {p.commentCount > 0 && (
                        <span className="board-comment-count">[{p.commentCount}]</span>
                      )}
                    </td>
                    <td className="col-author">{typeof p.author === 'string' ? p.author : (p.author?.nickname || p.author?.username || '익명')}</td>
                    <td className="col-date">{new Date(p.createdAt).toLocaleDateString('ko-KR')}</td>
                    <td className="col-views">{p.viewCount || 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div className="board-pagination">
              <button disabled={currentPage <= 1} onClick={() => onPageChange(currentPage - 1)}>◀ 이전</button>
              <span className="board-page-info">{currentPage} / {totalPages}</span>
              <button disabled={currentPage >= totalPages} onClick={() => onPageChange(currentPage + 1)}>다음 ▶</button>
            </div>
          )}
        </>
      )}
    </>
  );
}

// ==================== POST DETAIL VIEW ====================

function PostDetailView({ post, loading, error, currentUser, onBack, onEdit, onDelete, onCommentSubmit }) {
  const [commentText, setCommentText] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);
  const [commentError, setCommentError] = useState('');

  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorBanner msg={error} />;
  if (!post) return null;

  const isAuthor = currentUser && post.userId === currentUser.id;

  const handleCommentSubmit = async (e) => {
    e.preventDefault();
    if (!commentText.trim()) return;
    setSubmittingComment(true);
    setCommentError('');
    try {
      await onCommentSubmit(post.id, commentText.trim());
      setCommentText('');
    } catch (err) {
      setCommentError(err.message);
    } finally {
      setSubmittingComment(false);
    }
  };

  return (
    <div className="post-view-container">
      <button className="post-back-btn" onClick={onBack}>◀ 목록으로</button>
      <div className="post-view-card">
        <div className="post-view-header">
          <h2 className="post-view-title">{post.title}</h2>
          <div className="post-view-meta">
            <span className="post-view-author">👤 {typeof post.author === 'string' ? post.author : (post.author?.nickname || post.author?.username || '익명')}</span>
            <span className="post-view-date">📅 {new Date(post.createdAt).toLocaleString('ko-KR')}</span>
            <span className="post-view-views">👁️ {post.viewCount || 0}</span>
          </div>
          {post.updatedAt !== post.createdAt && (
            <div className="post-view-edited">(수정됨: {new Date(post.updatedAt).toLocaleString('ko-KR')})</div>
          )}
        </div>
        <div className="post-view-content">{post.content}</div>
        {isAuthor && (
          <div className="post-view-actions">
            <button className="post-edit-btn" onClick={() => onEdit(post)}>✏️ 수정</button>
            <button className="post-delete-btn" onClick={() => { if (confirm('정말 삭제하시겠습니까?')) onDelete(post.id); }}>🗑️ 삭제</button>
          </div>
        )}
      </div>

      {/* 댓글 영역 */}
      <div className="comments-section">
        <h3 className="comments-title">💬 댓글 {post.comments?.length || 0}개</h3>
        {currentUser ? (
          <form className="comment-form" onSubmit={handleCommentSubmit}>
            <textarea value={commentText} onChange={e => setCommentText(e.target.value)}
              placeholder="댓글을 입력하세요..." rows={3} required />
            {commentError && <div className="auth-error" style={{marginTop:6}}>{commentError}</div>}
            <button type="submit" className="comment-submit-btn" disabled={submittingComment}>
              {submittingComment ? '등록 중...' : '댓글 등록'}
            </button>
          </form>
        ) : (
          <div className="comment-login-hint">댓글을 작성하려면 로그인이 필요합니다.</div>
        )}
        <div className="comments-list">
          {post.comments?.map((c, i) => (
            <div key={i} className="comment-item">
              <div className="comment-header">
                <span className="comment-author">👤 {typeof c.author === 'string' ? c.author : (c.author?.nickname || c.author?.username || '익명')}</span>
                <span className="comment-date">{new Date(c.createdAt).toLocaleString('ko-KR')}</span>
              </div>
              <div className="comment-content">{c.content}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ==================== POST EDIT FORM ====================

function PostEditForm({ initial, onSubmit, onCancel, loading }) {
  const [title, setTitle] = useState(initial?.title || '');
  const [content, setContent] = useState(initial?.content || '');
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) {
      setError('제목과 내용을 모두 입력해주세요.');
      return;
    }
    setError('');
    try {
      await onSubmit(title.trim(), content.trim());
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="post-edit-container">
      <button className="post-back-btn" onClick={onCancel}>◀ 취소</button>
      <div className="post-edit-card">
        <h3>{initial ? '게시글 수정' : '새 게시글 작성'}</h3>
        <form className="post-edit-form" onSubmit={handleSubmit}>
          <div className="auth-form-group">
            <label>제목</label>
            <input type="text" value={title} onChange={e => setTitle(e.target.value)}
              placeholder="제목을 입력하세요" required autoFocus />
          </div>
          <div className="auth-form-group">
            <label>내용</label>
            <textarea value={content} onChange={e => setContent(e.target.value)}
              placeholder="내용을 입력하세요..." rows={10} required />
          </div>
          {error && <div className="auth-error">{error}</div>}
          <button type="submit" className="auth-submit-btn" disabled={loading}>
            {loading ? '저장 중...' : initial ? '수정 완료' : '작성 완료'}
          </button>
        </form>
      </div>
    </div>
  );
}

// ==================== BOARD MAIN VIEW ====================

function BoardView({ currentUser }) {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // 상세 보기
  const [selectedPostId, setSelectedPostId] = useState(null);
  const [postDetail, setPostDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');

  // 글쓰기/수정
  const [editMode, setEditMode] = useState(false);
  const [editTarget, setEditTarget] = useState(null); // null = new post
  const [editLoading, setEditLoading] = useState(false);

  const loadPosts = useCallback(async (pg) => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchPosts(pg, 20);
      setPosts(data.posts || []);
      setTotalPages(data.totalPages || 1);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!selectedPostId && !editMode) loadPosts(page);
  }, [page, selectedPostId, editMode, loadPosts]);

  const loadPostDetail = useCallback(async (id) => {
    setDetailLoading(true);
    setDetailError('');
    try {
      const data = await fetchPost(id);
      setPostDetail(data);
    } catch (err) {
      setDetailError(err.message);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const handlePostClick = (id) => {
    setSelectedPostId(id);
    loadPostDetail(id);
  };

  const handleBackToList = () => {
    setSelectedPostId(null);
    setPostDetail(null);
    setEditMode(false);
    setEditTarget(null);
  };

  const handleNewPost = () => {
    if (!currentUser) {
      alert('게시글 작성을 위해 로그인이 필요합니다.');
      return;
    }
    setEditMode(true);
    setEditTarget(null);
  };

  const handleEditPost = (post) => {
    setEditMode(true);
    setEditTarget(post);
  };

  const handlePostSubmit = async (title, content) => {
    setEditLoading(true);
    try {
      if (editTarget) {
        await updatePost(editTarget.id, title, content);
        // 수정 후: edit 모드 종료하고 상세 보기로
        setEditMode(false);
        setEditTarget(null);
        await loadPostDetail(editTarget.id);
      } else {
        await createPost(title, content);
        // 신규 작성 후: 목록으로
        handleBackToList();
      }
    } finally {
      setEditLoading(false);
    }
  };

  const handleDeletePost = async (id) => {
    try {
      await deletePost(id);
      handleBackToList();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleCommentSubmit = async (postId, content) => {
    await addComment(postId, content);
    // reload detail
    await loadPostDetail(postId);
  };

  // Edit mode
  if (editMode) {
    return (
      <PostEditForm
        initial={editTarget}
        onSubmit={handlePostSubmit}
        onCancel={handleBackToList}
        loading={editLoading}
      />
    );
  }

  // Detail view
  if (selectedPostId) {
    return (
      <PostDetailView
        post={postDetail}
        loading={detailLoading}
        error={detailError}
        currentUser={currentUser}
        onBack={handleBackToList}
        onEdit={handleEditPost}
        onDelete={handleDeletePost}
        onCommentSubmit={handleCommentSubmit}
      />
    );
  }

  // List view
  return (
    <BoardListView
      posts={posts}
      loading={loading}
      error={error}
      onPostClick={handlePostClick}
      onNewPost={handleNewPost}
      currentPage={page}
      totalPages={totalPages}
      onPageChange={setPage}
    />
  );
}

// ==================== MAIN APP ====================

function App() {
  const [activeTab, setActiveTab] = useState('macro');
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Analysis tab search
  const [searchCode, setSearchCode] = useState('005930');
  const [searchInput, setSearchInput] = useState('005930');

  // Auth state
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);

  // Macro analysis state (fetched from server)
  const [macroData, setMacroData] = useState(MACRO_FALLBACK);
  const [macroLoading, setMacroLoading] = useState(false);
  const [macroError, setMacroError] = useState(null);
  const [macroRefetchCounter, setMacroRefetchCounter] = useState(0);

  // Restore auth on mount
  useEffect(() => {
    const stored = getStoredAuth();
    if (stored) {
      setUser(stored.user);
      setToken(stored.token);
    }
    setAuthChecked(true);
  }, []);

  // Fetch macro analysis on mount and on refetch
  useEffect(() => {
    let cancelled = false;
    setMacroLoading(true);
    setMacroError(null);
    fetchMacroAnalysis(macroRefetchCounter > 0)
      .then(data => {
        if (cancelled) return;
        setMacroData(data);
      })
      .catch(e => {
        if (cancelled) return;
        setMacroError(e.message);
      })
      .finally(() => {
        if (!cancelled) setMacroLoading(false);
      });
    return () => { cancelled = true; };
  }, [macroRefetchCounter]);

  const handleAuthSuccess = (userData, tokenData) => {
    setUser(userData);
    setToken(tokenData);
  };

  const handleLogout = async () => {
    try {
      await logout();
    } finally {
      setUser(null);
      setToken(null);
    }
  };

  // Collect all codes needed across tabs
  const macroCodes = [
    ...(macroData?.beneficiary_stocks || []).map(s => s.code),
    ...(macroData?.damage_stocks || []).map(s => s.code),
  ];
  // Fetch quotes for current tab
  const macroQuotes = useStockQuotes(macroCodes);
  const analysisQuotes = useStockQuotes([searchCode]);

  const renderContent = () => {
    switch (activeTab) {
      case 'macro':
        return <MacroView
          data={macroData}
          quotes={macroQuotes.quotes}
          loading={macroLoading}
          error={macroError}
          onRefresh={() => setMacroRefetchCounter(c => c + 1)}
          lastUpdated={macroData?.generated_at ? new Date(macroData.generated_at) : null}
        />;
      case 'theme':
        return <ThemeView />;
      case 'value':
        return <ValueView />;
      case 'rebalance':
        return <RebalanceView data={REBALANCE_DATA} />;
      case 'analysis':
        return <AnalysisView
          quotes={analysisQuotes.quotes} loading={analysisQuotes.loading}
          error={analysisQuotes.error} lastUpdated={analysisQuotes.lastUpdated}
          searchCode={searchCode} setSearchCode={setSearchCode}
          searchInput={searchInput} setSearchInput={setSearchInput}
        />;
      case 'board':
        return <BoardView currentUser={user} />;
      default:
        return null;
    }
  };

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="header-content">
          <div className="logo-area">
            <button className="hamburger-btn" onClick={() => setSidebarOpen(!sidebarOpen)}>☰</button>
            <span className="logo-icon">📊</span>
            <div>
              <h1 className="app-title">Macro Stock Analyzer</h1>
              <p className="app-subtitle">실시간 시세 기반 · 매크로 이벤트 종목 분석</p>
            </div>
          </div>
          <div className="auth-area">
            {!authChecked ? null : user ? (
              <>
                <span className="auth-username">👤 {user.nickname || user.username}</span>
                <button className="auth-btn logout-btn" onClick={handleLogout}>로그아웃</button>
              </>
            ) : (
              <button className="auth-btn login-btn" onClick={() => setShowLoginModal(true)}>🔑 로그인</button>
            )}
          </div>
        </div>
      </header>

      {showLoginModal && (
        <LoginModal onClose={() => setShowLoginModal(false)} onAuthSuccess={handleAuthSuccess} />
      )}

      <div className="app-body">
        <nav className={`sidebar ${sidebarOpen ? 'open' : 'closed'}`}>
          {TABS.map((tab) => (
            <button
              key={tab.id}
              className={`sidebar-item ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <span className="sidebar-icon">{tab.icon}</span>
              <span className="sidebar-label">{tab.label}</span>
            </button>
          ))}
        </nav>

        <main className="main-content">
          {renderContent()}
          <div className="disclaimer">
            ※ 데이터는 네이버 증권에서 제공됩니다. 투자 판단은 본인의 책임입니다.
          </div>
        </main>
      </div>

      <footer className="app-footer">
        <p>Macro Stock Analyzer © 2026 | 네이버 증권 실시간 데이터 기반</p>
      </footer>
    </div>
  );
}

export default App;
