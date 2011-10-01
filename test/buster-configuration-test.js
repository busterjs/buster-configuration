var buster = require("buster");
var assert = buster.assert;
var busterConfiguration = require("../lib/buster-configuration");

buster.testCase("buster-configuration", {
    setUp: function () {
        this.c = busterConfiguration.create();
    },

    "should add groups": function () {
        this.c.addGroup("My group", {});

        assert.equals(this.c.groups.length, 1);
        var group = this.c.groups[0];
        assert.equals(group.name, "My group");
    }
});