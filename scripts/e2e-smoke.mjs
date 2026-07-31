import { spawn } from 'node:child_process';
import puppeteer from 'puppeteer-core';
const PORT = 4725;
const BASE = `http://127.0.0.1:${PORT}`;
const ALLOWED = [/ReactNativeWebView is not available/, /Failed to load resource/];
let passed = 0;
const ok = (c, l) => { if (!c) throw new Error('FAIL: ' + l); passed++; console.log('  ok - ' + l); };
const server = spawn('npx', ['vite', 'preview', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], { shell: true, stdio: 'ignore' });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const setKwh = (page, v) => page.evaluate((val) => {
  const el = document.querySelector('#kwh-input');
  Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(el, val);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}, String(v));
const setSummer = (page, on) => page.evaluate((want) => {
  const chip = document.querySelector('.chip');
  const isOn = chip.classList.contains('on');
  if (isOn !== want) chip.click();
}, on);
let browser;
try {
  let up = false;
  for (let i = 0; i < 40 && !up; i++) { try { up = (await fetch(BASE)).ok; } catch { await wait(250); } }
  ok(up, 'preview 기동');
  browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  const page = await browser.newPage();
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error' && !ALLOWED.some((re) => re.test(m.text()))) errs.push(m.text()); });
  page.on('pageerror', (e) => { if (!ALLOWED.some((re) => re.test(e.message))) errs.push(e.message); });
  await page.setViewport({ width: 390, height: 844 });
  await page.goto(BASE, { waitUntil: 'networkidle0' });
  const text = () => page.evaluate(() => document.body.innerText);
  ok((await text()).includes('전기요금 미리보기'), '홈 타이틀');

  // 기타 계절 · 저압 200kWh = 31,500원 (1단계 상한)
  await setSummer(page, false);
  await setKwh(page, 200); await wait(150);
  ok((await text()).includes('31,500원'), '저압 200kWh = 31,500원');
  ok((await text()).includes('누진 1단계'), '200kWh 누진 1단계');

  // 401kWh → 3단계, 기본요금 7,300원, 총 91,110원
  await setKwh(page, 401); await wait(150);
  const t401 = await text();
  ok(t401.includes('누진 3단계'), '401kWh 누진 3단계');
  ok(t401.includes('7,300원'), '3단계 기본요금 7,300원');
  ok(t401.includes('91,110원'), '저압 401kWh = 91,110원');

  // 하계 완화: 300kWh가 1단계, 46,740원
  await setSummer(page, true);
  await setKwh(page, 300); await wait(150);
  const tS = await text();
  ok(tS.includes('누진 1단계'), '하계 300kWh 누진 1단계');
  ok(tS.includes('46,740원'), '하계 저압 300kWh = 46,740원');

  // 슬라이더 재계산
  await page.evaluate(() => {
    const el = document.querySelector('.slider');
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(el, '500');
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await wait(150);
  ok((await text()).includes('500kWh'), '슬라이더로 500kWh 반영');

  // 전월 저장 → 리로드 영속성
  await page.evaluate(() => { [...document.querySelectorAll('.btn')].find((b) => b.innerText.includes('전월'))?.click(); });
  await wait(150);
  await setKwh(page, 350); await wait(150);
  await page.reload({ waitUntil: 'networkidle0' }); await wait(200);
  const tR = await text();
  ok(tR.includes('전월 500kWh'), '전월 사용량 저장·복원');
  ok(await page.evaluate(() => document.querySelector('#kwh-input').value === '350'), '사용량 리로드 영속성');

  // 0 입력 방어 + 금지 문자열
  await setKwh(page, 0); await wait(150);
  let t = await text();
  for (const bad of ['NaN', 'undefined', 'Infinity', '[object', 'null원']) ok(!t.includes(bad), `노출 없음: ${bad}`);

  // 손상 localStorage 내성
  await page.evaluate(() => {
    localStorage.setItem('elecbill.kwh', '{corrupt!!');
    localStorage.setItem('elecbill.prevKwh', '"abc"');
    localStorage.setItem('elecbill.contract', 'garbage');
  });
  await page.reload({ waitUntil: 'networkidle0' }); await wait(200);
  t = await text();
  ok(t.includes('전기요금 미리보기'), '손상 localStorage에서도 부팅');
  for (const bad of ['NaN', 'undefined', 'Infinity']) ok(!t.includes(bad), `손상 후 노출 없음: ${bad}`);

  ok(errs.length === 0, '콘솔 에러 0건' + (errs.length ? ' — ' + errs[0] : ''));
  console.log(`\nE2E SMOKE PASS — ${passed} assertions`);
} finally { await browser?.close(); server.kill(); }
