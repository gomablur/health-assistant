const { withAndroidManifest, withMainActivity, withPlugins } = require('@expo/config-plugins');

/**
 * Health Connect needs two things the library's bundled plugin does not add:
 *
 * 1. Android 14+ requires a ViewPermissionUsageActivity alias
 *    (VIEW_PERMISSION_USAGE + HEALTH_PERMISSIONS).
 * 2. MainActivity.onCreate must register the permission delegate, otherwise
 *    requestPermission() crashes with
 *    "lateinit property requestPermission has not been initialized".
 *
 * https://matinzd.github.io/react-native-health-connect/docs/permissions
 */

const DELEGATE_IMPORT = 'import dev.matinzd.healthconnect.permissions.HealthConnectPermissionDelegate';
const DELEGATE_CALL = 'HealthConnectPermissionDelegate.setPermissionDelegate(this)';

function withPermissionUsageAlias(config) {
  return withAndroidManifest(config, (config) => {
    const app = config.modResults.manifest.application[0];
    app['activity-alias'] = app['activity-alias'] ?? [];
    const exists = app['activity-alias'].some(
      (alias) => alias.$['android:name'] === 'ViewPermissionUsageActivity',
    );
    if (!exists) {
      app['activity-alias'].push({
        $: {
          'android:name': 'ViewPermissionUsageActivity',
          'android:exported': 'true',
          'android:targetActivity': '.MainActivity',
          'android:permission': 'android.permission.START_VIEW_PERMISSION_USAGE',
        },
        'intent-filter': [
          {
            action: [{ $: { 'android:name': 'android.intent.action.VIEW_PERMISSION_USAGE' } }],
            category: [{ $: { 'android:name': 'android.intent.category.HEALTH_PERMISSIONS' } }],
          },
        ],
      });
    }
    return config;
  });
}

function withPermissionDelegate(config) {
  return withMainActivity(config, (config) => {
    if (config.modResults.language !== 'kt') {
      throw new Error('with-health-connect: MainActivity must be Kotlin');
    }
    let src = config.modResults.contents;

    if (!src.includes(DELEGATE_IMPORT)) {
      src = src.replace(
        /^(import com\.facebook\.react\.ReactActivity$)/m,
        `${DELEGATE_IMPORT}\n$1`,
      );
    }

    if (!src.includes(DELEGATE_CALL)) {
      // register the launcher right after super.onCreate, as the library documents:
      // registerForActivityResult must run before the activity reaches STARTED,
      // but after the activity-result registry has restored its saved state.
      const superOnCreate = /^(\s*)(super\.onCreate\(.*\))/m;
      if (!superOnCreate.test(src)) {
        throw new Error('with-health-connect: could not find super.onCreate in MainActivity');
      }
      src = src.replace(superOnCreate, `$1$2\n$1${DELEGATE_CALL}`);
    }

    config.modResults.contents = src;
    return config;
  });
}

module.exports = function withHealthConnect(config) {
  return withPlugins(config, [withPermissionUsageAlias, withPermissionDelegate]);
};
