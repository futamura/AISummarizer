import CopyPlugin from 'copy-webpack-plugin';
import HtmlWebpackPlugin from 'html-webpack-plugin';
import MiniCssExtractPlugin from 'mini-css-extract-plugin';
import path from 'path';
import { fileURLToPath } from 'url';
import type { Configuration } from 'webpack';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isDev = process.env.NODE_ENV === 'development';

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
    offscreen: './src/pages/Offscreen.ts',
    content: './src/pages/Content.tsx',
  },
  output: {
    publicPath: '',
    path: path.resolve(__dirname, isDev ? 'dist/dev' : 'dist/prod'),
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
    new HtmlWebpackPlugin({
      template: './public/offscreen.html',
      filename: 'offscreen.html',
      chunks: ['offscreen'],
    }),
    new CopyPlugin({
      patterns: [
        {
          from: 'public',
          to: '.',
          globOptions: {
            ignore: ['**/*.sketch', '**/*.html'],
          },
        },
        {
          from: 'manifest.json',
          to: '.',
          transform: (content: Buffer) => {
            if (!isDev) {
              return content;
            }
            /* Point manifest icons at the DEV-badged variants for development builds */
            const manifest = JSON.parse(content.toString());
            const toDevIcons = (icons: Record<string, string>) =>
              Object.fromEntries(Object.entries(icons).map(([size, iconPath]) => [size, (iconPath as string).replace(/\.png$/, '-dev.png')]));
            manifest.icons = toDevIcons(manifest.icons);
            manifest.action.default_icon = toDevIcons(manifest.action.default_icon);
            return JSON.stringify(manifest, null, 2);
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
