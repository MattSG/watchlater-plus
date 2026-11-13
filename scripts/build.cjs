const { readFile, writeFile, mkdir, copyFile } = require('node:fs/promises');
const path = require('node:path');
const { zipSync } = require('fflate');

const root = path.resolve(__dirname, '..');
const files = ['core.js', 'content.js', 'content.css', 'LICENSE'];

function calver(
  date = new Date(),
  sequence = process.env.GITHUB_RUN_NUMBER || 0,
) {
  const build = Number(sequence);
  if (!Number.isInteger(build) || build < 0 || build > 65535)
    throw new Error('Build number must be an integer between 0 and 65535.');
  return `${date.getUTCFullYear()}.${date.getUTCMonth() + 1}.${date.getUTCDate()}.${build}`;
}

async function build() {
  const manifest = JSON.parse(
    await readFile(path.join(root, 'manifest.json'), 'utf8'),
  );
  const pkg = JSON.parse(
    await readFile(path.join(root, 'package.json'), 'utf8'),
  );
  if (pkg.version !== manifest.version)
    throw new Error('Package and manifest versions differ.');
  const version = process.env.BUILD_VERSION || calver();
  if (
    !/^\d{1,5}(?:\.\d{1,5}){3}$/.test(version) ||
    version.split('.').some((part) => Number(part) > 65535)
  )
    throw new Error(
      'BUILD_VERSION must contain four browser-compatible numeric components.',
    );
  for (const browser of ['chrome', 'firefox']) {
    const directory = path.join(root, 'dist', browser);
    await mkdir(directory, { recursive: true });
    const browserManifest = structuredClone(manifest);
    browserManifest.version = version;
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
      `watchlater-plus-${browser}-${version}.${browser === 'firefox' ? 'xpi' : 'zip'}`,
    );
    await writeFile(archive, zipSync(entries));
    console.log(archive);
  }
  return version;
}

if (require.main === module)
  build().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
module.exports = { build, calver };
