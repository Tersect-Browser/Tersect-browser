module.exports = {
  module: {
    rules: [
      // Handle node_modules CSS (e.g., PrimeReact, PrimeFlex) with style-loader
      {
        test: /\.css$/i,
        include: /node_modules/,
        use: ['style-loader', 'css-loader']
      },
      // Handle component-level CSS, but skip Angular's global styles (ngGlobalStyle)
      {
        test: /\.css$/i,
        exclude: [
          /node_modules/,
          /styles\.css/, // prevent messing with global styles.css
          /.*ngGlobalStyle.*/
        ],
        use: ['to-string-loader', 'css-loader']
      }
    ]
  }
};
