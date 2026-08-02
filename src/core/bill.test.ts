import { describe, expect, it } from 'vitest';
import { airconMonthlyKwh, calcBill, nextTierInfo, splitTiers } from './bill';

describe('splitTiers', () => {
  it('기타 계절 경계 200/400', () => {
    expect(splitTiers(200, false)).toEqual([200, 0, 0]);
    expect(splitTiers(201, false)).toEqual([200, 1, 0]);
    expect(splitTiers(400, false)).toEqual([200, 200, 0]);
    expect(splitTiers(401, false)).toEqual([200, 200, 1]);
  });

  it('하계 경계 300/450', () => {
    expect(splitTiers(300, true)).toEqual([300, 0, 0]);
    expect(splitTiers(301, true)).toEqual([300, 1, 0]);
    expect(splitTiers(450, true)).toEqual([300, 150, 0]);
    expect(splitTiers(451, true)).toEqual([300, 150, 1]);
  });
});

describe('calcBill 저압', () => {
  it('200kWh(1단계 상한): 항목별 정확 계산', () => {
    const r = calcBill({ kwh: 200, contract: 'low', summer: false });
    expect(r.tier).toBe(1);
    expect(r.baseCharge).toBe(910);
    expect(r.energyCharge).toBe(24000);
    expect(r.climateCharge).toBe(1800);
    expect(r.fuelAdjCharge).toBe(1000);
    expect(r.subtotal).toBe(27710);
    expect(r.vat).toBe(2771);
    expect(r.fund).toBe(1020);
    expect(r.total).toBe(31500);
  });

  it('201kWh: 2단계 진입, 기본요금 점프', () => {
    const r = calcBill({ kwh: 201, contract: 'low', summer: false });
    expect(r.tier).toBe(2);
    expect(r.baseCharge).toBe(1600);
    expect(r.energyCharge).toBe(24214); // 24000 + 214.6 절사
    expect(r.total).toBe(32540);
  });

  it('400→401kWh: 3단계 진입 시 기본요금 7300원', () => {
    const r400 = calcBill({ kwh: 400, contract: 'low', summer: false });
    const r401 = calcBill({ kwh: 401, contract: 'low', summer: false });
    expect(r400.tier).toBe(2);
    expect(r401.tier).toBe(3);
    expect(r401.baseCharge).toBe(7300);
    expect(r401.total).toBeGreaterThan(r400.total);
  });

  it('하계 300kWh는 1단계, 기타 계절 300kWh는 2단계 (하계가 저렴)', () => {
    const summer = calcBill({ kwh: 300, contract: 'low', summer: true });
    const normal = calcBill({ kwh: 300, contract: 'low', summer: false });
    expect(summer.tier).toBe(1);
    expect(normal.tier).toBe(2);
    expect(summer.total).toBeLessThan(normal.total);
  });

  it('하계 451kWh: 3단계 진입', () => {
    expect(calcBill({ kwh: 450, contract: 'low', summer: true }).tier).toBe(2);
    expect(calcBill({ kwh: 451, contract: 'low', summer: true }).tier).toBe(3);
  });
});

describe('calcBill 고압', () => {
  it('같은 사용량이면 고압이 저압보다 저렴', () => {
    const low = calcBill({ kwh: 350, contract: 'low', summer: false });
    const high = calcBill({ kwh: 350, contract: 'high', summer: false });
    expect(high.total).toBeLessThan(low.total);
  });

  it('고압 200kWh 단가 적용', () => {
    const r = calcBill({ kwh: 200, contract: 'high', summer: false });
    expect(r.baseCharge).toBe(730);
    expect(r.energyCharge).toBe(21000); // 200 × 105.0
  });

  it('고압 300kWh 전력량요금 = 200×105.0 + 100×174.0', () => {
    const r = calcBill({ kwh: 300, contract: 'high', summer: false });
    expect(r.energyCharge).toBe(21000 + 17400);
  });

  it('고압 401kWh 3단계 단가 242.3 적용', () => {
    const r = calcBill({ kwh: 401, contract: 'high', summer: false });
    expect(r.baseCharge).toBe(6060);
    expect(r.energyCharge).toBe(21000 + 34800 + 242); // 242.3 절사
  });
});

describe('슈퍼유저 구간', () => {
  it('하계 1000kWh 이하는 슈퍼유저 아님', () => {
    expect(calcBill({ kwh: 1000, contract: 'low', summer: true }).superKwh).toBe(0);
  });

  it('하계 1010kWh: 초과 10kWh에 736.2원 적용, 3단계와 중복 과금 안 함', () => {
    const r = calcBill({ kwh: 1010, contract: 'low', summer: true });
    expect(r.superKwh).toBe(10);
    // 300 + 150 + (1000-450) = 1000, 나머지 10kWh는 슈퍼유저
    expect(r.tierKwh).toEqual([300, 150, 550]);
    expect(r.energyCharge).toBe(
      Math.floor((300 * 1200 + 150 * 2146 + 550 * 3073 + 10 * 7362) / 10),
    );
  });

  it('기타 계절에는 슈퍼유저 구간이 없다', () => {
    const r = calcBill({ kwh: 1200, contract: 'low', summer: false });
    expect(r.superKwh).toBe(0);
    expect(r.tierKwh[2]).toBe(800);
  });
});

describe('nextTierInfo', () => {
  it('기타 계절 180kWh → 2단계까지 20kWh 남고, 넘으면 금액이 뛴다', () => {
    const info = nextTierInfo(180, 'low', false)!;
    expect(info.nextTier).toBe(2);
    expect(info.boundary).toBe(200);
    expect(info.remainKwh).toBe(20);
    expect(info.jumpWon).toBeGreaterThan(0);
  });

  it('하계는 경계가 300/450', () => {
    expect(nextTierInfo(250, 'low', true)!.boundary).toBe(300);
    expect(nextTierInfo(320, 'low', true)!.nextTier).toBe(3);
    expect(nextTierInfo(320, 'low', true)!.boundary).toBe(450);
  });

  it('이미 3단계면 null', () => {
    expect(nextTierInfo(500, 'low', false)).toBeNull();
  });
});

describe('calcBill 방어', () => {
  it('0·음수·NaN 사용량도 유한한 결과', () => {
    for (const kwh of [0, -10, Number.NaN, Number.POSITIVE_INFINITY]) {
      const r = calcBill({ kwh, contract: 'low', summer: false });
      expect(Number.isFinite(r.total)).toBe(true);
      expect(r.tier).toBe(1);
      expect(r.energyCharge).toBe(0);
    }
  });

  it('청구액은 10원 미만 절사', () => {
    const r = calcBill({ kwh: 137, contract: 'low', summer: false });
    expect(r.total % 10).toBe(0);
  });

  it('사용량 증가에 따라 청구액 단조 증가 (경계 전수)', () => {
    let prev = -1;
    for (let kwh = 0; kwh <= 800; kwh += 1) {
      const t = calcBill({ kwh, contract: 'low', summer: false }).total;
      expect(t).toBeGreaterThanOrEqual(prev);
      prev = t;
    }
  });
});

describe('airconMonthlyKwh', () => {
  it('1.8kW × 8h × 30일 = 432kWh', () => {
    expect(airconMonthlyKwh(1.8, 8)).toBe(432);
  });

  it('0·음수·NaN 입력은 0', () => {
    expect(airconMonthlyKwh(0, 5)).toBe(0);
    expect(airconMonthlyKwh(1.8, -1)).toBe(0);
    expect(airconMonthlyKwh(Number.NaN, 5)).toBe(0);
  });
});
