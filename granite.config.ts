import { defineConfig } from '@apps-in-toss/web-framework/config';

export default defineConfig({
  // src/config.ts APP_NAME과 문자 단위 동일. 딥링크 intoss://elecbill.
  appName: 'elecbill',
  brand: {
    displayName: '전기요금 미리보기',
    primaryColor: '#E8611A',
    // 콘솔에 아이콘 업로드 후 발급 URL로 교체할 것 (로컬 경로 금지)
    icon: 'https://static.toss.im/appsintoss/61245/f04ed42f-8249-41d5-ae45-5ea445fc8320.png',
  },
  web: { host: 'localhost', port: 5173, commands: { dev: 'vite', build: 'vite build' } },
  permissions: [],
  outdir: 'dist',
});
