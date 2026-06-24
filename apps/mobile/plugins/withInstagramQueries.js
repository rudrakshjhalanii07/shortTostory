const { withAndroidManifest } = require('@expo/config-plugins');

/**
 * Declares Instagram in the Android <queries> block so the app can resolve and
 * launch the com.instagram.share.ADD_TO_STORY intent on Android 11+ (API 30),
 * where package visibility is restricted by default.
 */
module.exports = function withInstagramQueries(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;

    if (!Array.isArray(manifest.queries)) {
      manifest.queries = [];
    }

    const alreadyDeclared = manifest.queries.some((q) =>
      (q.package ?? []).some(
        (p) => p?.$?.['android:name'] === 'com.instagram.android',
      ),
    );

    if (!alreadyDeclared) {
      manifest.queries.push({
        package: [{ $: { 'android:name': 'com.instagram.android' } }],
      });
    }

    return cfg;
  });
};
