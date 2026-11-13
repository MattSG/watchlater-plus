const { readFile, readdir } = require('node:fs/promises');
const path = require('node:path');

function checkActions(source, lock) {
  const errors = [];
  for (const match of source.matchAll(/^\s*-?\s*uses:\s*([^\s#]+).*$/gm)) {
    const reference = match[1];
    if (/^\.\/\.github\/workflows\/[\w.-]+\.ya?ml$/.test(reference)) continue;
    const split = reference.lastIndexOf('@');
    const action = reference.slice(0, split);
    const sha = reference.slice(split + 1);
    if (split < 0 || !/^[a-f0-9]{40}$/.test(sha))
      errors.push(`${reference}: requires a full commit SHA`);
    else if (lock[action]?.sha !== sha)
      errors.push(`${reference}: does not match .github/actions-lock.json`);
  }
  return errors;
}

async function main() {
  const directory = path.resolve(__dirname, '../.github');
  const lock = JSON.parse(
    await readFile(path.join(directory, 'actions-lock.json'), 'utf8'),
  );
  const workflows = path.join(directory, 'workflows');
  for (const file of await readdir(workflows)) {
    if (!/\.ya?ml$/.test(file)) continue;
    const errors = checkActions(
      await readFile(path.join(workflows, file), 'utf8'),
      lock,
    );
    if (errors.length) throw new Error(`${file}:\n${errors.join('\n')}`);
  }
  console.log('All workflow actions match the SHA lock file.');
}
if (require.main === module)
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
module.exports = { checkActions };
