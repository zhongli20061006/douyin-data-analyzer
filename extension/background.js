/* 抖音个人视频数据分析器 — background service worker
 * 只做一件事：把 content script 的上报请求转发到本地后端。
 * 扩展上下文 fetch 凭 host_permissions 跨域，不受页面 CORS 限制；不改动请求内容。
 */
'use strict';

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || message.type !== 'dy-analyzer-request') return;
  (async () => {
    try {
      const resp = await fetch(message.url, {
        method: message.method || 'POST',
        headers: message.headers || {},
        body: message.body,
      });
      sendResponse({ ok: true, status: resp.status, bodyText: await resp.text() });
    } catch (e) {
      sendResponse({ ok: false, error: e && e.message ? e.message : String(e) });
    }
  })();
  return true;
});
