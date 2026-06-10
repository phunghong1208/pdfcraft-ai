/**
 * Fetch and optionally reassemble chunked assets (Cloudflare Pages 25MB limit).
 * Dev: fetches full files directly — no manifest.json noise in server logs.
 */

interface ChunkManifest {
  filename: string;
  chunks: number;
  totalSize: number;
  chunkSize: number;
}

function mimeFromUrl(url: string): string {
  const lower = url.toLowerCase();
  if (lower.includes('.wasm')) return 'application/wasm';
  if (lower.includes('.js')) return 'application/javascript';
  if (lower.includes('.ttf')) return 'font/ttf';
  if (lower.includes('.otf')) return 'font/otf';
  if (lower.includes('.woff2')) return 'font/woff2';
  return 'application/octet-stream';
}

async function assembleFromManifest(
  baseUrl: string,
  queryString: string,
  manifest: ChunkManifest,
): Promise<Blob> {
  const chunkPromises: Promise<ArrayBuffer>[] = [];
  for (let i = 0; i < manifest.chunks; i++) {
    const chunkUrl = `${baseUrl}.part_${i}${queryString}`;
    chunkPromises.push(
      fetch(chunkUrl).then((res) => {
        if (!res.ok) throw new Error(`Failed to fetch chunk ${i} for ${baseUrl}`);
        return res.arrayBuffer();
      }),
    );
  }

  const chunks = await Promise.all(chunkPromises);
  const assembled = new Uint8Array(manifest.totalSize);
  let offset = 0;
  for (const chunk of chunks) {
    assembled.set(new Uint8Array(chunk), offset);
    offset += chunk.byteLength;
  }

  return new Blob([assembled], { type: mimeFromUrl(baseUrl) });
}

/**
 * Fetches an asset: direct file first, then chunked manifest (production).
 */
export async function fetchAssembledBlob(url: string): Promise<Blob> {
  const [baseUrl, query] = url.split('?');
  const queryString = query ? `?${query}` : '';

  const directRes = await fetch(url);
  if (directRes.ok) {
    return directRes.blob();
  }

  const manifestUrl = `${baseUrl}.manifest.json${queryString}`;
  try {
    const manifestRes = await fetch(manifestUrl);
    if (manifestRes.ok) {
      const manifest: ChunkManifest = await manifestRes.json();
      console.log(
        `[asset-loader] Reassembling ${manifest.filename} from ${manifest.chunks} chunks...`,
      );
      return assembleFromManifest(baseUrl, queryString, manifest);
    }
  } catch (err) {
    console.debug(`[asset-loader] Manifest fetch failed for ${baseUrl}:`, err);
  }

  throw new Error(`Failed to fetch asset: ${url} (HTTP ${directRes.status})`);
}
