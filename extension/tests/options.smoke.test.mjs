import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { JSDOM } from 'jsdom'

const optionsHtml = readFileSync(new URL('../options/options.html', import.meta.url), 'utf-8')
const optionsJs = readFileSync(new URL('../options/options.js', import.meta.url), 'utf-8')

function createPage() {
  const dom = new JSDOM(optionsHtml, {
    runScripts: 'outside-only',
    url: 'chrome-extension://abc/options.html',
  })
  const { window } = dom
  const store = {}
  window.chrome = {
    storage: {
      local: {
        get: (keys) => Promise.resolve(Object.fromEntries(keys.map((k) => [k, store[k]]))),
        set: (obj) => Promise.resolve(Object.assign(store, obj)),
      },
    },
  }
  window.eval(optionsJs)
  return { window, store }
}

const flush = () => new Promise((r) => setTimeout(r, 0))

test('选项页保存包含 API 令牌', async () => {
  const { window, store } = createPage()
  window.document.getElementById('token').value = 'my-secret-token'
  window.document.getElementById('backend').value = 'http://127.0.0.1:8001'
  window.document.getElementById('save').click()
  await flush()
  assert.equal(store.apiToken, 'my-secret-token')
})

test('选项页重置清空 API 令牌', async () => {
  const { window, store } = createPage()
  store.apiToken = 'old-token'
  window.document.getElementById('reset').click()
  await flush()
  assert.equal(store.apiToken, '')
})
