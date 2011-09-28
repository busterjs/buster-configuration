var buster = require("buster");
var assert = buster.assert;
var refute = buster.refute;
var bcGroup = require("../lib/group");

buster.testCase("buster-configuration group", {
    "should create resources with root path": function (done) {
        var group = bcGroup.create({
            resources: [
                "foo.js",
                "bar.js"
            ]
        }, __dirname + "/fixtures");

        group.resolve().then(function () {
            assert("/foo.js" in group.resourceSet.resources);
            assert("/bar.js" in group.resourceSet.resources);
            done();
        });
    },

    "should get file contents as actual content": function (done) {
        var group = bcGroup.create({
            resources: [
                "foo.js"
            ]
        }, __dirname + "/fixtures");

        group.resolve().then(function () {
            group.resourceSet.getResource("/foo.js", function (err, resource) {
                assert.isUndefined(err);
                assert.equals(resource.content, "var thisIsTheFoo = 5;");
                done();
            });
        });
    },

    "should resolve globs": function (done) {
        var group = bcGroup.create({
            resources: [
                "*.js"
            ]
        }, __dirname + "/fixtures");

        group.resolve().then(function () {
            assert("/foo.js" in group.resourceSet.resources);
            assert("/bar.js" in group.resourceSet.resources);

            group.resourceSet.getResource("/foo.js", function (err, resource) {
                assert.isUndefined(err);
                group.resourceSet.getResource("/bar.js", function (err, resource) {
                    assert.isUndefined(err);
                    done();
                });
            });
        });
    },

    "should add resource as object with path": function (done) {
        var group = bcGroup.create({
            resources: [
                {path:"foo.js"}
            ]
        }, __dirname + "/fixtures");

        group.resolve().then(function () {
            assert("/foo.js" in group.resourceSet.resources);
            done();
        });
    },

    "should respect custom headers": function (done) {
        var group = bcGroup.create({
            resources: [
                {path:"foo.js",headers:{"X-Foo":"Bar"}}
            ]
        }, __dirname + "/fixtures");

        group.resolve().then(function () {
            group.resourceSet.getResource("/foo.js", function (err, resource) {
                assert.isUndefined(err);
                assert.match(resource.headers, {"X-Foo": "Bar"});
                done();
            });
        });
    },

    "should set etag": function (done) {
        var group = bcGroup.create({
            resources: [
                "foo.js"
            ]
        }, __dirname + "/fixtures");

        group.resolve().then(function () {
            group.resourceSet.getResource("/foo.js", function (err, resource) {
                assert.isUndefined(err);
                assert("etag" in resource);
                // TODO: Should probably test more here.
                done();
            });
       });
    },

    "should fail for missing file": function (done) {
        var group = bcGroup.create({
            resources: [
                "/does/not/exist.js"
            ]
        }, __dirname + "/fixtures");

        group.resolve().then(function () {
        }, function (err) {
            assert.match(err, "ENOENT");
            assert.match(err, "/does/not/exist.js");
            done();
        });
    },

    "should add backend resource": function (done) {
        var group = bcGroup.create({
            resources: [
                {path:"foo",backend:"http://10.0.0.1/"}
            ]
        }, __dirname + "/fixtures");

        group.resolve().then(function () {
            assert("/foo" in group.resourceSet.resources);
            var resource = group.resourceSet.resources["/foo"];
            assert.equals(resource.backend, "http://10.0.0.1/");
            done();
        });
    },

    "should add combined resources": function (done) {
        var group = bcGroup.create({
            resources: [
                "foo.js",
                "bar.js",
                {path: "/bundle.js", combine: ["foo.js", "bar.js"]}
            ]
        }, __dirname + "/fixtures");

        group.resolve().then(function () {
            assert("/bundle.js" in group.resourceSet.resources);
            var resource = group.resourceSet.resources["/bundle.js"];
            assert.equals(resource.combine, ["/foo.js", "/bar.js"]);
            done();
        });
    },

    "should add combined resources with glob pattern": function (done) {
        var group = bcGroup.create({
            resources: [
                "foo.js",
                "bar.js",
                {path: "/bundle.js", combine: ["*.js"]}
            ]
        }, __dirname + "/fixtures");

        group.resolve().then(function () {
            assert(true);
            var resource = group.resourceSet.resources["/bundle.js"];
            assert.equals(resource.combine.sort(), ["/foo.js", "/bar.js"].sort());
            done();
        });
    }
});