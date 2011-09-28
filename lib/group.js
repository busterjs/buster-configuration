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
            } else {
                resourcePromises.push(addFileSystemResource.call(this, resource));
            }
        }

        bPromise.all(resourcePromises).then(function () {
            promise.resolve();
        }, function (err) {
            promise.reject(err);
        });

        return promise;
    }
};

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
    glob(absolutePath, glob.GLOB_DEFAULT | glob.GLOB_NOCHECK, function (err, matches) {
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
                    filePromise.resolve();
                }
            });
        }(paths[i]));
    }

    bPromise.all(filePromises).then(function () {
        promise.resolve();
    }, function (err) {
        promise.reject(err);
    });
}