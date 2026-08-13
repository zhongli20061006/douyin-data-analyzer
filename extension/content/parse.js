/* 抖音个人视频数据分析器 —— 纯 DOM 解析函数
 * 浏览器 content script 与 Node(jsdom) 测试共用；
 * 解析以 data-e2e + 结构定位为主，哈希 class 只作候选兜底。
 */
(function (root) {
  'use strict';

  /** 解析互动数字：236 / 4.0万 / 1.2亿 / 4,000 → 整数；失败返回 null。 */
  function parseCount(text) {
    if (text === null || text === undefined) return null;
    const t = String(text).trim().replace(/,/g, '');
    const m = t.match(/^(\d+(?:\.\d+)?)(\u4e07|\u4ebf)?$/); // 万|亿
    if (!m) return null;
    const n = parseFloat(m[1]);
    const unit = m[2];
    let value = n;
    if (unit === '\u4ebf') value = n * 1e8;      // 亿
    else if (unit === '\u4e07') value = n * 1e4; // 万
    return Math.round(value);
  }

  /** 从链接提取 secUid：支持作者主页路径 /user/MS4wLj... 与主页卡片查询参数 secUid=MS4wLj... */
  function extractSecUidFromHref(href) {
    const s = String(href || '');
    const m = s.match(/\/user\/(MS4wLj[^/?#]*)/) || s.match(/[?&]secUid=(MS4wLj[^&#]*)/);
    return m ? m[1] : '';
  }

  /** 在容器内找第一个「纯数字/万/亿」文本元素并解析。 */
  function countIn(el) {
    if (!el) return null;
    const nodes = el.querySelectorAll('div, span');
    for (const node of nodes) {
      const t = (node.textContent || '').trim();
      if (t && /^[\d.,\u4e07\u4ebf]+$/.test(t)) {
        const v = parseCount(t);
        if (v !== null) return v;
      }
    }
    return null;
  }

  /**
   * 解析主页作品列表（div[data-e2e="user-post-list"] > ul > li）。
   * @param {Element} root 列表容器
   * @param {{author_name?: string, author_id?: string}} author 作者信息（来自 RENDER_DATA）
   * @returns {Array<object>} 每条含 video_id/video_title/play_count/cover_url/sec_uid/
   *                          author_name/author_id/missing_fields；图文与无 video_id 卡片跳过。
   */
  function parseProfileCards(root, author) {
    const results = [];
    if (!root) return results;
    for (const li of root.querySelectorAll('li')) {
      const videoLink = li.querySelector('a[href*="/video/"]');
      if (!videoLink) continue; // 图文 /note/ 或其它卡片 → 跳过
      const href = videoLink.getAttribute('href') || '';
      const m = href.match(/\/video\/(\d+)/);
      if (!m) continue; // 连 video_id 都取不到 → 跳过
      const video_id = m[1];
      const missing = [];

      const titleEl = li.querySelector('p.frUrWD64') || li.querySelector('p.EB3BkdQ8');
      const video_title = titleEl ? (titleEl.textContent || '').trim() : '';
      if (!video_title) missing.push('video_title');

      const playValue = countIn(li.querySelector('div.jXmtohcJ'));
      const play_count = playValue === null ? 0 : playValue;
      if (playValue === null) missing.push('play_count');

      const img = li.querySelector('img');
      const cover_url = img ? (img.getAttribute('src') || '') : '';
      if (!cover_url) missing.push('cover_url');

      results.push({
        video_id: video_id,
        video_title: video_title,
        play_count: play_count,
        cover_url: cover_url,
        sec_uid: extractSecUidFromHref(href),
        author_name: (author && author.author_name) || '',
        author_id: (author && author.author_id) || '',
        missing_fields: missing,
      });
    }
    return results;
  }

  /**
   * 解析视频详情页互动数据。
   * @param {Element} root document 或详情页容器
   * @returns {object|null} video_id/like_count/comment_count/share_count/video_desc/
   *                        video_url/cover_url/author_sec_uid/play_count(null)/publish_time(null)/
   *                        missing_fields；video_id 缺失返回 null。
   */
  function parseVideoDetail(root) {
    let video_id = '';
    const vidEl = root.querySelector('[data-e2e="feed-video"]');
    if (vidEl && vidEl.getAttribute('data-e2e-vid')) {
      video_id = vidEl.getAttribute('data-e2e-vid').trim();
    }
    if (!video_id) {
      const url = root.URL || (root.defaultView && root.defaultView.location.href) || '';
      const m = String(url).match(/\/video\/(\d+)/);
      if (m) video_id = m[1];
    }
    if (!video_id) {
      // 主页浮层场景：URL 为 /user/self?...&modal_id=<视频ID>
      const url = root.URL || (root.defaultView && root.defaultView.location.href) || '';
      const m = String(url).match(/[?&]modal_id=(\d+)/);
      if (m) video_id = m[1];
    }
    if (!video_id) return null;
    const missing = [];

    const likeValue = countIn(root.querySelector('[data-e2e="video-player-digg"]'));
    const like_count = likeValue === null ? 0 : likeValue;
    if (likeValue === null) missing.push('like_count');

    const commentValue = countIn(root.querySelector('[data-e2e="feed-comment-icon"]'));
    const comment_count = commentValue === null ? 0 : commentValue;
    if (commentValue === null) missing.push('comment_count');

    const shareValue = countIn(root.querySelector('[data-e2e="video-player-share"]'));
    const share_count = shareValue === null ? 0 : shareValue;
    if (shareValue === null) missing.push('share_count');

    const collectValue = countIn(root.querySelector('[data-e2e="video-player-collect"]'));
    const collect_count = collectValue === null ? 0 : collectValue;
    if (collectValue === null) missing.push('collect_count');

    const descEl = root.querySelector('[data-e2e="video-desc"]');
    const video_desc = descEl ? (descEl.textContent || '').trim() : '';
    if (!video_desc) missing.push('video_desc');
    const titleEl = descEl ? descEl.querySelector('span') : null;
    const video_title = titleEl ? (titleEl.textContent || '').trim() : '';

    const authorLink = root.querySelector('a[href*="/user/MS4wLj"]');
    const author_sec_uid = authorLink
      ? extractSecUidFromHref(authorLink.getAttribute('href'))
      : '';

    let cover_url = '';
    const posterEl = root.querySelector('video[poster]');
    if (posterEl) {
      cover_url = posterEl.getAttribute('poster') || '';
    } else {
      const imgEl = root.querySelector('[data-e2e="feed-video"] img');
      if (imgEl) cover_url = imgEl.getAttribute('src') || '';
    }
    if (!cover_url) missing.push('cover_url');

    return {
      video_id: video_id,
      video_title: video_title,
      video_desc: video_desc,
      like_count: like_count,
      comment_count: comment_count,
      share_count: share_count,
      collect_count: collect_count,
      play_count: null,
      publish_time: null,
      video_url: 'https://www.douyin.com/video/' + video_id,
      cover_url: cover_url,
      author_sec_uid: author_sec_uid,
      missing_fields: missing,
    };
  }

  /** 秒级时间戳 → 本地时间 'YYYY-MM-DD HH:MM:SS'。 */
  function formatLocalTime(sec) {
    const d = new Date(Number(sec) * 1000);
    if (Number.isNaN(d.getTime())) return null;
    const pad = (n) => String(n).padStart(2, '0');
    return (
      d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' +
      pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds())
    );
  }

  /** 解析接口 JSON（aweme_list 或 aweme 详情结构）为记录数组。 */
  function parseAwemeList(json) {
    if (!json) return [];
    let list = [];
    if (Array.isArray(json.aweme_list)) {
      list = json.aweme_list;
    } else if (json.aweme && json.aweme.aweme_id) {
      list = [json.aweme];
    }
    const results = [];
    for (const aweme of list) {
      const video_id = String(aweme.aweme_id || '');
      if (!video_id) continue;
      const stats = aweme.statistics || {};
      const missing = [];
      const title = aweme.desc || '';
      if (!title) missing.push('video_title');

      const playValue = stats.play_count;
      const play_count = typeof playValue === 'number' && playValue >= 0 ? playValue : 0;
      if (typeof playValue !== 'number') missing.push('play_count');

      const numOf = (v, field) => {
        if (typeof v === 'number' && v >= 0) return v;
        missing.push(field);
        return 0;
      };
      const like_count = numOf(stats.digg_count, 'like_count');
      const comment_count = numOf(stats.comment_count, 'comment_count');
      const share_count = numOf(stats.share_count, 'share_count');
      const collect_count = numOf(stats.collect_count, 'collect_count');

      const author = aweme.author || {};
      const cover =
        aweme.video && aweme.video.cover && Array.isArray(aweme.video.cover.url_list)
          ? aweme.video.cover.url_list[0] || ''
          : '';
      if (!cover) missing.push('cover_url');

      results.push({
        video_id: video_id,
        video_title: title,
        video_desc: title,
        play_count: play_count,
        like_count: like_count,
        comment_count: comment_count,
        share_count: share_count,
        collect_count: collect_count,
        publish_time: aweme.create_time ? formatLocalTime(aweme.create_time) : null,
        cover_url: cover,
        author_name: author.nickname || '',
        author_id: author.uid ? String(author.uid) : '',
        sec_uid: author.sec_uid || '',
        missing_fields: missing,
      });
    }
    return results;
  }

  /** 从列表容器向上找可滚动祖先（作品列表懒加载容器）。 */
  function findScrollContainer(root, doc) {
    let el = root && root.parentElement;
    while (el && el !== doc.body && el !== doc.documentElement) {
      if (el.scrollHeight > el.clientHeight + 4) return el;
      const cs = el.ownerDocument.defaultView.getComputedStyle(el);
      if (/auto|scroll|overlay/.test(cs.overflowY)) return el;
      el = el.parentElement;
    }
    return null;
  }

  /** hook 数据优先补全 DOM 卡片：互动/发布时间以 hook 为准，播放量取较大可信值。 */
  function mergeCardWithHook(card, hook) {
    if (!hook) return card;
    return {
      video_id: card.video_id,
      video_title: hook.video_title || card.video_title,
      video_desc: hook.video_desc || card.video_desc || '',
      play_count:
        typeof hook.play_count === 'number' && hook.play_count > 0
          ? hook.play_count
          : card.play_count,
      like_count: hook.like_count,
      comment_count: hook.comment_count,
      share_count: hook.share_count,
      collect_count: hook.collect_count,
      publish_time: hook.publish_time,
      cover_url: hook.cover_url || card.cover_url,
      author_name: hook.author_name || card.author_name,
      author_id: hook.author_id || card.author_id,
      sec_uid: card.sec_uid || hook.sec_uid || '',
      missing_fields: hook.missing_fields && hook.missing_fields.length
        ? hook.missing_fields
        : card.missing_fields,
    };
  }

  /** 回放并清空 hook 缓冲队列（DOM 元素自定义属性，跨 world 共享）。 */
  function drainHookQueue(rootEl) {
    const queue = rootEl && Array.isArray(rootEl.__dyAnalyzerQueue)
      ? rootEl.__dyAnalyzerQueue
      : [];
    if (rootEl) rootEl.__dyAnalyzerQueue = [];
    const messages = [];
    for (const raw of queue) {
      try {
        const msg = JSON.parse(raw);
        if (msg && msg.source === 'dy-analyzer-hook') messages.push(msg);
      } catch (e) { /* 忽略坏消息 */ }
    }
    return messages;
  }

  /** 从一批记录中提取去重后的 video_id 列表（每批 ≤ 100，天然满足后端上限）。*/
  function idsFromBatch(records) {
    const seen = new Set();
    const ids = [];
    for (const r of records || []) {
      const vid = r && r.video_id ? String(r.video_id) : '';
      if (vid && !seen.has(vid)) {
        seen.add(vid);
        ids.push(vid);
      }
    }
    return ids;
  }

  /** 采集进度文案：采集中 N 条。*/
  function progressLabel(count) {
    return '采集中 ' + Number(count || 0) + ' 条';
  }

  /** 从 hook 记录中取第一个非空 author_id（真实作者）；可传入本次采集 videoIds 过滤残留；无则回退 fallback。 */
  function resolveAuthorId(hookRecords, fallback, videoIds) {
    const filter = videoIds ? new Set(videoIds) : null;
    for (const r of hookRecords || []) {
      if (!r) continue;
      if (filter && !filter.has(r.video_id)) continue;
      if (r && r.author_id) return String(r.author_id);
    }
    return fallback || '';
  }

  /** 从 hook 记录中找与页面 sec_uid 匹配的真实作者（合拍/残留作者因 sec_uid 不同被排除）；无匹配返回 null。 */
  function resolvePageOwnerFromHooks(hookRecords, pageSecUid) {
    if (!pageSecUid) return null;
    for (const r of hookRecords || []) {
      if (r && r.author_id && r.sec_uid === pageSecUid) {
        return { author_id: String(r.author_id), author_name: r.author_name || '' };
      }
    }
    return null;
  }

  const api = {
    parseCount, extractSecUidFromHref, parseProfileCards, parseVideoDetail,
    parseAwemeList, findScrollContainer, mergeCardWithHook, drainHookQueue,
    idsFromBatch, progressLabel, resolveAuthorId, resolvePageOwnerFromHooks,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root && !root.DouyinParse) root.DouyinParse = api;
})(typeof window !== 'undefined' ? window : globalThis);
