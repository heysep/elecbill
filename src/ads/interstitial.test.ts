import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * 광고 배선의 계약을 소스 수준에서 고정한다. 이 레포는 스캐폴드에서 복제된
 * 공통 템플릿을 쓰는데, 그 템플릿에 세 가지 결함이 있었다(2026-09-01 수리).
 *
 *  ① `interstitial.ts` 가 config 를 안 거치고 `import.meta.env` 를 다시 읽었다.
 *     config 에 ID 를 박아도 이 파일만 빈 문자열이 되어 전면광고가 통째로 no-op 이다.
 *  ② 진입 직후 시간 가드가 없었다. 액션 문턱만으로는 "열자마자 빠르게 누르는" 사람을
 *     못 막고, 그게 청년미래적금이 반려된 형태다(20260812-7).
 *  ③ 문턱 비교가 `!==` 라, 한 상호작용이 bump 를 두 번 부르면 그 세션은 영영 못 띄웠다.
 */
const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8');

describe('광고 ID', () => {
  it('config 의 ID 3종에 코드 기본값이 있다 — .env 없는 머신에서도 살아남는다', () => {
    const src = read('./config.ts');
    for (const name of ['AD_GROUP_ID', 'REWARDED_AD_ID', 'FULLSCREEN_AD_ID']) {
      const line = src.split('\n').find((l) => l.includes(`export const ${name}`)) ?? '';
      expect(line, `${name} 선언을 못 찾았다`).not.toBe('');
      const decl = src.slice(src.indexOf(`export const ${name}`)).split(';')[0];
      expect(decl, `${name} 에 기본값이 없다 — .env 없는 빌드에서 광고가 사라진다`).toMatch(
        /\|\|\s*'ait\./,
      );
    }
  });

  it('interstitial 이 env 를 다시 읽지 않는다', () => {
    const src = read('./interstitial.ts');
    expect(src).not.toMatch(/import\.meta\.env/);
    expect(src).toMatch(/import \{ FULLSCREEN_AD_ID \} from '\.\/config'/);
  });
});

describe('전면광고 노출 조건', () => {
  it('진입 직후 시간 가드가 있다', () => {
    const src = read('./interstitial.ts');
    expect(src, '진입 가드가 없다 — 「접속 직후 노출」 반려 형태다').toMatch(/MIN_MS_IN_SESSION/);
    const body = src.match(/export function bumpInterstitialSettled\([\s\S]*?\n\}/)?.[0] ?? '';
    expect(body, 'bumpInterstitialSettled 를 못 찾았다').not.toBe('');
    expect(body, '가드가 bumpInterstitialSettled 안에 걸려 있지 않다').toMatch(/sessionStartedAt/);
  });

  it('문턱 비교가 >= 다 — 건너뛴 세션이 영영 못 띄우지 않는다', () => {
    const src = read('./interstitial.ts');
    expect(src).not.toMatch(/settledCount !== threshold/);
    expect(src).toMatch(/settledCount < threshold/);
  });

  it('세션당 1회 캡이 살아 있다', () => {
    const src = read('./interstitial.ts');
    expect(src).toMatch(/SESSION_CAP = 1/);
    expect(src).toMatch(/shownCount >= SESSION_CAP/);
  });
});

describe('호출부', () => {
  it('전면 트리거가 남아 있다 — 지우면 지면이 23일 뒤 삭제된다', () => {
    const src = read('../App.tsx');
    const calls = [...src.matchAll(/bumpInterstitialSettled\(/g)];
    expect(calls.length, '전면 트리거가 사라졌다').toBeGreaterThan(0);
  });

  /**
   * 이 앱은 버튼이 아니라 슬라이더로 값을 바꾼다. 그래서 「정착(debounce)한 뒤 1회」로 세는데,
   * 그 타이머는 입력값을 보는 useEffect 안에 있을 수밖에 없다. 그 대신 두 가지를 강제한다:
   *   ① 호출이 반드시 setTimeout 뒤에 있을 것 — 첫 페인트를 막지 않는다.
   *   ② 첫 렌더는 건너뛸 것 — effect 는 마운트 때 한 번 돌기 때문에, 안 건너뛰면
   *      사용자가 아무것도 안 했는데 정착 1회가 공짜로 세어진다.
   */
  it('전면 호출이 setTimeout 뒤에 있고 첫 렌더를 건너뛴다', () => {
    const src = read('../App.tsx');
    const effects = [
      ...src.matchAll(/useEffect\(\s*\(\)\s*=>\s*\{([\s\S]*?)\},\s*\[[^\]]*\]\s*\)/g),
    ];
    expect(effects.length, 'useEffect 를 못 찾았다 — 정규식이 코드 모양과 안 맞는다').toBeGreaterThan(
      0,
    );
    let found = 0;
    for (const [, body] of effects) {
      if (!/bumpInterstitialSettled\(/.test(body)) {
        expect(body, 'effect 안에서 리워드를 즉시 부르면 안 된다').not.toMatch(/showRewarded\(/);
        continue;
      }
      found++;
      expect(body, '전면 호출이 setTimeout 안에 없다 — 첫 페인트 전에 실행된다').toMatch(
        /setTimeout\(/,
      );
      expect(body, '타이머 정리(clearTimeout)가 없다 — 드래그 중에도 광고가 뜬다').toMatch(
        /clearTimeout\(/,
      );
      expect(body, '첫 렌더 건너뛰기 가드가 없다 — 아무것도 안 해도 1회가 세어진다').toMatch(
        /settledOnceRef|firstRunRef|skipFirst/,
      );
    }
    expect(found, '정착 기반 전면 트리거 effect 를 못 찾았다').toBe(1);
  });
});
