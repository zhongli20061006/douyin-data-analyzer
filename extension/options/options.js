const KEY = 'backendBaseUrl'
const MODE_KEY = 'complianceMode'
const TOKEN_KEY = 'apiToken'
const DEFAULT = 'http://127.0.0.1:8001'
const input = document.getElementById('backend')
const modeSel = document.getElementById('mode')
const tokenInput = document.getElementById('token')
const statusEl = document.getElementById('status')

chrome.storage.local.get([KEY, MODE_KEY, TOKEN_KEY]).then((data) => {
  input.value = data[KEY] || DEFAULT
  modeSel.value = data[MODE_KEY] || 'limited'
  tokenInput.value = data[TOKEN_KEY] || ''
})

function normalize(value) {
  let v = String(value || '').trim().replace(/\/+$/, '')
  if (v && !/^https?:\/\//i.test(v)) v = 'http://' + v
  return v || DEFAULT
}

document.getElementById('save').addEventListener('click', () => {
  const value = normalize(input.value)
  chrome.storage.local.set({
    [KEY]: value,
    [MODE_KEY]: modeSel.value,
    [TOKEN_KEY]: tokenInput.value.trim(),
  }).then(() => {
    input.value = value
    statusEl.textContent = '已保存：' + value
    setTimeout(() => { statusEl.textContent = '' }, 2500)
  })
})

document.getElementById('reset').addEventListener('click', () => {
  input.value = DEFAULT
  modeSel.value = 'limited'
  tokenInput.value = ''
  chrome.storage.local.set({ [KEY]: DEFAULT, [MODE_KEY]: 'limited', [TOKEN_KEY]: '' })
  statusEl.textContent = '已恢复默认'
  setTimeout(() => { statusEl.textContent = '' }, 2500)
})
