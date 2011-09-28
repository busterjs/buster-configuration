var bPromise = require("buster-promise");
var resourceSet = require("buster-resources/lib/resource-set");
var Path = require("path");

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
        for (var i = 0, ii = this.groupData.resources.length; i < ii; i++) {
            addResource.call(this, this.groupData.resources[i]);
        }
        promise.resolve();
        return promise;
    }
};

function resolvePath(path) {
    return Path.resolve(this.rootPath, path);
}

function shortenedPath(path) {
    return path.slice(this.rootPath.length);
}

function addResource(path) {
    var absolutePath = resolvePath.call(this, path);
    this.resourceSet.addFile(absolutePath, shortenedPath.call(this, absolutePath));
}