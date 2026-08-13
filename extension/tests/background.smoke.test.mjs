import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { JSDOM } from 'jsdom'

const backgroundSrc = readFileSync(new URL('../background.js', import.meta.url), 'utf-8')

function createContext() {
  const dom = new JSDOM('', { runScripts: 'outside-only', url: 'chrome-extension://abc/background.html' })
  const { window } = dom
  let listener = null
  const fetchCalls = []
  window.chrome = {
    runtime: {
      onMessage: {
        addListener: (fn) => { listener = fn },
      },
    },
  }
  window.fetch = async (url, opts = {}) => {
    fetchCalls.push({ url: String(url), opts })
    return { status: 200, text: async () => '{"ok":true}' }
  }
  window.eval(backgroundSrc)
  return { window, getListener: () => listener, fetchCalls }
}

const flush = () => new Promise((r) => setTimeout(r, 0))

test('background 收到请求消息后转发 fetch 并回传响应', async () => {
  const { getListener, fetchCalls } = createContext()
  const listener = getListener()
  assert.ok(listener, 'background.js 应注册 onMessage listener')
  let response = null
  const sendResponse = (r) => { response = r }
  const ret = listener(
    {
      type: 'dy-analyzer-request',
      url: 'http://127.0.0.1:8001/api/extension/videos',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Token': 'token-x' },
      body: '{"videos":[]}',
    },
    {},
    sendResponse,
  )
  assert.equal(ret, true, 'async listener 应返回 true 保持通道')
  await flush()
  assert.equal(fetchCalls.length, 1)
  assert.equal(fetchCalls[0].url, 'http://127.0.0.1:8001/api/extension/videos')
  assert.equal(fetchCalls[0].opts.method, 'POST')
  assert.equal(fetchCalls[0].opts.headers['X-API-Token'], 'token-x')
  assert.equal(fetchCalls[0].opts.body, '{"videos":[]}')
  assert.deepEqual(JSON.parse(JSON.stringify(response)), { ok: true, status: 200, bodyText: '{"ok":true}' })
})

test('background 转发失败时回传 ok:false', async () => {
  const ctx = createContext()
  ctx.window.fetch = async () => { throw new Error('network down') }
  let response = null
  const sendResponse = (r) => { response = r }
  ctx.getListener()(
    { type: 'dy-analyzer-request', url: 'http://127.0.0.1:8001/x', method: 'POST', headers: {}, body: '{}' },
    {},
    sendResponse,
  )
  await flush()
  assert.deepEqual(JSON.parse(JSON.stringify(response)), { ok: false, error: 'network down' })
})
