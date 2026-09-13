import CopyPlugin from 'copy-webpack-plugin';
import HtmlWebpackPlugin from 'html-webpack-plugin';
import MiniCssExtractPlugin from 'mini-css-extract-plugin';
import path from 'path';
import { fileURLToPath } from 'url';
import webpack from 'webpack';
import type { Configuration } from 'webpack';

import { Manifest, Target, transformManifest } from './build/manifest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isDev = process.env.NODE_ENV === 'development';

/* Build target: chrome (default) or firefox */
const target = (process.env.TARGET ?? 'chrome') as Target;
if (target !== 'chrome' && target !== 'firefox') {
  throw new Error(`Unknown TARGET: ${process.env.TARGET} (expected "chrome" or "firefox")`);
}
const isFirefox = target === 'firefox';

/* Chrome keeps dist/dev and dist/prod; Firefox builds go to dist/firefox-dev and dist/firefox-prod */
const outputDir = `${isFirefox ? 'firefox-' : ''}${isDev ? 'dev' : 'prod'}`;

// pdf.worker.min.mjs の絶対パスを取得
const pdfWorkerPath = path.resolve(__dirname, 'node_modules/pdfjs-dist/build/pdf.worker.min.mjs');

const config: Configuration = {
  mode: isDev ? 'development' : 'production',
  entry: {
    popup: './src/pages/Popup.tsx',
    options: {
      import: './src/pages/Options.tsx',
      filename: 'options.js',
    },
    'service-worker': './src/pages/ServiceWorker.ts',
    /* Firefox has no offscreen API; theme detection runs in the background page instead */
    ...(!isFirefox && { offscreen: './src/pages/Offscreen.ts' }),
    content: './src/pages/Content.tsx',
  },
  output: {
    publicPath: '',
    path: path.resolve(__dirname, 'dist', outputDir),
    filename: '[name].js',
    clean: true,
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
      {
        test: /\.css$/,
        use: [
          MiniCssExtractPlugin.loader,
          'css-loader',
          {
            loader: 'postcss-loader',
            options: {
              postcssOptions: {
                config: path.resolve(__dirname, 'postcss.config.js'),
              },
            },
          },
        ],
      },
    ],
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js'],
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  plugins: [
    new webpack.DefinePlugin({
      __TARGET__: JSON.stringify(target),
      /*
       * webpack otherwise inlines import.meta.url as the absolute path of the build directory
       * (pdfjs-dist uses it in a Node.js-only code path). A constant keeps the bundle free of
       * local paths and byte-identical when AMO reviewers rebuild it from source
       */
      'import.meta.url': JSON.stringify('file:///'),
    }),
    new MiniCssExtractPlugin({
      filename: 'globals.css',
    }),
    new HtmlWebpackPlugin({
      template: './public/popup.html',
      filename: 'popup.html',
      chunks: ['popup'],
    }),
    new HtmlWebpackPlugin({
      template: './public/options.html',
      filename: 'options.html',
      chunks: ['options'],
    }),
    ...(isFirefox
      ? []
      : [
          new HtmlWebpackPlugin({
            template: './public/offscreen.html',
            filename: 'offscreen.html',
            chunks: ['offscreen'],
          }),
        ]),
    new CopyPlugin({
      patterns: [
        {
          from: 'public',
          to: '.',
          globOptions: {
            ignore: ['**/*.sketch', '**/*.html', '**/.DS_Store'],
          },
        },
        {
          from: 'manifest.json',
          to: '.',
          transform: (content: Buffer) => {
            /* Keep the Chrome production manifest byte-identical to the source */
            if (!isDev && !isFirefox) {
              return content;
            }
            const manifest = JSON.parse(content.toString()) as Manifest;
            return JSON.stringify(transformManifest(manifest, { isDev, target }), null, 2);
          },
        },
        // pdfjs worker を public ディレクトリにコピー
        {
          from: pdfWorkerPath,
          to: 'pdf.worker.min.mjs',
        },
      ],
    }),
  ],
  // devtool: isDev ? 'inline-source-map' : false,
  devtool: isDev ? 'source-map' : false,
  optimization: {
    minimize: !isDev,
  },
};

export default config;
