// rollup.config.js
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import esbuild from 'rollup-plugin-esbuild'
import polyfillNode from 'rollup-plugin-polyfill-node';
import {visualizer} from 'rollup-plugin-visualizer';

export default {
  input: 'dist/genome-browser/main.js',
  output: {
    file: 'dist/genome-browser/genome-browser.min.js',
    format: 'iife',
    name: 'GenomeBrowser',
    sourcemap: true,
  },
    treeshake: {
    moduleSideEffects: false
  },
  plugins: [
    polyfillNode(),
    resolve({ browser: true }),
    commonjs(),
    esbuild({ minify: true, target: 'es2022' }),
    visualizer({ filename: 'bundle-analysis.html' })
  ],
};
