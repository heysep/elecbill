import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 서버 없는 단독 미니앱: 요금 계산은 전부 번들 내 상수 + 순수 함수. 네트워크 호출 없음.
export default defineConfig({
  plugins: [react()],
});
