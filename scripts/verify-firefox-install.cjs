const { Builder } = require('selenium-webdriver');
const firefox = require('selenium-webdriver/firefox');
const path = require('node:path');

(async () => {
  if (!process.argv[2]) throw new Error('Provide the signed XPI path.');
  const options = new firefox.Options()
    .addArguments('-headless')
    .setBinary(require('playwright').firefox.executablePath());
  const driver = await new Builder()
    .forBrowser('firefox')
    .setFirefoxOptions(options)
    .build();
  try {
    const id = await driver.installAddon(path.resolve(process.argv[2]), false);
    if (id !== 'watchlater-plus@mattsg')
      throw new Error('Installed add-on ID does not match.');
    console.log('PASS Firefox permanent signed-addon installation.');
  } finally {
    await driver.quit();
  }
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
