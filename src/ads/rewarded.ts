import { GoogleAdMob } from '@apps-in-toss/web-framework';
import { REWARDED_AD_ID } from './config';

/**
 * 토스 리워드(보상형) 영상 광고. 시청 완료 시 onReward 호출.
 * 빌드 시 VITE_REWARDED_AD_ID로 광고 그룹 ID 주입.
 * ID 미발급/미지원/실패는 흡수하고 즉시 보상 지급 → 광고 인벤 없어도 콘텐츠를 막지 않음.
 *
 * onClose는 광고 흐름이 끝났을 때(보상 여부와 무관하게) 정확히 한 번 호출된다 —
 * 보상 없이 광고를 닫아도 화면의 로딩 상태가 풀리도록 하기 위함.
 */
function evType(e: unknown): string {
  return (e as { type?: string } | null)?.type ?? '';
}

/**
 * 지금 이 환경에서 리워드 광고를 실제로 띄울 수 있는가(렌더 시점 판정).
 * 토스 앱 밖/구버전에서는 isSupported()가 동기로 throw하므로 try/catch로 감싼다.
 * false면 잠금 UI 자체를 그리지 않고 콘텐츠를 바로 연다(fail-open).
 */
export function canShowRewarded(): boolean {
  if (!REWARDED_AD_ID) return false;
  try {
    return (
      GoogleAdMob.loadAppsInTossAdMob.isSupported() === true &&
      GoogleAdMob.showAppsInTossAdMob.isSupported() === true
    );
  } catch {
    return false;
  }
}

export interface RewardedCallbacks {
  /** 보상 지급 시점(광고 시청 완료 또는 광고 없이 공개 동작) — 최대 1회. */
  onReward: () => void;
  /** 광고 흐름 종료(닫힘/실패 포함) — 최대 1회. 로딩 UI 해제용. */
  onClose?: () => void;
}

export function showRewarded({ onReward, onClose }: RewardedCallbacks): void {
  let rewarded = false;
  let closed = false;
  const grant = () => {
    if (!rewarded) {
      rewarded = true;
      onReward();
    }
  };
  const finish = () => {
    if (!closed) {
      closed = true;
      onClose?.();
    }
  };
  /** 광고를 보여줄 수 없는 상황 — 보상 지급 후 종료(콘텐츠를 막지 않음). */
  const failOpen = () => {
    grant();
    finish();
  };

  if (!REWARDED_AD_ID) {
    failOpen();
    return;
  }
  try {
    if (
      GoogleAdMob.loadAppsInTossAdMob.isSupported() !== true ||
      GoogleAdMob.showAppsInTossAdMob.isSupported() !== true
    ) {
      failOpen();
      return;
    }
    GoogleAdMob.loadAppsInTossAdMob({
      options: { adGroupId: REWARDED_AD_ID },
      onEvent: (e) => {
        if (evType(e) !== 'loaded') return;
        try {
          GoogleAdMob.showAppsInTossAdMob({
            options: { adGroupId: REWARDED_AD_ID },
            onEvent: (se) => {
              const t = evType(se);
              if (t === 'userEarnedReward') grant();
              // 보상 없이 닫으면 보상 없이 종료만 — 다시 시도할 수 있게 로딩을 푼다.
              else if (t === 'dismissed') finish();
              else if (t === 'failedToShow') failOpen();
            },
            onError: (err: unknown) => {
              console.error(err);
              failOpen();
            },
          });
        } catch (err) {
          console.error(err);
          failOpen();
        }
      },
      onError: (err: unknown) => {
        console.error(err);
        failOpen();
      },
    });
  } catch (err) {
    console.error(err);
    failOpen();
  }
}
