import {
  ASSET_RATE,
  BENEFIT_RATE,
  clampPeople,
  DEPOSIT_YEARLY_RATE,
  EARNED_INCOME_DEDUCTION,
  MEDIAN_INCOME,
  MIN_PAYOUT,
  PAYOUT_UNIT,
  regionOf,
  rentCap,
  RENT_CAP_MULTIPLE,
  selectionLine,
  SELF_PAY_RATE,
  type BenefitKind,
  type RegionKey,
  type Year,
} from './constants';

export interface HousingInput {
  year: Year;
  /** 가구원 수 1~6 */
  people: number;
  /** 세전 월 소득(원) */
  incomeWon: number;
  /** 근로·사업소득이면 30% 공제를 적용한다 */
  earned: boolean;
  /** 예금·자동차 등 재산(원). 임차보증금은 여기 넣지 않는다 */
  assetWon: number;
  regionKey: RegionKey;
  /** 세 들어 사는가 */
  renter: boolean;
  /** 월세(원) */
  rentWon: number;
  /** 임차보증금(원) */
  depositWon: number;
  /**
   * 급지만 바꿔 계산할 때 쓴다(리워드 덤의 급지 비교표).
   * 기본재산액 공제는 regionKey 것을 그대로 두어 「급지 차이」만 보이게 한다.
   */
  gradeOverride?: 1 | 2 | 3 | 4;
}

export interface HousingResult {
  /** 소득평가액(원) — 실제소득에서 근로소득공제를 뺀 값 */
  evaluatedIncome: number;
  /** 재산의 소득환산액(원/월) */
  assetIncome: number;
  /** 소득인정액 = 소득평가액 + 재산의 소득환산액 */
  recognizedIncome: number;
  /** 소득인정액이 기준 중위소득의 몇 %인가(소수 1자리) */
  medianPercent: number;
  /** 주거급여 선정기준(중위 48%) */
  housingLine: number;
  /** 생계급여 선정기준(중위 32%) — 자기부담분의 기준선 */
  livingLine: number;
  /** 주거급여 자격이 되는가 */
  eligible: boolean;
  /** 기준임대료(원/월) */
  cap: number;
  /** 실제임차료 = 월세 + 보증금 월환산 */
  actualRent: number;
  /** 보증금을 연 4%로 월환산한 금액 */
  depositRent: number;
  /** 지원 산정의 바탕이 되는 금액 = min(실제임차료, 기준임대료) */
  base: number;
  /** 자기부담분 */
  selfPay: number;
  /** 예상 월 지원액 */
  payout: number;
  /** 실제임차료가 기준임대료의 5배를 넘어 최저지급액만 나오는 경우 */
  cappedByMultiple: boolean;
  /** 산정액이 1만원 미만이라 최저지급액으로 올라간 경우 */
  liftedToMin: boolean;
}

/** 급여 한 종류에 대한 자격 판정 — 결과 화면의 「생계·의료·교육도 되나」 줄에 쓴다 */
export interface BenefitLine {
  kind: BenefitKind;
  label: string;
  rate: number;
  line: number;
  eligible: boolean;
}

const BENEFIT_LABEL: Record<BenefitKind, string> = {
  living: '생계급여',
  medical: '의료급여',
  housing: '주거급여',
  education: '교육급여',
};

/** 음수·NaN·Infinity 를 0 으로 눌러 화면에 NaN 이 새지 않게 한다 */
function safe(n: number): number {
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

/**
 * 재산의 소득환산액.
 *
 * 기본재산액 공제는 주거용재산 → 일반재산 순으로 차감한다. 남은 잔액에만 환산율이 붙는다.
 * 임차보증금은 주거용재산(월 1.04%)이고, 입력칸의 「예금·자동차 등」은 일반재산(월 4.17%)으로 본다.
 * 금융재산 6.26%·자동차 100% 는 입력칸이 없어 적용하지 않는다 — 화면에 그 한계를 적는다.
 */
export function assetToIncome(
  depositWon: number,
  assetWon: number,
  basicAsset: number
): number {
  let remainingDeduction = basicAsset;

  const residential = safe(depositWon);
  const usedOnResidential = Math.min(remainingDeduction, residential);
  remainingDeduction -= usedOnResidential;

  const general = safe(assetWon);
  const usedOnGeneral = Math.min(remainingDeduction, general);

  const residentialLeft = residential - usedOnResidential;
  const generalLeft = general - usedOnGeneral;

  return Math.floor(
    residentialLeft * ASSET_RATE.residential + generalLeft * ASSET_RATE.general
  );
}

/** 보증금을 연 4%로 월차임 환산. 원 단위 절사. */
export function depositToMonthlyRent(depositWon: number): number {
  return Math.floor((safe(depositWon) * DEPOSIT_YEARLY_RATE) / 12);
}

export function calcHousing(input: HousingInput): HousingResult {
  const people = clampPeople(input.people);
  const region = regionOf(input.regionKey);

  const income = safe(input.incomeWon);
  const evaluatedIncome = input.earned
    ? Math.floor(income * (1 - EARNED_INCOME_DEDUCTION))
    : income;

  // 자가 가구는 임차보증금이 없다 — 재산 환산에도 월세 계산에도 넣지 않는다.
  const deposit = input.renter ? safe(input.depositWon) : 0;
  const rent = input.renter ? safe(input.rentWon) : 0;

  const assetIncome = assetToIncome(deposit, input.assetWon, region.basicAsset);
  const recognizedIncome = evaluatedIncome + assetIncome;

  const median = MEDIAN_INCOME[input.year][people - 1];
  const medianPercent = Math.round((recognizedIncome / median) * 1000) / 10;

  const housingLine = selectionLine(input.year, people, 'housing');
  const livingLine = selectionLine(input.year, people, 'living');
  const eligible = recognizedIncome <= housingLine;

  const cap = rentCap(input.year, people, input.gradeOverride ?? region.grade);
  const depositRent = depositToMonthlyRent(deposit);
  const actualRent = rent + depositRent;

  const selfPay =
    recognizedIncome <= livingLine
      ? 0
      : Math.floor((recognizedIncome - livingLine) * SELF_PAY_RATE);

  const base = Math.min(actualRent, cap);
  const cappedByMultiple = input.renter && actualRent > cap * RENT_CAP_MULTIPLE;

  let payout = 0;
  let liftedToMin = false;

  if (!eligible || !input.renter) {
    // 자격이 없거나 자가 가구면 임차급여는 0이다(자가는 수선유지급여 대상).
    payout = 0;
  } else if (cappedByMultiple) {
    payout = MIN_PAYOUT;
  } else {
    const raw = base - selfPay;
    if (raw < MIN_PAYOUT) {
      payout = MIN_PAYOUT;
      liftedToMin = true;
    } else {
      // 고시 제7조④ — 1원 단위에서 올림해 10원 단위로 지급한다.
      payout = Math.ceil(raw / PAYOUT_UNIT) * PAYOUT_UNIT;
    }
  }

  return {
    evaluatedIncome,
    assetIncome,
    recognizedIncome,
    medianPercent,
    housingLine,
    livingLine,
    eligible,
    cap,
    actualRent,
    depositRent,
    base,
    selfPay,
    payout,
    cappedByMultiple,
    liftedToMin,
  };
}

/** 같은 소득인정액으로 생계·의료·주거·교육 각각이 되는지 */
export function benefitLines(
  year: Year,
  people: number,
  recognizedIncome: number
): BenefitLine[] {
  return (Object.keys(BENEFIT_RATE) as BenefitKind[]).map((kind) => {
    const line = selectionLine(year, people, kind);
    return {
      kind,
      label: BENEFIT_LABEL[kind],
      rate: BENEFIT_RATE[kind],
      line,
      eligible: recognizedIncome <= line,
    };
  });
}

/** 리워드 덤 — 같은 입력으로 1~4급지를 전부 비교한다 */
export interface GradeRow {
  grade: 1 | 2 | 3 | 4;
  cap: number;
  payout: number;
}

export function compareGrades(input: HousingInput): GradeRow[] {
  // 급지만 갈아끼운다. 지역(=기본재산액 공제)은 그대로라 재산 환산이 흔들리지 않고,
  // 표에 남는 차이가 순수하게 「급지 때문에 생긴 차이」가 된다.
  return ([1, 2, 3, 4] as const).map((grade) => {
    const r = calcHousing({ ...input, gradeOverride: grade });
    return { grade, cap: r.cap, payout: r.payout };
  });
}
