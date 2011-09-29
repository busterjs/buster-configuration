var bPromise = require("buster-promise");
var resourceSet = require("buster-resources/lib/resource-set");
var Path = require("path");
var fs = require("fs");
var glob = require("glob");
var crypto = require("crypto");

module.exports = {
    create: function (groupData, rootPath) {
        var instance = Object.create(this);
        instance.groupData = groupData;
        instance.groupData.resources = instance.groupData.resources || {};
        instance.groupData.load = instance.groupData.load || [];
        instance.rootPath = rootPath;
        return instance;
    },

    resolve: function () {
        this.resourceSet = resourceSet.create({});
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
        
        if (this.groupData.sources instanceof Array) {
            this.groupData.load = this.groupData.sources.concat(this.groupData.load);
        }

        if (this.groupData.libs instanceof Array) {
            this.groupData.load = this.groupData.libs.concat(this.groupData.load);
        }

        if (this.groupData.deps instanceof Array) {
            this.groupData.load = this.groupData.deps.concat(this.groupData.load);
        }

        if (this.groupData.specs instanceof Array) {
            this.groupData.load = this.groupData.specs.concat(this.groupData.load);
        }

        if (this.groupData.tests instanceof Array) {
            this.groupData.load = this.groupData.tests.concat(this.groupData.load);
        }

        for (var i = 0, ii = this.groupData.load.length; i < ii; i++) {
            resourcePromises.push(addLoadResource.call(this, this.groupData.load[i]));
        }

        bPromise.all(resourcePromises).then(function () {
            promise.resolve();
        }, function (err) {
            promise.reject(err);
        });

        return promise;
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
            var pathToLoad = shortenedPath.call(this, resolvePath.call(this, allPaths[i]));
            this.resourceSet.appendToLoad([pathToLoad]);
        }

        promise.resolve();
    }.bind(this), function (err) {
        promise.reject(err);
    });

    return promise;
}