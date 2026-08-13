/* 抖音个人视频数据分析器 —— 页面世界网络 hook（被动观察接口响应）
 * 仅读取已存在的响应，不修改请求、不发送新请求。
 * 数据通道：CustomEvent('dy-analyzer-data') + documentElement.__dyAnalyzerQueue 缓冲。
 */
(function () {
  'use strict';
  const QUEUE_KEY = '__dyAnalyzerQueue';
  const MAX_QUEUE = 500;
  const EVENT_NAME = 'dy-analyzer-data';

  function ensureQueue() {
    if (!document.documentElement[QUEUE_KEY]) {
      document.documentElement[QUEUE_KEY] = [];
    }
    return document.documentElement[QUEUE_KEY];
  }

  /** URL 快速路径：作品列表 / 详情接口。 */
  function matchUrl(url) {
    return /\/aweme\/v\d+\/web\/(aweme\/post|aweme\/detail)/.test(url || '');
  }

  /** 结构兜底：只要响应 JSON 含 aweme_list 或 aweme.aweme_id 即可解析。 */
  function hasStructure(json) {
    if (!json || typeof json !== 'object') return false;
    if (Array.isArray(json.aweme_list) && json.aweme_list.length) return true;
    if (json.aweme && json.aweme.aweme_id) return true;
    return false;
  }

  function emit(json) {
    const msg = { source: 'dy-analyzer-hook', data: json };
    try {
      document.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: JSON.stringify(msg) }));
    } catch (e) { /* 页面可能在关闭 */ }
    const queue = ensureQueue();
    queue.push(JSON.stringify(msg));
    if (queue.length > MAX_QUEUE) queue.shift();
  }

  // XHR 观察
  const origOpen = XMLHttpRequest.prototype.open;
  const origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url) {
    this.__dyUrl = String(url || '');
    return origOpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function () {
    this.addEventListener('load', function () {
      try {
        const url = this.__dyUrl || '';
        if (!matchUrl(url)) return;
        const json = JSON.parse(this.responseText || '');
        if (hasStructure(json)) emit(json);
      } catch (e) { /* 非 JSON 或解析失败，忽略 */ }
    });
    return origSend.apply(this, arguments);
  };

  // fetch 观察
  const origFetch = window.fetch;
  window.fetch = function () {
    const input = arguments[0];
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    return origFetch.apply(this, arguments).then(function (resp) {
      if (matchUrl(url)) {
        resp.clone().text().then(function (body) {
          try {
            const json = JSON.parse(body);
            if (hasStructure(json)) emit(json);
          } catch (e) { /* 忽略 */ }
        }).catch(function () { /* 忽略 */ });
      }
      return resp;
    });
  };
})();
