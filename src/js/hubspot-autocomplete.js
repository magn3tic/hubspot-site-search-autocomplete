;(function($, win, doc) {

  $.fn.hubspotAutocomplete = function(options) {
    console.log('[Hubspot Autocomplete] - options: ', options, typeof(options));

    /**
     * Bugfix 1.0.2
     * 
     * Depending on the environment, `options` could be stringified JSON.
     * If that's the case, turn it into a plain JS Object.
     */
    if (options && typeof(options) === 'string') {
      options = JSON.parse(options);
    }

    if (!$.isPlainObject(options) || !options.portalId) {
      console.error('[Hubspot Autocomplete] - A Hubspot portal ID is required.');
      return $.noop;
    }

    var defaults = {
      portalId: null,
      accentColor: '#226db7',
      highlightOpacity: 0.25,
      domains: [],
      pathPrefix: null,
      pageTypes: ['SITE_PAGE', 'BLOG_POST', 'LANDING_PAGE'],
      thumbnailImages: true,
      hubDb: {
        table: null,
        query: null
      },
      resultItemLength: 'LONG',
      truncateContent: false,
      minInputValue: 0,
      resultLimit: 15,
      viewAllLink: 'https://www.google.com/search?q=%term%',
      viewAllText: 'View all matches for "%term%"',
      viewAllIcon: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>',
      noMatchesText: 'No results found matching "%term%"',
      label: false,
      input: {
        type: 'text',
        autocomplete: 'off',
        placeholder: 'Search This Site',
        value: ''
      },
      searchTimeout: 300,
      searchIcon: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>',
      css: true,
      enableLoadMore: false
    },
    settings = $.extend(true, {}, defaults, options);

    if (!settings.portalId) {
      console.error('[Hubspot Autocomplete] - No PortalId option provided.');
      return false;
    }

    var $body = $('body'),
        currentXHR = null,
        debounceTimeout = null,
        searchRestarted = true,
        lastTerm = null, //reqOpts.term is currentTerm
        reqUrl = 'https://api.hubapi.com/contentsearch/v2/search?',
        reqOpts = {
          term: null,
          portalId: settings.portalId,
          autocomplete: true,
          length: settings.resultItemLength,
          limit: settings.resultLimit
        },
        imgCache = [],
        resizeTimeout = null;

    function augmentReqOpts() {
      if (settings.domains.length > 0) {
        reqOpts.domain = settings.domains.join(',');
      }
      if (settings.hubDb && settings.hubDb.table) {
        reqOpts.tableId = settings.hubDb.table;
      }
    };

    function getReqUrlParams(obj) {
      var params = $.param(obj);
      for (var i=0; i < settings.pageTypes.length; i++) {
        params += '&type='+settings.pageTypes[i];
      }
      return params;
    };

    //style customization
    function hexToRgb(hex) {
      var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
      return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
      } : null;
    };
    function getRgba(rgbobj, opacity) {
      return 'rgba('+rgbobj.r+', '+rgbobj.g+', '+rgbobj.g+', '+opacity+')';
    };
    function writeStylesToHead(css) {
      var head = doc.head || doc.getElementsByTagName('head')[0],
          style = doc.createElement('style');
      style.appendChild(doc.createTextNode(css));
      head.appendChild(style);
    };
    function doColorStyles(color) {
      var css = '.hssa-input-wrapper input[type="search"]:focus ~ .hssa-input--icon svg, '; 
      css += '.hssa-input-wrapper input[type="text"]:focus ~ .hssa-input--icon svg,';
      css+=  '.hssa-results .hssa-viewall a:hover svg {stroke:'+color+'}';
      css += '.hssa-loader--icon span { background:'+color+'; }';
      css += '.hssa-input-label label:hover { color:'+color+'; }';
      css += '.hssa-results .hs-search-highlight { background:'+getRgba(hexToRgb(color), settings.highlightOpacity)+' }';
      writeStylesToHead(css);
    };

    //unloaded thumbnail search
    function loadUnloadedThumbs($el) {
      var $unloaded = $el.find('figure:not([class*="load-started"])');
      if ($unloaded.length === 0) return;
      $unloaded.each(function(index) {
        var $this = $(this),
            $img = $this.children('[data-hssa-thumb]'),
            imgSrc = $img.data('hssa-thumb'),
            preImg = new Image();
        $this.addClass('load-started');
        preImg.onload = function() {
          $img.css({ backgroundImage: 'url('+imgSrc+')' });
          $this.addClass('load-finished');
        }
        if (imgSrc) { preImg.src = imgSrc; }
      });
    };

    //abort existing ajax reqs
    function abortXhrAndClearTimeout() {
      if (currentXHR !== null) { currentXHR.abort(); }
      if (debounceTimeout) { clearTimeout(debounceTimeout); }
    };
   
    function stringReplaceTerm(term) {
      return term.replace('%term%', reqOpts.term);
    };
    function getInputHtml(index) {
      var input = '<input id="hssa-input-'+index+'" ';
      for (var key in settings.input) {
        input += key+'='+'"'+settings.input[key]+'" ';
      }
      return input += '>';
    };
    function getResultContainers() {
      var currIndex = $(this).parent().data('hssa-input-index'),
          $outer = $('[data-hssa-results-index="'+currIndex+'"]'),
          $inner = $outer.find('.hssa-results');
      return { $outer: $outer, $inner: $inner };
    };
    function getBlogPostMeta(result) {
      var postDate = result.publishedDate ? new Date(result.publishedDate) : false,
          html = '<div class="hssa-postmeta">';
      if (result.authorFullName) {
        html += '<span>'+result.authorFullName+'</span>';
        if (postDate) html += '<span class="hssa-middot">&middot;</span>';
      }
      if (postDate) html += '<span>'+postDate.toLocaleDateString('en-US')+'</span>';
      return html += '</div>';
    };
    function getThumbnailImage(result) {
      return '<figure><span data-hssa-thumb="'+result.featuredImageUrl+'"></span></figure>';
    };
    function getResultsHtml(results) {
      var html = '<ul>';
      for (var i=0; i < results.length; i++) {
        var item = results[i];
        var desc = item.description ? '<p><span>'+item.description+'<span></p>' : '';
        html += '<li data-hssa-result-type="'+item.type+'"><a href="'+item.url+'"><div>';
        if (item.type === 'BLOG_POST') {
          html += getThumbnailImage(item);
          html += getBlogPostMeta(item);
        }
        html += '<h4>'+results[i].title+'</h4>'+desc+'</div></a></li>';
      }
      if (settings.viewAllLink) {
        html += '<li class="hssa-viewall"><a href="'+stringReplaceTerm(settings.viewAllLink)+'"><h4>';
        html += stringReplaceTerm(settings.viewAllText)+' <span class="hssa-viewall--icon">'+settings.viewAllIcon+'</span></h4></a></li>';
      }
      html += '</ul>';
      return html;
    };

    function toggleResultsShowing($container, $inner) {
      if (reqOpts.term.length === 0) {
        $container.removeClass('has-results has-empty-results is-loading');
        $inner.html('');
      } else {
        $container.addClass('is-loading');
      }
    };

    // ajax callbacks
    function XHRcallbacks($container, $outer) {
      var onXhrDone = function(data) {
        //console.log(data);
        if (data.total > 0) {
          $container.html(getResultsHtml(data.results));
          $outer.removeClass('has-empty-results').addClass('has-results');

          //load in unloaded thumbs
          loadUnloadedThumbs($container);
        } else {
          $container.html('<p class="hssa-nomatches">'+stringReplaceTerm(settings.noMatchesText)+'</p>');
          $outer.removeClass('has-results').addClass('has-empty-results');
        }
        $outer.removeClass('is-loading').trigger('hssa.xhrcomplete', [data]);
      },
      onXhrFailure = function(jqXhr, textStatus, error) {
        if (textStatus === 'abort') { return; } //ignore timeout based abort
        $outer.addClass('has-error').trigger('hssa.xhrfail');
      };
      return { done: onXhrDone, fail: onXhrFailure };
    };

    //create new ajax req
    function XHRcreate($container, $outer) {
      var xhrcb = XHRcallbacks($container, $outer);
      currentXHR = $.getJSON(reqUrl + getReqUrlParams(reqOpts));
      currentXHR.done(xhrcb.done);
      currentXHR.fail(xhrcb.fail);
    };

    // auto-search on input
    function onSearchInput() {
      abortXhrAndClearTimeout();
      var $t = $(this),
          $results = getResultContainers.call(this);
      reqOpts.term = $.trim($t.val());
      toggleResultsShowing($results.$outer, $results.$inner);
      if (reqOpts.term.length > settings.minInputValue && reqOpts.term !== lastTerm) {
        debounceTimeout = window.setTimeout(function() {
          XHRcreate($results.$inner, $results.$outer);
        }, settings.searchTimeout);
      }
    };

    // on input focus
    function onSearchFocus() {
      var $results = getResultContainers.call(this);
      $results.$outer.addClass('is-focused');
    };

    function calcDropdownProps($els) {
      var inputOffset = $els.input.offset();
      $els.results.css({
        width: $els.input.width(), 
        left: inputOffset.left, 
        top: inputOffset.top + $els.input.height()
      });
    };

    // move + position the dropdown (get around hidden overflows)
    function repositionDropdown($els) {
      $els.results.detach().appendTo($body);
      calcDropdownProps($els);
    };

    // ui event handlers
    function bindUiHandlers($box, $input) {
      $input.on({ input: onSearchInput, focus: onSearchFocus });
      $box.trigger('hssa.ready').on('click', function(event) {
        event.stopPropagation();
      });
      $(doc).on('click', function() {
        $('.hssa-results-outer.is-focused').removeClass('is-focused');
      });
    };

    //debounced resize
    function resizeHandler($els) {
      if (resizeTimeout) {
        clearTimeout(resizeTimeout);
      }
      resizeTimeout = setTimeout(function() {
        calcDropdownProps($els);
      }, 500);
    };

    //build search box
    function initialize(index) {
      /**
       * Bugfix 1.0.1
       * 
       * Multiple search boxes not always getting incremented index value.
       * Adds a new DOM Query every iteration, but makes sure that multiple hssa inputs are always treated as separate elements.
       */
      var existsAtThisIndex = $('#hssa-input-'+index);
      if (existsAtThisIndex.length > 0) { index++; }

      var $this = $(this),
          hasInitialized = $this.hasClass('has-initialized');

      //catch cases where external script gets run multi times
      if (hasInitialized) { return false; };

      //theme decorative css things
      if (settings.css) {
        doColorStyles(settings.accentColor);
      }

      //build-up & append search box html
      var $foundInput = $this.find('input[type="text"], input[type="search"]'),
          hasInput = !!($foundInput.length),
          $input = hasInput ? $foundInput : $(getInputHtml(index)),
          $results = $('<div class="hssa-results"></div>'),
          $loader = $('<div class="hssa-loader"></div>'),
          loaderIcon = '<div class="hssa-loader--icon"><span></span><span></span><span></span></div>';

      (!hasInput ? $this.prepend($input, $results) : $this.append($results));

      $loader.html(loaderIcon);
      $results.wrap('<div class="hssa-results-outer" data-hssa-results-index="'+index+'"></div>').before($loader);
      $input.wrap('<div class="hssa-input-wrapper" data-hssa-input-index="'+index+'"></div>');
      if (settings.searchIcon) {
        $input.after('<span class="hssa-input--icon">'+settings.searchIcon+'</span>')
              .after('<span class="hssa-input-deco" style="background:'+settings.accentColor+';"></span>');
      }
      if (settings.label) {
        $this.prepend('<div class="hssa-input-label"><label for="hssa-input-'+index+'">'+settings.label+'</label></div>');
      }
      if (settings.truncateContent) {
        $this.addClass('hssa-truncate-content');
      }

      var $wraps = {
        results: $results.parent('.hssa-results-outer'),
        input: $this.find('.hssa-input-wrapper')
      };

      //bind handlers + reposition drops + add ready class
      bindUiHandlers($this, $input);
      repositionDropdown($wraps);
      $this.addClass('has-initialized');

      $(win).resize(function() { resizeHandler($wraps); });
    };

    console.log('[Hubspot Autocomplete] - 1.0.2');
    return $(this).each(initialize);
  };

})(jQuery, window, document);