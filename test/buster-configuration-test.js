var buster = require("buster");
var assert = buster.assert;
var refute = buster.refute;
var busterConfiguration = require("../lib/buster-configuration");

buster.testCase("buster-configuration", {
    setUp: function () {
        this.c = busterConfiguration.create();
        this.rootPath = __dirname;
    },

    "should add groups": function () {
        this.c.addGroup("My group", {}, this.rootPath);

        assert.equals(this.c.groups.length, 1);
        var group = this.c.groups[0];
        assert.equals(group.name, "My group");
    },

    "should load groups from config file": function () {
        assert.isTrue(this.c.loadGroupsFromConfigFile(__dirname + "/buster"));
        assert.equals(this.c.groups.length, 1);
    },

    "should handle none existing file": function () {
        assert.isFalse(this.c.loadGroupsFromConfigFile(__dirname + "/does-not-exist"));
        assert.equals(this.c.groups.length, 0);
    },

    "should filter groups on environment": function () {
        this.c.addGroup("My group 1", {environment: "node"}, this.rootPath);
        this.c.addGroup("My group 2", {environment: "node"}, this.rootPath);
        this.c.addGroup("My group 3", {environment: "browser"}, this.rootPath);

        this.c.filterEnv("node");
        assert.equals(this.c.groups.length, 2);
    },

    "should handle none-string for env filtering": function () {
        this.c.addGroup("My group 1", {environment: "node"}, this.rootPath);
        this.c.addGroup("My group 2", {environment: "browser"}, this.rootPath);

        this.c.filterEnv(null);
        this.c.filterEnv({});
        this.c.filterEnv(1234);
        this.c.filterEnv([]);
        assert.equals(this.c.groups.length, 2);
    },

    "should filter groups on name": function () {
        this.c.addGroup("The test", {}, this.rootPath);
        this.c.addGroup("test the foo", {}, this.rootPath);
        this.c.addGroup("foo the bar", {}, this.rootPath);

        this.c.filterGroup(/test/);
        assert.equals(this.c.groups.length, 2);
        assert.match(this.c.groups, [{name: "The test"}, {name: "test the foo"}]);
    },

    "should resolve all groups": function (done) {
        this.c.addGroup("My group 1", {load: ["fixtures/foo.js"]}, this.rootPath);
        this.c.addGroup("My group 2", {load: ["fixtures/bar.js"]}, this.rootPath);

        this.c.resolveGroups(function (err) {
            refute.defined(err);
            // If it is resolved, it has a resourceSet.
            assert("resourceSet" in this.c.groups[0]);
            assert("resourceSet" in this.c.groups[1]);
            done();
        }.bind(this));
    },

    "should resolve all groups with error": function (done) {
        this.c.addGroup("My group 1", {load: ["fixtures/foo.js"]}, this.rootPath);
        this.c.addGroup("My group 2", {load: ["fixtures/does-not-exist.js"]}, this.rootPath);

        this.c.resolveGroups(function (err) {
            assert.defined(err);
            assert.match(err, "ENOENT");
            done();
        }.bind(this));
    },

    "should resolve group with custom root path": function (done) {
        this.c.addGroup("My group 1", {
            load: ["test/fixtures/foo.js"],
            rootPath: __dirname + "/.."
        });

        this.c.resolveGroups(function (err) {
            refute.defined(err);
            assert("resourceSet" in this.c.groups[0]);
            done();
        }.bind(this));
    }
});