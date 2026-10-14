// Fix Expo Web build on Webpack 5 when a dependency contains `require('crypto')`.
// Webpack 5 no longer polyfills Node core modules automatically.
// In the browser, `window.crypto` exists, so we can safely disable the Node `crypto` fallback.

const createExpoWebpackConfigAsync = require('@expo/webpack-config');
const webpack = require('webpack');

module.exports = async function (env, argv) {
  const config = await createExpoWebpackConfigAsync(env, argv);

  config.resolve.fallback = {
    ...(config.resolve.fallback || {}),
    crypto: false,
    stream: require.resolve('stream-browserify'),
    buffer: require.resolve('buffer/'),
  };

  config.plugins = config.plugins || [];
  config.plugins.push(
    new webpack.ProvidePlugin({
      Buffer: ['buffer', 'Buffer'],
      process: 'process/browser',
    })
  );

  return config;
};
