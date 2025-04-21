module.exports = {
  // ensure all styles get inlined if you like:
  module: {
    rules: [
      {
        test: /\.css$/,
        use: ['to-string-loader', 'css-loader']
      }
    ]
  }
};