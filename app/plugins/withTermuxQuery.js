// Android 11+ package visibility: without a <queries> entry the app can't see Termux, so
// getLaunchIntentForPackage('com.termux') returns null even when it is installed.
const { withAndroidManifest } = require('expo/config-plugins');

const PACKAGES = ['com.termux'];

module.exports = function withTermuxQuery(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;
    manifest.queries = manifest.queries ?? [{}];
    const queries = manifest.queries[0];
    queries.package = queries.package ?? [];
    for (const name of PACKAGES) {
      if (!queries.package.some((p) => p.$?.['android:name'] === name)) {
        queries.package.push({ $: { 'android:name': name } });
      }
    }
    return cfg;
  });
};
