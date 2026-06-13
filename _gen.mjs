import { writeFileSync } from 'fs';
const COUNTRIES = 'https://raw.githubusercontent.com/mledoze/countries/master/countries.json';
const WB = 'https://api.worldbank.org/v2/country/all/indicator/SP.POP.TOTL?format=json&per_page=400&mrnev=1';
const PASS = 'https://raw.githubusercontent.com/ilyankou/passport-index-dataset/master/passport-index-tidy-iso3.csv';
const UA = { 'User-Agent': 'TerraExplorer/1.0 (educational project) node' };
const sleep = ms => new Promise(r => setTimeout(r, ms));

const [all, wbRaw, passCsv] = await Promise.all([
  fetch(COUNTRIES).then(r => r.json()), fetch(WB).then(r => r.json()), fetch(PASS).then(r => r.text())
]);

const popByIso3 = {};
wbRaw[1].forEach(row => { if (row.countryiso3code && row.value != null) popByIso3[row.countryiso3code] = row.value; });
const POP_OVERRIDES = { TWN:23420000,UNK:1761985,VAT:764,ESH:565581,GUF:290691,GLP:395700,MTQ:364508,REU:873102,MYT:320901,COK:15040,NIU:1937,FLK:3662,TKL:1893,WLF:11558,SHN:5314,BLM:10994,MAF:38659,SPM:5840,MSR:4922,AIA:15753,ALA:30129,GGY:63950,JEY:103267,NFK:2188,PCN:47,BVT:0,CXR:1692,CCK:593,BES:26221,SGS:30,IOT:3000,ATF:150,HMD:0,UMI:300 };
Object.keys(POP_OVERRIDES).forEach(k => { if (popByIso3[k] == null) popByIso3[k] = POP_OVERRIDES[k]; });

const ACCESS = new Set(['visa free', 'visa on arrival', 'eta']);
const scoreByIso3 = {};
passCsv.split(/\r?\n/).slice(1).forEach(line => {
  const p = line.split(','); if (p.length < 3) return;
  const passport = p[0].trim(), req = p[2].trim(); if (!passport) return;
  if (scoreByIso3[passport] == null) scoreByIso3[passport] = 0;
  if (ACCESS.has(req) || /^\d+$/.test(req)) scoreByIso3[passport] += 1;
});
const uniq = [...new Set(Object.values(scoreByIso3))].sort((a, b) => b - a);
const rankOf = {}; uniq.forEach((s, i) => { rankOf[s] = i + 1; });
const PASS_ALIAS = { UNK: 'XKX' };
const imgByIso3 = {};
const adj = c => (c.demonyms && c.demonyms.eng && c.demonyms.eng.m) ? c.demonyms.eng.m : null;

// Pass 1: batched pageimages (fast)
async function queryImages(titles, attempt = 0) {
  const url = 'https://en.wikipedia.org/w/api.php?action=query&format=json&prop=pageimages&piprop=thumbnail%7Coriginal&pithumbsize=500&redirects=1&titles=' + encodeURIComponent(titles.join('|'));
  try {
    const d = JSON.parse(await (await fetch(url, { headers: UA })).text());
    const q = d.query || {};
    const norm = {}; (q.normalized || []).forEach(n => norm[n.from] = n.to);
    const redir = {}; (q.redirects || []).forEach(n => redir[n.from] = n.to);
    const byTitle = {};
    Object.values(q.pages || {}).forEach(p => { byTitle[p.title] = (p.thumbnail && p.thumbnail.source) || (p.original && p.original.source) || null; });
    const out = {}; titles.forEach(t => { let x = norm[t] || t; x = redir[x] || x; out[t] = byTitle[x] || null; });
    return out;
  } catch (e) { if (attempt < 5) { await sleep(2500 * (attempt + 1)); return queryImages(titles, attempt + 1); } return {}; }
}
async function batchPass(getTitle) {
  const items = all.filter(c => !imgByIso3[c.cca3]).map(c => ({ c, title: getTitle(c) })).filter(x => x.title);
  for (let i = 0; i < items.length; i += 20) {
    const batch = items.slice(i, i + 20);
    const res = await queryImages(batch.map(b => b.title));
    batch.forEach(b => { if (res[b.title]) imgByIso3[b.c.cca3] = res[b.title]; });
    await sleep(1100);
  }
}
await batchPass(c => adj(c) ? adj(c) + ' passport' : null);
await batchPass(c => 'Passport of ' + c.name.common);
await batchPass(c => c.name.common + ' passport');
console.log('after pageimages:', Object.keys(imgByIso3).length);

// Pass 2: REST summary fallback for remaining (different image selector)
async function restImage(title) {
  try {
    const d = await (await fetch('https://en.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(title), { headers: UA })).json();
    return (d.originalimage && d.originalimage.source) || (d.thumbnail && d.thumbnail.source) || null;
  } catch (e) { return null; }
}
async function restPass(getTitle) {
  const items = all.filter(c => c.cca3 && !imgByIso3[c.cca3] && scoreByIso3[c.cca3] != null).map(c => ({ c, title: getTitle(c) })).filter(x => x.title);
  for (const it of items) {
    const img = await restImage(it.title);
    if (img) imgByIso3[it.c.cca3] = img;
    await sleep(350);
  }
}
await restPass(c => adj(c) ? adj(c) + ' passport' : null);
await restPass(c => c.name.common + ' passport');
await restPass(c => 'Passport of ' + c.name.common);
console.log('after REST fallback:', Object.keys(imgByIso3).length);

const slim = all.map(c => {
  const cca2 = (c.cca2 || '').toLowerCase(); const iso3 = c.cca3 || '';
  const passKey = scoreByIso3[iso3] != null ? iso3 : (PASS_ALIAS[iso3] || iso3);
  let passport = null;
  if (scoreByIso3[passKey] != null) { const vf = scoreByIso3[passKey]; passport = { visaFree: vf, rank: rankOf[vf] }; }
  return {
    name: { common: c.name && c.name.common, official: c.name && c.name.official },
    ccn3: c.ccn3 || '', cca3: iso3, cca2: cca2,
    region: c.region || '', subregion: c.subregion || '',
    capital: Array.isArray(c.capital) ? c.capital : [],
    population: popByIso3[iso3] != null ? popByIso3[iso3] : null,
    latlng: Array.isArray(c.latlng) ? c.latlng : null,
    currencies: c.currencies || {}, languages: c.languages || {},
    flags: cca2 ? { svg: 'https://flagcdn.com/' + cca2 + '.svg', png: 'https://flagcdn.com/w320/' + cca2 + '.png' } : { svg: '', png: '' },
    passportImage: imgByIso3[iso3] || '', passport: passport
  };
});
console.log('total', slim.length, 'passport', slim.filter(c => c.passport).length, 'image', slim.filter(c => c.passportImage).length);
console.log('still missing:', slim.filter(c => c.passport && !c.passportImage).map(c => c.name.common).join(', '));
writeFileSync('countries-data.js',
  '// Bundled country data — auto-generated, do not edit by hand.\n' +
  '// Sources: mledoze/countries (MIT), flagcdn.com, World Bank (SP.POP.TOTL),\n' +
  '// passport-index-dataset (visa-free score + rank), Wikipedia/Wikimedia (passport cover images).\n' +
  'var COUNTRIES_DATA = ' + JSON.stringify(slim) + ';\n', 'utf8');
console.log('wrote countries-data.js');
