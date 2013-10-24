// Task

var Task = Backbone.Model.extend({
	defaults: {
		text: "",
		excludedContexts: [], // context names
	},
}, {
	timeScales: [
		{ id: "today",      label: "Today", range: 24 * 60 * 60 * 1000 },
		{ id: "this-week",  label: "This Week", range: 7 * 24 * 60 * 60 * 1000 },
	],
});

var TaskCollection = Backbone.Collection.extend({
	model: Task,

	constructor: function (store) {
		store.applyToCollection(this);
		Backbone.Collection.apply(this, Array.prototype.slice.call(arguments, 1));
	},
});


// Comparison

var Comparison = Backbone.Model.extend({
	defaults: {
		greaterTaskId: "",
		lesserTaskId: "",
		invalidated: false,
	},

	comparator: "createdAt",

	initialize: function () {
		if (!this.has("createdAt")) {
			this.set("createdAt", new Date);
		}
	},

	invalidate: function () {
		this.save({
			invalidated: true,
			invalidatedAt: new Date,
		});
	},
});

var ComparisonCollection = Backbone.Collection.extend({
	model: Comparison,

	constructor: function (store) {
		store.applyToCollection(this);
		Backbone.Collection.apply(this, Array.prototype.slice.call(arguments, 1));
	},
});


// TaskForest

// TODO: use transitivity when a task is deleted
function TaskForest(tasks, comparisons) {
	this.tasks = tasks;
	this.comparisons = comparisons;

	this._recalculate();

	this.taskComparator = _.bind(this.taskComparator, this);

	this.listenTo(tasks, "add", this._addTask);
	this.listenTo(tasks, "add", this._triggerRecalculate);
	this.listenTo(tasks, "remove reset", this._recalculate);
	this.listenTo(tasks, "change:waitingFor", this._recalculate); // TODO: this could be more efficient

	this.listenTo(comparisons, "add", this._addComparison);
	this.listenTo(comparisons, "add", this._triggerRecalculate);
	this.listenTo(comparisons, "remove reset sort change:invalidated", this._recalculate);
}
_.extend(TaskForest.prototype, Backbone.Events, {
	taskComparator: function (task1, task2) {
		var level1 = this._level(task1.cid);
		var level2 = this._level(task2.cid);

		if (level1 === undefined && level2 === undefined) {
			return 0;
		} else if (level1 === undefined) {
			return 1;
		} else if (level2 === undefined) {
			return -1;
		}
		return level1 - level2;
	},

	potentialNextTasks: function () {
		var nexts = this.tasks.map(function (t) { return t.cid });

		this._walk(null, function (task, level) {
			if (task.has("waitingFor")) {
				removeFromSet(nexts, task.cid);
				return level;
			} else {
				if (level > 0) {
					removeFromSet(nexts, task.cid);
				}
				return level + 1;
			}
		}, 0);

		return _.map(nexts, function (cid) { return this.tasks.get(cid) }, this);
	},

	_triggerRecalculate: function () {
		this.trigger("recalculate");
	},

	_addTask: function (task) {
		this._children[task.cid] = [];
		this._parents[task.cid] = [];
		this._roots.push(task.cid);
	},

	_addComparison: function (comparison) {
		if (comparison.get("invalidated")) {
			return;
		}

		var greaterTask = this.tasks.get(comparison.get("greaterTaskId"));
		var lesserTask = this.tasks.get(comparison.get("lesserTaskId"));
		if (!greaterTask || !lesserTask) {
			return;
		}

		if (_.contains(this._allParents(greaterTask.cid), lesserTask.cid)) {
			console.log("ignoring comparison that would create a cycle", greaterTask.get("text"), ">", lesserTask.get("text"));
			return;
		}

		this._addChild(greaterTask.cid, lesserTask.cid);
		removeFromSet(this._roots, lesserTask.cid);
	},

	_recalculate: function () {
		this._children = {}; // cid -> [cid, ...]
		this._parents = {}; // cid -> [cid, ...]
		this._roots = []; // [cid, ...]

		this.tasks.each(this._addTask, this);
		this.comparisons.each(this._addComparison, this);

		this.trigger("recalculate");
	},

	_moveChild: function (cid, newParentCid) {
		// remove from all the old parents
		_.each(this._parents[cid], function (parentCid) {
			removeFromSet(this._children[parentCid], cid);
		}, this);

		// clear the parents array
		this._parents[cid] = [];

		// add to new parent
		this._addChild(newParentCid, cid);
	},

	_addChild: function (parentCid, childCid) {
		addToSet(this._children[parentCid], childCid);
		addToSet(this._parents[childCid], parentCid);
	},

	_allParents: function (cid) {
		var self = this, all = [];
		walk(cid);
		return all;

		function walk(currentCid) {
			var parentCids = self._parents[currentCid] || [];
			all.push.apply(all, parentCids);
			_.each(parentCids, walk);
		}
	},

	// find the longest path to the root & return that depth
	_level: function (cid) {
		var self = this;
		return getLevel(cid);

		function getLevel(currentCid) {
			var parentCids = self._parents[currentCid] || [];
			if (parentCids.length === 0) {
				return 0;
			}

			return _.max(parentCids.map(getLevel)) + 1;
		}
	},

	_walk: function (task, iter, data, filter) {
		// get the list of children in case it's mutated
		var children;
		if (task) {
			if (!this._children[task.cid]) {
				console.error("during walk, children of task weren't found", task);
				return;
			}
			children = this._children[task.cid];
		} else {
			children = this._roots;
		}

		// invoke the iterator
		if (task && (!filter || filter(task))) {
			data = iter(task, data);
		}

		// recurse
		_.each(children, function (childCid) {
			var child = this.tasks.get(childCid);
			if (child) {
				this._walk(child, iter, data, filter);
			} else {
				console.error("during walk, task wasn't found", childCid);
			}
		}, this);
	},
});


// Pile

var Pile = Backbone.Model.extend({
	defaults: {
		name: "",
	},

	initialize: function () {
		if (this.has("id")) {
			this._makeCollections();
		} else {
			this.listenToOnce(this, "change:id", this._makeCollections);
		}
	},

	_makeCollections: function () {
		this.tasks = new TaskCollection(this.collection.store.makeStore("piles-" + this.id + "-tasks"));
		this.comparisons = new ComparisonCollection(this.collection.store.makeStore("piles-" + this.id + "-comparisons"));
		this.taskForest = new TaskForest(this.tasks, this.comparisons);

		this.tasks.comparator = this.taskForest.taskComparator;
		this.listenTo(this.taskForest, "recalculate", this._recalculated);

		this.tasks.pile = this.comparisons.pile = this;
	},

	_recalculated: function () {
		this.tasks.sort();
	},

	toJSON: function () {
		var o = Backbone.Model.prototype.toJSON.apply(this, arguments);
		o.tasks = this.tasks.toJSON();
		o.comparisons = this.comparisons.toJSON();
		return o;
	},
});

var PileCollection = Backbone.Collection.extend({
	model: Pile,

	constructor: function (store) {
		store.applyToCollection(this);
		Backbone.Collection.apply(this, Array.prototype.slice.call(arguments, 1));
	},

	// per Backbone.js convention, that's an object, not a string
	clonePileFromJSON: function (json) {
		var d = new $.Deferred;

		var taskJSONs = json.tasks, comparisonJSONs = json.comparisons;
		var oldIds = _.pluck(taskJSONs, "id");
		delete json.id;
		delete json.tasks;
		delete json.comparisons;

		var pile = this.add(json);
		pile.save().then(saveTasks, bail("Could not save pile"));

		function saveTasks() {
			pile.tasks.reset(_.map(taskJSONs, function (taskJSON) {
				delete taskJSON.id;
				return taskJSON;
			}));
			$.when.apply($, pile.tasks.invoke("save"))
				.then(saveComparisons, bail("failed to save all the tasks"));
		}

		function saveComparisons() {
			var newIds = pile.tasks.pluck("id");
			var idMap = _.object(oldIds, newIds);

			pile.comparisons.reset(_.reduce(comparisonJSONs, function (jsons, comparisonJSON) {
				delete comparisonJSON.id;
				comparisonJSON.lesserTaskId = idMap[comparisonJSON.lesserTaskId];
				comparisonJSON.greaterTaskId = idMap[comparisonJSON.greaterTaskId];
				if (comparisonJSON.lesserTaskId && comparisonJSON.greaterTaskId) {
					jsons.push(comparisonJSON);
				}
				return jsons;
			}, []));
			console.log("[import] pruned " + (comparisonJSONs.length - pile.comparisons.length) + " of " + comparisonJSONs.length + " comparisons");
			$.when.apply($, pile.comparisons.invoke("save"))
				.then(done, bail("failed to save all the comparisons"));
		}

		function done() {
			d.resolve(pile);
		}

		function bail(reason) {
			return function () {
				d.reject(reason);
			};
		}

		return d.promise();
	},
});
