
'use strict';

var fs = require('fs'),
    url = require('url'),
    http = require('http'),
    async = require('async');

var media = url.parse(process.env.NODE_HOST_MEDIA || 'http://data.goddard.com/media');
var path = __dirname + '/../../test/fixtures/apps.json';
var apps = require(path);
var route = process.env.NODE_APPS_ROUTE || '/';

function rewriteManifest(init) {
  fs.unlink(path, function(err) {
    if (err) return process.emit('console:log', 'error', err);
    fs.writeFile(path, JSON.stringify(apps, null, '  '), function(err) {
      if (err) process.emit('console:log', 'error', err);
      else {
        if (!init) return;
        process.emit('init');
      }
    });
  });
}

function checkMediaAvailability() {
  if (process.env.NODE_ENV.indexOf('test') !== -1) {
    process.emit('console:log', 'detected testing environment, skipping media availability check...');
    return rewriteManifest(true);
  }
  process.emit('console:log', 'running head requests on media resources');
  function head(done) {
    return http.request({
      hostname: media.hostname,
      path: [media.path, this.medium.uri].join('/'),
      method: 'head'
    }, function(res) {
      var headResponse = '';
      res.on('data', function(data) {
        headResponse += data;
      }).on('end', function() {

        // we only want to remove media from the manifest if we're in production
        if (process.env.NODE_ENV.indexOf('prod') > -1 && res.statusCode === 404) {
          if (!this.ccI) {
            if (!apps.categories[this.cI].media) return done();
            apps.categories[this.cI].media.splice(this.mI, 1);
          } else {
            apps.categories[this.cI].categories[this.ccI].media.splice(this.mI, 1);
          }
          return done();
        }

        // otherwise, don't mangle the manifest
        if (this.ccI) {
          var media = apps.categories[this.cI].categories[this.ccI].media;
          if (!media) return done();
          media[this.mI].available = parseInt(res.headers['content-length'], 10) >= media[this.mI].size;
        } else {
          var media = apps.categories[this.cI].media;
          if (!media) return done();
          media[this.mI].available = parseInt(res.headers['content-length'], 10) >= media[this.mI].size;
        }
        done();
      }.bind(this));
    }.bind(this)).on('error', done.bind(done)).end();
  }
  var headRequests = [];
  apps.categories.forEach(function(category, cI) {
    (category.media || []).forEach(function(medium, mI) {
      headRequests.push(head.bind({medium: medium, cI: cI, ccI: null, mI: mI}));
    });
    (category.categories || []).forEach(function(category, ccI) {
      category.media.forEach(function(medium, mI) {
        headRequests.push(head.bind({medium: medium, cI: cI, ccI: ccI, mI: mI}));
      });
    });
  });
  async.parallel(headRequests, function(err, results) {
    if (err) process.emit('console:log', 'error', err);
    else rewriteManifest(true);
  });
}

function collate(manifest) {
  this.set('apps.content.menu', [{
    name: 'Start Page',
    uri: route
  }, {
    name: 'All Videos',
    uri: route + 'all-videos'
  }].concat(manifest.categories.map(function(category) {
    return {
      name: category.name,
      uri: route + category.uri,
      thumbnail: category.thumbnail
    };
  })));

  this.set('apps.content.haveCategories', manifest.categories.filter(function(category) {
    return !!category.categories;
  }));
  this.set('apps.content.dontHaveCategories', manifest.categories.filter(function(category) {
    return !category.categories;
  }));
}

function registerAllParentCategories() {
  var haveCategories = this.get('apps.content.haveCategories');
  var menu = this.get('apps.content.menu');
  haveCategories.forEach(function(listing) {
    var uri = route + listing.uri;
    var childCategoryMenu = [



      // do we want this to point to the home page or the top level of this category?
      {name: 'Start Page', uri: route /* <-- homepage, category --> `uri` */},



      {name: 'All Videos', uri: uri + '/all-videos'}
    ].concat(
      listing.categories.map(function(category) {
        return {name: category.name, uri: uri + '/' + category.uri};
      })
    );

    this.all(uri, function(req, res) {
      res.render('apps_parenthome', {
        menu: childCategoryMenu,
        notIndexPage: true,
        category: listing,
        current: uri,
        parent: route,
        categories: listing.categories,
        hcwt: apps.hcwt[0],
        currentCategory: uri
      });
    });
    this.all(uri + '/all-videos', function(req, res) {
      res.render('apps_listing', {
        menu: childCategoryMenu,
        notIndexPage: true,
        category: listing,
        heading: listing.name,
        current: uri + '/all-videos',
        parent: uri,
        categories: listing.categories,
        currentCategory: uri + '/all-videos'
      });
    });
    listing.categories.forEach(function(category) {
      category.menu = childCategoryMenu;
      registerChildCategory.call(this, category, uri);
    }, this);
  }, this);
}

function registerAllTopLevelCategories() {
  var dontHave = this.get('apps.content.dontHaveCategories');
  var menu = this.get('apps.content.menu');
  dontHave.forEach(function(category) {
    registerCategoryMedia.call(this, category, route + category.uri);
    this.all(route + category.uri, function(req, res) {
      res.render('apps_category', {
        menu: menu,
        current: route + category.uri,
        parent: route,
        category: category,
        notIndexPage: true,
        currentCategory: route + category.uri
      });
    });
  }, this);
}

function registerChildCategory(category, parentUri) {
  var menu = this.get('apps.content.menu');
  var uri = parentUri + '/' + category.uri;
  registerCategoryMedia.call(this, category, uri);
  this.all(uri, function(req, res) {
    res.render('apps_category', {
      menu: category.menu || menu,
      notIndexPage: true,
      current: uri,
      parent: parentUri,
      category: category,
      currentCategory: uri
    });
  });
}

function registerCategoryMedia(category, parentUri) {
  var menu = this.get('apps.content.menu');
  (category.media || []).forEach(function(medium, i) {
    this.all(parentUri + '/video/' + i, function(req, res) {
      res.render('apps_medium', {
        menu: category.menu || menu,
        parent: parentUri,
        medium: medium,
        categoryName: category.name,
        notIndexPage: true,
        currentCategory: parentUri
      });
    });
  }, this);
}

function registerMediaListing() {
  var menu = this.get('apps.content.menu');
  var topLevelCategoriesWithMedia = this.get('apps.content.dontHaveCategories').filter(function(category) {
    return category.media && category.media.length;
  });
  this.all(route + 'all-videos', function(req, res) {
    res.render('apps_allvideos', {
      menu: menu,
      current: route + 'all-videos',
      categories: topLevelCategoriesWithMedia,
      parent: route,
      notIndexPage: true,
      currentCategory: route + 'all-videos'
    });
  });
}

function init(manifest) {
  collate.call(this, manifest);
  registerAllParentCategories.call(this);
  registerAllTopLevelCategories.call(this);
  registerMediaListing.call(this);
  this.all(route, function(req, res) {
    if (req.hostname.indexOf('goddard') !== -1) {
      return res.redirect('http://mamawifi.com');
    }
    res.render('apps_home', {
      dyk: manifest.dyk[0],
      current: route,
      notIndexPage: false,
      category: {name: 'mamaconnect', uri: route},
      menu: this.get('apps.content.menu'),
      currentCategory: route
    });
  }.bind(this));
}

module.exports = function(app) {
  process.on('init', function() {
    process.emit('console:log', 'manifest was rewritten. reloading...');
    apps = require(path);
    process.emit('console:log', 'reloaded...');
    init.call(app, apps);
    process.emit('console:log', 'mamaconnect content sytem initialised!');
  });

  // run the media availability check every fifteen minutes
  setInterval(
    checkMediaAvailability.bind(app),
    (1000 * 60) * 15
  );

  // run it once, immediately
  checkMediaAvailability.call(app);
};
