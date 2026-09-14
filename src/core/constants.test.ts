import { describe, expect, it } from 'vitest';
import {
  MEDIAN_INCOME,
  MAX_PEOPLE,
  RENT_CAP,
  RENT_CAP_DELTA_2027,
  REGIONS,
  selectionLine,
  YEARS,
} from './constants';

/**
 * 이 앱의 값어치는 전부 숫자에 있다. 그래서 상수를 「출처에 적힌 그대로」 다시 적어 대조한다.
 * 아래 표는 보건복지부 보도자료(2026-07-28) 첨부 PDF 를 그대로 옮긴 것이다.
 *   본문: https://www.korea.kr/briefing/pressReleaseView.do?newsId=156772464
 *   PDF : https://www.korea.kr/common/download.do?fileId=198516484&tblKey=GMN
 * 5쪽 <2026년도 및 2027년도 기준 중위소득>, 6쪽 <급여별 선정기준>, 7쪽 <2027년도 기준임대료>.
 *
 * 상수 파일이 표를 계산으로 줄여 놓았기 때문에(선정기준 = round(중위 × 비율)),
 * 그 줄임이 발표값과 어긋나는 순간을 여기서 잡아야 한다.
 */

/** PDF 5쪽 표의 「증가액('27년-'26년)」 행 */
const PUBLISHED_DELTA = [171_804, 281_353, 359_055, 435_147, 506_300, 573_249];

/** PDF 6쪽 <2026년도 및 2027년도 급여별 선정기준> 전체 48칸 */
const PUBLISHED_SELECTION = {
  living: {
    2026: [820_556, 1_343_773, 1_714_892, 2_078_316, 2_418_150, 2_737_905],
    2027: [875_533, 1_433_806, 1_829_789, 2_217_563, 2_580_166, 2_921_344],
  },
  medical: {
    2026: [1_025_695, 1_679_717, 2_143_614, 2_597_895, 3_022_688, 3_422_381],
    2027: [1_094_417, 1_792_258, 2_287_236, 2_771_954, 3_225_208, 3_651_680],
  },
  housing: {
    2026: [1_230_834, 2_015_660, 2_572_337, 3_117_474, 3_627_225, 4_106_857],
    2027: [1_313_300, 2_150_710, 2_744_684, 3_326_345, 3_870_249, 4_382_016],
  },
  education: {
    2026: [1_282_119, 2_099_646, 2_679_518, 3_247_369, 3_778_360, 4_277_976],
    2027: [1_368_021, 2_240_323, 2_859_046, 3_464_943, 4_031_510, 4_564_601],
  },
} as const;

describe('기준 중위소득', () => {
  it('연도마다 1~6인 여섯 칸이 다 있다', () => {
    for (const year of YEARS) {
      expect(MEDIAN_INCOME[year]).toHaveLength(MAX_PEOPLE);
      for (const v of MEDIAN_INCOME[year]) expect(v).toBeGreaterThan(0);
    }
  });

  it('2027년 = round(2026년 × 1.067) — 발표된 6.70% 인상률과 맞는다', () => {
    for (let i = 0; i < MAX_PEOPLE; i++) {
      expect(MEDIAN_INCOME[2027][i]).toBe(Math.round(MEDIAN_INCOME[2026][i] * 1.067));
    }
  });

  it('보도자료가 함께 실은 증가액과 원 단위까지 맞는다', () => {
    for (let i = 0; i < MAX_PEOPLE; i++) {
      expect(MEDIAN_INCOME[2027][i] - MEDIAN_INCOME[2026][i]).toBe(PUBLISHED_DELTA[i]);
    }
  });

  it('가구원이 늘수록 커진다', () => {
    for (const year of YEARS) {
      for (let i = 1; i < MAX_PEOPLE; i++) {
        expect(MEDIAN_INCOME[year][i]).toBeGreaterThan(MEDIAN_INCOME[year][i - 1]);
      }
    }
  });
});

describe('급여별 선정기준', () => {
  it('계산값이 발표된 48칸과 원 단위까지 같다', () => {
    for (const kind of ['living', 'medical', 'housing', 'education'] as const) {
      for (const year of YEARS) {
        const published = PUBLISHED_SELECTION[kind][year];
        for (let i = 0; i < MAX_PEOPLE; i++) {
          expect(
            selectionLine(year, i + 1, kind),
            `${year} ${kind} ${i + 1}인`,
          ).toBe(published[i]);
        }
      }
    }
  });

  it('생계 < 의료 < 주거 < 교육 순으로 넓어진다', () => {
    for (const year of YEARS) {
      for (let p = 1; p <= MAX_PEOPLE; p++) {
        const l = selectionLine(year, p, 'living');
        const m = selectionLine(year, p, 'medical');
        const h = selectionLine(year, p, 'housing');
        const e = selectionLine(year, p, 'education');
        expect(l).toBeLessThan(m);
        expect(m).toBeLessThan(h);
        expect(h).toBeLessThan(e);
      }
    }
  });
});

describe('기준임대료', () => {
  it('연도마다 6인 × 4급지 스물네 칸이 다 있다', () => {
    for (const year of YEARS) {
      expect(RENT_CAP[year]).toHaveLength(MAX_PEOPLE);
      for (const row of RENT_CAP[year]) {
        expect(row).toHaveLength(4);
        for (const v of row) expect(v).toBeGreaterThan(0);
      }
    }
  });

  it('2027년 값 = 2026년 값 + 보도자료의 증가액 (24칸 전수)', () => {
    for (let p = 0; p < MAX_PEOPLE; p++) {
      for (let g = 0; g < 4; g++) {
        expect(RENT_CAP[2027][p][g], `${p + 1}인 ${g + 1}급지`).toBe(
          RENT_CAP[2026][p][g] + RENT_CAP_DELTA_2027[p][g],
        );
      }
    }
  });

  it('증가액이 발표문의 「1만 2천 원 ~ 5만 원」 범위 안이다', () => {
    const all = RENT_CAP_DELTA_2027.flat();
    expect(Math.min(...all)).toBe(12_000);
    expect(Math.max(...all)).toBe(50_000);
  });

  it('같은 가구원 수면 급지가 낮을수록 상한이 작다', () => {
    for (const year of YEARS) {
      for (const row of RENT_CAP[year]) {
        for (let g = 1; g < 4; g++) expect(row[g]).toBeLessThan(row[g - 1]);
      }
    }
  });

  it('같은 급지면 가구원이 늘수록 상한이 커진다', () => {
    for (const year of YEARS) {
      for (let g = 0; g < 4; g++) {
        for (let p = 1; p < MAX_PEOPLE; p++) {
          expect(RENT_CAP[year][p][g]).toBeGreaterThan(RENT_CAP[year][p - 1][g]);
        }
      }
    }
  });
});

describe('지역', () => {
  it('1~4급지가 모두 한 번 이상 쓰인다', () => {
    const grades = new Set(REGIONS.map((r) => r.grade));
    expect([...grades].sort()).toEqual([1, 2, 3, 4]);
  });

  it('기본재산액이 전부 양수다', () => {
    for (const r of REGIONS) expect(r.basicAsset).toBeGreaterThan(0);
  });
});
