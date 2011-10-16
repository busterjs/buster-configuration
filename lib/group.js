var bPromise = require("buster-promise");
var resourceSet = require("buster-resources/lib/resource-set");
var Path = require("path");
var fs = require("fs");
var glob = require("glob");
var crypto = require("crypto");
var Url = require("url");

var LOAD_ALIASES = ["sources", "libs", "deps", "specs", "tests"];
var NO_CACHE_HEADERS = {
    "Cache-Control": "no-cache",
    "Pragma": "no-cache",
    "Expires": "0"
};

module.exports = {
    create: function (groupData, rootPath) {
        var instance = Object.create(this);
        instance.groupData = groupData;
        instance.groupData.resources = instance.groupData.resources || {};
        instance.groupData.load = instance.groupData.load || [];
        instance.environment = groupData.environment || groupData.env || "browser";
        instance.rootPath = rootPath;

        if ("server" in groupData) {
            var url = Url.parse(groupData.server);
            delete groupData.server;

            instance.server = url;
            instance.server.port = parseInt(instance.server.port, 10);
        }
        return instance;
    },

    resolve: function () {
        this.resourceSet = resourceSet.create({});
        this.absoluteLoadEntries = [];

        var promise = bPromise.create();

        var resourcePromises = [];
        for (var i = 0, ii = this.groupData.resources.length; i < ii; i++) {
            var resource = this.groupData.resources[i];
            if (typeof(resource) == "string") resource = {path: resource};

            if ("backend" in resource) {
                addBackendResource.call(this, resource);
            } else if ("combine" in resource) {
                resourcePromises.push(addCombinedResource.call(this, resource));
            } else if ("content" in resource) {
                addContentResource.call(this, resource);
            } else {
                resourcePromises.push(addFileSystemResource.call(this, resource));
            }
        }

        for (var i = 0, ii = LOAD_ALIASES.length; i < ii; i++) {
            var alias = LOAD_ALIASES[i];
            if (this.groupData[alias] instanceof Array) {
                this.groupData.load = this.groupData.load.concat(this.groupData[alias]);
            }
        }

        for (var i = 0, ii = this.groupData.load.length; i < ii; i++) {
            resourcePromises.push(addLoadResource.call(this, this.groupData.load[i]));
        }

        bPromise.all(resourcePromises).then(function () {
            promise.resolve(this);
        }.bind(this), function (err) {
            promise.reject(err);
        });

        return promise;
    },

    setupFrameworkResources: function () {
        var files = resolveModules.call(this, [
            ["buster-core", "buster-core.js"],
            ["buster-core", "buster-event-emitter.js"],
            ["buster-evented-logger", "buster-evented-logger.js"],
            ["buster-assertions", "buster-assertions.js"],
            ["buster-assertions", "buster-assertions/expect.js"],
            ["buster-format", "buster-format.js"],
            ["buster-promise", "buster-promise.js"],
            ["sinon", "sinon.js"],
            ["sinon", "sinon/spy.js"],
            ["sinon", "sinon/stub.js"],
            ["sinon", "sinon/mock.js"],
            ["sinon", "sinon/collection.js"],
            ["sinon", "sinon/sandbox.js"],
            ["sinon", "sinon/test.js"],
            ["sinon", "sinon/test_case.js"],
            ["sinon", "sinon/assert.js"],
            ["sinon", "sinon/util/fake_xml_http_request.js"],
            ["sinon", "sinon/util/fake_timers.js"],
            ["sinon", "sinon/util/fake_server.js"],
            ["sinon", "sinon/util/fake_server_with_clock.js"],
            ["buster-test", "buster-test/spec.js"],
            ["buster-test", "buster-test/test-case.js"],
            ["buster-test", "buster-test/test-context-filter.js"],
            ["buster-test", "buster-test/test-runner.js"],
            ["buster-test", "buster-test/reporters/json-proxy.js"],
            ["sinon-buster", "sinon-buster.js"],
            ["buster", "buster/buster-wiring.js"]
        ]);

        var ieFiles = resolveModules.call(this, [
            ["sinon", "sinon/util/timers_ie.js"],
            ["sinon", "sinon/util/xhr_ie.js"]
        ]);

        var compatResourceName = "/buster/compat-" + VERSION() + ".js";
        this.resourceSet.addResource(compatResourceName, {
            combine: ieFiles,
            headers: NO_CACHE_HEADERS
        });
        this.resourceSet.prependToLoad([compatResourceName]);

        var bundleResourceName = "/buster/bundle-" + VERSION() + ".js";
        this.resourceSet.addResource(bundleResourceName, {
            combine: files,
            headers: NO_CACHE_HEADERS
        });
        this.resourceSet.prependToLoad([bundleResourceName]);
    }
};

var GLOB_OPTIONS = glob.GLOB_DEFAULT | glob.GLOB_NOCHECK;

function resolvePath(path) {
    return Path.resolve(this.rootPath, path);
}

function shortenedPath(path) {
    return path.slice(this.rootPath.length);
}

function addFileSystemResource(resource) {
    var self = this;
    var promise = bPromise.create();
    var absolutePath = resolvePath.call(self, resource.path);
    glob(absolutePath, GLOB_OPTIONS, function (err, matches) {
        if (err) {
            promise.reject(err);
        } else {
            addResources.call(self, matches, resource, promise);
        }
    });

    return promise;
}

function addBackendResource(resource) {
    var absolutePath = resolvePath.call(this, resource.path);
    var relative = shortenedPath.call(this, absolutePath);

    this.resourceSet.addResource(relative, {backend: resource.backend});
}

function addContentResource(resource) {
    this.resourceSet.addResource(resource.path, {content: resource.content});
}

function addCombinedResource(resource) {
    var self = this;
    var promise = bPromise.create();

    var globPromises = [];
    for (var i = 0, ii = resource.combine.length; i < ii; i++) {
        (function (globPromise) {
            globPromises.push(globPromise);
            var absolutePath = resolvePath.call(self, resource.combine[i]);
            glob(absolutePath, GLOB_OPTIONS, function (err, matches) {
                if (err) {
                    globPromise.reject(err);
                } else {
                    globPromise.resolve(matches.map(function (match) {
                        return shortenedPath.call(self, match);
                    }));
                }
            });
        }(bPromise.create()));
    }

    bPromise.all(globPromises).then(function () {
        var allMatches = [];
        for (var i = 0, ii = arguments.length; i < ii; i++) {
            allMatches = allMatches.concat(arguments[i][0]);
        }

        self.resourceSet.addResource(resource.path, {combine: allMatches});
        promise.resolve();
    }, function (err) {
        promise.reject(err);
    });

    return promise;
}

function addResources(paths, baseResource, promise) {
    var self = this;

    var filePromises = [];
    for (var i = 0, ii = paths.length; i < ii; i++) {
        (function (path) {
            var filePromise = bPromise.create();
            filePromises.push(filePromise);
            var resource = {};

            resource.path = shortenedPath.call(self, path);
            if ("headers" in baseResource) {
                resource.headers = baseResource.headers;
            }

            fs.stat(path, function (err, stats) {
                if (err) {
                    filePromise.reject(err.message);
                } else {
                    var hash = crypto.createHash("sha1");
                    hash.update(stats.mtime.toString());
                    hash.update(path);
                    resource.etag = hash.digest("hex");

                    self.resourceSet.addFile(path, resource);
                    filePromise.resolve(path);
                }
            });
        }(paths[i]));
    }

    bPromise.all(filePromises).then(function () {
        var allAddedPaths = [];
        for (var i = 0, ii = arguments.length; i < ii; i++) {
            allAddedPaths = allAddedPaths.concat(arguments[i][0]);
        }
        promise.resolve(allAddedPaths);
    }, function (err) {
        promise.reject(err);
    });
}

function addLoadResource(load)  {
    var promise = bPromise.create();

    addFileSystemResource.call(this, {path: load}).then(function (allPaths) {
        for (var i = 0, ii = allPaths.length; i < ii; i++) {
            var absolutePath = resolvePath.call(this, allPaths[i]);
            var pathToLoad = shortenedPath.call(this, absolutePath);
            this.absoluteLoadEntries.push(absolutePath);

            if (this.resourceSet.load.indexOf(pathToLoad) == -1) {
                this.resourceSet.appendToLoad([pathToLoad]);
            }
        }

        promise.resolve();
    }.bind(this), function (err) {
        promise.reject(err);
    });

    return promise;
}

function resolveModules(modules) {
    var paths = [];

    for (var i = 0, ii = modules.length; i < ii; i++) {
        var moduleName = modules[i][0];
        var moduleFile = modules[i][1];
        var resourcePath = "/buster/" + moduleFile;
        var absolutePath = require.resolve(moduleName + "/lib/" + moduleFile);
        this.resourceSet.addFile(absolutePath, {path: resourcePath});
        paths.push(resourcePath);
    }

    return paths;
}

var bConfig;

function VERSION() {
    if (!bConfig) bConfig = require("./buster-configuration");
    return bConfig.VERSION;
}
