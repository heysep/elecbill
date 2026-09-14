import { defineConfig } from '@apps-in-toss/web-framework/config';

export default defineConfig({
  // 슬롯 식별자다. 앱 주제가 바뀌어도 이 값은 바꾸지 않는다(딥링크 intoss://elecbill).
  // src/config.ts 의 APP_NAME 과 문자 단위 동일.
  appName: 'elecbill',

  brand: {
    displayName: '주거급여 계산기',
    primaryColor: '#0E8A6E',
    icon: 'https://static.toss.im/appsintoss/61245/3bd3ddb3-301c-4d35-971c-37bb62cf8602.png',
  },

  permissions: [],
  webBundleDir: 'dist'
});
