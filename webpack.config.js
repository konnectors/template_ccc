const CopyPlugin = require('copy-webpack-plugin')

module.exports = {
  mode: 'none',
  plugins: [
    new CopyPlugin({
      patterns: [{ from: 'manifest.konnector' }, { from: 'assets' }]
    })
  ]
}
