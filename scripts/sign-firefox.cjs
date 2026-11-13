const {
  readFile,
  writeFile,
  mkdir,
  mkdtemp,
  readdir,
  copyFile,
} = require('node:fs/promises');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { unzipSync } = require('fflate');

function unpackPackage(bytes, expectedVersion) {
  const entries = unzipSync(bytes);
  const manifest = JSON.parse(
    Buffer.from(entries['manifest.json'] || []).toString(),
  );
  if (
    manifest.version !== expectedVersion ||
    manifest.browser_specific_settings?.gecko?.id !== 'watchlater-plus@mattsg'
  )
    throw new Error('Release package version or add-on ID does not match.');
  for (const name of Object.keys(entries)) {
    if (name.startsWith('META-INF/')) {
      delete entries[name];
      continue;
    }
    if (
      name.includes('\\') ||
      name.split('/').includes('..') ||
      path.isAbsolute(name) ||
      /^[a-z]:/i.test(name)
    )
      throw new Error('Unsafe path in release package.');
  }
  return entries;
}

function command(executable, args, options = {}) {
  const result = spawnSync(executable, args, { encoding: 'utf8', ...options });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(
      `${executable} failed: ${result.stderr || 'see workflow logs'}`,
    );
  return result.stdout;
}

async function main() {
  if (!process.env.WEB_EXT_API_KEY || !process.env.WEB_EXT_API_SECRET)
    throw new Error(
      'Set WEB_EXT_API_KEY and WEB_EXT_API_SECRET in the firefox-signing GitHub environment.',
    );
  const root = path.resolve(__dirname, '..');
  const base = path.join(root, 'output', 'firefox-sign');
  await mkdir(base, { recursive: true });
  const work = await mkdtemp(path.join(base, 'run-'));
  const tag = process.env.RELEASE_TAG || 'latest';
  const release = JSON.parse(
    command('gh', [
      'release',
      'view',
      ...(tag === 'latest' ? [] : [tag]),
      '--json',
      'tagName,assets',
    ]),
  );
  if (!/^v\d{4}\.\d{1,2}\.\d{1,2}\.\d{1,5}$/.test(release.tagName))
    throw new Error('Expected a CalVer release tag.');
  const version = release.tagName.slice(1);
  const filename = `watchlater-plus-firefox-${version}.xpi`;
  if (!release.assets.some((asset) => asset.name === filename))
    throw new Error('Firefox release asset is missing.');
  command('gh', [
    'release',
    'download',
    release.tagName,
    '--pattern',
    filename,
    '--dir',
    work,
  ]);
  const entries = unpackPackage(
    await readFile(path.join(work, filename)),
    version,
  );
  const source = path.join(work, 'source');
  for (const [name, bytes] of Object.entries(entries)) {
    const file = path.join(source, name);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, bytes);
  }
  const signed = path.join(work, 'signed');
  command(
    process.execPath,
    [
      path.join(root, 'node_modules/web-ext/bin/web-ext.js'),
      'sign',
      '--source-dir',
      source,
      '--channel',
      'unlisted',
      '--artifacts-dir',
      signed,
      '--approval-timeout',
      '600000',
    ],
    { stdio: 'inherit' },
  );
  const packages = (await readdir(signed)).filter((file) =>
    file.endsWith('.xpi'),
  );
  if (packages.length !== 1)
    throw new Error('Mozilla did not return exactly one signed XPI.');
  const signedFile = path.join(signed, packages[0]);
  const signature = unzipSync(await readFile(signedFile));
  if (!signature['META-INF/mozilla.rsa'] && !signature['META-INF/cose.sig'])
    throw new Error('Signed XPI has no Mozilla signature.');
  command(
    process.execPath,
    [path.join(root, 'scripts/verify-firefox-install.cjs'), signedFile],
    { stdio: 'inherit' },
  );
  await copyFile(signedFile, path.join(work, filename));
  command('gh', [
    'release',
    'upload',
    release.tagName,
    path.join(work, filename),
    '--clobber',
  ]);
  const notes = path.join(work, 'notes.md');
  await writeFile(
    notes,
    'Chrome: extract the ZIP and use **Load unpacked** in `chrome://extensions`.\n\nFirefox: install the **Mozilla-signed XPI** through `about:addons` → **Install Add-on From File**. It remains installed after restart. Signed for self-distribution (unlisted); no public AMO listing.\n',
  );
  command('gh', ['release', 'edit', release.tagName, '--notes-file', notes]);
  console.log(`Signed Firefox ${version} attached to ${release.tagName}.`);
}

if (require.main === module)
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
module.exports = { unpackPackage };
