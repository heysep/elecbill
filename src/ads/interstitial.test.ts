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
    const body = src.match(/export function bumpInterstitial\([\s\S]*?\n\}/)?.[0] ?? '';
    expect(body, 'bumpInterstitial 을 못 찾았다').not.toBe('');
    expect(body, '가드가 bumpInterstitial 안에 걸려 있지 않다').toMatch(/sessionStartedAt/);
  });

  it('문턱 비교가 >= 다 — 건너뛴 세션이 영영 못 띄우지 않는다', () => {
    const src = read('./interstitial.ts');
    expect(src).not.toMatch(/actionCount !== threshold/);
    expect(src).toMatch(/actionCount < threshold/);
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
    const calls = [...src.matchAll(/bumpInterstitial\(/g)];
    expect(calls.length, '전면 트리거가 사라졌다').toBeGreaterThan(0);
  });

  it('마운트 useEffect 에서 광고를 부르지 않는다', () => {
    const src = read('../App.tsx');
    const effects = [
      ...src.matchAll(/useEffect\(\s*\(\)\s*=>\s*\{([\s\S]*?)\},\s*\[[^\]]*\]\s*\)/g),
    ];
    expect(effects.length, 'useEffect 를 못 찾았다 — 정규식이 코드 모양과 안 맞는다').toBeGreaterThan(
      0,
    );
    for (const [, body] of effects) {
      expect(body, 'effect 에서 광고를 부르면 첫 페인트 전에 실행된다').not.toMatch(
        /bumpInterstitial\(|showRewarded\(/,
      );
    }
  });
});
