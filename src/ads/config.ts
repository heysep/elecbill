/**
 * 토스 개발자 콘솔에서 발급받는 광고 그룹 ID.
 *
 * ⚠️ 기본값을 코드에 박는다. `.env`는 `.gitignore` 대상이라 값이 없는 머신에서 빌드하면
 * 빈 문자열이 되고, 광고 로직이 조용히 건너뛰어진다 — 빌드는 성공하고 노출만 0이 된다.
 * 광고 그룹 ID는 번들에 실려 나가는 공개 식별자라 숨길 것이 없다.
 * 환경변수는 테스트용 ID로 갈아끼울 때만 쓴다.
 */
export const AD_GROUP_ID =
  (import.meta.env.VITE_AD_GROUP_ID as string | undefined) || 'ait.v2.live.fc19a998937b4e2a';

/** 리워드(보상형) 광고 그룹 ID. 미발급이면 canShowRewarded()가 false라 버튼을 안 그린다. */
export const REWARDED_AD_ID =
  (import.meta.env.VITE_REWARDED_AD_ID as string | undefined) || 'ait.v2.live.6f8a4d2fa33a480d';

/** 전면 광고 그룹 ID — 결과를 가리지 않는 전환에만. */
export const FULLSCREEN_AD_ID =
  (import.meta.env.VITE_FULLSCREEN_AD_ID as string | undefined) || 'ait.v2.live.574c2086c21e430c';
