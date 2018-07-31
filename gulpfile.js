const gulp = require('gulp');
const gutil = require('gulp-util');
const _if = require('gulp-if');
const sass = require('gulp-sass');
const sourcemaps = require('gulp-sourcemaps');
const uglify = require('gulp-uglify');
const autoprefixer = require('gulp-autoprefixer');
const browsersync = require('browser-sync').create();

// gulp --build (publish-ready)
const argv = require('yargs').argv;
const isBuild = !!(argv.build);

// demo project paths
const PATHS = {
  server: 'demo',
  inject: 'demo/assets/css/*.css',
  scss: 'src/scss/*.scss',
  js: 'src/js/*.js',
  html: 'demo/*.html',
  scssIncludes: [],
  dest: {
    css: 'demo/assets/css',
    js: 'demo/assets/js'
  }
};

// browserlist target
const targetBrowsers = ['> 0.25%', 'last 5 versions'];

//webpack config
const WEBPACK_CONFIG = {
  context: __dirname+'/src/js',
  entry: './_index.js',
  output: {
    path: isBuild ? __dirname : __dirname+'/demo/assets/js',
    filename: isBuild ? 'hubspot-autocomplete.min.js' : 'hubspot-autocomplete.js'
  },
  bail: false,
  module: {
    loaders: [{
      test: /\.js$/,
      exclude: /(node_modules|demo)/,
      loader: 'babel-loader',
      query: {
        presets: [['env', {"targets": {"browsers": targetBrowsers }}]]
      }
    }]
  }
};

//* TASKS START ---------------------------------------------*//

// *TASK - demo/dev server
gulp.task('server', () => {
  browsersync.init({
    server: PATHS.server,
    files: PATHS.inject,
    logFileChanges: false,
    ghostMode: false
  }, (err, bs) => {});
});

// *TASK - scss stylesheets
gulp.task('scss', () => {
  return gulp.src(PATHS.scss)
    .pipe(_if(!isBuild, sourcemaps.init()))
    .pipe(sass({
      outputStyle: !isBuild ? 'nested' : 'compressed',
      includePaths: PATHS.scssincludes
    }).on('error', sass.logError))
    .pipe(autoprefixer({
      browsers: targetBrowsers
    }))
    .pipe(_if(!isBuild, sourcemaps.write('./')))
    .pipe(gulp.dest(PATHS.dest.css));
});

// *TASK - scripts
gulp.task('js', () => {
  return gulp.src(PATHS.js)
    //todo - uglify, browserify, webpackify, whateverify
    //.pipe(uglify())
    .pipe(gulp.dest(PATHS.dest.js));
});

// *TASK - webpack (if needed)
gulp.task('webpack', () => {});

// *TASK - default
gulp.task('default', ['server', 'scss', 'js'], () => {
  if (isBuild) {return;}
  gulp.watch(PATHS.scss, ['scss']);
  gulp.watch(PATHS.js, ['js']);
  gulp.watch([PATHS.dest.js+'/*.js', PATHS.html]).on('change', browsersync.reload);
});