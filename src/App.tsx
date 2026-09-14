import { useEffect, useMemo, useRef, useState } from 'react';
import { AD_GROUP_ID } from './ads/config';
import { bumpInterstitialSettled } from './ads/interstitial';
import { BannerAd } from './ads/BannerAd';
import { canShowRewarded, showRewarded } from './ads/rewarded';
import {
  CheckIcon,
  CloseIcon,
  CopyIcon,
  HomeIcon,
  InfoIcon,
  MapPinIcon,
  ReceiptIcon,
  ScaleIcon,
  UsersIcon,
  YouthIcon,
} from './components/icons';
import { STORAGE_PREFIX } from './config';
import {
  ASSET_RATE,
  CHECKED_AT,
  GAZETTE_PENDING,
  GRADE_LABEL,
  MAX_PEOPLE,
  MEDIAN_INCOME,
  REGIONS,
  YEARS,
  YOUTH_SPLIT_MAX_AGE,
  YOUTH_SPLIT_MIN_AGE,
  regionOf,
  type RegionKey,
  type Year,
} from './core/constants';
import { benefitLines, calcHousing, compareGrades, type HousingInput } from './core/housing';

/* ------------------------------------------------------------------ *
 * 입력 범위 — 슬라이더 상한. 넘겨도 계산은 되지만 슬라이더로는 여기까지만 간다.
 * ------------------------------------------------------------------ */
const INCOME_MAX = 7_000_000;
const INCOME_STEP = 50_000;
const RENT_MAX = 1_500_000;
const RENT_STEP = 10_000;
const DEPOSIT_MAX = 100_000_000;
const DEPOSIT_STEP = 1_000_000;
const ASSET_MAX = 300_000_000;
const ASSET_STEP = 1_000_000;

/** 입력이 이만큼 조용해지면 「값이 정착했다」고 본다. 슬라이더 드래그 중에는 계속 새로 잡힌다. */
const SETTLE_MS = 900;
/** 정착 3회째에 전면광고 1회 — 결과는 그 전에 이미 다 보인다. */
const INTERSTITIAL_THRESHOLD = 3;

const K = {
  year: STORAGE_PREFIX + 'year',
  people: STORAGE_PREFIX + 'people',
  income: STORAGE_PREFIX + 'income',
  earned: STORAGE_PREFIX + 'earned',
  asset: STORAGE_PREFIX + 'asset',
  region: STORAGE_PREFIX + 'region',
  renter: STORAGE_PREFIX + 'renter',
  rent: STORAGE_PREFIX + 'rent',
  deposit: STORAGE_PREFIX + 'deposit',
};

/** localStorage 는 깨진 값·용량 초과·비활성화 어느 쪽으로도 터진다. 전부 기본값으로 되돌린다. */
function loadNum(key: string, fallback: number, min: number, max: number): number {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    const n = Number(JSON.parse(raw));
    if (!Number.isFinite(n)) return fallback;
    return Math.min(Math.max(Math.floor(n), min), max);
  } catch {
    return fallback;
  }
}

function loadBool(key: string, fallback: boolean): boolean {
  try {
    const raw = localStorage.getItem(key);
    if (raw === 'true') return true;
    if (raw === 'false') return false;
    return fallback;
  } catch {
    return fallback;
  }
}

function loadRegion(): RegionKey {
  try {
    const raw = localStorage.getItem(K.region);
    return REGIONS.some((r) => r.key === raw) ? (raw as RegionKey) : 'seoul';
  } catch {
    return 'seoul';
  }
}

function loadYear(): Year {
  try {
    return localStorage.getItem(K.year) === '2027' ? 2027 : 2026;
  } catch {
    return 2026;
  }
}

const won = (n: number) => Math.round(n).toLocaleString('ko-KR') + '원';

/** 만원 단위 표기. 12,340,000원 → "1,234만원". 소수점은 버린다(슬라이더 step 이 만원 배수다). */
const manwon = (n: number) => Math.floor(n / 10_000).toLocaleString('ko-KR') + '만원';

/** WebView 에서 navigator.clipboard 가 없는 경우가 잦아 execCommand 로 폴백한다. */
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
  const [year, setYear] = useState<Year>(loadYear);
  const [people, setPeople] = useState(() => loadNum(K.people, 1, 1, MAX_PEOPLE));
  const [income, setIncome] = useState(() => loadNum(K.income, 900_000, 0, INCOME_MAX));
  const [earned, setEarned] = useState(() => loadBool(K.earned, true));
  const [asset, setAsset] = useState(() => loadNum(K.asset, 0, 0, ASSET_MAX));
  const [regionKey, setRegionKey] = useState<RegionKey>(loadRegion);
  const [renter, setRenter] = useState(() => loadBool(K.renter, true));
  const [rent, setRent] = useState(() => loadNum(K.rent, 350_000, 0, RENT_MAX));
  const [deposit, setDeposit] = useState(() => loadNum(K.deposit, 3_000_000, 0, DEPOSIT_MAX));

  const [copied, setCopied] = useState(false);
  const [bonus, setBonus] = useState(false);
  const [bonusLoading, setBonusLoading] = useState(false);

  const input: HousingInput = useMemo(
    () => ({
      year,
      people,
      incomeWon: income,
      earned,
      assetWon: asset,
      regionKey,
      renter,
      rentWon: rent,
      depositWon: deposit,
    }),
    [year, people, income, earned, asset, regionKey, renter, rent, deposit]
  );

  const r = useMemo(() => calcHousing(input), [input]);
  const region = regionOf(regionKey);
  const lines = useMemo(
    () => benefitLines(year, people, r.recognizedIncome),
    [year, people, r.recognizedIncome]
  );
  const gradeRows = useMemo(() => (bonus ? compareGrades(input) : []), [bonus, input]);

  useEffect(() => {
    try {
      localStorage.setItem(K.year, String(year));
      localStorage.setItem(K.people, JSON.stringify(people));
      localStorage.setItem(K.income, JSON.stringify(income));
      localStorage.setItem(K.earned, String(earned));
      localStorage.setItem(K.asset, JSON.stringify(asset));
      localStorage.setItem(K.region, regionKey);
      localStorage.setItem(K.renter, String(renter));
      localStorage.setItem(K.rent, JSON.stringify(rent));
      localStorage.setItem(K.deposit, JSON.stringify(deposit));
    } catch {
      /* 저장 실패는 계산을 막지 않는다 */
    }
  }, [year, people, income, earned, asset, regionKey, renter, rent, deposit]);

  /**
   * 전면광고 트리거. 값이 SETTLE_MS 동안 조용해져야 「정착 1회」로 센다.
   * - 슬라이더를 끄는 동안에는 타이머가 계속 새로 잡혀 광고가 뜰 수 없다.
   * - 첫 렌더는 사용자 행동이 아니므로 건너뛴다(안 건너뛰면 정착 1회가 공짜로 세어진다).
   * - 실제 노출은 interstitial.ts 가 진입 8초·세션 1회로 다시 잠근다.
   */
  const settledOnceRef = useRef(false);
  useEffect(() => {
    if (!settledOnceRef.current) {
      settledOnceRef.current = true;
      return;
    }
    const t = setTimeout(() => bumpInterstitialSettled(INTERSTITIAL_THRESHOLD), SETTLE_MS);
    return () => clearTimeout(t);
  }, [year, people, income, earned, asset, regionKey, renter, rent, deposit]);

  const unlockBonus = () => {
    if (bonus || bonusLoading) return;
    setBonusLoading(true);
    showRewarded({ onReward: () => setBonus(true), onClose: () => setBonusLoading(false) });
  };

  const onCopy = () => {
    copyText(
      [
        `${year}년 기준 · ${people}인 가구 · ${GRADE_LABEL[region.grade]}`,
        `소득인정액 ${won(r.recognizedIncome)} (기준 중위소득의 ${r.medianPercent}%)`,
        r.eligible
          ? `주거급여 자격 O · 예상 월 지원액 ${won(r.payout)}`
          : `주거급여 자격 X (선정기준 ${won(r.housingLine)} 초과)`,
        '',
        "토스에서 '주거급여 계산기' 검색",
      ].join('\n')
    );
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  const median = MEDIAN_INCOME[year][people - 1];
  // 중위 60% 지점까지를 게이지 폭으로 삼는다 — 급여 기준선 넷(32·40·48·50%)이 다 들어온다.
  const gaugeMax = 60;
  const pct = (v: number) => (Math.min(Math.max(v, 0), gaugeMax) / gaugeMax) * 100;

  return (
    <div className="app">
      <header>
        <h1 className="hdr-title">
          <HomeIcon className="hdr-icon" aria-hidden />
          주거급여 계산기
        </h1>
        <p className="hdr-sub">
          소득과 월세만 넣으면 자격과 월 지원액이 바로 나와요. 기준 중위소득 대비 몇 %인지도 같이 봐요.
        </p>
      </header>

      <div className="seg" role="tablist" aria-label="적용 연도">
        {YEARS.map((y) => (
          <button
            key={y}
            role="tab"
            aria-selected={year === y}
            className={'seg-btn' + (year === y ? ' on' : '')}
            onClick={() => setYear(y)}
          >
            {y}년 기준
            <span className="seg-sub">{y === 2026 ? '지금 신청' : '1월 1일부터'}</span>
          </button>
        ))}
      </div>

      <section className="panel">
        <div className="field">
          <span className="field-label">
            <UsersIcon className="label-icon" aria-hidden />
            가구원 수
          </span>
          <div className="chips grid6">
            {Array.from({ length: MAX_PEOPLE }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                className={'chip' + (people === n ? ' on' : '')}
                aria-pressed={people === n}
                onClick={() => setPeople(n)}
              >
                {n}인
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <span className="field-label">
            <MapPinIcon className="label-icon" aria-hidden />
            사는 곳
          </span>
          <div className="chips">
            {REGIONS.map((reg) => (
              <button
                key={reg.key}
                className={'chip' + (regionKey === reg.key ? ' on' : '')}
                aria-pressed={regionKey === reg.key}
                onClick={() => setRegionKey(reg.key)}
              >
                {reg.label}
              </button>
            ))}
          </div>
          <p className="hint">{GRADE_LABEL[region.grade]}</p>
        </div>

        <div className="field">
          <label className="field-label" htmlFor="income">
            월 소득 (세전) <strong className="field-value">{manwon(income)}</strong>
          </label>
          <input
            id="income"
            className="slider"
            type="range"
            min={0}
            max={INCOME_MAX}
            step={INCOME_STEP}
            value={income}
            onChange={(e) => setIncome(Number(e.target.value))}
          />
          <div className="slider-marks">
            <span>0</span>
            <span>350만</span>
            <span>700만원</span>
          </div>
          <button
            className={'toggle' + (earned ? ' on' : '')}
            aria-pressed={earned}
            onClick={() => setEarned(!earned)}
          >
            근로·사업소득이에요 (30% 공제)
          </button>
        </div>
      </section>

      {/* 결과 — 입력을 건드리기 전부터 기본값으로 이미 채워져 있다 */}
      <section className={'result' + (r.eligible ? '' : ' no')}>
        <span className="result-cap">
          {renter ? '예상 월 지원액' : '자가 가구 · 임차급여 대상 아님'}
        </span>
        <strong className="result-big">{renter ? won(r.payout) : '—'}</strong>
        <span className="result-sub">
          {year}년 기준 · {people}인 가구 · {region.label}({region.grade}급지)
        </span>
        <div className="verdict">
          {r.eligible ? (
            <CheckIcon className="verdict-icon" aria-hidden />
          ) : (
            <CloseIcon className="verdict-icon" aria-hidden />
          )}
          {r.eligible
            ? `주거급여 자격 있음 · 소득인정액이 선정기준(${won(r.housingLine)}) 이하예요`
            : `주거급여 자격 없음 · 선정기준(${won(r.housingLine)})을 ${won(
                r.recognizedIncome - r.housingLine
              )} 넘어요`}
        </div>
        {r.eligible && renter && r.cappedByMultiple && (
          <p className="result-note">
            실제 임차료가 기준임대료의 5배를 넘어 최저지급액만 나와요.
          </p>
        )}
        {r.eligible && renter && r.liftedToMin && (
          <p className="result-note">산정액이 1만원보다 적어 최저지급액 1만원으로 올렸어요.</p>
        )}
        {!renter && (
          <p className="result-note">
            자가 가구는 월세 대신 주택 수선을 지원하는 수선유지급여 대상이에요.
          </p>
        )}
        <button className="copy-btn" onClick={onCopy}>
          {copied ? (
            <CheckIcon className="copy-icon" aria-hidden />
          ) : (
            <CopyIcon className="copy-icon" aria-hidden />
          )}
          {copied ? '복사했어요' : '결과 복사'}
        </button>
      </section>

      <section className="panel">
        <h2 className="panel-title">
          <ScaleIcon className="title-icon" aria-hidden />
          우리 집 소득인정액
        </h2>
        <p className="big-line">
          {won(r.recognizedIncome)}
          <span className="big-line-sub">
            {' '}
            = 기준 중위소득의 <strong>{r.medianPercent}%</strong>
          </span>
        </p>

        <div className="gauge" aria-hidden>
          <div className="gauge-track">
            <span className="gauge-seg s1" style={{ width: `${pct(32)}%` }} />
            <span className="gauge-seg s2" style={{ width: `${pct(40) - pct(32)}%` }} />
            <span className="gauge-seg s3" style={{ width: `${pct(48) - pct(40)}%` }} />
            <span className="gauge-seg s4" style={{ width: `${100 - pct(48)}%` }} />
            <span className="gauge-pin" style={{ left: `${pct(r.medianPercent)}%` }} />
          </div>
          <div className="gauge-marks">
            <span style={{ left: `${pct(32)}%` }}>32</span>
            <span style={{ left: `${pct(40)}%` }}>40</span>
            <span style={{ left: `${pct(48)}%` }}>48</span>
          </div>
        </div>

        <dl className="rows">
          <div className="row">
            <dt>소득평가액{earned ? ' (30% 공제 후)' : ''}</dt>
            <dd>{won(r.evaluatedIncome)}</dd>
          </div>
          <div className="row">
            <dt>재산의 소득환산액</dt>
            <dd>{won(r.assetIncome)}</dd>
          </div>
          <div className="row sub">
            <dt>소득인정액</dt>
            <dd>{won(r.recognizedIncome)}</dd>
          </div>
        </dl>
        <p className="hint">
          {people}인 가구 기준 중위소득 {won(median)} · 주거급여 선정기준(48%){' '}
          {won(r.housingLine)}
        </p>
      </section>

      <section className="panel">
        <h2 className="panel-title">
          <HomeIcon className="title-icon" aria-hidden />
          사는 형태
        </h2>
        <div className="seg">
          <button
            className={'seg-btn' + (renter ? ' on' : '')}
            aria-pressed={renter}
            onClick={() => setRenter(true)}
          >
            세 들어 살아요
          </button>
          <button
            className={'seg-btn' + (!renter ? ' on' : '')}
            aria-pressed={!renter}
            onClick={() => setRenter(false)}
          >
            자가예요
          </button>
        </div>

        {renter && (
          <>
            <div className="field">
              <label className="field-label" htmlFor="rent">
                월세 <strong className="field-value">{manwon(rent)}</strong>
              </label>
              <input
                id="rent"
                className="slider"
                type="range"
                min={0}
                max={RENT_MAX}
                step={RENT_STEP}
                value={rent}
                onChange={(e) => setRent(Number(e.target.value))}
              />
            </div>
            <div className="field">
              <label className="field-label" htmlFor="deposit">
                보증금 <strong className="field-value">{manwon(deposit)}</strong>
              </label>
              <input
                id="deposit"
                className="slider"
                type="range"
                min={0}
                max={DEPOSIT_MAX}
                step={DEPOSIT_STEP}
                value={deposit}
                onChange={(e) => setDeposit(Number(e.target.value))}
              />
              <p className="hint">
                보증금은 연 4%로 월세 환산해서 실제 임차료에 더해요 — 지금은 월{' '}
                {won(r.depositRent)}.
              </p>
            </div>
          </>
        )}

        <div className="field">
          <label className="field-label" htmlFor="asset">
            재산 (예금·자동차 등) <strong className="field-value">{manwon(asset)}</strong>
          </label>
          <input
            id="asset"
            className="slider"
            type="range"
            min={0}
            max={ASSET_MAX}
            step={ASSET_STEP}
            value={asset}
            onChange={(e) => setAsset(Number(e.target.value))}
          />
          <p className="hint">
            간단 추정이에요. 기본재산액 {manwon(region.basicAsset)}({region.label})을 빼고 남은
            금액에 일반재산 환산율 월 {(ASSET_RATE.general * 100).toFixed(2)}%를 적용해요. 실제로는
            금융재산 월 {(ASSET_RATE.financial * 100).toFixed(2)}%, 자동차 월 100%로 더 높게 잡히는
            항목이 있어 소득인정액이 더 클 수 있어요.
          </p>
        </div>
      </section>

      {renter && (
        <section className="panel">
          <h2 className="panel-title">
            <ReceiptIcon className="title-icon" aria-hidden />
            지원액이 나온 과정
          </h2>
          <dl className="rows">
            <div className="row">
              <dt>기준임대료 ({region.grade}급지 · {people}인)</dt>
              <dd>{won(r.cap)}</dd>
            </div>
            <div className="row">
              <dt>실제 임차료 (월세 + 보증금 환산)</dt>
              <dd>{won(r.actualRent)}</dd>
            </div>
            <div className="row sub">
              <dt>둘 중 작은 값</dt>
              <dd>{won(r.base)}</dd>
            </div>
            <div className="row">
              <dt>자기부담분 (생계기준 초과분의 30%)</dt>
              <dd>{r.selfPay === 0 ? '없음' : '− ' + won(r.selfPay)}</dd>
            </div>
            <div className="row sub">
              <dt>예상 월 지원액</dt>
              <dd>{won(r.payout)}</dd>
            </div>
          </dl>
          <p className="hint">
            생계급여 선정기준 {won(r.livingLine)} 이하면 자기부담분이 없어요. 산정액이 1만원보다
            적으면 1만원을 줘요.
          </p>
        </section>
      )}

      <section className="panel">
        <h2 className="panel-title">
          <CheckIcon className="title-icon" aria-hidden />
          같은 소득으로 다른 급여도 되나요
        </h2>
        <dl className="rows">
          {lines.map((l) => (
            <div className="row" key={l.kind}>
              <dt>
                {l.label} <span className="rate">중위 {Math.round(l.rate * 100)}%</span>
              </dt>
              <dd className={l.eligible ? 'yes' : 'no'}>
                {l.eligible ? '가능' : '해당 없음'} · {won(l.line)}
              </dd>
            </div>
          ))}
        </dl>
        <p className="hint">
          소득인정액 {won(r.recognizedIncome)} 기준이에요. 의료·교육급여는 부양의무자 기준 등 별도
          요건이 더 있어요.
        </p>
      </section>

      {/* 덤 — 토스 앱 밖에서는 canShowRewarded()가 false라 버튼 자체가 안 보인다 */}
      {canShowRewarded() && !bonus && (
        <button type="button" className="bonus-cta" onClick={unlockBonus} disabled={bonusLoading}>
          {bonusLoading ? '광고 확인 중' : '광고 보고 1~4급지 전부 비교하기'}
        </button>
      )}
      {bonus && (
        <section className="panel">
          <h2 className="panel-title">
            <MapPinIcon className="title-icon" aria-hidden />
            급지별로 얼마나 다를까
          </h2>
          <p className="hint">
            지금 입력({people}인 · 월세 {manwon(rent)} · 소득 {manwon(income)})으로 급지만 바꿔
            봤어요.
          </p>
          <dl className="rows">
            {gradeRows.map((g) => (
              <div className={'row' + (g.grade === region.grade ? ' mine' : '')} key={g.grade}>
                <dt>
                  {GRADE_LABEL[g.grade]}
                  <span className="rate">상한 {won(g.cap)}</span>
                </dt>
                <dd>{renter && r.eligible ? won(g.payout) : '—'}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      <section className="panel">
        <h2 className="panel-title">
          <YouthIcon className="title-icon" aria-hidden />
          알아두면 좋은 것
        </h2>
        <p className="note">
          <strong>청년 주거급여 분리지급</strong> — 수급가구의 만 {YOUTH_SPLIT_MIN_AGE}세부터 만{' '}
          {YOUTH_SPLIT_MAX_AGE}세가 되기 전까지의 미혼 자녀가 취학·구직 등으로 부모와{' '}
          <strong>다른 시·군</strong>(광역시 안의 군은 제외)에 주민등록을 두고 따로 임대차계약을
          맺었다면, 부모와 별도로 주거급여를 받을 수 있어요. 신청은 부모 주소지 관할에서 해요.
        </p>
        <p className="note">
          <strong>신청은 어디서</strong> — 주민등록상 주소지 읍·면·동 행정복지센터(주민센터)에
          방문하거나, 복지로(bokjiro.go.kr)에서 온라인으로 신청해요. 신청 후 소득·재산 조사와 주택
          조사를 거쳐 결정돼요.
        </p>
      </section>

      <p className="disclaimer">
        <InfoIcon className="disclaimer-icon" aria-hidden />
        기준: 보건복지부 제80차 중앙생활보장위원회(2026-07-28) 발표 기준 중위소득·급여별 선정기준,
        국토교통부 기준임대료. {CHECKED_AT} 확인.
        {GAZETTE_PENDING[year] && ' 2027년 수치는 발표 확정치이며 고시는 연말에 발령돼요.'} 참고용
        모의 계산이며 실제 결정액과 다를 수 있어요. 가구특성별 지출비용·부채 공제·자동차 기준 등은
        반영하지 않았어요. 입력값은 이 기기에만 저장돼요.
      </p>

      <BannerAd adGroupId={AD_GROUP_ID} />
    </div>
  );
}
