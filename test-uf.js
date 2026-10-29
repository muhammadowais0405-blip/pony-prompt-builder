import uFuzzy from '@leeoniya/ufuzzy';
const uf = new uFuzzy({ intraMode: 1 });
const haystack = ["blonde hair", "hair blonde", "masterpiece blonde_hair", "1girl bg"];
const idxs = uf.filter(haystack, "hair bl");
console.log(idxs ? idxs.map(i => haystack[i]) : []);
