/* 抖音个人视频数据分析器 —— content script
 * 主页模式：白名单校验 → 悬浮按钮 → 自动滚动采集播放量 → 分批上报
 * 详情页模式：白名单校验（作者是自己）→ 被动提取互动数据 → 防抖上报
 */
(function () {
  'use strict';
  const P = window.DouyinParse;
  const MAX_VIDEOS = 1000; // 全量采集：上限放宽，停止由滚动到底（无新增+高度不变）决定
  const BATCH_SIZE = 100;
  const DETAIL_DEBOUNCE_MS = 60 * 1000;
  const KEY_BACKEND = 'backendBaseUrl';
  const KEY_UID = 'myUid';
  const KEY_SEC_UID = 'mySecUid';
  const KEY_NICKNAME = 'myNickname';
  const KEY_MODE = 'complianceMode';
  const KEY_TOKEN = 'apiToken';
  const DEFAULT_BACKEND = 'http://127.0.0.1:8001';
  const HOOK_EVENT = 'dy-analyzer-data';

  let homeButtonAdded = false;
  let detailStarted = false;
  let lastPath = '';
  const hookMap = new Map();
  let complianceLimited = false;
  let stopRequested = false;

  function normalizeBase(url) {
    let u = String(url || DEFAULT_BACKEND).trim().replace(/\/+$/, '');
    if (!/^https?:\/\//i.test(u)) u = 'http://' + u;
    return u;
  }

  function storageGet(keys) {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.get(keys, resolve);
      } catch (e) {
        // 扩展重新加载后旧 content script 上下文失效，提示刷新页面并降级为空配置
        console.warn('[dy-analyzer] 扩展上下文已失效，请刷新页面', e);
        resolve({});
      }
    });
  }

  function storageSet(obj) {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.set(obj, () => resolve());
      } catch (e) {
        console.warn('[dy-analyzer] 扩展上下文已失效，请刷新页面', e);
        resolve();
      }
    });
  }

  async function getConfig() {
    const data = await storageGet([KEY_BACKEND, KEY_UID, KEY_SEC_UID, KEY_NICKNAME, KEY_MODE, KEY_TOKEN]);
    return {
      backendBaseUrl: normalizeBase(data[KEY_BACKEND]),
      myUid: data[KEY_UID] || '',
      mySecUid: data[KEY_SEC_UID] || '',
      myNickname: data[KEY_NICKNAME] || '',
      complianceMode: data[KEY_MODE] || 'limited',
      apiToken: data[KEY_TOKEN] || '',
    };
  }

  function readRenderData() {
    const el = document.querySelector('script#RENDER_DATA');
    if (!el) return null;
    try {
      return JSON.parse(decodeURIComponent(el.textContent || ''));
    } catch (e) {
      return null;
    }
  }

  function handleHookData(json) {
    const records = P.parseAwemeList(json);
    for (const r of records) {
      if (!hookMap.has(r.video_id)) hookMap.set(r.video_id, r);
    }
  }

  function setupHookListener() {
    document.addEventListener(HOOK_EVENT, (e) => {
      try {
        const msg = JSON.parse(e.detail || '');
        if (msg && msg.source === 'dy-analyzer-hook') handleHookData(msg.data);
      } catch (err) { /* 忽略坏消息 */ }
    });
    // 回放缓冲：content script 晚于 hook 注入时补齐第一帧数据
    const buffered = P.drainHookQueue(document.documentElement);
    for (const msg of buffered) handleHookData(msg.data);
  }

  /** 经 background service worker 转发上报（扩展上下文 fetch，不受页面 CORS 限制）。 */
  async function requestBackend(url, method, payload) {
    const cfg = await getConfig();
    const resp = await chrome.runtime.sendMessage({
      type: 'dy-analyzer-request',
      url: url,
      method: method,
      headers: { 'Content-Type': 'application/json', 'X-API-Token': cfg.apiToken },
      body: JSON.stringify(payload),
    });
    if (!resp || !resp.ok) {
      throw new Error(resp && resp.error ? resp.error : '请求失败');
    }
    return { status: resp.status, text: resp.bodyText };
  }

  async function reportIds(videoIds, authorId) {
    const cfg = await getConfig();
    const resp = await requestBackend(cfg.backendBaseUrl + '/api/extension/ids', 'POST', {
      video_ids: videoIds,
      author_id: authorId,
    });
    if (resp.status < 200 || resp.status >= 300) {
      let detail = 'HTTP ' + resp.status;
      try {
        const err = JSON.parse(resp.text);
        detail = err.detail || detail;
      } catch (e) { /* ignore */ }
      if (resp.status === 401 || resp.status === 403 || resp.status === 503) {
        detail = '后端拒绝了请求：请检查 API 令牌配置（选项页与 local_config.py 一致）。' +
          (detail ? ' ' + detail : '');
      }
      throw new Error(detail);
    }
    return JSON.parse(resp.text);
  }

  /** 主页模式判定：limited 模式要求主页主人 uid === 登录账号 uid；unlimited 任意用户主页。 */
  function isOwnProfile(limited) {
    if (!/^\/user\//.test(location.pathname)) return false;
    if (!limited) return true; // 无限制模式：任意用户主页可采集
    const data = readRenderData();
    if (!data || !data.app || !data.app.user || !data.app.odin) return false;
    const user = data.app.user;
    const odin = data.app.odin;
    return (
      user.isLogin === true &&
      user.info &&
      odin.user_id &&
      String(user.info.uid) === String(odin.user_id)
    );
  }

  function showToast(message) {
    let box = document.getElementById('dy-analyzer-toast');
    if (!box) {
      box = document.createElement('div');
      box.id = 'dy-analyzer-toast';
      box.style.cssText =
        'position:fixed;right:16px;bottom:72px;z-index:2147483647;background:#1d2128;color:#e5e7eb;' +
        'border:1px solid #2d323a;border-radius:8px;padding:10px 14px;font-size:13px;' +
        'box-shadow:0 2px 8px rgba(0,0,0,.35);max-width:320px;word-break:break-all;';
      document.body.appendChild(box);
    }
    box.textContent = message;
    clearTimeout(box._timer);
    box._timer = setTimeout(() => { if (box.parentNode) box.remove(); }, 6000);
  }

  async function report(videos, sourceUrl) {
    const cfg = await getConfig();
    const resp = await requestBackend(cfg.backendBaseUrl + '/api/extension/videos', 'POST', {
      source_url: sourceUrl,
      videos: videos,
    });
    if (resp.status < 200 || resp.status >= 300) {
      let detail = 'HTTP ' + resp.status;
      try {
        const err = JSON.parse(resp.text);
        detail = err.detail || detail;
      } catch (e) { /* ignore */ }
      if (resp.status === 401 || resp.status === 403 || resp.status === 503) {
        detail = '后端拒绝了请求：请检查 API 令牌配置（选项页与 local_config.py 一致）。' +
          (detail ? ' ' + detail : '');
      }
      throw new Error(detail);
    }
    return JSON.parse(resp.text);
  }

  function sleep(ms) {
    return new Promise((resolve) => {
      const start = Date.now();
      const timer = setInterval(() => {
        if (stopRequested || Date.now() - start >= ms) {
          clearInterval(timer);
          resolve();
        }
      }, 100);
    });
  }

  function waitForGrowth(root, currentCount, timeoutMs) {
    return new Promise((resolve) => {
      const start = Date.now();
      const timer = setInterval(() => {
        if (
          stopRequested ||
          root.querySelectorAll('li').length > currentCount ||
          Date.now() - start > (timeoutMs || 6000)
        ) {
          clearInterval(timer);
          resolve();
        }
      }, 300);
    });
  }

  /* ---------- 主页模式 ---------- */

  function createCollectButton() {
    const old = document.getElementById('dy-analyzer-btn');
    if (old) old.remove();
    const wrap = document.createElement('div');
    wrap.id = 'dy-analyzer-btn';
    wrap.style.cssText =
      'position:fixed;right:16px;bottom:16px;z-index:2147483647;display:flex;gap:8px;align-items:center;' +
      'font-family:system-ui,sans-serif;';
    const btn = document.createElement('div');
    btn.id = 'dy-analyzer-start';
    btn.textContent = '开始采集';
    btn.style.cssText =
      'background:#409eff;color:#fff;border-radius:20px;padding:10px 18px;font-size:14px;cursor:pointer;' +
      'box-shadow:0 2px 8px rgba(0,0,0,.35);user-select:none;white-space:nowrap;';
    btn.addEventListener('click', collectProfile);
    const stop = document.createElement('div');
    stop.id = 'dy-analyzer-stop';
    stop.textContent = '停止';
    stop.style.cssText =
      'display:none;background:#f56c6c;color:#fff;border-radius:20px;padding:10px 18px;font-size:14px;cursor:pointer;' +
      'box-shadow:0 2px 8px rgba(0,0,0,.35);user-select:none;white-space:nowrap;';
    stop.addEventListener('click', requestStop);
    wrap.appendChild(btn);
    wrap.appendChild(stop);
    document.body.appendChild(wrap);
    return wrap;
  }

  function requestStop() {
    if (stopRequested) return;
    stopRequested = true;
    const stop = document.getElementById('dy-analyzer-stop');
    if (stop) {
      stop.textContent = '已请求停止';
      stop.style.pointerEvents = 'none';
    }
  }

  function removeCollectButton() {
    const b = document.getElementById('dy-analyzer-btn');
    if (b) b.remove();
  }

  async function collectProfile() {
    const startBtn = document.getElementById('dy-analyzer-start');
    const stopBtn = document.getElementById('dy-analyzer-stop');
    const root = document.querySelector('[data-e2e="user-post-list"]');
    if (!root) {
      showToast('未找到作品列表（user-post-list），请确认在「作品」tab');
      return;
    }
    const cfg = await getConfig();
    // 卡片解析用占位作者；真实归属在上报前统一确定（见 collectProfile 尾部）
    const author = { author_name: '', author_id: '' };
    const scroller = P.findScrollContainer(root, document);
    console.log(
      '[dy-analyzer] 采集开始: scroller=',
      scroller ? scroller.tagName + '.' + String(scroller.className || '').slice(0, 40) : 'none(window)',
      '初始li=', root.querySelectorAll('li').length,
      'hook已缓存=', hookMap.size,
    );
    stopRequested = false;
    startBtn.textContent = P.progressLabel(0);
    startBtn.style.pointerEvents = 'none';
    if (stopBtn) {
      stopBtn.textContent = '停止';
      stopBtn.style.pointerEvents = 'auto';
      stopBtn.style.display = 'block';
    }

    const seen = new Set();
    const collected = [];
    let roundsWithoutNew = 0;
    let lastScrollHeight = -1;
    let noGrowRounds = 0;

    try {
      while (!stopRequested && seen.size < MAX_VIDEOS && roundsWithoutNew < 3 && noGrowRounds < 3) {
        const cards = P.parseProfileCards(root, author);
        let added = 0;
        for (const card of cards) {
          // limited 模式防页面篡改：卡片链接里的 secUid 必须与当前登录账号一致
          if (complianceLimited && card.sec_uid && card.sec_uid !== cfg.mySecUid) continue;
          if (!seen.has(card.video_id)) {
            seen.add(card.video_id);
            // hook 数据优先补全（互动/发布时间），DOM 卡片兜底
            const merged = P.mergeCardWithHook(card, hookMap.get(card.video_id));
            collected.push(merged);
            added += 1;
          }
        }
        roundsWithoutNew = added === 0 ? roundsWithoutNew + 1 : 0;
        startBtn.textContent = P.progressLabel(seen.size);
        const scrollHeight = scroller ? scroller.scrollHeight : document.documentElement.scrollHeight;
        const scrollTop = scroller ? scroller.scrollTop : window.scrollY;
        const clientHeight = scroller ? scroller.clientHeight : window.innerHeight;
        if (scrollHeight === lastScrollHeight) {
          noGrowRounds += 1;
        } else {
          noGrowRounds = 0;
          lastScrollHeight = scrollHeight;
        }
        console.log(
          '[dy-analyzer] 一轮: li=', root.querySelectorAll('li').length,
          'seen=', seen.size, '本轮新增=', added,
          'scroll=', scrollTop, '/', scrollHeight, '/', clientHeight,
          '无新增轮=', roundsWithoutNew, '高度不变轮=', noGrowRounds,
        );
        if (seen.size >= MAX_VIDEOS) break;
        if (scroller) {
          scroller.scrollTop = scroller.scrollHeight;
        } else {
          window.scrollTo(0, document.documentElement.scrollHeight);
        }
        await sleep(1500 + Math.random() * 1500);
        await waitForGrowth(root, seen.size);
      }

      if (stopRequested && seen.size === 0) {
        showToast('已取消，未采集到数据');
        return;
      }

      const missingCount = collected.reduce(
        (sum, c) => sum + (c.missing_fields || []).length,
        0,
      );
      // 主页采集归属：limited 或「自己主页」用登录配置；否则用 hook 中 sec_uid 匹配页面主人的真实作者
      const pageSecUid = (collected[0] && collected[0].sec_uid) || '';
      let owner;
      if (complianceLimited || (pageSecUid && cfg.mySecUid === pageSecUid)) {
        owner = { author_name: cfg.myNickname, author_id: cfg.myUid };
      } else {
        owner = P.resolvePageOwnerFromHooks([...hookMap.values()], pageSecUid)
          || { author_name: '', author_id: '' };
      }
      for (const rec of collected) {
        rec.author_id = owner.author_id;
        rec.author_name = owner.author_name;
      }
      const batchAuthorId = owner.author_id;
      const rejected = [];
      for (let i = 0; i < collected.length; i += BATCH_SIZE) {
        const batch = collected.slice(i, i + BATCH_SIZE);
        try {
          const res = await report(batch, 'https://www.douyin.com/user/' + cfg.mySecUid);
          console.log(
            '[dy-analyzer] 批次上报: batch=', batch.length,
            'accepted=', res.accepted, 'upserted=', res.upserted,
            'rejected=', (res.rejected || []).length,
          );
          for (const r of res.rejected || []) {
            rejected.push(r);
            if (rejected.length <= 3) console.log('[dy-analyzer] 拒绝原因:', r);
          }
        } catch (e) {
          console.warn('[dy-analyzer] 批次上报异常:', e && e.message ? e.message : e);
          rejected.push({ video_id: 'batch' + i, reason: String(e.message || e) });
        }
        try {
          const idsRes = await reportIds(P.idsFromBatch(batch), batchAuthorId);
          console.log('[dy-analyzer] 批内 ids 已保留:', idsRes.added, '新增 /', idsRes.total, '总计');
        } catch (e) {
          console.warn('[dy-analyzer] 批内 ids 保留失败:', e && e.message ? e.message : e);
        }
      }
      let head;
      if (stopRequested) {
        head = '已手动停止';
      } else if (seen.size >= MAX_VIDEOS) {
        head = '采集完成（已达采集上限 ' + MAX_VIDEOS + ' 条）';
      } else {
        head = '采集完成';
      }
      showToast(
        head + '：成功 ' + collected.length + ' 条，字段缺失 ' +
        missingCount + ' 处，被拒 ' + rejected.length + ' 条',
      );
    } catch (e) {
      showToast('采集出错：' + (e && e.message ? e.message : e));
    } finally {
      startBtn.textContent = '开始采集';
      startBtn.style.pointerEvents = 'auto';
      if (stopBtn) {
        stopBtn.style.display = 'none';
        stopBtn.style.pointerEvents = 'auto';
        stopBtn.textContent = '停止';
      }
      stopRequested = false;
    }
  }

  /* ---------- 详情页模式 ---------- */

  /** 页面是否包含指向「当前登录账号」的作者链接（详情页作者区必有一个）。 */
  function hasSelfAuthorLink(mySecUid) {
    if (!mySecUid) return false;
    return !!document.querySelector('a[href*="/user/' + mySecUid + '"]');
  }

  /** 当前页面是否包含详情数据容器（主页浮层或独立 /video/ 页均适用）。 */
  function isDetailView() {
    return !!document.querySelector('[data-e2e="feed-video"]');
  }

  /** 同步当前视频详情；manual=true 时所有失败都给出明确提示（用于手动排查）。 */
  async function maybeCollectDetail(manual) {
    if (!isDetailView()) {
      if (manual) showToast('当前页面没有详情数据（feed-video）');
      return false;
    }
    const cfg = await getConfig();
    if (!cfg.mySecUid) {
      showToast('请先在自己主页点一次「开始采集」，再浏览视频详情页');
      return false;
    }
    if (!hasSelfAuthorLink(cfg.mySecUid)) {
      console.log('[dy-analyzer] 非自己视频，跳过:', location.href);
      if (manual) showToast('当前视频作者不是自己，不采集');
      return false; // 别人的视频，忽略
    }
    const videoEl = document.querySelector('[data-e2e="feed-video"]');
    if (!videoEl) {
      console.log('[dy-analyzer] feed-video 未就绪，重试:', location.href);
      if (manual) showToast('详情数据（feed-video）尚未加载，请稍后重试');
      return false;
    }
    const detail = P.parseVideoDetail(document);
    if (!detail) {
      showToast('未解析到 video_id');
      return false;
    }
    const key = 'detail_last_' + detail.video_id;
    const stored = await storageGet(key);
    if (stored[key] && Date.now() - stored[key] < DETAIL_DEBOUNCE_MS) {
      showToast('该视频 60 秒内已同步过，请稍后再试');
      return false;
    }
    await storageSet({ [key]: Date.now() });
    try {
      const payload = Object.assign({}, detail, {
        author_name: cfg.myNickname,
        author_id: cfg.myUid,
      });
      const res = await report([payload], 'https://www.douyin.com/user/' + cfg.mySecUid);
      const missing = (detail.missing_fields || []).length;
      console.log('[dy-analyzer] 详情同步成功:', detail.video_id, 'missing:', detail.missing_fields);
      showToast(
        '已同步该视频详情（' + detail.video_id + '）' +
        (missing ? '，字段缺失 ' + missing + ' 处' : ''),
      );
      return true;
    } catch (e) {
      showToast('同步失败：' + (e && e.message ? e.message : e));
      return false;
    }
  }

  function createDetailButton() {
    const old = document.getElementById('dy-analyzer-detail-btn');
    if (old) old.remove();
    const btn = document.createElement('div');
    btn.id = 'dy-analyzer-detail-btn';
    btn.textContent = '同步本页';
    btn.style.cssText =
      'position:fixed;right:16px;bottom:64px;z-index:2147483647;background:#67c23a;color:#fff;' +
      'border-radius:20px;padding:8px 14px;font-size:13px;cursor:pointer;' +
      'box-shadow:0 2px 8px rgba(0,0,0,.35);user-select:none;font-family:system-ui,sans-serif;';
    btn.addEventListener('click', async () => {
      btn.textContent = '同步中…';
      await maybeCollectDetail(true);
      btn.textContent = '同步本页';
    });
    document.body.appendChild(btn);
    return btn;
  }

  function removeDetailButton() {
    const b = document.getElementById('dy-analyzer-detail-btn');
    if (b) b.remove();
  }

  /* ---------- 启动（主页模式） ---------- */

  function startDetailMode() {
    if (detailStarted) return;
    detailStarted = true;
    createDetailButton();
    setTimeout(async () => {
      if (isDetailView()) {
        await maybeCollectDetail();
      } else {
        console.log('[dy-analyzer] feed-video 未出现，放弃自动同步:', location.href);
      }
    }, 1200);
  }

  function init() {
    homeButtonAdded = false;
    getConfig().then((cfg) => {
      complianceLimited = cfg.complianceMode === 'limited';
      if (isOwnProfile(complianceLimited)) {
        const data = readRenderData();
        const info = data && data.app && data.app.user && data.app.user.info;
        if (info) {
          // 以当前主页主人的身份为准，覆盖可能变化的缓存
          storageSet({
            [KEY_UID]: info.uid,
            [KEY_SEC_UID]: info.secUid,
            [KEY_NICKNAME]: info.nickname,
          });
        }
        const addButtonWhenReady = () => {
          if (document.querySelector('[data-e2e="user-post-list"]')) {
            createCollectButton();
            return true;
          }
          return false;
        };
        if (!addButtonWhenReady()) {
          new MutationObserver((_, obs) => {
            if (addButtonWhenReady()) obs.disconnect();
          }).observe(document.body, { childList: true, subtree: true });
        }
      }
    });
  }

  /** 详情模式常驻监听：检测 feed-video 出现/消失/切换，管理按钮与自动同步。 */
  function watchDetail() {
    let lastVid = '';
    const check = () => {
      const vidEl = document.querySelector('[data-e2e="feed-video"]');
      const vid = vidEl ? (vidEl.getAttribute('data-e2e-vid') || '') : '';
      if (vid && vid !== lastVid) {
        lastVid = vid;
        detailStarted = false;
        startDetailMode();
      } else if (!vid && lastVid) {
        lastVid = '';
        detailStarted = false;
        removeDetailButton();
      }
    };
    new MutationObserver(check).observe(document.body, { childList: true, subtree: true });
    check();
  }

  /** SPA 路由监听：抖音页面切换可能不刷新页面，轮询 pathname 变化重新初始化。 */
  function watchRoute() {
    const now = location.pathname;
    if (now !== lastPath) {
      lastPath = now;
      init();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      init();
      watchDetail();
      setupHookListener();
    });
  } else {
    init();
    watchDetail();
    setupHookListener();
  }
  setInterval(watchRoute, 800);
})();
