const { readFile, writeFile, mkdir, copyFile } = require('node:fs/promises');
const path = require('node:path');
const { zipSync } = require('fflate');

const root = path.resolve(__dirname, '..');
const files = ['core.js', 'content.js', 'content.css', 'LICENSE'];

async function build() {
  const manifest = JSON.parse(
    await readFile(path.join(root, 'manifest.json'), 'utf8'),
  );
  const pkg = JSON.parse(
    await readFile(path.join(root, 'package.json'), 'utf8'),
  );
  if (pkg.version !== manifest.version)
    throw new Error('Package and manifest versions differ.');
  for (const browser of ['chrome', 'firefox']) {
    const directory = path.join(root, 'dist', browser);
    await mkdir(directory, { recursive: true });
    const browserManifest = structuredClone(manifest);
    if (browser === 'firefox')
      browserManifest.browser_specific_settings = {
        gecko: {
          id: 'watchlater-plus@mattsg',
          strict_min_version: '142.0',
          data_collection_permissions: { required: ['none'] },
        },
      };
    const entries = {
      'manifest.json': Buffer.from(
        JSON.stringify(browserManifest, null, 2) + '\n',
      ),
    };
    for (const file of files) {
      entries[file] = await readFile(path.join(root, file));
      await copyFile(path.join(root, file), path.join(directory, file));
    }
    await writeFile(
      path.join(directory, 'manifest.json'),
      entries['manifest.json'],
    );
    const archive = path.join(
      root,
      'dist',
      `watchlater-plus-${browser}-${manifest.version}.zip`,
    );
    await writeFile(archive, zipSync(entries));
    console.log(archive);
  }
}

if (require.main === module)
  build().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
module.exports = { build };
