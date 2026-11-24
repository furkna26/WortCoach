const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.resolve(__dirname, '..');

const vCode = fs.readFileSync(path.join(ROOT, 'js/verbHelper.js'), 'utf8');
const dictCode = fs.readFileSync(path.join(ROOT, 'js/dictionary.js'), 'utf8');

const networkCalls = [];

const originalFetch = fetch;
const trackingFetch = async (url, opts) => {
  networkCalls.push({
    url: String(url),
    headers: opts?.headers
  });
  return originalFetch(url, opts);
};

const ctx = {
  console,
  setTimeout,
  clearTimeout,
  fetch: trackingFetch,
  localStorage: { getItem: () => null, setItem: () => {} },
  window: {}
};
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(vCode, ctx);
vm.runInContext(dictCode, ctx);

async function testNetwork(query) {
  networkCalls.length = 0;
  console.log(`\n=================== Searching: "${query}" ===================`);
  const result = await ctx.DictionaryService.resolveToGermanEntry(query);
  console.log(`Resolved: ${result?.article ? result.article + ' ' : ''}${result?.germanWord} (TR: ${result?.meaningsTr})`);
  console.log(`Total Live Internet HTTP Requests Made: ${networkCalls.length}`);
  networkCalls.forEach((call, i) => {
    const u = new URL(call.url);
    console.log(`  ${i+1}. [${u.hostname}] ${u.pathname}?${decodeURIComponent(u.search.slice(1, 80))}...`);
  });
}

async function run() {
  await testNetwork('fare');
  await testNetwork('ayakkabi');
  await testNetwork('großartig');
  await testNetwork('schlafen');
  await testNetwork('gözlük');
}
run();
