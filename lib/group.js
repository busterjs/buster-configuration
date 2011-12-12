var B = require("buster-core");
var bPromise = require("buster-promise");
var resourceSet = require("buster-resources/lib/resource-set");
var Path = require("path");
var fs = require("fs");
// var glob = require("glob");
var glob = require("buster-glob").glob;
var url = require("url");
// var moduleLoader = require("buster-module-loader");

var CONFIG_OPTIONS = ["autoRun"];
// var LOAD_ALIASES = ["deps", "libs", "src", "sources", "specs", "tests"];
// var LOAD_EVENTS = ["dependencies", "sources", "tests"];
// var NO_CACHE_HEADERS = {
//     "Cache-Control": "no-cache",
//     "Pragma": "no-cache",
//     "Expires": "0"
// };

// var KNOWN_OPTIONS = LOAD_ALIASES.concat(
//     ["resources", "environment", "rootPath", "extends", "env",
//      "server", "options", "serverString", "name", "autoRun",
//      "extensions"]);

// var UNKNOWN_OPTION_HELP = {
//     "load": "Did you mean one of: deps, libs, src, sources, tests, specs?",
//     "extend": "Did you mean extends?"
// };

var cg = module.exports = B.extend(B.eventEmitter.create(), {
    create: function (options, rootPath) {
        options = options || {};
        return B.extend(Object.create(this), {
            rootPath: Path.resolve(rootPath, options.rootPath),
            server: extractServer(options),
            environment: options.environment || options.env || "browser",
            options: extractOptions(options),
//             serverString: options.server,
//             error: unknownProperties(options),
//             extensions: options.extensions
        }, extractResources(options));
    },

    resolve: function () {
        var promise = bPromise.create();
        if (this.rsPromise) return this.rsPromise;
        if (this.resourceSet) return promise.resolve(this.resourceSet);

        this.rsPromise = promise;
        var rs = this.resourceSet = resourceSet.create();

        var done = function (err) {
            delete this.rsPromise;
            if (err) return promise.reject(err);
            promise.resolve(rs);
        }.bind(this);

        addResources(rs, this.rootPath, this.resources).then(function () {
            addAllLoadEntries(this, rs, this.rootPath).then(
                partial(done, null), done);
        }.bind(this), done);

//         var promise = bPromise.create();
//         if (this.resourceSet) return promise.resolve(this);
//         if (this.error) return promise.reject(this.error);
//         if (!loadExtensions(this, promise)) return promise;

//         this.resourceSet = resourceSet.create({});
//         this.absoluteLoadEntries = [];

//         var promises = loadResources.call(this, this.resources);
//         promises.push(addLoadResources.call(this));

//         bPromise.all(promises).then(function () {
//             promise.resolve(this);
//         }.bind(this), function (err) {
//             promise.reject(err);
//         });

        return promise;
    },

//     setupFrameworkResources: function () {
//         this.emit("load:resources", this.resourceSet);

//         var files = resolveModules.call(this, [
//             ["buster-core", "buster-core.js"],
//             ["buster-core", "buster-event-emitter.js"],
//             ["buster-evented-logger", "buster-evented-logger.js"],
//             ["buster-assertions", "buster-assertions.js"],
//             ["buster-assertions", "buster-assertions/expect.js"],
//             ["buster-format", "buster-format.js"],
//             ["buster-promise", "buster-promise.js"],
//             ["sinon", "sinon.js"],
//             ["sinon", "sinon/spy.js"],
//             ["sinon", "sinon/stub.js"],
//             ["sinon", "sinon/mock.js"],
//             ["sinon", "sinon/collection.js"],
//             ["sinon", "sinon/sandbox.js"],
//             ["sinon", "sinon/test.js"],
//             ["sinon", "sinon/test_case.js"],
//             ["sinon", "sinon/assert.js"],
//             ["sinon", "sinon/util/event.js"],
//             ["sinon", "sinon/util/fake_xml_http_request.js"],
//             ["sinon", "sinon/util/fake_timers.js"],
//             ["sinon", "sinon/util/fake_server.js"],
//             ["sinon", "sinon/util/fake_server_with_clock.js"],
//             ["buster-test", "buster-test/spec.js"],
//             ["buster-test", "buster-test/test-case.js"],
//             ["buster-test", "buster-test/test-context.js"],
//             ["buster-test", "buster-test/test-runner.js"],
//             ["buster-test", "buster-test/reporters/json-proxy.js"],
//             ["buster-bayeux-emitter", "buster-bayeux-emitter.js"],
//             ["sinon-buster", "sinon-buster.js"],
//             ["buster", "buster/buster-wiring.js"]
//         ]);

//         var ieFiles = resolveModules.call(this, [
//             ["sinon", "sinon/util/timers_ie.js"],
//             ["sinon", "sinon/util/xhr_ie.js"]
//         ]);

//         var compatResourceName = "/buster/compat-" + VERSION() + ".js";
//         this.resourceSet.addResource(compatResourceName, {
//             combine: ieFiles,
//             headers: NO_CACHE_HEADERS
//         });
//         this.resourceSet.prependToLoad([compatResourceName]);

//         var bundleResourceName = "/buster/bundle-" + VERSION() + ".js";
//         this.resourceSet.addResource(bundleResourceName, {
//             combine: files,
//             headers: NO_CACHE_HEADERS
//         });
//         this.resourceSet.prependToLoad([bundleResourceName]);
//     },

    extend: function (options, rootPath) {
        return cg.create(mergeOptions(this, options || {}), rootPath);
    }
});

// UTILS

function partial(fn) {
    var args = [].slice.call(arguments, 1);
    return function () {
        return fn.apply(this, args.concat([].slice.call(arguments)));
    };
}

function bind(obj, fn) {
    var restArgs = [].slice.call(arguments, 2);
    return obj[fn].bind.apply(obj[fn], [obj].concat(restArgs));
}

function prop(name) {
    return function (object) {
        return object[name];
    };
}

function concat(arr1, arr2) {
    return (arr1 || []).concat(arr2 || []);
}

// OPTIONS

function extractResources(o) {
    return {
        resources: o.resources || [],
        libs: concat(o.deps, o.libs),
        sources: concat(o.src, o.sources),
        tests: concat(o.specs, o.tests)
    };
}

function extractOptions(opt) {
    return CONFIG_OPTIONS.reduce(function (options, key) {
        if (key in opt) options[key] = opt[key];
        return options;
    }, {});
}

function extractServer(options) {
    if (!options.server) return;
    if (!/^[a-z]+:\/\//i.test(options.server)) {
        options.server = "http://" + options.server;
    }
    var server = url.parse(options.server);
    server.port = parseInt(server.port, 10);
    return server;
}

// RESOURCES

function addResources(rs, rootPath, resources) {
    return bPromise.all(resources.map(partial(addResource, rs, rootPath)));
}

function addResource(rs, rootPath, resource) {
    if (typeof resource == "string") {
        return addStringResource(rs, makePath(rs, rootPath, resource));
    }

    return bPromise.thenable(rs.addResource(resource.path, resource));
}

function addStringResource(rs, path) {
    var promise = bPromise.create();

    resolvePaths(rs, path.root, [path], function (e, paths) {
        if (e || paths.length == 0) {
            return promise.reject(e || { message: path.path + " matched no files" });
        }

        addFileResources(rs, paths).then(
            bind(promise, "resolve"), bind(promise, "reject"));
    });

    return promise;
}

function addFileResources(rs, paths) {
    return bPromise.all(paths.map(partial(addFileResource, rs)));
}

function addFileResource(rs, resource) {
    return rs.addFile(resource.fileName, {
        path: resource.path
    });
}

function resolvePaths(rs, rootPath, paths, callback) {
    glob(relativePaths(paths).map(prop("fileName")), function (err, matches) {
        if (err) return callback(err);
        matches = makePaths(rs, rootPath, matches);
        matches = mergePaths(mergePaths(existingResources(rs, paths), matches),
                             absolutePaths(paths));
        callback(err, matches);
    });
}

function existingResources(rs, paths) {
    return paths.reduce(function (res, path) {
        if (rs.resources[path.path]) res.push(path);
        return res;
    }.bind(this), []);
}

// LOAD

function addAllLoadEntries(group, rs, rootPath) {
    var promise = bPromise.create();

    buster.series([
        partial(addLoadEntries, group, rs, rootPath, "libs"),
        partial(addLoadEntries, group, rs, rootPath, "sources"),
        partial(addLoadEntries, group, rs, rootPath, "tests")
    ], function (err, results) {
        if (err) return promise.reject(err);
        promise.resolve(results);
    });

    return promise;
}

function addLoadEntries(group, rs, rootPath, type, done) {
    var loadPaths = makePaths(rs, rootPath, group[type]);

    resolvePaths(rs, rootPath, loadPaths, function (err, matches) {
        if (err) return done(err);
        var collection = pathCollection(rs, rootPath, matches);
        group.emit("load:" + type, collection.api, rootPath);

        addMissingLoadResources(rs, collection.paths()).then(function () {
            var pathNames = collection.relativePaths();
            rs.appendToLoad(pathNames);
            done(null, pathNames);
        }, function (err) { done(err); });
    });
}

function addMissingLoadResources(rs, paths) {
    return addFileResources(rs, paths.reduce(function (resources, path) {
        if (!rs.resources[path.path]) resources.push(path);
        return resources;
    }, []));
}

// PATHS

function relativePath(root, path) {
    return path.replace(root, "");
}

function makePaths(rs, root, paths) {
    return paths.map(function (path) {
        return makePath(rs, root, relativePath(root, path));
    });
}

function makePath(rs, root, path) {
    var fileName = Path.join(root, path);
    var normalized = rs.normalizePath(relativePath(root, fileName));
    return {
        root: root,
        path: normalized,
        fileName: fileName,
        isAbsolute: normalized == fileName
    };
}

function mergePaths(target, source) {
    var tpaths = paths(target), spaths = paths(source);

    spaths.forEach(function (p, i) {
        if (tpaths.indexOf(p) < 0) {
            target.push(source[i]);
        }
    });

    return target;
}

function relativePaths(paths) {
    return paths.filter(function (p) { return !p.isAbsolute; });
}

function absolutePaths(paths) {
    return paths.filter(function (p) { return p.isAbsolute; });
}

function paths(paths) {
    return paths.map(function (p) { return p.path; });
}

function pathCollection(rs, rootPath, paths) {
    var api = {
        get: function (i) {
            return paths[i].path;
        },
        add: function (path) {
            paths.push(makePath(rs, rootPath, path));
            return api;
        },
        remove: function (path) {
            paths = paths.filter(function (p) { return p.path != path; });
        }
    };
    api.push = api.add;

    return {
        api: api,
        paths: function () {
            return paths;
        },
        relativePaths: function () {
            return paths.map(function (p) { return p.path; });
        }
    };
}

// -----------------------

function mergeOptions(group, options) {
    var opt = {}, key;
    opt.resources = B.extend(group.resources, options.resources);

    for (var i = 0, l = LOAD_ALIASES.length; i < l; ++i) {
        key = LOAD_ALIASES[i];
        options[key] = (group[key] || []).concat(options[key] || []);
    }

    return B.extend(opt, {
        environment: group.environment,
        rootPath: group.rootPath,
        server: group.serverString
    }, extractOptions(group.options), options);
}












// ----------------------------------------------------------

// function resolvePaths(rootPath, rs, paths, callback) {
//     glob(paths.map(Path.join.bind(Path, rootPath)), function (err, matches) {
//         if (!err && matches.length == 0) {
//             err = { message: resource + " matched no files" };
//         }

//         if (err) return callback(err);
//         matches = rs.recognizedPaths(paths).concat(matches);
//         callback(err, matches.map(relativePath.bind(null, rootPath)));
//     });
// }

// function addAllLoadEntries(hub, rootPath, rs, options) {
//     var promise = bPromise.create();

//     function load(event, arr) {
//         return function (done) {
//             resolvePaths(rootPath, rs, arr, function (err, paths) {
//                 hub.emit(event, paths, rootPath);
//                 addLoadEntries(rootPath, rs, paths).then(done.bind(null, null), done);
//             });
//         };
//     }

//     buster.series([
//         load("load:dependencies", options.libs),
//         load("load:sources", options.sources),
//         load("load:tests", options.tests)
//     ], function (err, results) {
//         if (err) return promise.reject(err);
//         promise.resolve(buster.flatten(results));
//     });

//     return promise;
// }

// function addLoadEntries(rootPath, rs, entries) {
//     return bPromise.all(entries.reduce(function (promises, resource) {
//         var path = rs.normalizePath(resource);
//         var append = appendToLoad.bind(null, rs);

//         if (!rs.resources[path]) {
//             promises.push(addFileResource(rootPath, rs, path).then(append));
//         } else {
//             append([path]);
//         }

//         return promises;
//     }, []));
// }

// function appendToLoad(resourceSet, paths) {
//     paths.forEach(function (path) {
//         if (resourceSet.load.indexOf(path) >= 0) return;
//         resourceSet.appendToLoad(path);
//     });
// }

// function addResources(rootPath, rs, resources) {
//     return bPromise.all(resources.map(addResource.bind(null, rootPath, rs)));
// }

// function addResource(rootPath, rs, resource) {
//     if (typeof resource == "string") {
//         return addFileResource(rootPath, rs, [resource]);
//     }

//     return bPromise.thenable(rs.addResource(resource.path, resource));

//     // var promise = bPromise.create();

//     // resolvePaths(rootPath, rs, resource, function (err, matches) {
//     //     if (err) return promise.reject(err);
//     //     B.parallel(addFiles(rootPath, rs, matches), function (err, paths) {
//     //         promise.resolve(paths);
//     //     });
//     // });

//     // glob(Path.join(rootPath, resource), function (err, matches) {
//     //     if (matches.length == 0) {
//     //         return promise.reject({ message: resource + " matched no files" });
//     //     }
//     //     B.parallel(addFiles(rootPath, rs, matches), function (err, paths) {
//     //         promise.resolve(paths);
//     //     });
//     // });

//     //return promise;
//     // return addFileResource(rootPath, rs, resource);
// }

// function addFileResource(rootPath, rs, resources) {
//     var promise = bPromise.create();

//     B.parallel(addFiles(rootPath, rs, resources), function (err, paths) {
//         promise.resolve(paths);
//     });

//     return promise;
// }

// // ------------------------------------------------------

// function addFiles(rootPath, rs, files) {
//     return files.reduce(function (fns, file) {
//         fns.push(addFile(rootPath, rs, file));
//         return fns;
//     }, []);
// }

// function addFile(rootPath, rs, file) {
//     return function (done) {
//         var fileName = Path.resolve(rootPath, file);
//         rs.addFile(fileName, {
//             path: relativePath(rootPath, file)
//         }).then(function (resource) {
//             done(null, resource.path);
//         }, done);
//     };
// }

// function relativePath(root, path) {
//     return path.replace(root, "");
// }

// // -------------------------------------------------------

// function extractServer(options) {
//     if (!options.server) return;
//     if (!/^[a-z]+:\/\//i.test(options.server)) {
//         options.server = "http://" + options.server;
//     }
//     var server = url.parse(options.server);
//     server.port = parseInt(server.port, 10);
//     return server;
// }






//////////////////////////////////////////////////////////////////////77

// function loadExtensions(group, promise) {
//     try {
//         (group.extensions || []).forEach(function (extension) {
//             var module = moduleLoader.load(extension);

//             if (typeof module.configure != "function") {
//                 throw new Error("Extension '" + extension +
//                                 "' has no 'configure' method");
//             }

//             module.configure(group);
//         });
//     } catch (e) {
//         e.message = "Failed loading extensions: " + e.message;
//         promise.reject(e);
//         return false;
//     }

//     return true;
// }

// function mergeOptions(group, options) {
//     var opt = {}, key;
//     opt.resources = B.extend(group.resources, options.resources);

//     for (var i = 0, l = LOAD_ALIASES.length; i < l; ++i) {
//         key = LOAD_ALIASES[i];
//         options[key] = (group[key] || []).concat(options[key] || []);
//     }

//     return B.extend(opt, {
//         environment: group.environment,
//         rootPath: group.rootPath,
//         server: group.serverString
//     }, extractOptions(group.options), options);
// }

// function loadResources(resources) {
//     var promises = [], resource;

//     for (var i = 0, ii = resources.length; i < ii; i++) {
//         resource = resources[i];
//         if (typeof(resource) == "string") resource = { path: resource };

//         if ("backend" in resource) {
//             addBackendResource.call(this, resource);
//         } else if ("combine" in resource) {
//             promises.push(addCombinedResource.call(this, resource));
//         } else if ("content" in resource) {
//             addContentResource.call(this, resource);
//         } else {
//             promises.push(addFileSystemResource.call(this, resource));
//         }
//     }

//     return promises;
// }

// function buildLoadArray(group, callback) {
//     var fns = LOAD_EVENTS.reduce(function (fns, event, i) {
//         fns.push(function (done) {
//             var patterns = group[LOAD_ALIASES[i*2]].concat(group[LOAD_ALIASES[i*2 + 1]]).map(function (pattern) { return Path.resolve(group.rootPath, pattern); });

//             bglob.glob(patterns, function (err, matches) {
//                 if (matches.length == 0) {
//                     matches = patterns.reduce(function (m, pattern) {
//                         if (group.resourceSet.resources[pattern]) {
//                             m.push(pattern);
//                         }
//                         return m;
//                     }, []);
//                 }

//                 matches = matches.map(shortenedPath.bind(group));
//                 group.emit("load:" + event, matches, group.rootPath);
//                 done(err, matches);
//             });
//         });
//         return fns;
//     }, []);

//     parallel(fns, function (err, matches) {
//         callback(err, B.flatten(matches));
//     });
// }

// var GLOB_OPTIONS = glob.GLOB_DEFAULT | glob.GLOB_NOCHECK;

// function resolvePath(path) {
//     return Path.resolve(this.rootPath, path);
// }

// function shortenedPath(path) {
//     return path.replace(this.rootPath, "");
// }

// function addFileSystemResource(resource) {
//     var self = this;
//     var promise = bPromise.create();
//     var absolutePath = resolvePath.call(self, resource.path);
//     glob(absolutePath, GLOB_OPTIONS, function (err, matches) {
//         if (err) {
//             promise.reject(err);
//         } else {
//             addResources.call(self, matches, resource, promise);
//         }
//     });

//     return promise;
// }

// function addBackendResource(resource) {
//     var absolutePath = resolvePath.call(this, resource.path);
//     var relative = shortenedPath.call(this, absolutePath);

//     this.resourceSet.addResource(relative, {backend: resource.backend});
// }

// function addContentResource(resource) {
//     this.resourceSet.addResource(resource.path, {content: resource.content});
// }

// function addCombinedResource(resource) {
//     var self = this;
//     var promise = bPromise.create();

//     var globPromises = [];
//     for (var i = 0, ii = resource.combine.length; i < ii; i++) {
//         (function (globPromise) {
//             globPromises.push(globPromise);
//             var absolutePath = resolvePath.call(self, resource.combine[i]);
//             glob(absolutePath, GLOB_OPTIONS, function (err, matches) {
//                 if (err) {
//                     globPromise.reject(err);
//                 } else {
//                     globPromise.resolve(matches.map(function (match) {
//                         return shortenedPath.call(self, match);
//                     }));
//                 }
//             });
//         }(bPromise.create()));
//     }

//     bPromise.all(globPromises).then(function () {
//         var allMatches = [];
//         for (var i = 0, ii = arguments.length; i < ii; i++) {
//             allMatches = allMatches.concat(arguments[i][0]);
//         }

//         self.resourceSet.addResource(resource.path, {combine: allMatches});
//         promise.resolve();
//     }, function (err) {
//         promise.reject(err);
//     });

//     return promise;
// }

// function addResources(paths, baseResource, promise) {
//     var self = this;
//     var filePromises = [];
//     for (var i = 0, ii = paths.length; i < ii; i++) {
//         (function (path) {
//             var filePromise = bPromise.create();
//             filePromises.push(filePromise);
//             var resource = {};

//             resource.path = shortenedPath.call(self, path);
//             if ("headers" in baseResource) {
//                 resource.headers = baseResource.headers;
//             }

//             fs.stat(path, function (err, stats) {
//                 if (err) {
//                     filePromise.reject(err.message);
//                 } else {
//                     var hash = crypto.createHash("sha1");
//                     hash.update(stats.mtime.toString());
//                     hash.update(path);
//                     resource.etag = hash.digest("hex");

//                     self.resourceSet.addFile(path, resource);
//                     filePromise.resolve(path);
//                 }
//             });
//         }(paths[i]));
//     }

//     bPromise.all(filePromises).then(function () {
//         var allAddedPaths = [];
//         for (var i = 0, ii = arguments.length; i < ii; i++) {
//             allAddedPaths = allAddedPaths.concat(arguments[i][0]);
//         }
//         promise.resolve(allAddedPaths);
//     }, function (err) {
//         promise.reject(err);
//     });
// }

// function addLoadResources() {
//     var promise = bPromise.create(), group = this;

//     buildLoadArray(group, function (err, loadArr) {
//         addLoadResourcesIter.call(group, loadArr, promise);
//     });

//     return promise;
// }

// function addLoadResourcesIter(loadResources, promise) {
//     if (loadResources.length == 0) {
//         return promise.resolve();
//     }

//     addLoadResource.call(this, loadResources.shift()).then(function () {
//         addLoadResourcesIter.call(this, loadResources, promise);
//     }.bind(this), function (err) {
//         promise.reject(err);
//     });
// }

// function addLoadResource(load)  {
//     var promise = bPromise.create();
//     var resource = getResource(this.resources, load);

//     if (resource) {
//         addToLoad.call(this, resource.path);
//         promise.resolve();
//         return promise;
//     }

//     addFileSystemResource.call(this, {path: load}).then(function (allPaths) {
//         for (var i = 0, ii = allPaths.length; i < ii; i++) {
//             var absolutePath = resolvePath.call(this, allPaths[i]);
//             var pathToLoad = shortenedPath.call(this, absolutePath);
//             addToLoad.call(this, pathToLoad, absolutePath);
//         }

//         promise.resolve();
//     }.bind(this), function (err) {
//         promise.reject(err);
//     });

//     return promise;
// }

// function addToLoad(path, absolutePath) {
//     if (absolutePath) {
//         this.absoluteLoadEntries.push(absolutePath);
//     }

//     if (this.resourceSet.load.indexOf(path) < 0) {
//         this.resourceSet.appendToLoad([path]);
//     }
// }

// function getResource(resources, path) {
//     for (var i = 0, l = resources.length; i < l; ++i) {
//         if (resources[i].path == path) return resources[i];
//     }
// }

// function resolveModules(modules) {
//     var paths = [];

//     for (var i = 0, ii = modules.length; i < ii; i++) {
//         var moduleName = modules[i][0];
//         var moduleFile = modules[i][1];
//         var resourcePath = "/buster/" + moduleFile;
//         var absolutePath = require.resolve(moduleName + "/lib/" + moduleFile);
//         this.resourceSet.addFile(absolutePath, {path: resourcePath});
//         paths.push(resourcePath);
//     }

//     return paths;
// }

// var bConfig;

// function VERSION() {
//     if (!bConfig) bConfig = require("./buster-configuration");
//     return bConfig.VERSION;
// }

// function extractServer(options) {
//     if (!options.server) return;
//     if (!/^[a-z]+:\/\//i.test(options.server)) {
//         options.server = "http://" + options.server;
//     }
//     var server = Url.parse(options.server);
//     server.port = parseInt(server.port, 10);
//     return server;
// }

// function extractOptions(options) {
//     var opt = {}, key;
//     for (var i = 0, l = CONFIG_OPTIONS.length; i < l; ++i) {
//         key = CONFIG_OPTIONS[i];

//         if (key in options) {
//             opt[key] = options[key];
//         }
//     }

//     return opt;
// }

// function extractResources(options) {
//     var resources = { resources: options.resources || [] };

//     for (var i = 0, l = LOAD_ALIASES.length; i < l; ++i) {
//         resources[LOAD_ALIASES[i]] = options[LOAD_ALIASES[i]] || [];
//     }

//     return resources;
// }

// function unknownProperties(group) {
//     var prop, help;

//     for (prop in group) {
//         if (group.hasOwnProperty(prop) && KNOWN_OPTIONS.indexOf(prop) < 0) {
//             help = UNKNOWN_OPTION_HELP[prop];
//             return "Unknown configuration option '" + prop + "'" +
//                 (help ? "\n" + help : "");
//         }
//     }
// }
