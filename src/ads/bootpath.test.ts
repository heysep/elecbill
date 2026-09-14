import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * 부팅 경로 광고 금지 — 이 워크스페이스에서 심사 반려를 3번 낸 사유다.
 * 반려 문구: "미니앱 최초 접속 시간이 20초를 초과하여 로딩 성능 개선이 필요해요."
 *
 * 실측된 사유는 **호출 시점**이지 import 가 아니다:
 *   - 적금 메이트 20260815-19 : main.tsx 가 createRoot **앞에서** initAds() 동기 호출
 *   - 세금 달력 / 연봉 실수령액 : App mount useEffect 에서 preloadInterstitial() 즉시 호출
 *
 * 그래서 두 층으로 나눠 잰다. import 자체를 금지하면 배너를 정상적으로 단 앱까지
 * 불통이 된다 — 실제로 심사를 통과해 라이브인 「대출 갚기 플랜」이 그 형태다.
 */

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8');

/** 광고 SDK 를 실제로 «부르는» 것들. import 구문은 여기 안 걸린다. */
const AD_CALL =
  /\b(initAds|preloadInterstitial|loadFullScreenAd|showFullScreenAd|bumpInterstitialSettled|bumpInterstitial|showRewarded|TossAds)\s*\(/;

describe('부팅 경로 광고 금지', () => {
  it('main.tsx 에는 광고 참조가 아예 없다', () => {
    // 부트스트랩 파일은 작다. 여기는 엄격해도 비용이 없고, 반려 3건 중 1건이 여기였다.
    const src = read('../main.tsx');
    expect(src).not.toMatch(/from\s+['"][^'"]*\/ads\//);
    expect(src).not.toMatch(AD_CALL);
  });

  it('App.tsx 모듈 최상위에서 광고를 부르지 않는다', () => {
    // 들여쓰기 없는 줄 = 모듈 스코프. 그 줄에서 광고를 부르면 첫 페인트 전에 실행된다.
    const offenders = read('../App.tsx')
      .split('\n')
      .filter((line) => !/^\s/.test(line) && AD_CALL.test(line));
    expect(offenders, `모듈 최상위 광고 호출: ${offenders.join(' / ')}`).toHaveLength(0);
  });

  it('useEffect 안에서 광고를 즉시 부르지 않는다', () => {
    // **모든** useEffect 를 본다. 의존성 배열이 무엇이든 effect 는 첫 렌더 뒤 한 번 돈다 —
    // []-의존성만 검사하면 [state] 짜리에 넣은 호출을 놓친다(실제로 이 테스트가 처음엔 놓쳤다).
    // 그 안에서 광고를 부르려면
    // setTimeout 으로 미뤄야 한다 — 실측: 4초 지연으로도 부족한 앱이 있어
    // 배너가 이미 있는 앱은 프리로드를 아예 빼는 게 검증된 다음 수다.
    const src = read('../App.tsx');
    const effects = [...src.matchAll(/useEffect\(\s*\(\)\s*=>\s*\{([\s\S]*?)\},\s*\[[^\]]*\]\s*\)/g)];
    expect(effects.length, 'useEffect 를 하나도 못 찾았다 — 정규식이 코드 모양과 안 맞는다').toBeGreaterThan(0);
    for (const [, body] of effects) {
      if (AD_CALL.test(body)) {
        expect(body, 'effect 안의 광고 호출은 setTimeout 으로 미뤄야 한다').toMatch(/setTimeout/);
      }
    }
  });
});
