import { describe, expect, it } from 'vitest';
import {
  assetToIncome,
  benefitLines,
  calcHousing,
  compareGrades,
  depositToMonthlyRent,
  type HousingInput,
} from './housing';
import {
  MIN_PAYOUT,
  rentCap,
  regionOf,
  selectionLine,
} from './constants';

const base: HousingInput = {
  year: 2026,
  people: 1,
  incomeWon: 900_000,
  earned: true,
  assetWon: 0,
  regionKey: 'seoul',
  renter: true,
  rentWon: 350_000,
  depositWon: 3_000_000,
};

const at = (over: Partial<HousingInput> = {}) => calcHousing({ ...base, ...over });

describe('소득평가액', () => {
  it('근로·사업소득이면 30%를 공제한다', () => {
    expect(at({ incomeWon: 1_000_000, earned: true }).evaluatedIncome).toBe(700_000);
  });

  it('근로소득이 아니면 공제하지 않는다', () => {
    expect(at({ incomeWon: 1_000_000, earned: false }).evaluatedIncome).toBe(1_000_000);
  });

  it('소득 0이면 소득평가액도 0', () => {
    expect(at({ incomeWon: 0 }).evaluatedIncome).toBe(0);
  });

  it('음수 소득은 0으로 눌린다 — 화면에 음수가 새지 않는다', () => {
    const r = at({ incomeWon: -500_000 });
    expect(r.evaluatedIncome).toBe(0);
    expect(r.recognizedIncome).toBe(0);
  });

  it('NaN 입력에도 숫자가 나온다', () => {
    const r = at({ incomeWon: Number.NaN, assetWon: Number.NaN, rentWon: Number.NaN });
    expect(Number.isFinite(r.recognizedIncome)).toBe(true);
    expect(Number.isFinite(r.payout)).toBe(true);
  });
});

describe('재산의 소득환산액', () => {
  const seoulDeduction = regionOf('seoul').basicAsset; // 1억 900만원

  it('재산이 기본재산액 이하면 환산액 0', () => {
    expect(assetToIncome(0, seoulDeduction, seoulDeduction)).toBe(0);
  });

  it('기본재산액을 넘는 일반재산에만 월 4.17%가 붙는다', () => {
    const over = 10_000_000;
    expect(assetToIncome(0, seoulDeduction + over, seoulDeduction)).toBe(
      Math.floor(over * 0.0417),
    );
  });

  it('공제는 주거용(보증금) 먼저 쓰고 남은 만큼만 일반재산에 간다', () => {
    // 보증금이 공제를 다 먹으면 일반재산은 전액이 4.17% 대상이 된다.
    const asset = 5_000_000;
    expect(assetToIncome(seoulDeduction, asset, seoulDeduction)).toBe(
      Math.floor(asset * 0.0417),
    );
  });

  it('공제를 넘는 보증금에는 주거용 환산율 1.04%가 붙는다', () => {
    const over = 20_000_000;
    expect(assetToIncome(seoulDeduction + over, 0, seoulDeduction)).toBe(
      Math.floor(over * 0.0104),
    );
  });

  it('음수 재산은 0으로 본다', () => {
    expect(assetToIncome(-1, -1, seoulDeduction)).toBe(0);
  });

  it('자가 가구는 보증금을 재산에서 뺀다', () => {
    const r = at({ renter: false, depositWon: 900_000_000 });
    expect(r.assetIncome).toBe(0);
  });
});

describe('보증금 월환산', () => {
  it('연 4%를 12로 나눈다', () => {
    expect(depositToMonthlyRent(30_000_000)).toBe(Math.floor((30_000_000 * 0.04) / 12));
    expect(depositToMonthlyRent(30_000_000)).toBe(100_000);
  });

  it('보증금 0이면 0', () => {
    expect(depositToMonthlyRent(0)).toBe(0);
  });

  it('실제임차료 = 월세 + 보증금 월환산', () => {
    const r = at({ rentWon: 400_000, depositWon: 30_000_000 });
    expect(r.depositRent).toBe(100_000);
    expect(r.actualRent).toBe(500_000);
  });
});

describe('자격 판정', () => {
  it('소득인정액이 주거급여 선정기준과 같으면 자격이 있다 (이하)', () => {
    const line = selectionLine(2026, 1, 'housing');
    const r = at({ incomeWon: line, earned: false });
    expect(r.recognizedIncome).toBe(line);
    expect(r.eligible).toBe(true);
  });

  it('1원만 넘어도 자격이 없다', () => {
    const line = selectionLine(2026, 1, 'housing');
    const r = at({ incomeWon: line + 1, earned: false });
    expect(r.eligible).toBe(false);
    expect(r.payout).toBe(0);
  });

  it('기준 중위소득 대비 %가 맞는다', () => {
    const r = at({ incomeWon: 1_282_119, earned: false, depositWon: 0 });
    // 2026년 1인 중위 2,564,238의 정확히 50%
    expect(r.medianPercent).toBe(50);
  });
});

describe('지원액 산정', () => {
  it('실제임차료가 기준임대료보다 작으면 실제임차료가 바탕이 된다', () => {
    const r = at({ rentWon: 200_000, depositWon: 0 });
    expect(r.cap).toBe(rentCap(2026, 1, 1)); // 369,000
    expect(r.base).toBe(200_000);
  });

  it('실제임차료가 기준임대료를 넘으면 기준임대료가 상한이다', () => {
    const r = at({ rentWon: 900_000, depositWon: 0 });
    expect(r.base).toBe(369_000);
  });

  it('소득인정액이 생계급여 선정기준 이하면 자기부담분이 0이다', () => {
    const living = selectionLine(2026, 1, 'living');
    const r = at({ incomeWon: living, earned: false, depositWon: 0 });
    expect(r.selfPay).toBe(0);
    expect(r.payout).toBe(Math.min(r.actualRent, r.cap));
  });

  it('생계기준 초과분의 30%가 자기부담분이다', () => {
    const living = selectionLine(2026, 1, 'living');
    const over = 100_000;
    const r = at({ incomeWon: living + over, earned: false, depositWon: 0, rentWon: 350_000 });
    expect(r.selfPay).toBe(Math.floor(over * 0.3));
    expect(r.payout).toBe(350_000 - Math.floor(over * 0.3));
  });

  it('지급액은 10원 단위로 올림한다 (고시 제7조④)', () => {
    // 1원 단위가 남는 자기부담분을 만든다: 초과분 3,457원 × 30% = 1,037.1 → 1,037
    const living = selectionLine(2026, 1, 'living');
    const r = at({
      incomeWon: living + 3_457,
      earned: false,
      depositWon: 0,
      rentWon: 350_000,
    });
    expect(r.selfPay).toBe(1_037);
    // 350,000 − 1,037 = 348,963 → 10원 단위 올림 → 348,970
    expect(r.payout).toBe(348_970);
    expect(r.payout % 10).toBe(0);
  });

  it('어떤 조합에서도 지급액이 10원 단위다', () => {
    for (const extra of [0, 1, 7, 13, 999, 12_345]) {
      const living = selectionLine(2026, 1, 'living');
      const r = at({ incomeWon: living + extra, earned: false, depositWon: 0, rentWon: 350_000 });
      expect(r.payout % 10, `초과분 ${extra}`).toBe(0);
    }
  });

  it('산정액이 1만원 미만이면 최저지급액 1만원으로 올라간다', () => {
    // 주거급여 자격선 바로 아래까지 소득을 올리면 자기부담분이 임차료를 거의 다 먹는다.
    const r = at({
      incomeWon: selectionLine(2026, 1, 'housing'),
      earned: false,
      depositWon: 0,
      rentWon: 30_000,
    });
    expect(r.eligible).toBe(true);
    expect(r.payout).toBe(MIN_PAYOUT);
    expect(r.liftedToMin).toBe(true);
  });

  it('실제임차료가 기준임대료의 5배를 넘으면 최저지급액만 나온다', () => {
    const cap = rentCap(2026, 1, 1);
    const r = at({ incomeWon: 0, rentWon: cap * 5 + 1, depositWon: 0 });
    expect(r.cappedByMultiple).toBe(true);
    expect(r.payout).toBe(MIN_PAYOUT);
  });

  it('5배 경계값(정확히 5배)은 정상 지급이다', () => {
    const cap = rentCap(2026, 1, 1);
    const r = at({ incomeWon: 0, rentWon: cap * 5, depositWon: 0 });
    expect(r.cappedByMultiple).toBe(false);
    expect(r.payout).toBe(cap);
  });

  it('자가 가구는 임차급여가 0이다', () => {
    expect(at({ renter: false }).payout).toBe(0);
  });

  it('월세 0·보증금 0이면 지원액도 0이다 (임차료가 없으니 줄 것이 없다)', () => {
    // base 0 − 자기부담분 0 = 0 → 최저지급액 규정으로 1만원이 된다.
    const r = at({ incomeWon: 0, rentWon: 0, depositWon: 0 });
    expect(r.base).toBe(0);
    expect(r.payout).toBe(MIN_PAYOUT);
  });

  it('지원액이 기준임대료를 절대 넘지 않는다', () => {
    for (let p = 1; p <= 6; p++) {
      for (const income of [0, 500_000, 2_000_000]) {
        const r = at({ people: p, incomeWon: income, rentWon: 5_000_000, depositWon: 0 });
        expect(r.payout).toBeLessThanOrEqual(Math.max(r.cap, MIN_PAYOUT));
      }
    }
  });

  it('지원액은 절대 음수가 아니다 (전 조합 훑기)', () => {
    for (const year of [2026, 2027] as const) {
      for (let p = 1; p <= 6; p++) {
        for (const key of ['seoul', 'gyeonggi', 'incheon', 'metro', 'etc'] as const) {
          for (const income of [0, 1_000_000, 3_000_000, 9_999_999]) {
            for (const rent of [0, 350_000, 3_000_000]) {
              const r = at({ year, people: p, regionKey: key, incomeWon: income, rentWon: rent });
              expect(r.payout).toBeGreaterThanOrEqual(0);
              expect(Number.isFinite(r.payout)).toBe(true);
              expect(Number.isFinite(r.medianPercent)).toBe(true);
            }
          }
        }
      }
    }
  });
});

describe('가구원 수 방어', () => {
  it('범위를 벗어난 가구원 수는 1~6으로 눌린다', () => {
    expect(at({ people: 0 }).cap).toBe(rentCap(2026, 1, 1));
    expect(at({ people: 99 }).cap).toBe(rentCap(2026, 6, 1));
    expect(Number.isFinite(at({ people: Number.NaN }).payout)).toBe(true);
  });
});

describe('다른 급여 판정', () => {
  it('소득인정액이 낮으면 네 급여가 전부 된다', () => {
    const lines = benefitLines(2026, 1, 0);
    expect(lines.every((l) => l.eligible)).toBe(true);
    expect(lines).toHaveLength(4);
  });

  it('생계는 안 되고 주거·교육은 되는 구간이 있다', () => {
    const income = selectionLine(2026, 1, 'housing');
    const lines = benefitLines(2026, 1, income);
    const by = Object.fromEntries(lines.map((l) => [l.kind, l.eligible]));
    expect(by.living).toBe(false);
    expect(by.medical).toBe(false);
    expect(by.housing).toBe(true);
    expect(by.education).toBe(true);
  });
});

describe('급지 비교(리워드 덤)', () => {
  it('1~4급지 네 줄이 나오고 급지가 낮을수록 상한이 작다', () => {
    const rows = compareGrades({ ...base, rentWon: 900_000 });
    expect(rows).toHaveLength(4);
    expect(rows.map((r) => r.grade)).toEqual([1, 2, 3, 4]);
    for (let i = 1; i < 4; i++) expect(rows[i].cap).toBeLessThan(rows[i - 1].cap);
  });

  it('사용자가 고른 급지의 줄은 실제 결과와 같다', () => {
    const input = { ...base, regionKey: 'metro' as const };
    const mine = calcHousing(input);
    const row = compareGrades(input).find((r) => r.grade === 3);
    expect(row?.cap).toBe(mine.cap);
    expect(row?.payout).toBe(mine.payout);
  });
});
