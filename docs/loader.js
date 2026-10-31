// Auto-downloads game data from GitHub Release tar archives into OPFS.
// Streams each tar sequentially — no library needed.

const REPO = '4Sakens/mkw-web';
const RELEASE_TAG = 'game-data';
const ARCHIVES = [
  { name: 'game-data-core.tar', size: 856590848 },
  { name: 'game-data-video.tar', size: 1828199936 },
];
const TOTAL_BYTES = ARCHIVES.reduce((s, a) => s + a.size, 0);

const CONFIG_TOML = `[paths]
dvd_root = "/opfs/WiiCompiled/dvd"

[video]
window_width = 854
window_height = 480

[network]
enabled = false
`;

// ── Tar parser (streams 512-byte headers) ──

function decodeTarHeader(buf) {
  const td = new TextDecoder();
  const name = td.decode(buf.subarray(0, 100)).replace(/\0+$/, '');
  const sizeStr = td.decode(buf.subarray(124, 136)).replace(/\0+$/, '').trim();
  const size = parseInt(sizeStr, 8) || 0;
  const type = buf[156];
  // type 0 or ASCII '0' = regular file, '5' = directory, 'x'/'g' = pax header
  const isFile = type === 0 || type === 0x30;
  // GNU long name indicator
  const isLongName = type === 0x4C;
  // Check for pax extended header
  const isPax = type === 0x78 || type === 0x67;
  // Prefix (for POSIX ustar)
  const prefix = td.decode(buf.subarray(345, 500)).replace(/\0+$/, '');
  const fullName = prefix ? prefix + '/' + name : name;
  return { name: fullName, size, isFile, isLongName, isPax };
}

async function* tarEntries(reader) {
  let buffer = new Uint8Array(0);
  let longName = null;

  function append(chunk) {
    const merged = new Uint8Array(buffer.length + chunk.length);
    merged.set(buffer);
    merged.set(chunk, buffer.length);
    buffer = merged;
  }

  async function need(n) {
    while (buffer.length < n) {
      const { done, value } = await reader.read();
      if (done) return false;
      append(value);
    }
    return true;
  }

  function consume(n) {
    const out = buffer.subarray(0, n);
    buffer = buffer.slice(n);
    return out;
  }

  while (true) {
    if (!(await need(512))) return;
    const header = consume(512);
    // Two zero blocks = end of archive
    if (header.every((b) => b === 0)) return;

    const entry = decodeTarHeader(header);
    const paddedSize = Math.ceil(entry.size / 512) * 512;

    if (entry.isLongName) {
      if (!(await need(paddedSize))) return;
      const data = consume(paddedSize);
      longName = new TextDecoder().decode(data.subarray(0, entry.size)).replace(/\0+$/, '');
      continue;
    }

    if (entry.isPax) {
      if (!(await need(paddedSize))) return;
      consume(paddedSize);
      continue;
    }

    if (longName) {
      entry.name = longName;
      longName = null;
    }

    if (!entry.isFile || entry.size === 0) {
      if (entry.size > 0) {
        if (!(await need(paddedSize))) return;
        consume(paddedSize);
      }
      continue;
    }

    if (!(await need(paddedSize))) return;
    const fileData = consume(paddedSize).slice(0, entry.size);
    yield { name: entry.name, data: fileData };
  }
}

// ── OPFS helpers ──

async function dirFor(root, parts) {
  let dir = root;
  for (const part of parts) dir = await dir.getDirectoryHandle(part, { create: true });
  return dir;
}

async function writeFile(dir, name, data) {
  const h = await dir.getFileHandle(name, { create: true });
  const w = await h.createWritable();
  await w.write(data);
  await w.close();
}

// ── Public API ──

export async function isGameDataReady() {
  try {
    const root = await navigator.storage.getDirectory();
    const wc = await root.getDirectoryHandle('WiiCompiled');
    const dvd = await wc.getDirectoryHandle('dvd');
    await dvd.getFileHandle('.complete');
    return true;
  } catch {
    return false;
  }
}

export async function downloadGameData(onProgress) {
  if (navigator.storage.persist) await navigator.storage.persist();

  const root = await navigator.storage.getDirectory();
  const wc = await dirFor(root, ['WiiCompiled']);
  const dvd = await dirFor(wc, ['dvd']);

  let downloaded = 0;

  for (const archive of ARCHIVES) {
    const url = `https://github.com/${REPO}/releases/download/${RELEASE_TAG}/${archive.name}`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`Failed to fetch ${archive.name}: ${resp.status}`);

    const contentLength = parseInt(resp.headers.get('content-length'), 10) || archive.size;
    const bodyReader = resp.body.getReader();

    // Wrap reader to track download progress
    let archiveBytes = 0;
    const trackingReader = {
      async read() {
        const result = await bodyReader.read();
        if (!result.done) {
          archiveBytes += result.value.length;
          onProgress(downloaded + archiveBytes, TOTAL_BYTES, archive.name);
        }
        return result;
      }
    };

    for await (const entry of tarEntries(trackingReader)) {
      // Strip leading ./ from paths
      let path = entry.name.replace(/^\.\//, '');
      if (!path) continue;

      const parts = path.split('/');
      const fileName = parts.pop();
      if (!fileName) continue;

      const dir = parts.length > 0 ? await dirFor(dvd, parts) : dvd;
      await writeFile(dir, fileName, entry.data);
    }

    downloaded += contentLength;
    onProgress(downloaded, TOTAL_BYTES, null);
  }

  // Write Config.toml
  try {
    const configHandle = await wc.getFileHandle('Config.toml');
    let config = await (await configHandle.getFile()).text();
    if (config.includes('# dvd_root') || !config.includes('dvd_root = "/opfs')) {
      config = config.replace(/^#?\s*dvd_root\s*=.*$/m, 'dvd_root = "/opfs/WiiCompiled/dvd"');
      if (!config.includes('dvd_root = "/opfs')) {
        config += '\n[paths]\ndvd_root = "/opfs/WiiCompiled/dvd"\n';
      }
      await writeFile(wc, 'Config.toml', new TextEncoder().encode(config));
    }
  } catch {
    await writeFile(wc, 'Config.toml', new TextEncoder().encode(CONFIG_TOML));
  }

  // Mark complete
  await writeFile(dvd, '.complete', new TextEncoder().encode('done'));
}

export { TOTAL_BYTES };
