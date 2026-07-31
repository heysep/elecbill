import { spawn } from 'node:child_process';
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';
const PORT = 4726;
const BASE = `http://127.0.0.1:${PORT}`;
mkdirSync('store-assets', { recursive: true });
const server = spawn('npx', ['vite', 'preview', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], { shell: true, stdio: 'ignore' });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const COPY = {
  shot1: '누진 요금, 청구서 오기 전에 미리 확인',
  shot2: '하계 완화까지 반영한 상세 내역',
  shot3: '에어컨 몇 시간 틀면 얼마 늘까?',
};
const setKwh = (page, v) => page.evaluate((val) => {
  const el = document.querySelector('#kwh-input');
  Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(el, val);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}, String(v));
const addCopy = (page, text) => page.evaluate((t) => {
  document.querySelector('.shot-copy')?.remove();
  const d = document.createElement('div');
  d.className = 'shot-copy';
  d.textContent = t;
  d.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99;background:#E8611A;color:#fff;font-weight:800;font-size:17px;padding:16px 20px;text-align:center;word-break:keep-all;';
  document.body.prepend(d);
  document.querySelector('.app').style.paddingTop = '76px';
}, text);
let browser;
try {
  let up = false;
  for (let i = 0; i < 40 && !up; i++) { try { up = (await fetch(BASE)).ok; } catch { await wait(250); } }
  browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  const page = await browser.newPage();
  await page.setViewport({ width: 318, height: 524, deviceScaleFactor: 2 });
  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await wait(400);
  await setKwh(page, 350); await wait(200);
  await addCopy(page, COPY.shot1);
  await page.screenshot({ path: 'store-assets/shot1.png' });
  // shot2: 요금 내역 카드가 보이도록 스크롤
  await page.evaluate(() => { document.querySelectorAll('.panel')[1]?.scrollIntoView(); window.scrollBy(0, -80); });
  await wait(200);
  await addCopy(page, COPY.shot2);
  await page.screenshot({ path: 'store-assets/shot2.png' });
  // shot3: 에어컨 환산 카드
  await page.evaluate(() => {
    const el = document.querySelector('#ac-hours');
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(el, '8');
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.evaluate(() => { document.querySelectorAll('.panel')[2]?.scrollIntoView(); window.scrollBy(0, -80); });
  await wait(200);
  await addCopy(page, COPY.shot3);
  await page.screenshot({ path: 'store-assets/shot3.png' });
  console.log('shots done');
} finally { await browser?.close(); server.kill(); }
