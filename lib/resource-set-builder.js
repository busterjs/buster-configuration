var B = require("buster-core");
var bPromise = require("buster-promise");
var glob = require("buster-glob").glob;
var resourceSet = require("buster-resources/lib/resource-set");
var addUnique = require("./util").addUnique;

var Path = require("path");

module.exports = {
    create: function (rootPath) {
        return B.extend(B.create(this), {
            resourceSet: resourceSet.create(),
            rootPath: rootPath
        });
    },

    addResources: function (resources) {
        return bPromise.all(resources.map(B.bind(this, "addResource")));
    },

    addResource: function (resource) {
        if (typeof resource == "string") {
            return this.addStringResource(resource);
        }

        return bPromise.thenable(this.resourceSet.addResource(resource.path, resource));
    },

    addStringResource: function (path) {
        var promise = bPromise.create();

        this.resolvePaths([path], function (e, paths) {
            if (e || paths.length == 0) {
                return promise.reject(e || { message: path + " matched no files" });
            }

            this.addFileResources(paths).then(B.bind(promise, "resolve"),
                                              B.bind(promise, "reject"));
        });

        return promise;
    },

    addFileResources: function (paths) {
        return bPromise.all((paths || []).map(B.bind(this, "addFileResource")));
    },

    addFileResource: function (resource) {
        return this.resourceSet.addFileWithEtag(this.absolutePath(resource), {
            path: resource
        });
    },

    addAllLoadEntries: function (group) {
        var promise = bPromise.create();

        buster.series([
            B.bind(this, "addLoadEntries", group, "libs"),
            B.bind(this, "addLoadEntries", group, "sources"),
            B.bind(this, "addLoadEntries", group, "testLibs"),
            B.bind(this, "addLoadEntries", group, "tests")
        ], function (err, results) {
            if (err) return promise.reject(err);
            promise.resolve(results);
        });

        return promise;
    },

    addLoadEntries: function (group, type, done) {
        this.resolvePaths(group[type], function (err, matches) {
            if (err || (group[type].length > 0 && matches.length == 0)) {
                var paths = group[type].join(", ");
                return done(err || { message: paths + " matched no files" });
            }

            group.emit("load:" + type, matches, this.rootPath);

            this.addMissingLoadResources(matches).then(function () {
                this.resourceSet.appendToLoad(matches.map(resourceSet.normalizePath));
                done(null, matches);
            }.bind(this), function (err) { done(err); });
        });
    },

    addMissingLoadResources: function (paths) {
        return this.addFileResources(paths.filter(function (path) {
            return !this.resourceSet.resources[path];
        }.bind(this)));
    },

    resolvePaths: function (paths, callback) {
        glob(paths.map(B.bind(this, "absolutePath")), function (err, matches) {
            err = err || this.outsideRootError(matches);
            if (err) return callback(err);
            matches = addUnique(matches, this.existingResources(paths))
            callback.call(this, err, matches.map(B.bind(this, "relativePath")));
        }.bind(this));
    },

    existingResources: function (paths) {
        return paths.filter(function (path) {
            return this.resourceSet.resources[path];
        }.bind(this));
    },

    relativePath: function (path) {
        return path.replace(this.rootPath.replace(/\/?$/, "/"), "");
    },

    absolutePath: function (path) {
        return Path.resolve(this.rootPath, path);
    },

    outsideRoot: function (path) {
        return path.indexOf(this.rootPath) < 0;
    },

    outsideRootError: function (paths) {
        var offendingPaths = paths.filter(B.bind(this, "outsideRoot"));
        if (offendingPaths.length == 0) return;
        var plural = offendingPaths.length > 1 ? "Some paths are " : "A path is ";

        return plural + "outside the project root. Set rootPath to the desired root\n" +
            "to refer to paths outside the configuration file directory.\n  " +
            offendingPaths.map(B.partial(Path.relative, this.rootPath)).join("\n  ");
    }
};
