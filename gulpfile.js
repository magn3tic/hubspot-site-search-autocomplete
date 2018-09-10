const gulp = require('gulp');
const gutil = require('gulp-util');
const _if = require('gulp-if');
const sass = require('gulp-sass');
const sourcemaps = require('gulp-sourcemaps');
const uglify = require('gulp-uglify');
const autoprefixer = require('gulp-autoprefixer');
const browsersync = require('browser-sync').create();

// gulp --build (publish-ready)
// gulp --docs (work on gh-pages site)
const argv = require('yargs').argv;
const isBuild = !!(argv.build);
const isDocs = !!(argv.docs);

// demo project paths
const PATHS = {
  server: 'demo',
  docs_server: 'docs',
  inject: 'demo/assets/css/*.css',
  docs_inject: 'docs/assets/css/*.css',
  scss: 'src/scss/*.scss',
  docs_scss: 'docs/_scss/*.scss',
  js: 'src/js/*.js',
  html: 'demo/*.html',
  docs: 'docs/*.html',
  scssIncludes: [],
  dest: {
    css: 'demo/assets/css',
    js: 'demo/assets/js',
    docs_css: 'docs/assets/css'
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
const browsersyncDefaults = { logFileChanges: false, ghostMode: false };
gulp.task('server', () => {
  browsersync.init({
    server: PATHS.server,
    files: PATHS.inject,
    ...browsersyncDefaults
  }, (err, bs) => {});
});
gulp.task('docs.server', () => {
  browsersync.init({
    server: PATHS.docs_server,
    files: PATHS.docs_inject,
    ...browsersyncDefaults
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
gulp.task('docs.scss', () => {
  return gulp.src(PATHS.docs_scss)
    .pipe(_if(!isBuild, sourcemaps.init()))
    .pipe(sass({
      outputStyle: !isBuild ? 'nested' : 'compressed',
      includePaths: PATHS.scssincludes
    }).on('error', sass.logError))
    .pipe(autoprefixer({browsers: targetBrowsers }))
    .pipe(_if(!isBuild, sourcemaps.write('./')))
    .pipe(gulp.dest(PATHS.dest.docs_css));
});

// *TASK - scripts
gulp.task('js', () => {
  return gulp.src(PATHS.js)
    //todo - uglify, browserify, webpackify, whateverify
    .pipe(_if(isBuild, uglify()))
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



// *DOCS BUILD --------------

gulp.task('docs', ['docs.server', 'docs.scss'], () => {
  gulp.watch(PATHS.docs).on('change', browsersync.reload);
  gulp.watch(PATHS.docs_scss, ['docs.scss']);
});
