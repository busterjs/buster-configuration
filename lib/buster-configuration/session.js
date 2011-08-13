var fs = require("fs");
var url = require("url");
var crypto = require("crypto");
var buster = require("buster-core");
buster.promise = require("buster-promise");

var properties = ["content", "backend", "headers", "pending",
                  "combine", "etag", "cacheable", "minify"];

function sha256sum(str) {
    var hash = crypto.createHash("sha256");
    hash.update(str);

    return hash.digest("hex");
}

function cleanResource(resource) {
    var res = {};

    properties.forEach(function (prop) {
        if (prop in resource) {
            res[prop] = resource[prop];
        }
    });

    if (!res.etag && res.content) {
        res.etag = sha256sum(res.content);
    }

    return res;
}

function normalizedPath(path) {
    return path.replace(/^\/?/, "/");
}

function verifyResourcesToCombine(cfg, resources) {
    for (var i = 0, l = resources.length; i < l; ++i) {
        if (!cfg.getResource(resources[i])) {
            throw new Error("Cannot combine non-existent resource " + resources[i]);
        }
    }
}

module.exports = {
    create: function () {
        return Object.create(this);
    },

    addResource: function (path, resource) {
        if (resource && !resource.pending && this.preProcess(path, resource)) {
            return;
        }

        if (!resource) {
            throw new TypeError("Resource object is null or undefined");
        }

        if (resource.content == null && !resource.backend &&
            !resource.combine && !resource.etag) {
            throw new TypeError("Received no resource etag, content, backend or combine");
        }

        if ("content" in resource && resource.backend ||
            "content" in resource && resource.combine ||
            resource.backend && resource.combine) {
            throw new TypeError("Can only have one of content, combine and backend");
        }

        if (resource.backend && !url.parse(resource.backend).host) {
            throw new TypeError("Proxy resource backend is invalid");
        }

        if (/^\./.test(path)) {
            throw new TypeError("Path can not be relative");
        }

        if (resource.combine) {
            verifyResourcesToCombine(this, resource.combine);
        }

        this.resources = this.resources || {};
        this.resources[normalizedPath(path)] = cleanResource(resource);
    },

    preProcess: function (path, resource) {
        if (!this.preProcessors) {
            return;
        }

        var self = this, promise = buster.promise.create(), result;

        for (var i = 0, l = this.preProcessors.length; i < l; ++i) {
            result = this.preProcessors[i](path, resource);

            if (result) {
                this.pending.push(promise);

                result.then(function (p, r) {
                    var res = self.getResource(path);

                    if (res && res.pending) {
                        delete self.resources[normalizedPath(path)];
                    }

                    self.addResource(p, r);
                    promise.resolve();
                });

                return true;
            }
        }
    },

    getResource: function (path) {
        return this.resources && this.resources[normalizedPath(path)];
    },

    load: function (path, resource) {
        if (resource) {
            this.addResource(path, resource);
        }

        if (!this.getResource(path)) {
            throw new TypeError("Cannot load non-existent resource " + path);
        }

        this.loadResources = this.loadResources || [];
        this.loadResources.push(normalizedPath(path));
    },

    addFileAsResource: function (file, meta) {
        var promise = buster.promise.create();
        this.pending.push(promise);
        var path = meta && meta.path || file;
        this.addResource(path, { content: "", pending: true });

        fs.readFile(file, "utf-8", (function (err, data) {
            if (err) {
                if (this.getResource(path).pending) {
                    delete this.resources[normalizedPath(path)];
                }

                promise.reject(err);
            } else {
                this.addResource(path, buster.extend({}, meta, { content: data }));
                promise.resolve(data);
            }
        }.bind(this)));

        return promise;
    },

    configure: function () {
        var promise = buster.promise.create();
        var self = this;

        function configComplete() {
            var num = self.pending.length;

            buster.promise.all(self.pending).then(function () {
                if (num == self.pending.length) {
                    promise.resolve({
                        resources: self.resources || {},
                        load: self.loadResources || []
                    });
                } else {
                    configComplete();
                }
            }, function (err) {
                promise.reject(err);
            });
        }

        configComplete();
        return promise;
    },

    get pending () {
        this._pending = this._pending || [];
        return this._pending;
    }
};
