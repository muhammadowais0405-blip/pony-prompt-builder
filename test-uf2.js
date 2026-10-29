import uFuzzy from '@leeoniya/ufuzzy';
const uf = new uFuzzy({ intraMode: 1 });
const haystack = ["blonde hair", "hair blonde", "masterpiece blonde_hair", "1girl bg"];

let query = "hair bl";
let terms = query.split(" ").filter(w => w.length > 0);
let idxs = uf.filter(haystack, terms[0]);
for (let i = 1; i < terms.length; i++) {
  if (idxs && idxs.length > 0) {
    let nextIdxs = uf.filter(haystack, terms[i]);
    // intersect
    idxs = idxs.filter(id => nextIdxs.includes(id));
  }
}
console.log(idxs ? idxs.map(i => haystack[i]) : []);
