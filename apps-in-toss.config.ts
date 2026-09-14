import { defineConfig } from '@apps-in-toss/web-framework/config';

export default defineConfig({
  // 슬롯 식별자다. 앱 주제가 바뀌어도 이 값은 바꾸지 않는다(딥링크 intoss://elecbill).
  // src/config.ts 의 APP_NAME 과 문자 단위 동일.
  appName: 'elecbill',

  brand: {
    displayName: '주거급여 계산기',
    primaryColor: '#0E8A6E',
    icon: 'https://static.toss.im/appsintoss/61245/f04ed42f-8249-41d5-ae45-5ea445fc8320.png',
  },

  permissions: [],
  webBundleDir: 'dist'
});
