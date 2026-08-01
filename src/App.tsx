import { useEffect, useMemo, useState } from 'react';
import { AD_GROUP_ID } from './ads/config';
import { bumpInterstitial } from './ads/interstitial';
import { BannerAd } from './ads/BannerAd';
import { BoltIcon, CompareIcon, InfoIcon, PlugIcon, SnowIcon } from './components/icons';
import { STORAGE_PREFIX } from './config';
import { airconMonthlyKwh, calcBill, TARIFF_DATE, type Contract } from './core/bill';

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

export function App() {
  const month = new Date().getMonth() + 1;
  const [kwh, setKwh] = useState(() => loadNum(K_KWH, 300, 0, 999));
  const [contract, setContract] = useState<Contract>(loadContract);
  const [summer, setSummer] = useState(month === 7 || month === 8);
  const [prevKwh, setPrevKwh] = useState<number | null>(loadPrev);
  const [savedFlash, setSavedFlash] = useState(false);
  const [acKw, setAcKw] = useState('1.8');
  const [acHours, setAcHours] = useState(4);

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

  const savePrev = () => {
    try {
      localStorage.setItem(K_PREV, JSON.stringify(kwh));
    } catch {
      /* 저장 실패 무시 */
    }
    setPrevKwh(kwh);
    setSavedFlash(true);
    window.setTimeout(() => setSavedFlash(false), 1500);
  };

  const diff = prevBill === null ? null : bill.total - prevBill.total;

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
            onClick={() => { setContract('low'); bumpInterstitial(3); }}
          >
            주택용 저압
          </button>
          <button
            className={'seg-btn' + (contract === 'high' ? ' on' : '')}
            onClick={() => { setContract('high'); bumpInterstitial(3); }}
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
            max={999}
            value={kwh}
            onChange={(e) => {
              const n = Number(e.target.value);
              setKwh(Number.isFinite(n) ? Math.min(Math.max(Math.floor(n), 0), 999) : 0);
            }}
          />
          <input
            className="slider"
            type="range"
            min={0}
            max={800}
            step={10}
            value={Math.min(kwh, 800)}
            onChange={(e) => setKwh(Number(e.target.value))}
            aria-label="월 사용량 슬라이더"
          />
          <div className="slider-marks">
            <span>0</span>
            <span>200</span>
            <span>400</span>
            <span>600</span>
            <span>800</span>
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
      </section>

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
            <dt>전력산업기반기금 (3.7%)</dt>
            <dd>{won(bill.fund)}</dd>
          </div>
        </dl>
        <p className="meta">요금표 기준일 {TARIFF_DATE} · 청구액 10원 미만 절사</p>
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
