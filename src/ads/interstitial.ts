import { loadFullScreenAd, showFullScreenAd } from '@apps-in-toss/web-framework';
import { FULLSCREEN_AD_ID } from './config';

/**
 * 토스 전면(영상) 광고.
 * ID 미발급/미지원/실패는 전부 흡수 — 광고 없이 그대로 진행한다.
 *
 * 빈도 정책: 사용자가 직접 누른 전환 N회째부터 1번, 세션당 최대 1회.
 * 진입 즉시 전면광고는 이탈·심사 리스크가 커서 쓰지 않는다.
 */
// config.ts 의 기본값을 쓴다. 여기서 env 를 다시 읽으면 config 에 ID 를 박아 두어도
// 이 파일만 빈 문자열이 되어 전면광고가 조용히 사라진다.
const FS_AD_ID = FULLSCREEN_AD_ID;
const SESSION_CAP = 1;

/**
 * 진입 직후 노출을 막는 시간 안전판.
 * 액션 문턱만으로는 "열자마자 빠르게 두 번 누르는" 사람을 못 막는다 —
 * 같은 워크스페이스의 청년미래적금이 그 형태로 반려됐다(심사건 20260812-7).
 * 도구형 미니앱은 세션이 짧아 60초를 강제하면 전면이 거의 안 뜨므로,
 * 도달 경로는 문턱이 정하고 시간은 진입 직후만 잘라내는 하한으로 짧게 둔다.
 */
const MIN_MS_IN_SESSION = 8_000;

const sessionStartedAt = Date.now();
let shownCount = 0;
let actionCount = 0;

function play(): void {
  if (!FS_AD_ID) return;
  try {
    loadFullScreenAd({
      options: { adGroupId: FS_AD_ID },
      onEvent: (e) => {
        if (e.type === 'loaded') {
          try {
            showFullScreenAd({
              options: { adGroupId: FS_AD_ID },
              onEvent: () => {},
              onError: (err) => console.error(err),
            });
          } catch (err) {
            console.error(err);
          }
        }
      },
      onError: (err) => console.error(err),
    });
  } catch (err) {
    console.error(err);
  }
}

/**
 * 능동 액션마다 호출 — threshold회째부터 전면광고 1번(세션 캡 적용).
 *
 * `!==` 였던 것을 `>=` 로 바꾼다. 한 상호작용이 bump 를 두 번 부르면 카운터가 문턱을
 * 건너뛰어 그 세션은 전면광고를 영영 못 띄웠다. 노출 빈도는 그대로고 건너뜀만 막는다.
 *
 * 가드에 걸린 액션은 버리지 않고 카운트만 남긴다 — 버리면 문턱을 넘긴 세션이 영영 못 띄운다.
 */
export function bumpInterstitial(threshold: number): void {
  actionCount++;
  if (shownCount >= SESSION_CAP || actionCount < threshold) return;
  if (Date.now() - sessionStartedAt < MIN_MS_IN_SESSION) return;
  shownCount++;
  play();
}
