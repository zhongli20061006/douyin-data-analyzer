import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { JSDOM, VirtualConsole } from 'jsdom'

const parseSrc = readFileSync(new URL('../content/parse.js', import.meta.url), 'utf-8')
const collectSrc = readFileSync(new URL('../content/collect.js', import.meta.url), 'utf-8')

// jsdom 25 + Node 24 下，MutationObserver 回调会被延迟上报一个虚假的 jsdomError
// （回调体实际正常执行，断言不受影响）。这里过滤该噪音，保持测试输出干净。
const virtualConsole = new VirtualConsole()
virtualConsole.on('jsdomError', () => {})

const PROFILE = `
<div data-e2e="user-post-list"><ul>
  <li><div><a href="/video/7672018085449279859?secUid=MS4wLjABAAAA_test"><div class="jXmtohcJ"><span></span><span>236</span></div><p class="frUrWD64">标题A</p></a></div></li>
  <li><div><a href="/video/7672018085449279860?secUid=MS4wLjABAAAA_test"><div class="jXmtohcJ"><span></span><span>481</span></div><p class="frUrWD64">标题B</p></a></div></li>
</ul></div>`

function createPage() {
  const dom = new JSDOM(PROFILE, {
    url: 'https://www.douyin.com/user/self?from_tab_name=main',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    virtualConsole,
  })
  const { window } = dom
  window.chrome = {
    storage: {
      local: {
        get: (_keys, cb) => cb({
          backendBaseUrl: 'http://127.0.0.1:8001',
          myUid: 'u1',
          mySecUid: 's1',
          myNickname: '测试',
          complianceMode: 'unlimited',
          apiToken: 'test-token',
        }),
        set: (_obj, cb) => { if (cb) cb() },
      },
    },
    runtime: {
      sendMessage: async (msg) => {
        messages.push(msg)
        if (String(msg.url).includes('/api/extension/ids')) {
          return { ok: true, status: 200, bodyText: JSON.stringify({ added: 0, total: 2 }) }
        }
        return { ok: true, status: 200, bodyText: JSON.stringify({ accepted: 1, upserted: 1, rejected: [] }) }
      },
    },
  }
  const messages = []
  window.scrollTo = () => {}
  window.eval(parseSrc)
  window.eval(collectSrc)
  return { dom, window, messages }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function waitFor(fn, timeoutMs = 5000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (fn()) return true
    await sleep(50)
  }
  return false
}

test('主页采集显示实时计数并可手动停止，数据与 id 照常上报', async () => {
  const { dom, window, messages } = createPage()
  try {
    assert.ok(await waitFor(() => window.document.getElementById('dy-analyzer-start')))
    const mainBtn = window.document.getElementById('dy-analyzer-start')
    mainBtn.click()

    // 采集开始：停止按钮出现，主按钮显示「采集中 N 条」并递增到 2
    assert.ok(await waitFor(() => window.document.getElementById('dy-analyzer-stop')))
    assert.ok(await waitFor(() => (mainBtn.textContent || '').includes('采集中')))
    assert.ok(await waitFor(() => (mainBtn.textContent || '').includes('2 条')))

    // 手动停止
    window.document.getElementById('dy-analyzer-stop').click()
    assert.ok(await waitFor(() => {
      const t = window.document.getElementById('dy-analyzer-toast')
      return t && t.textContent.includes('已手动停止')
    }))

    // 已采数据照常入库、id 按批上报
    assert.ok(messages.some((m) => m.url.includes('/api/extension/videos')))
    assert.ok(messages.some((m) => m.url.includes('/api/extension/ids')))
    const videoMsg = messages.find((m) => m.url.includes('/api/extension/videos'))
    assert.ok(videoMsg, '应有 /api/extension/videos 上报消息')
    assert.equal(videoMsg.method, 'POST')
    assert.equal(videoMsg.headers['X-API-Token'], 'test-token')
    const idsMsg = messages.find((m) => m.url.includes('/api/extension/ids'))
    assert.ok(idsMsg, '应有 /api/extension/ids 上报消息')
    assert.equal(idsMsg.headers['X-API-Token'], 'test-token')

    // 采集结束按钮复位
    assert.ok(await waitFor(() => mainBtn.textContent === '开始采集'))
  } finally {
    dom.window.close()
  }
})

test('unlimited 模式页面主人通过 hook sec_uid 匹配', async () => {
  const { dom, window, messages } = createPage()
  try {
    assert.ok(await waitFor(() => window.document.getElementById('dy-analyzer-start')))
    const hookJson = {
      aweme_list: [
        {
          aweme_id: '7672018085449279859',
          desc: '标题A',
          create_time: 1700000000,
          statistics: { play_count: 236, digg_count: 40000, comment_count: 481, share_count: 1150 },
          author: { uid: 'realAuthorUid', sec_uid: 'MS4wLjABAAAA_test', nickname: '真实作者' },
          video: { cover: { url_list: ['https://p3.douyinpic.com/coverA.jpeg'] } },
        },
      ],
    }
    window.document.dispatchEvent(new window.CustomEvent('dy-analyzer-data', {
      detail: JSON.stringify({ source: 'dy-analyzer-hook', data: hookJson }),
    }))
    const mainBtn = window.document.getElementById('dy-analyzer-start')
    mainBtn.click()
    assert.ok(await waitFor(() => (mainBtn.textContent || '').includes('2 条')))
    window.document.getElementById('dy-analyzer-stop').click()
    assert.ok(await waitFor(() => messages.some((m) => m.url.includes('/api/extension/ids'))))
    const idsMsg = messages.find((m) => m.url.includes('/api/extension/ids'))
    const body = JSON.parse(idsMsg.body)
    // hook 中 sec_uid 与页面卡片一致的记录即页面主人
    assert.equal(body.author_id, 'realAuthorUid')
    const videoMsg = messages.find((m) => m.url.includes('/api/extension/videos'))
    const vbody = JSON.parse(videoMsg.body)
    for (const v of vbody.videos) {
      assert.equal(v.author_id, 'realAuthorUid')
    }
  } finally {
    dom.window.close()
  }
})

test('跨页面 hook 残留不影响页面主人解析', async () => {
  const { dom, window, messages } = createPage()
  try {
    assert.ok(await waitFor(() => window.document.getElementById('dy-analyzer-start')))
    // 残留：a 视频不在本次采集卡片中（模拟 SPA 切换前的上一作者页面）
    const staleHook = {
      aweme_list: [
        {
          aweme_id: '7672018085449279858',
          desc: '旧作者视频',
          create_time: 1700000000,
          statistics: { play_count: 1 },
          author: { uid: 'zhuifengUid', sec_uid: 'MS4wLjABAAAA_old', nickname: '追风小叶' },
          video: { cover: { url_list: ['https://p3.douyinpic.com/coverOld.jpeg'] } },
        },
      ],
    }
    // 本次：b 视频在当前采集卡片中，作者为自己
    const currentHook = {
      aweme_list: [
        {
          aweme_id: '7672018085449279859',
          desc: '标题A',
          create_time: 1700000000,
          statistics: { play_count: 236 },
          author: { uid: 'myUid', sec_uid: 'MS4wLjABAAAA_test', nickname: '自己' },
          video: { cover: { url_list: ['https://p3.douyinpic.com/coverA.jpeg'] } },
        },
      ],
    }
    window.document.dispatchEvent(new window.CustomEvent('dy-analyzer-data', {
      detail: JSON.stringify({ source: 'dy-analyzer-hook', data: staleHook }),
    }))
    window.document.dispatchEvent(new window.CustomEvent('dy-analyzer-data', {
      detail: JSON.stringify({ source: 'dy-analyzer-hook', data: currentHook }),
    }))
    const mainBtn = window.document.getElementById('dy-analyzer-start')
    mainBtn.click()
    assert.ok(await waitFor(() => (mainBtn.textContent || '').includes('2 条')))
    window.document.getElementById('dy-analyzer-stop').click()
    assert.ok(await waitFor(() => messages.some((m) => m.url.includes('/api/extension/ids'))))
    const idsMsg = messages.find((m) => m.url.includes('/api/extension/ids'))
    const body = JSON.parse(idsMsg.body)
    // 残留作者 sec_uid 与页面不一致，被排除；当前页作者 myUid 胜出
    assert.equal(body.author_id, 'myUid')
  } finally {
    dom.window.close()
  }
})

test('unlimited 模式在别人主页采集时作者统一为页面主人', async () => {
  const { dom, window, messages } = createPage()
  try {
    assert.ok(await waitFor(() => window.document.getElementById('dy-analyzer-start')))
    const hookJson = {
      aweme_list: [
        {
          aweme_id: '7672018085449279859',
          desc: '标题A',
          create_time: 1700000000,
          statistics: { play_count: 236 },
          author: { uid: 'authorUid', sec_uid: 'MS4wLjABAAAA_test', nickname: '页面主人' },
          video: { cover: { url_list: ['https://p3.douyinpic.com/coverA.jpeg'] } },
        },
      ],
    }
    window.document.dispatchEvent(new window.CustomEvent('dy-analyzer-data', {
      detail: JSON.stringify({ source: 'dy-analyzer-hook', data: hookJson }),
    }))

    const mainBtn = window.document.getElementById('dy-analyzer-start')
    mainBtn.click()
    assert.ok(await waitFor(() => (mainBtn.textContent || '').includes('2 条')))
    window.document.getElementById('dy-analyzer-stop').click()
    assert.ok(await waitFor(() => messages.some((m) => m.url.includes('/api/extension/videos'))))

    const videoMsg = messages.find((m) => m.url.includes('/api/extension/videos'))
    const body = JSON.parse(videoMsg.body)
    assert.ok(body.videos.length >= 1)
    for (const v of body.videos) {
      assert.equal(v.author_id, 'authorUid')
      assert.equal(v.author_name, '页面主人')
    }
    const idsMsg = messages.find((m) => m.url.includes('/api/extension/ids'))
    assert.ok(idsMsg, '应有 ids 上报')
    assert.equal(JSON.parse(idsMsg.body).author_id, 'authorUid')
  } finally {
    dom.window.close()
  }
})

test('unlimited 模式合拍视频的作者仍归页面主人', async () => {
  const { dom, window, messages } = createPage()
  try {
    assert.ok(await waitFor(() => window.document.getElementById('dy-analyzer-start')))
    // hook：一条合拍视频 author 为对方，一条普通视频 author 为页面主人
    const hookJson = {
      aweme_list: [
        {
          aweme_id: '7672018085449279859',
          desc: '合拍视频',
          create_time: 1700000000,
          statistics: { play_count: 236, collect_count: 66 },
          author: { uid: 'coauthorUid', sec_uid: 'MS4wLjABAAAA_co', nickname: '合拍对方' },
          video: { cover: { url_list: ['https://p3.douyinpic.com/coverCo.jpeg'] } },
        },
        {
          aweme_id: '7672018085449279860',
          desc: '普通视频',
          create_time: 1700000000,
          statistics: { play_count: 481, collect_count: 88 },
          author: { uid: 'authorUid', sec_uid: 'MS4wLjABAAAA_test', nickname: '页面主人' },
          video: { cover: { url_list: ['https://p3.douyinpic.com/coverA.jpeg'] } },
        },
      ],
    }
    window.document.dispatchEvent(new window.CustomEvent('dy-analyzer-data', {
      detail: JSON.stringify({ source: 'dy-analyzer-hook', data: hookJson }),
    }))
    const mainBtn = window.document.getElementById('dy-analyzer-start')
    mainBtn.click()
    assert.ok(await waitFor(() => (mainBtn.textContent || '').includes('2 条')))
    window.document.getElementById('dy-analyzer-stop').click()
    assert.ok(await waitFor(() => messages.some((m) => m.url.includes('/api/extension/videos'))))

    const videoMsg = messages.find((m) => m.url.includes('/api/extension/videos'))
    const body = JSON.parse(videoMsg.body)
    assert.equal(body.videos.length, 2)
    for (const v of body.videos) {
      assert.equal(v.author_id, 'authorUid')
      assert.equal(v.author_name, '页面主人')
    }
    const idsMsg = messages.find((m) => m.url.includes('/api/extension/ids'))
    assert.ok(idsMsg, '应有 ids 上报')
    assert.equal(JSON.parse(idsMsg.body).author_id, 'authorUid')
  } finally {
    dom.window.close()
  }
})

test('自己主页采集时作者使用登录配置（昵称齐全）', async () => {
  const { dom, window, messages } = createPage()
  try {
    // 覆盖 storage：mySecUid 与页面卡片 sec_uid 一致（自己主页）
    window.chrome.storage.local.get = (_keys, cb) => cb({
      backendBaseUrl: 'http://127.0.0.1:8001',
      myUid: 'myUid',
      mySecUid: 'MS4wLjABAAAA_test',
      myNickname: '我自己',
      complianceMode: 'unlimited',
      apiToken: 'test-token',
    })
    assert.ok(await waitFor(() => window.document.getElementById('dy-analyzer-start')))
    const mainBtn = window.document.getElementById('dy-analyzer-start')
    mainBtn.click()
    assert.ok(await waitFor(() => (mainBtn.textContent || '').includes('2 条')))
    window.document.getElementById('dy-analyzer-stop').click()
    assert.ok(await waitFor(() => messages.some((m) => m.url.includes('/api/extension/videos'))))

    const videoMsg = messages.find((m) => m.url.includes('/api/extension/videos'))
    const body = JSON.parse(videoMsg.body)
    for (const v of body.videos) {
      assert.equal(v.author_id, 'myUid')
      assert.equal(v.author_name, '我自己')
    }
    const idsMsg = messages.find((m) => m.url.includes('/api/extension/ids'))
    assert.ok(idsMsg, '应有 ids 上报')
    assert.equal(JSON.parse(idsMsg.body).author_id, 'myUid')
  } finally {
    dom.window.close()
  }
})
