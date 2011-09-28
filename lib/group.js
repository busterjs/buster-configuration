var bPromise = require("buster-promise");
var resourceSet = require("buster-resources/lib/resource-set");
var Path = require("path");
var glob = require("glob");

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

        var globPromises = [];
        for (var i = 0, ii = this.groupData.resources.length; i < ii; i++) {
            (function (self, globPromise) {
                globPromises.push(globPromise);
                var absolutePath = resolvePath.call(self, self.groupData.resources[i]);
                glob(absolutePath, function (err, matches) {
                    if (err) {
                        globPromise.reject(err);
                    } else {
                        addResources.call(self, matches);
                        globPromise.resolve();
                    }
                });
            }(this, bPromise.create()));
        }
        bPromise.all(globPromises).then(function () {
            promise.resolve();
        }, function (err) {
            promise.reject(err); // TODO: test that err is undefined etc
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

function addResources(paths) {
    for (var i = 0, ii = paths.length; i < ii; i++) {
        var path = paths[i];
        this.resourceSet.addFile(path, shortenedPath.call(this, path));
    }
}