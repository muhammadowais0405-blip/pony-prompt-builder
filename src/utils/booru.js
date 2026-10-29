import * as XLSX from 'xlsx';
import uFuzzy from '@leeoniya/ufuzzy';

const uf = new uFuzzy({ intraMode: 1 });
let cachedIndex = null;
let cachedHaystack = null;

/**
 * Normalizes a tag for searching by replacing underscores with spaces,
 * lowercasing, and stripping special characters.
 */
export function normalizeTag(tag) {
  if (!tag) return '';
  return tag.replace(/_/g, ' ').toLowerCase().replace(/[^a-z0-9 ]/g, '');
}

/**
 * Extracts the tag currently being typed based on the cursor position.
 * e.g., "masterpiece, blonde_ha|" returns "blonde_ha"
 */
export function getCurrentTag(text, cursorPosition) {
  if (!text) return { term: '', start: 0, end: 0 };
  
  // Find the boundaries of the tag around the cursor
  const textBefore = text.substring(0, cursorPosition);
  const textAfter = text.substring(cursorPosition);
  
  const lastCommaBefore = textBefore.lastIndexOf(',');
  const firstCommaAfter = textAfter.indexOf(',');
  
  const start = lastCommaBefore === -1 ? 0 : lastCommaBefore + 1;
  const end = firstCommaAfter === -1 ? text.length : cursorPosition + firstCommaAfter;
  
  const term = text.substring(start, end).trim();
  return { term, start, end };
}

/**
 * Parses a single Excel/CSV/JSON file buffer or text into an array of tag objects.
 * Columns: 0: tag, 1: aliases, 2: count
 */
export function parseBooruExcel(data, fileIndex = 0, isJson = false, isText = false) {
  try {
    if (isJson) {
      const text = new TextDecoder().decode(data);
      const parsed = JSON.parse(text);
      let dataArray = Array.isArray(parsed) ? parsed : [];
      if (!Array.isArray(parsed)) {
        // Handle object formats if needed, or assume array of objects
        if (parsed.tags && Array.isArray(parsed.tags)) dataArray = parsed.tags;
      }
      return dataArray.map((item, idx) => {
        let tag = item.tag || item.name || '';
        let count = item.count || item.posts || 0;
        let aliases = item.aliases || [];
        if (!Array.isArray(aliases)) {
           aliases = String(aliases).split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
        }
        if (!tag || String(tag).trim() === '') return null;
        return {
          tag: String(tag).trim(),
          count: Number(String(count).replace(/,/g, '')) || 0,
          type: item.type || 'general',
          aliases: aliases,
          fileIndex
        };
      }).filter(Boolean);
    }

    if (isText) {
      const text = data instanceof Uint8Array ? new TextDecoder().decode(data) : String(data);
      const lines = text.split(/\r?\n/);
      return lines.map(line => {
        const trimmed = line.trim();
        if (!trimmed) return null;
        
        const parts = trimmed.split(',');
        const tag = parts[0].trim();
        if (!tag) return null;

        let count = 0;
        let aliases = [];
        
        if (parts.length > 1) {
          const parsedCount = parseInt(parts[1].trim(), 10);
          if (!isNaN(parsedCount)) {
            count = parsedCount;
            if (parts.length > 2) {
              aliases = parts.slice(2).join(',').replace(/"/g, '').split(',').map(a => a.trim()).filter(Boolean);
            }
          } else {
            aliases = parts.slice(1).join(',').replace(/"/g, '').split(',').map(a => a.trim()).filter(Boolean);
          }
        }

        return {
          tag,
          count,
          type: 'general',
          aliases,
          fileIndex
        };
      }).filter(Boolean);
    }
  } catch (err) {
    console.error('Error parsing non-Excel format:', err);
    return [];
  }

  const workbook = XLSX.read(data, { type: 'array' });
  const firstSheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[firstSheetName];

  const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
  if (rows.length === 0) return [];

  const firstRow = rows[0];
  const isHeader = firstRow.some(cell => {
    const val = String(cell).toLowerCase();
    return val.includes('tag') || val.includes('count') || val.includes('alias');
  });

  const dataRows = isHeader ? rows.slice(1) : rows;

  return dataRows.map(row => {
    // New Order: [0] tag, [1] aliases, [2] count
    let tag, count, aliases;
    if (row.length === 3) {
      [tag, count, aliases] = row;
    } else {
       [tag, count, aliases] = row;
    }
    if (!tag || String(tag).trim() === '') return null;

    return {
      tag: String(tag).trim(),
      count: Number(String(count).replace(/,/g, '')) || 0,
      type: 'general', // Defaulting for now as requested
      aliases: aliases ? String(aliases).split(',').map(s => s.trim().toLowerCase()).filter(Boolean) : [],
      fileIndex // Store file priority
    };
  }).filter(Boolean);
}

/**
 * Searches the indexed tags using uFuzzy matching.
 */
export function fuzzyMatchTags(index, query) {
  if (!query || query.length < 2) return [];

  const rawQuery = query.toLowerCase();
  
  // Escape regex special chars except *
  const escapedQuery = rawQuery.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  const regexQuery = escapedQuery.replace(/\*/g, '.*');
  
  // Booru prefix matching. Starts with the regex by default, 
  // but if it has a wildcard we just test the regex.
  const regex = new RegExp(`^${regexQuery}`);

  const results = [];
  
  for (let i = 0; i < index.length; i++) {
    const item = index[i];
    const tagMatch = regex.test(item.tag.toLowerCase());
    
    let aliasMatch = null;
    if (!tagMatch && item.aliases) {
        aliasMatch = item.aliases.find(a => regex.test(a.toLowerCase()));
    }
    
    if (tagMatch || aliasMatch) {
       results.push({
           ...item,
           matchType: aliasMatch ? 'alias' : 'tag',
           matchedAlias: aliasMatch,
       });
    }
  }

  // Sort by count descending
  results.sort((a, b) => (b.count || 0) - (a.count || 0));
  
  return results.slice(0, 50);
}

/**
 * Builds relationships between tags.
 */
export function buildRelationships(index) {
  const relationships = {};
  
  // Track alias mapping & stats
  const aliasMap = {};
  const tagDb = {}; // string to item
  
  // Build maps
  index.forEach(item => {
    const mainNorm = normalizeTag(item.tag);
    if (!tagDb[mainNorm] || item.count > tagDb[mainNorm].count) {
      tagDb[mainNorm] = item;
    }
    
    item.aliases.forEach(alias => {
      const normAlias = normalizeTag(alias);
      if (!aliasMap[normAlias]) aliasMap[normAlias] = [];
      if (!aliasMap[normAlias].includes(item.tag)) {
        aliasMap[normAlias].push(item.tag);
      }
    });
  });

  index.forEach(item => {
    const rels = [];
    
    // 1. Alias family
    item.aliases.forEach(alias => {
      const normAlias = normalizeTag(alias);
      if (aliasMap[normAlias]) {
        aliasMap[normAlias].forEach(relatedTag => {
          if (relatedTag !== item.tag && !rels.some(r => r.tag === relatedTag)) {
            const relItem = tagDb[normalizeTag(relatedTag)];
            rels.push({
              tag: relatedTag,
              count: relItem ? relItem.count : 0,
              relation: 'alias group'
            });
          }
        });
      }
    });

    if (rels.length > 0) {
      rels.sort((a, b) => b.count - a.count);
      relationships[item.tag] = { related: rels.slice(0, 6) };
    }
  });

  return relationships;
}

// Database maps for O(1) lookups
let canonicalMap = new Map();
let aliasMap = new Map();
let dbBuiltForIndex = null;

function buildDbIfNeeded(index) {
  if (dbBuiltForIndex === index) return;
  
  canonicalMap.clear();
  aliasMap.clear();
  
  index.forEach(item => {
    const norm = normalizeTag(item.tag);
    if (!canonicalMap.has(norm) || item.count > canonicalMap.get(norm).count) {
      canonicalMap.set(norm, item);
    }
    
    item.aliases.forEach(a => {
      const aNorm = normalizeTag(a);
      if (!aliasMap.has(aNorm) || item.count > aliasMap.get(aNorm).count) {
        aliasMap.set(aNorm, item);
      }
    });
  });
  
  dbBuiltForIndex = index;
}

/**
 * Scans a tag string and finds alias/partial replacements efficiently using O(1) hash maps.
 */
export function analyzeTagsForReplacements(index, tagString) {
  if (!tagString || !index || !index.length) return [];
  
  buildDbIfNeeded(index);
  
  const tags = tagString.split(',').map(t => t.trim()).filter(Boolean);
  const results = [];
  
  for (const tag of tags) {
    const normalizedTag = normalizeTag(tag);
    if (!normalizedTag) continue;

    // 1. Exact canonical
    if (canonicalMap.has(normalizedTag)) {
      continue;
    }

    // 2. Exact alias match
    if (aliasMap.has(normalizedTag)) {
      const match = aliasMap.get(normalizedTag);
      results.push({
        original: tag,
        canonical: match.tag,
        count: match.count,
        matchType: 'alias',
        matchedPortion: tag,
      });
      continue;
    }

    // 3. Substring/Phrase breakdown (replaces the O(N*M) loop)
    // Create n-grams from the words to check against O(1) maps
    const words = normalizedTag.split(/\s+/).filter(w => w.length > 2);
    if (words.length > 1) {
      let foundPartial = false;
      const denormalize = (str) => str.replace(/_/g, ' ');

      // Try chunk sizes from large to small
      for (let size = words.length; size >= 1 && !foundPartial; size--) {
        for (let i = 0; i <= words.length - size; i++) {
          const chunk = words.slice(i, i + size).join(' ');
          // Try to look up the chunk
          const chunkMatch = canonicalMap.get(chunk) || aliasMap.get(chunk);
          if (chunkMatch && chunk.length > 3 && chunk !== normalizedTag) {
            results.push({
              original: tag,
              canonical: chunkMatch.tag,
              count: chunkMatch.count,
              matchType: 'partial',
              matchedPortion: denormalize(chunk),
            });
            foundPartial = true;
            break;
          }
        }
      }
      if (foundPartial) continue;
    }
  }
  
  return results;
}

/**
 * Maps Booru tag types to UI colors.
 */
export function getBooruTypeColor(type) {
  const t = String(type).toLowerCase();
  if (t.includes('char') || t === '4') return '#10b981'; // Green
  if (t.includes('copy') || t === '3') return '#a855f7'; // Purple
  if (t.includes('art') || t === '1') return '#f43f5e'; // Red
  if (t.includes('meta') || t === '6') return '#f59e0b'; // Orange
  if (t.includes('spec') || t === '5') return '#f43f5e'; // Red-ish
  return '#3b82f6'; // Blue (General)
}
