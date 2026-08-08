import { useEffect, useMemo, useState } from 'react';
import { AD_GROUP_ID } from './ads/config';
import { bumpInterstitial } from './ads/interstitial';
import { BannerAd } from './ads/BannerAd';
import { BoltIcon, CheckIcon, CompareIcon, CopyIcon, InfoIcon, PlugIcon, SnowIcon } from './components/icons';
import { STORAGE_PREFIX } from './config';
import {
  airconMonthlyKwh,
  calcBill,
  nextTierInfo,
  TIER_BOUNDS_NORMAL,
  TIER_BOUNDS_SUMMER,
  TARIFF_DATE,
  SUPER_RATE,
  FUND_RATE,
  type Contract,
} from './core/bill';

// 보너스(요금 역산)는 순수 추가분이라 기존 import 줄을 건드리지 않고 따로 가져온다.
import { canShowRewarded, showRewarded } from './ads/rewarded';
import { maxKwhForBudget } from './core/bill';

const KWH_MAX = 2000;

/** 보너스에서 되짚어 볼 목표 청구액(원) */
const BUDGETS = [30000, 50000, 70000, 100000, 150000] as const;

const K_KWH = STORAGE_PREFIX + 'kwh';
const K_CONTRACT = STORAGE_PREFIX + 'contract';
const K_PREV = STORAGE_PREFIX + 'prevKwh';

function loadNum(key: string, fallback: number, min: number, max: number): number {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    const n = Number(JSON.parse(raw));
    if (!Number.isFinite(n)) return fallback;
    return Math.min(Math.max(n, min), max);
  } catch {
    return fallback;
  }
}

function loadContract(): Contract {
  try {
    return localStorage.getItem(K_CONTRACT) === 'high' ? 'high' : 'low';
  } catch {
    return 'low';
  }
}

function loadPrev(): number | null {
  try {
    const raw = localStorage.getItem(K_PREV);
    if (raw === null) return null;
    const n = Number(JSON.parse(raw));
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
  } catch {
    return null;
  }
}

const won = (n: number) => n.toLocaleString('ko-KR') + '원';

/** WebView에서 navigator.clipboard가 없는 경우가 잦아 execCommand로 폴백한다. */
function copyText(text: string): void {
  try {
    if (navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(text).catch(() => legacyCopy(text));
      return;
    }
  } catch {
    /* fallthrough */
  }
  legacyCopy(text);
}

function legacyCopy(text: string): void {
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  } catch {
    /* 복사 실패는 조용히 무시 */
  }
}

export function App() {
  const month = new Date().getMonth() + 1;
  const [kwh, setKwh] = useState(() => loadNum(K_KWH, 300, 0, KWH_MAX));
  const [contract, setContract] = useState<Contract>(loadContract);
  const [summer, setSummer] = useState(month === 7 || month === 8);
  const [prevKwh, setPrevKwh] = useState<number | null>(loadPrev);
  const [savedFlash, setSavedFlash] = useState(false);
  const [copied, setCopied] = useState(false);
  const [acKw, setAcKw] = useState('1.8');
  const [acHours, setAcHours] = useState(4);
  // 보너스: 목표 금액별 사용 한도. 광고를 본 뒤 열린다(기존 화면은 그대로 무료).
  const [bonus, setBonus] = useState(false);
  const [bonusLoading, setBonusLoading] = useState(false);
  const unlockBonus = () => {
    if (bonus || bonusLoading) return;
    setBonusLoading(true);
    showRewarded({ onReward: () => setBonus(true), onClose: () => setBonusLoading(false) });
  };

  useEffect(() => {
    try {
      localStorage.setItem(K_KWH, JSON.stringify(kwh));
      localStorage.setItem(K_CONTRACT, contract);
    } catch {
      /* 저장 실패 무시 */
    }
  }, [kwh, contract]);

  const bill = useMemo(() => calcBill({ kwh, contract, summer }), [kwh, contract, summer]);
  const prevBill = useMemo(
    () => (prevKwh === null ? null : calcBill({ kwh: prevKwh, contract, summer })),
    [prevKwh, contract, summer]
  );

  const acKwNum = Number(acKw);
  const acMonthly = airconMonthlyKwh(Number.isFinite(acKwNum) ? acKwNum : 0, acHours);
  const acExtra =
    acMonthly > 0
      ? calcBill({ kwh: kwh + acMonthly, contract, summer }).total - bill.total
      : 0;

  /**
   * 결과 카드가 이미 화면에 뜬 뒤에만 눌리는 버튼이라 "결과보다 광고가 먼저" 경로가
   * 생기지 않는다. 임계값은 기존 savePrev와 같은 2 — 카운터가 모듈 스코프 공유다.
   * 딥링크는 카톡 등에 붙여넣으면 탭이 되지 않으므로 검색 문구를 발급처로 남긴다.
   */
  const onCopy = () => {
    copyText(
      [
        `월 ${kwh}kWh · 예상 청구액 ${won(bill.total)}`,
        `${contract === 'low' ? '주택용 저압' : '주택용 고압'} · 누진 ${bill.tier}단계${summer ? ' · 하계 완화' : ''}`,
        '',
        "토스에서 '전기요금 미리보기' 검색",
      ].join('\n')
    );
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
    bumpInterstitial(2);
  };

  const savePrev = () => {
    try {
      localStorage.setItem(K_PREV, JSON.stringify(kwh));
    } catch {
      /* 저장 실패 무시 */
    }
    setPrevKwh(kwh);
    setSavedFlash(true);
    window.setTimeout(() => setSavedFlash(false), 1500);
    // 전월 값 저장 = 사용자가 계산을 끝낸 시점. 계약 종류 토글(3회)은 아무도 하지 않아 지면이 놀았다.
    bumpInterstitial(2);
  };

  const diff = prevBill === null ? null : bill.total - prevBill.total;

  // 누진 구간 시각화 — 경계까지의 폭을 실제 kWh 비율로 그린다
  const [b1, b2] = summer ? TIER_BOUNDS_SUMMER : TIER_BOUNDS_NORMAL;
  const gaugeMax = Math.round(b2 * 1.5);
  const pct = (v: number) => (Math.min(Math.max(v, 0), gaugeMax) / gaugeMax) * 100;
  const next = useMemo(() => nextTierInfo(kwh, contract, summer), [kwh, contract, summer]);

  // 보너스: 목표 금액 안에서 쓸 수 있는 최대 사용량(역산). 광고를 본 뒤에만 계산한다.
  const budgetLimits = useMemo(
    () => (bonus ? BUDGETS.map((b) => maxKwhForBudget(b, contract, summer, KWH_MAX)) : []),
    [bonus, contract, summer]
  );

  return (
    <div className="app">
      <header>
        <h1 className="hdr-title">
          <BoltIcon className="hdr-icon" aria-hidden />
          전기요금 미리보기
        </h1>
        <p className="hdr-sub">월 사용량으로 주택용 누진 요금을 미리 계산해요</p>
      </header>

      <section className="panel">
        <div className="seg" role="tablist" aria-label="계약 종류">
          <button
            className={'seg-btn' + (contract === 'low' ? ' on' : '')}
            onClick={() => setContract('low')}
          >
            주택용 저압
          </button>
          <button
            className={'seg-btn' + (contract === 'high' ? ' on' : '')}
            onClick={() => setContract('high')}
          >
            주택용 고압
          </button>
        </div>

        <button className={'chip' + (summer ? ' on' : '')} onClick={() => setSummer(!summer)}>
          <SnowIcon className="chip-icon" aria-hidden />
          하계(7~8월) 누진 완화 {summer ? '적용' : '미적용'}
        </button>

        <div className="field">
          <label className="field-label" htmlFor="kwh-input">
            월 사용량 (kWh)
          </label>
          <input
            id="kwh-input"
            className="field-input"
            type="number"
            inputMode="numeric"
            min={0}
            max={KWH_MAX}
            value={kwh}
            onChange={(e) => {
              const n = Number(e.target.value);
              setKwh(Number.isFinite(n) ? Math.min(Math.max(Math.floor(n), 0), KWH_MAX) : 0);
            }}
          />
          <input
            className="slider"
            type="range"
            min={0}
            max={1200}
            step={10}
            value={Math.min(kwh, 1200)}
            onChange={(e) => setKwh(Number(e.target.value))}
            aria-label="월 사용량 슬라이더"
          />
          <div className="slider-marks">
            <span>0</span>
            <span>300</span>
            <span>600</span>
            <span>900</span>
            <span>1,200</span>
          </div>
        </div>
      </section>

      <section className="result">
        <span className="result-cap">예상 청구액 · 누진 {bill.tier}단계</span>
        <strong className="result-big">{won(bill.total)}</strong>
        <span className="result-sub">
          {contract === 'low' ? '주택용 저압' : '주택용 고압'} · {kwh}kWh
          {summer ? ' · 하계 완화' : ''}
        </span>
        {/* 결과 금액이 다 그려진 뒤에 온다 — 결과를 가리거나 앞서지 않는다 */}
        <button className="copy-btn" onClick={onCopy}>
          {copied ? <CheckIcon className="copy-icon" aria-hidden /> : <CopyIcon className="copy-icon" aria-hidden />}
          {copied ? '복사했어요' : '결과 복사'}
        </button>
      </section>

      <section className="panel">
        <h2 className="panel-title">누진 구간</h2>

        <div className="gauge" aria-hidden>
          <div className="gauge-track">
            <span className="gauge-seg seg1" style={{ width: `${pct(b1)}%` }} />
            <span className="gauge-seg seg2" style={{ width: `${pct(b2) - pct(b1)}%` }} />
            <span className="gauge-seg seg3" style={{ width: `${100 - pct(b2)}%` }} />
            <span className="gauge-fill" style={{ width: `${pct(kwh)}%` }} />
            <span className="gauge-pin" style={{ left: `${pct(kwh)}%` }} />
          </div>
          <div className="gauge-marks">
            <span style={{ left: `${pct(b1)}%` }}>{b1}</span>
            <span style={{ left: `${pct(b2)}%` }}>{b2}</span>
          </div>
        </div>

        <div className="tier-legend">
          {([1, 2, 3] as const).map((t) => (
            <div key={t} className={'tier-item' + (bill.tier === t ? ' on' : '')}>
              <span className={'tier-dot d' + t} />
              <span className="tier-name">{t}단계</span>
              <span className="tier-kwh">{bill.tierKwh[t - 1]}kWh</span>
            </div>
          ))}
        </div>

        {next ? (
          <p className={'warn' + (next.remainKwh <= 30 ? ' hot' : '')}>
            {next.remainKwh === 0
              ? `여기서 1kWh만 더 쓰면 ${next.nextTier}단계로 올라가요. 그 순간 ${won(next.jumpWon)}이 더 붙어요`
              : `${next.remainKwh}kWh 더 쓰면 ${next.nextTier}단계(${next.boundary}kWh 초과)로 올라가요. 넘어가는 순간 ${won(next.jumpWon)}이 더 붙어요`}
          </p>
        ) : (
          <p className="warn">
            이미 최고 단계인 3단계예요. 지금은 1kWh마다 가장 비싼 단가가 붙어요
          </p>
        )}

        {bill.superKwh > 0 && (
          <p className="warn hot">
            1,000kWh를 {bill.superKwh}kWh 넘겨 슈퍼유저 단가({SUPER_RATE}원/kWh)가 붙었어요
          </p>
        )}
      </section>

      {/* 보너스 — 토스 앱 밖에서는 canShowRewarded()가 false라 버튼 자체가 안 보인다 */}
      {canShowRewarded() && !bonus && (
        <button type="button" className="bonus-cta" onClick={unlockBonus} disabled={bonusLoading}>
          {bonusLoading ? '광고 확인 중' : '광고 보고 목표 금액별 사용 한도 보기'}
        </button>
      )}
      {bonus && (
        <section className="panel">
          <h2 className="panel-title">목표 금액별 쓸 수 있는 한도</h2>
          <p className="bonus-sub">
            지금 조건({contract === 'low' ? '저압' : '고압'}
            {summer ? ' · 하계 완화' : ''})에서 청구액이 그 금액을 넘지 않는 최대 사용량이에요.
          </p>
          <dl className="rows">
            {budgetLimits.map((lim, i) =>
              lim === null ? (
                <div className="row" key={BUDGETS[i]}>
                  <dt>{won(BUDGETS[i])} 이하</dt>
                  <dd className="bonus-val">기본요금만으로도 넘어요</dd>
                </div>
              ) : (
                <div className="row" key={lim.budget}>
                  <dt>{won(lim.budget)} 이하</dt>
                  <dd className="bonus-val">
                    {lim.kwh}kWh까지 · {won(lim.total)}
                  </dd>
                </div>
              )
            )}
          </dl>
          <p className="meta">
            지금 {kwh}kWh를 쓰면 {won(bill.total)}이에요. 한 칸이라도 넘으면 그 위 구간 단가가 붙어요.
          </p>
        </section>
      )}

      <section className="panel">
        <h2 className="panel-title">요금 내역</h2>
        <dl className="rows">
          <div className="row">
            <dt>기본요금</dt>
            <dd>{won(bill.baseCharge)}</dd>
          </div>
          <div className="row">
            <dt>전력량요금</dt>
            <dd>{won(bill.energyCharge)}</dd>
          </div>
          <div className="row">
            <dt>기후환경요금</dt>
            <dd>{won(bill.climateCharge)}</dd>
          </div>
          <div className="row">
            <dt>연료비조정액</dt>
            <dd>{won(bill.fuelAdjCharge)}</dd>
          </div>
          <div className="row sub">
            <dt>전기요금계</dt>
            <dd>{won(bill.subtotal)}</dd>
          </div>
          <div className="row">
            <dt>부가가치세 (10%)</dt>
            <dd>{won(bill.vat)}</dd>
          </div>
          <div className="row">
            <dt>전력산업기반기금 ({(FUND_RATE * 100).toFixed(1)}%)</dt>
            <dd>{won(bill.fund)}</dd>
          </div>
        </dl>
        <p className="meta">요금표 확인일 {TARIFF_DATE} · 청구액 10원 미만 절사</p>
      </section>

      <section className="panel">
        <h2 className="panel-title">
          <CompareIcon className="title-icon" aria-hidden />
          전월 대비
        </h2>
        {prevBill === null || prevKwh === null ? (
          <p className="empty">전월 사용량이 저장돼 있지 않아요. 이번 달 값을 저장해 두면 다음 달에 비교할 수 있어요.</p>
        ) : (
          <div className="compare">
            <div className="compare-row">
              <span>전월 {prevKwh}kWh</span>
              <span>{won(prevBill.total)}</span>
            </div>
            <div className="compare-row">
              <span>이번 달 {kwh}kWh</span>
              <span>{won(bill.total)}</span>
            </div>
            <p className={'compare-diff' + (diff !== null && diff > 0 ? ' up' : ' down')}>
              {diff === 0
                ? '전월과 같아요'
                : diff !== null && diff > 0
                  ? `전월보다 ${won(diff)} 늘어요`
                  : `전월보다 ${won(Math.abs(diff ?? 0))} 줄어요`}
            </p>
          </div>
        )}
        <button className="btn" onClick={savePrev}>
          {savedFlash ? '저장했어요' : '현재 사용량을 전월 값으로 저장'}
        </button>
      </section>

      <section className="panel">
        <h2 className="panel-title">
          <PlugIcon className="title-icon" aria-hidden />
          에어컨 간이 환산
        </h2>
        <div className="field">
          <label className="field-label" htmlFor="ac-kw">
            소비전력 (kW)
          </label>
          <input
            id="ac-kw"
            className="field-input"
            type="number"
            inputMode="decimal"
            step="0.1"
            min={0}
            value={acKw}
            onChange={(e) => setAcKw(e.target.value)}
          />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="ac-hours">
            하루 사용 시간: {acHours}시간
          </label>
          <input
            id="ac-hours"
            className="slider"
            type="range"
            min={0}
            max={24}
            value={acHours}
            onChange={(e) => setAcHours(Number(e.target.value))}
          />
        </div>
        <p className="ac-result">
          한 달(30일) 약 <strong>{acMonthly}kWh</strong>
          {acMonthly > 0 ? (
            <>
              {' '}
              — 지금 사용량에 더하면 <strong>+{won(acExtra)}</strong>
            </>
          ) : null}
        </p>
      </section>

      <p className="disclaimer">
        <InfoIcon className="disclaimer-icon" aria-hidden />
        본 결과는 참고용 모의 계산으로 법적 효력이 없으며, 복지할인·검침일·요금제 변동 등에 따라
        실제 한국전력 청구액과 다를 수 있어요. 모든 데이터는 기기에만 저장돼요.
      </p>

      <BannerAd adGroupId={AD_GROUP_ID} />
    </div>
  );
}
