var buster = require("buster");
var assert = buster.assert;
var refute = buster.refute;
var rsb = require("../lib/resource-set-builder");
var resourceSet = require("buster-resources/lib/resource-set");

buster.testCase("Resource set builder", {
    setUp: function () {
        this.rs = resourceSet.create();
        this.stub(this.rs, "addFileWithEtag");
    },

    "creates resource from file": function () {
        var root = __dirname + "/fixtures";
        var builder = rsb.create(root, this.rs);
        builder.addResource({ file: "bar.js" });

        assert.calledOnceWith(this.rs.addFileWithEtag, root + "/bar.js");
    },

    "creates file resource with headers": function () {
        var root = __dirname + "/fixtures";
        var builder = rsb.create(root, this.rs);
        builder.addResource({ file: "bar.js", headers: { "X-Ha": "Ha" } });

        assert.calledOnceWith(this.rs.addFileWithEtag, root + "/bar.js", {
            headers: { "X-Ha": "Ha" }
        });
    },

    "creates file resource with custom path": function () {
        var root = __dirname + "/fixtures";
        var builder = rsb.create(root, this.rs);
        builder.addResource({ file: "bar.js", path: "/baaaaar" });

        assert.calledOnceWith(this.rs.addFileWithEtag, root + "/bar.js", {
            path: "/baaaaar"
        });
    }
});
