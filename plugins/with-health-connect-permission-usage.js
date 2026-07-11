const { withAndroidManifest } = require('@expo/config-plugins');

/**
 * Health Connect on Android 14+ requires the app to expose a
 * ViewPermissionUsageActivity alias (VIEW_PERMISSION_USAGE +
 * HEALTH_PERMISSIONS). The plugin bundled with react-native-health-connect
 * only adds the pre-14 rationale intent filter, so we add the alias here.
 * https://matinzd.github.io/react-native-health-connect/docs/permissions
 */
module.exports = function withHealthConnectPermissionUsage(config) {
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
};
