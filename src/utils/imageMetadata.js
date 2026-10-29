export async function extractImageMetadata(file) {
  // First, let's read the file as an ArrayBuffer
  const buffer = await file.arrayBuffer();
  const view = new DataView(buffer);
  
  const textChunks = {};

  // Check if it's a PNG
  if (view.getUint32(0) !== 0x89504e47 || view.getUint32(4) !== 0x0d0a1a0a) {
    // Not a PNG, throw or return empty
    return null;
  }

  let offset = 8;
  while (offset < buffer.byteLength) {
    const length = view.getUint32(offset);
    const type = String.fromCharCode(
      view.getUint8(offset + 4),
      view.getUint8(offset + 5),
      view.getUint8(offset + 6),
      view.getUint8(offset + 7)
    );
    
    if (type === 'IEND') break;

    if (type === 'tEXt') {
      const dataOffset = offset + 8;
      let keyword = '';
      let i = 0;
      while (i < length) {
        const charCode = view.getUint8(dataOffset + i);
        if (charCode === 0) {
          i++;
          break;
        }
        keyword += String.fromCharCode(charCode);
        i++;
      }
      
      const textBytes = new Uint8Array(buffer, dataOffset + i, length - i);
      const textDecoder = new TextDecoder('utf-8');
      const text = textDecoder.decode(textBytes);
      textChunks[keyword] = text;
    } else if (type === 'iTXt') {
      const dataOffset = offset + 8;
      let keyword = '';
      let i = 0;
      while (i < length) {
        const charCode = view.getUint8(dataOffset + i);
        if (charCode === 0) {
          i++;
          break;
        }
        keyword += String.fromCharCode(charCode);
        i++;
      }
      
      const compressionFlag = view.getUint8(dataOffset + i);
      const compressionMethod = view.getUint8(dataOffset + i + 1);
      i += 2;
      
      // skip language tag
      while (i < length && view.getUint8(dataOffset + i) !== 0) i++;
      i++;
      // skip translated keyword
      while (i < length && view.getUint8(dataOffset + i) !== 0) i++;
      i++;
      
      const textBytes = new Uint8Array(buffer, dataOffset + i, length - i);
      
      if (compressionFlag === 0) {
        textChunks[keyword] = new TextDecoder('utf-8').decode(textBytes);
      } else if (compressionFlag === 1 && compressionMethod === 0) {
        textChunks[keyword] = await decompressZlib(textBytes);
      }
    }
    
    offset += 8 + length + 4; // length + type + data + crc
  }
  
  return textChunks;
}

async function decompressZlib(uint8Array) {
  try {
    const ds = new DecompressionStream('deflate'); // zlib is deflate
    const writer = ds.writable.getWriter();
    writer.write(uint8Array);
    writer.close();
    
    const reader = ds.readable.getReader();
    const chunks = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
    
    const totalLength = chunks.reduce((acc, val) => acc + val.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }
    
    return new TextDecoder('utf-8').decode(result);
  } catch (e) {
    console.error('Failed to decompress iTXt chunk', e);
    return '';
  }
}

export function parseA1111Parameters(parameters) {
  if (!parameters) return null;
  const parts = parameters.split('\nNegative prompt: ');
  let positive = parts[0];
  let negativeAndSettings = parts[1] || '';
  
  let negative = '';
  let settings = '';
  let settingsStartIndex = negativeAndSettings.lastIndexOf('\nSteps: ');
  if (settingsStartIndex === -1) {
    settingsStartIndex = negativeAndSettings.lastIndexOf('Steps: ');
    if (settingsStartIndex === 0) { // no negative prompt, just settings
       settings = negativeAndSettings;
    } else if (settingsStartIndex > 0) {
       negative = negativeAndSettings.substring(0, settingsStartIndex).trim();
       settings = negativeAndSettings.substring(settingsStartIndex).trim();
    } else {
       negative = negativeAndSettings.trim();
    }
  } else {
    negative = negativeAndSettings.substring(0, settingsStartIndex).trim();
    settings = negativeAndSettings.substring(settingsStartIndex).trim();
  }
  
  if (!negative && !settings && positive.indexOf('Steps: ') > -1) {
    const pSplit = positive.split('\nSteps: ');
    if (pSplit.length > 1) {
        positive = pSplit[0];
        settings = 'Steps: ' + pSplit[1];
    }
  }
  return { positive, negative, settings };
}
