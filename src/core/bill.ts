/**
 * 주택용 전기요금(누진 3단계) 계산 — 순수 함수.
 *
 * 요금표 기준일: 2026-01-01 (한국전력 주택용 전기요금표 기준 단가를 상수로 명시)
 * 실제 청구액은 복지할인·요금제 옵션·검침일 등에 따라 달라질 수 있다(참고용).
 */

export const TARIFF_DATE = '2026-01-01';

export type Contract = 'low' | 'high';

/** 누진 구간 경계 (kWh) — 기타 계절 */
export const TIER_BOUNDS_NORMAL = [200, 400] as const;
/** 누진 구간 경계 (kWh) — 하계(7~8월) 완화 */
export const TIER_BOUNDS_SUMMER = [300, 450] as const;

/** 구간별 기본요금 (원/호) */
export const BASE_CHARGE: Record<Contract, readonly [number, number, number]> = {
  low: [910, 1600, 7300],
  high: [730, 1260, 6060],
};

/** 구간별 전력량요금 단가 (원/kWh, 소수 1자리) — 정수 연산을 위해 0.1원 단위로 환산해 계산 */
export const ENERGY_RATE: Record<Contract, readonly [number, number, number]> = {
  low: [120.0, 214.6, 307.3],
  high: [105.0, 174.0, 242.3],
};

/**
 * 슈퍼유저 구간: 월 1,000kWh를 넘는 사용량에 최고 단가가 붙는다. 기본요금은 3단계와 같다.
 * 실제로는 하계(7~8월)와 동계(12~2월) 모두 적용되지만, 이 앱은 `summer`(7~8월)만
 * 판별하므로 동계는 반영하지 않는다 — 동계 지원은 별도 플래그가 필요하다.
 */
export const SUPER_BOUND = 1000;
export const SUPER_RATE = 736.2;

/** 기후환경요금 단가 (원/kWh) */
export const CLIMATE_RATE = 9.0;
/** 연료비조정액 단가 (원/kWh) */
export const FUEL_ADJ_RATE = 5.0;
/** 부가가치세율 */
export const VAT_RATE = 0.1;
/** 전력산업기반기금 요율 */
export const FUND_RATE = 0.037;

export interface BillInput {
  kwh: number;
  contract: Contract;
  /** 하계(7~8월) 누진 완화 적용 여부 */
  summer: boolean;
}

export interface BillResult {
  /** 구간별 사용량 (kWh) */
  tierKwh: [number, number, number];
  /** 적용 누진 단계 (1~3). 슈퍼유저 구간도 기본요금 기준은 3단계다. */
  tier: 1 | 2 | 3;
  /** 슈퍼유저 구간(1,000kWh 초과) 사용량. 하계·동계에만 0이 아니다. */
  superKwh: number;
  baseCharge: number;
  energyCharge: number;
  climateCharge: number;
  fuelAdjCharge: number;
  /** 전기요금계 = 기본+전력량+기후환경+연료비조정 */
  subtotal: number;
  vat: number;
  fund: number;
  /** 청구금액 (10원 미만 절사) */
  total: number;
}

/** 사용량을 누진 구간별로 분해 */
export function splitTiers(kwh: number, summer: boolean): [number, number, number] {
  const [b1, b2] = summer ? TIER_BOUNDS_SUMMER : TIER_BOUNDS_NORMAL;
  const t1 = Math.min(kwh, b1);
  const t2 = Math.min(Math.max(kwh - b1, 0), b2 - b1);
  const t3 = Math.max(kwh - b2, 0);
  return [t1, t2, t3];
}

export function calcBill({ kwh, contract, summer }: BillInput): BillResult {
  const usage = Number.isFinite(kwh) && kwh > 0 ? Math.floor(kwh) : 0;
  const tiers = splitTiers(usage, summer);
  const tier: 1 | 2 | 3 = tiers[2] > 0 ? 3 : tiers[1] > 0 ? 2 : 1;

  // 슈퍼유저 구간은 3단계 사용량에서 떼어낸다(중복 과금 방지).
  const superKwh = summer ? Math.max(usage - SUPER_BOUND, 0) : 0;
  tiers[2] -= superKwh;

  const baseCharge = BASE_CHARGE[contract][tier - 1];

  // 전력량요금: 단가가 0.1원 단위 → 0.1원(데시원) 정수로 합산 후 원 단위 절사
  const rates = ENERGY_RATE[contract];
  let deciWon = superKwh * Math.round(SUPER_RATE * 10);
  for (let i = 0; i < 3; i++) deciWon += tiers[i] * Math.round(rates[i] * 10);
  const energyCharge = Math.floor(deciWon / 10);

  const climateCharge = Math.floor(usage * CLIMATE_RATE);
  const fuelAdjCharge = Math.floor(usage * FUEL_ADJ_RATE);

  const subtotal = baseCharge + energyCharge + climateCharge + fuelAdjCharge;
  const vat = Math.round(subtotal * VAT_RATE);
  const fund = Math.floor((subtotal * FUND_RATE) / 10) * 10;
  const total = Math.floor((subtotal + vat + fund) / 10) * 10;

  return {
    tierKwh: tiers,
    tier,
    superKwh,
    baseCharge,
    energyCharge,
    climateCharge,
    fuelAdjCharge,
    subtotal,
    vat,
    fund,
    total,
  };
}

export interface NextTierInfo {
  /** 넘어가면 도달하는 단계 */
  nextTier: 2 | 3;
  /** 다음 단계가 시작되는 사용량(kWh) */
  boundary: number;
  /** 다음 단계까지 남은 여유 사용량(kWh) */
  remainKwh: number;
  /** 경계를 딱 1kWh 넘겼을 때 늘어나는 청구액(원) */
  jumpWon: number;
}

/**
 * 지금 사용량에서 "몇 kWh 더 쓰면 다음 누진 구간인지"와
 * 그때 한 번에 뛰는 금액을 계산한다. 이미 3단계면 null.
 */
export function nextTierInfo(
  kwh: number,
  contract: Contract,
  summer: boolean
): NextTierInfo | null {
  const usage = Number.isFinite(kwh) && kwh > 0 ? Math.floor(kwh) : 0;
  const [b1, b2] = summer ? TIER_BOUNDS_SUMMER : TIER_BOUNDS_NORMAL;
  const boundary = usage <= b1 ? b1 : usage <= b2 ? b2 : null;
  if (boundary === null) return null;

  const atBoundary = calcBill({ kwh: boundary, contract, summer }).total;
  const overBoundary = calcBill({ kwh: boundary + 1, contract, summer }).total;
  return {
    nextTier: boundary === b1 ? 2 : 3,
    boundary,
    remainKwh: boundary - usage,
    jumpWon: overBoundary - atBoundary,
  };
}

/** 에어컨 간이 환산: 소비전력(kW) × 하루 사용시간(h) × 30일 = 월 kWh */
export function airconMonthlyKwh(powerKw: number, hoursPerDay: number): number {
  if (!Number.isFinite(powerKw) || !Number.isFinite(hoursPerDay)) return 0;
  if (powerKw <= 0 || hoursPerDay <= 0) return 0;
  return Math.round(powerKw * hoursPerDay * 30);
}
