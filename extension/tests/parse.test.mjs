import { createRequire } from 'node:module'
import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'

const require = createRequire(import.meta.url)
const {
  parseCount,
  extractSecUidFromHref,
  parseProfileCards,
  parseVideoDetail,
  parseAwemeList,
  findScrollContainer,
  mergeCardWithHook,
  resolvePageOwnerFromHooks,
  drainHookQueue,
  idsFromBatch,
  progressLabel,
  resolveAuthorId,
} = require('../content/parse.js')

function domOf(html) {
  return new JSDOM(html)
}

const PROFILE_HTML = `
<div data-e2e="user-post-list"><ul>
  <li>
    <div><a href="/video/7672018085449279859?count=10&amp;secUid=MS4wLjABAAAA06jEnQt6n222TZfcskYj66Eae2cwa5P_-zn43ANyMO4-ozTFc8wQI4dpvCi2FEhl">
      <div class="GGxeUe0C">
        <div><img src="https://p3-pc-sign.douyinpic.com/coverA.jpeg?x-signature=abc" alt=""></div>
        <div class="jXmtohcJ"><span class="icon"></span><span class="BP1CQkLg">236</span></div>
        <p class="EB3BkdQ8">标题A</p>
      </div>
      <p class="frUrWD64">标题A</p>
    </a></div>
  </li>
  <li>
    <div><a href="/video/7672018085449279860?secUid=MS4wLjABAAAA06jEnQt6n222TZfcskYj66Eae2cwa5P_-zn43ANyMO4-ozTFc8wQI4dpvCi2FEhl">
      <div><img src="https://p3-pc-sign.douyinpic.com/coverB.jpeg" alt=""></div>
      <div class="jXmtohcJ"><span class="icon"></span><span>1.2万</span></div>
      <p class="frUrWD64">标题B</p>
    </a></div>
  </li>
  <li>
    <div><a href="/note/7647172401004949235">
      <div><img src="https://p3-pc-sign.douyinpic.com/coverC.jpeg" alt=""></div>
      <p class="frUrWD64">这是一篇图文</p>
    </a></div>
  </li>
</ul></div>
`

test('parseCount 支持纯数字/万/亿/千分位', () => {
  assert.equal(parseCount('236'), 236)
  assert.equal(parseCount('4.0万'), 40000)
  assert.equal(parseCount('1.2亿'), 120000000)
  assert.equal(parseCount('4,000'), 4000)
  assert.equal(parseCount('abc'), null)
  assert.equal(parseCount(null), null)
})

test('extractSecUidFromHref 提取作者 secUid', () => {
  assert.equal(
    extractSecUidFromHref('//www.douyin.com/user/MS4wLjABAAAATTGGMqqjAd_B2UP9s9ThMW5sj0J0Hw4XtLCytt0UOBI'),
    'MS4wLjABAAAATTGGMqqjAd_B2UP9s9ThMW5sj0J0Hw4XtLCytt0UOBI',
  )
  assert.equal(extractSecUidFromHref('/video/123'), '')
})

test('parseProfileCards 提取视频卡片字段', () => {
  const { document } = domOf(PROFILE_HTML).window
  const root = document.querySelector('[data-e2e="user-post-list"]')
  const cards = parseProfileCards(root, {
    author_name: '黑白阿巴巴',
    author_id: '4358913414407163',
  })
  assert.equal(cards.length, 2)
  assert.equal(cards[0].video_id, '7672018085449279859')
  assert.equal(cards[0].video_title, '标题A')
  assert.equal(cards[0].play_count, 236)
  assert.equal(cards[0].cover_url, 'https://p3-pc-sign.douyinpic.com/coverA.jpeg?x-signature=abc')
  assert.equal(cards[0].author_name, '黑白阿巴巴')
  assert.equal(cards[0].author_id, '4358913414407163')
  assert.equal(cards[0].sec_uid, 'MS4wLjABAAAA06jEnQt6n222TZfcskYj66Eae2cwa5P_-zn43ANyMO4-ozTFc8wQI4dpvCi2FEhl')
  assert.deepEqual(cards[0].missing_fields, [])
})

test('parseProfileCards 支持万格式并跳过图文', () => {
  const { document } = domOf(PROFILE_HTML).window
  const cards = parseProfileCards(document.querySelector('[data-e2e="user-post-list"]'), {})
  assert.equal(cards[1].play_count, 12000)
  assert.ok(!cards.some((c) => c.video_id === '7647172401004949235'))
})

test('parseProfileCards 统计缺失字段', () => {
  const html = `
  <div data-e2e="user-post-list"><ul>
    <li><div><a href="/video/7672018085449279899"><div><div class="jXmtohcJ"><span class="icon"></span><span></span></div></div></a></div></li>
  </ul></div>`
  const { document } = domOf(html).window
  const cards = parseProfileCards(document.querySelector('[data-e2e="user-post-list"]'), {})
  assert.equal(cards.length, 1)
  assert.ok(cards[0].missing_fields.includes('video_title'))
  assert.ok(cards[0].missing_fields.includes('play_count'))
})

const DETAIL_HTML = `
<div>
  <div data-e2e="feed-video" data-e2e-vid="7671480850864786742">
    <video poster="https://p3-sign.douyinpic.com/poster.jpeg?x-signature=def"></video>
  </div>
  <div data-e2e="video-desc"><span>第262集：标题</span><a href="//www.douyin.com/search/%E5%8E%86%E5%8F%B2?aweme_id=7671480850864786742">#历史</a></div>
  <a href="//www.douyin.com/user/MS4wLjABAAAATTGGMqqjAd_B2UP9s9ThMW5sj0J0Hw4XtLCytt0UOBI">@作者</a>
  <div data-e2e="video-player-digg"><div></div><div class="n1ekR9OB">4.0万</div></div>
  <div data-e2e="feed-comment-icon"><div></div><div class="cipURsys">481</div></div>
  <div data-e2e="video-player-share"><div></div><div class="mvwEat0w">1150</div></div>
  <div data-e2e="video-player-collect"><div></div><div class="collect-num">3.2万</div></div>
</div>
`

test('parseVideoDetail 提取互动数据与作者 secUid', () => {
  const { document } = domOf(DETAIL_HTML).window
  const detail = parseVideoDetail(document)
  assert.equal(detail.video_id, '7671480850864786742')
  assert.equal(detail.like_count, 40000)
  assert.equal(detail.comment_count, 481)
  assert.equal(detail.share_count, 1150)
  assert.equal(detail.collect_count, 32000)
  assert.equal(detail.video_desc, '第262集：标题#历史')
  assert.equal(detail.video_url, 'https://www.douyin.com/video/7671480850864786742')
  assert.equal(detail.cover_url, 'https://p3-sign.douyinpic.com/poster.jpeg?x-signature=def')
  assert.equal(detail.author_sec_uid, 'MS4wLjABAAAATTGGMqqjAd_B2UP9s9ThMW5sj0J0Hw4XtLCytt0UOBI')
  assert.equal(detail.play_count, null)
  assert.equal(detail.publish_time, null)
})

test('parseVideoDetail 无 video_id 返回 null', () => {
  const { document } = domOf('<div></div>').window
  assert.equal(parseVideoDetail(document), null)
})

test('parseVideoDetail 支持主页浮层 modal_id 场景', () => {
  const html = `
  <div>
    <div data-e2e="feed-video"><video poster="https://p3-sign.douyinpic.com/p.jpeg"></video></div>
    <a href="//www.douyin.com/user/MS4wLjABAAAATTGGMqqjAd_B2UP9s9ThMW5sj0J0Hw4XtLCytt0UOBI">@作者</a>
  </div>`
  const dom = new JSDOM(html, {
    url: 'https://www.douyin.com/user/self?from_tab_name=main&modal_id=7669345637021002313',
  })
  const detail = parseVideoDetail(dom.window.document)
  assert.equal(detail.video_id, '7669345637021002313')
  assert.ok(detail.missing_fields.includes('collect_count'))
})

const AWEME_JSON = {
  aweme_list: [
    {
      aweme_id: '7672018085449279859',
      desc: '标题A #话题',
      create_time: 1700000000,
      statistics: {
        digg_count: 40000,
        comment_count: 481,
        share_count: 1150,
        play_count: 236,
        collect_count: 6666,
      },
      author: { nickname: '黑白阿巴巴', uid: '4358913414407163', sec_uid: 'MS4wLjABAAAA_test' },
      video: { cover: { url_list: ['https://p3.douyinpic.com/coverA.jpeg'] } },
    },
    {
      aweme_id: '7672018085449279860',
      desc: '',
      create_time: null,
      statistics: {},
      author: {},
    },
  ],
}

test('parseAwemeList 提取完整字段', () => {
  const records = parseAwemeList(AWEME_JSON)
  assert.equal(records.length, 2)
  const r0 = records[0]
  assert.equal(r0.video_id, '7672018085449279859')
  assert.equal(r0.video_title, '标题A #话题')
  assert.equal(r0.play_count, 236)
  assert.equal(r0.like_count, 40000)
  assert.equal(r0.comment_count, 481)
  assert.equal(r0.share_count, 1150)
  assert.equal(r0.collect_count, 6666)
  assert.equal(r0.author_name, '黑白阿巴巴')
  assert.equal(r0.author_id, '4358913414407163')
  assert.equal(r0.cover_url, 'https://p3.douyinpic.com/coverA.jpeg')
  assert.match(r0.publish_time, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
  assert.deepEqual(r0.missing_fields, [])
})

test('parseAwemeList 容错与详情结构', () => {
  const r1 = parseAwemeList(AWEME_JSON)[1]
  assert.equal(r1.play_count, 0)
  assert.ok(r1.missing_fields.includes('video_title'))
  assert.ok(r1.missing_fields.includes('play_count'))
  assert.ok(r1.missing_fields.includes('collect_count'))
  const detail = parseAwemeList({ aweme: { aweme_id: '123456789012345678', statistics: { play_count: 5 } } })
  assert.equal(detail.length, 1)
  assert.equal(detail[0].video_id, '123456789012345678')
  assert.deepEqual(parseAwemeList({}), [])
  assert.deepEqual(parseAwemeList(null), [])
})

test('findScrollContainer 命中 overflow 祖先', () => {
  const html = `
  <div id="outer" style="overflow-y:auto;height:600px;">
    <div id="middle">
      <div id="list"><ul><li>a</li><li>b</li></ul></div>
    </div>
  </div>`
  const { document } = domOf(html).window
  const list = document.querySelector('#list')
  assert.equal(findScrollContainer(list, document), document.querySelector('#outer'))
})

test('findScrollContainer 无滚动祖先返回 null', () => {
  const { document } = domOf('<div id="list"><ul><li>a</li></ul></div>').window
  assert.equal(findScrollContainer(document.querySelector('#list'), document), null)
})

test('mergeCardWithHook 用 hook 数据补全卡片', () => {
  const card = {
    video_id: '1', video_title: 'DOM标题', play_count: 10, cover_url: 'c1',
    author_name: 'a', author_id: 'u', missing_fields: [],
  }
  const hook = {
    video_id: '1', video_title: 'Hook标题', play_count: 236, like_count: 40000,
    comment_count: 481, share_count: 1150, collect_count: 888, publish_time: '2026-05-12 14:13:52',
    cover_url: 'c2', missing_fields: [],
  }
  const merged = mergeCardWithHook(card, hook)
  assert.equal(merged.video_title, 'Hook标题')
  assert.equal(merged.play_count, 236)
  assert.equal(merged.like_count, 40000)
  assert.equal(merged.collect_count, 888)
  assert.equal(merged.publish_time, '2026-05-12 14:13:52')
  assert.equal(merged.cover_url, 'c2')
  assert.deepEqual(mergeCardWithHook(card, null), card)
})

test('resolvePageOwnerFromHooks 匹配页面 sec_uid 的真实作者', () => {
  const hooks = [
    { video_id: '1', author_id: 'coauthorUid', author_name: '合拍对方', sec_uid: 'MS4wLjABAAAA_co' },
    { video_id: '2', author_id: 'authorUid', author_name: '页面主人', sec_uid: 'MS4wLjABAAAA_test' },
  ]
  assert.deepEqual(resolvePageOwnerFromHooks(hooks, 'MS4wLjABAAAA_test'), {
    author_id: 'authorUid',
    author_name: '页面主人',
  })
})

test('resolvePageOwnerFromHooks 无匹配或空参数返回 null', () => {
  assert.equal(resolvePageOwnerFromHooks([], 'x'), null)
  assert.equal(resolvePageOwnerFromHooks([{ author_id: 'a', sec_uid: 'y' }], 'x'), null)
  assert.equal(resolvePageOwnerFromHooks(undefined, 'x'), null)
  assert.equal(resolvePageOwnerFromHooks([{ author_id: '', sec_uid: 'x' }], 'x'), null)
  assert.equal(resolvePageOwnerFromHooks([{ author_id: 'a', sec_uid: 'x' }], ''), null)
})

test('drainHookQueue 回放并清空缓冲', () => {
  const { document } = domOf('<div></div>').window
  document.documentElement.__dyAnalyzerQueue = [
    JSON.stringify({ source: 'dy-analyzer-hook', data: { aweme_list: [] } }),
    'not-json',
  ]
  const messages = drainHookQueue(document.documentElement)
  assert.equal(messages.length, 1)
  assert.equal(messages[0].source, 'dy-analyzer-hook')
  assert.equal(document.documentElement.__dyAnalyzerQueue.length, 0)
})

test('idsFromBatch 提取并去重 video_id', () => {
  const batch = [
    { video_id: '7672018085449279859', video_title: 'a' },
    { video_id: '7672018085449279860', video_title: 'b' },
    { video_id: '7672018085449279859', video_title: 'a-dup' },
  ]
  assert.deepEqual(idsFromBatch(batch), ['7672018085449279859', '7672018085449279860'])
})

test('idsFromBatch 空批与缺 id 记录返回空数组', () => {
  assert.deepEqual(idsFromBatch([]), [])
  assert.deepEqual(idsFromBatch([{ video_id: '' }, { video_title: 'x' }]), [])
})

test('progressLabel 生成采集进度文案', () => {
  assert.equal(progressLabel(0), '采集中 0 条')
  assert.equal(progressLabel(39), '采集中 39 条')
  assert.equal(progressLabel(100), '采集中 100 条')
})

test('resolveAuthorId 优先取 hook 真实作者', () => {
  const hooks = [
    { video_id: '1', author_id: '' },
    { video_id: '2', author_id: 'realAuthorUid' },
    { video_id: '3', author_id: 'anotherUid' },
  ]
  assert.equal(resolveAuthorId(hooks, 'fallbackUid'), 'realAuthorUid')
})

test('resolveAuthorId 无 hook 作者时回退 fallback', () => {
  assert.equal(resolveAuthorId([], 'myUid'), 'myUid')
  assert.equal(resolveAuthorId([{ video_id: '1', author_id: '' }], ''), '')
  assert.equal(resolveAuthorId(undefined, 'x'), 'x')
})

test('resolveAuthorId 按 videoIds 过滤其他作者的 hook 残留', () => {
  const hooks = [
    { video_id: 'a1', author_id: 'zhuifengUid' },
    { video_id: 'b1', author_id: 'myUid' },
  ]
  assert.equal(resolveAuthorId(hooks, 'fallback', ['b1']), 'myUid')
  assert.equal(resolveAuthorId(hooks, 'fallback', ['a1']), 'zhuifengUid')
  assert.equal(resolveAuthorId(hooks, 'fallback', ['x1']), 'fallback')
  assert.equal(resolveAuthorId(hooks, 'fallback', ['b1', 'a1']), 'zhuifengUid')
})
