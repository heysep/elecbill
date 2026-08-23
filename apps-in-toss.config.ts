import { defineConfig } from '@apps-in-toss/web-framework/config';

export default defineConfig({
  // src/config.ts APP_NAME과 문자 단위 동일. 딥링크 intoss://elecbill.
  appName: 'elecbill',

  brand: {
    primaryColor: '#E8611A',
  },

  permissions: [],
  webBundleDir: 'dist'
});
