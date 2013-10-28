var PileView = Backbone.View.extend({
	html: '<div class="navigation" />' +
	      '<div class="well selection glow" />' +
	      '<h3 class="next-task">Here is what you should do now:</h3>' +
	      '  <div class="task-list next"></div>' +
	      '<h3 class="tasks"><span>Here are your tasks in very rough order:</span> <button type="button" class="btn btn-xs btn-default reprioritize-top" data-toggle="tooltip" title="Use this periodically. Resets the win/loss record for the 10 tasks closest to becoming overdue.">Reprioritize Due Tasks</button></h3>' +
	      '  <div class="task-list rest"></div>' +
	      '<h3 class="wf-tasks">Here are tasks that you\'ve put off:</h3>' +
	      '  <div class="task-list wf"></div>' +
	      '<div class="jumbotron introduction">' +
	      '<div class="container">' +
	      '  <h2>What is Todournament?</h2>' +
	      '  <p>Todournament is a to-do list that <strong>helps you prioritize</strong>. It\'s designed to <strong>minimize bookkeeping</strong> while keeping your list ordered. Add to-do items below to begin.</p>' +
	      '</div>' +
	      '</div>' +
	      '<h3 class="add">Add tasks:</h3>' +
	      '  <div class="new-task"></div>' +
	      '<div class="footer">Created by <a href="http://alltom.com/">Tom Lieber</a>. Submit patches and bug reports on <a href="https://github.com/alltom/todournament">GitHub</a>.</div>',

	events: {
		"click .reprioritize-top" : "reprioritizeTopClicked",
	},

	initialize: function () {
		this.pile = this.model;

		this.$el.html(this.html);
		this.$selection = this.$(".selection");
		this.$newTask = this.$(".new-task");
		this.$reprioritizeTop = this.$(".reprioritize-top");

		this.$nextHeader = this.$("h3.next-task");
		this.$next = this.$(".next");
		this.$restHeader = this.$("h3.tasks");
		this.$restHeaderCaption = this.$("h3.tasks span");
		this.$rest = this.$(".rest");
		this.$wfHeader = this.$("h3.wf-tasks");
		this.$wf = this.$(".wf");

		this.$addHeader = this.$("h3.add");

		this.$reprioritizeTop.tooltip({ placement: "right" });

		this.navBarView = new NavBarView({ el: this.$(".navigation"), model: this.pile });

		this.selectionView = new SelectionView({ el: this.$selection[0] });
		this.selectionView.render();
		this.listenTo(this.selectionView, "compared", this.tasksCompared);
		this.listenTo(this.selectionView, "shuffle", this.render);

		this.taskListView = new TaskListView({
			el: this.$rest,
			model: this.pile,
			taskFilter: _.bind(function (t) { return !t.has("waitingFor") && !this.isNextTask(t) }, this),
		});
		this.taskListView.render();

		this.wfTaskListView = new TaskListView({
			el: this.$wf,
			model: this.pile,
			taskFilter: function (t) { return t.has("waitingFor") },
			comparator: function (t) { return t.id },
		});
		this.wfTaskListView.render();

		this.newTasksView = new NewTasksView({ el: this.$newTask, model: this.pile });
		this.newTasksView.on("add-many", this.addNewTasks, this);
		this.newTasksView.render();

		this.listenTo(this.pile.tasks, "add remove reset", this.render);
		this.listenTo(this.pile.tasks, "change:waitingFor", this.render);
		this.listenTo(this.pile.comparisons, "add remove reset change", this.render);
	},

	render: function () {
		var nexts = this.pile.taskForest.potentialNextTasks();
		if (nexts.length > 1) {
			var pair = _.sortBy(nexts, Math.random).slice(0, 2);
			var activeTasks = this.pile.tasks.filter(function (t) { return !t.has("waitingFor") });
			var progress = 1 - ((nexts.length - 1) / activeTasks.length);
			this.selectionView.prepare(pair[0], pair[1], progress);
			this.selectionView.render();
			this.$selection.show();

			this.$nextHeader.hide();
			this.$next.hide();

			this.$restHeaderCaption.text("Here are your tasks in very rough order:");
		} else if (nexts.length === 1) {
			this.$selection.hide();

			this.$nextHeader.show();
			this.$next.empty().show().append(
				new TaskView({ model: nexts[0], className: "task glow" }).render().el);
			this.$restHeaderCaption.text("Here are the rest of your tasks in very rough order:");
		} else {
			this.$selection.hide();
			this.$nextHeader.hide();
			this.$next.hide();
		}

		this.taskListView.render();
		this.wfTaskListView.render();

		this.$restHeader.toggle(this.taskListView.taskCount() > 0);
		this.$wfHeader.toggle(this.wfTaskListView.taskCount() > 0);
		this.$addHeader.text(this.pile.tasks.length > 0 ? "Add more tasks:" : "Add tasks:");

		this.$el.toggleClass("non-empty", this.pile.tasks.length > 0);

		return this;
	},

	addNewTasks: function (texts, timeScaleId) {
		_.each(texts, function (text) {
			var task = this.pile.tasks.create({
				text: text,
				timeScaleId: timeScaleId,
			});
		}, this);
		$(document.body).scrollTop(0);
	},

	tasksCompared: function (greaterTask, lesserTask) {
		this.pile.comparisons.create({
			greaterTaskId: greaterTask.id,
			lesserTaskId: lesserTask.id,
		});
	},

	reprioritizeTopClicked: function () {
		var self = this;

		var comparisons = this.pile.comparisons.where({invalidated: false});
		var sortedComparisons = _.sortBy(comparisons, function (c) { return -dueness(c) }, this);
		var closestToDue = sortedComparisons.slice(0, 10);
		_.invoke(closestToDue, "invalidate");

		function dueness(comparison) {
			var age = (new Date) - Date.parse(comparison.get("createdAt"));
			var range = 4 * 7 * 24 * 60 * 60 * 1000; // default range: 1 month

			var greaterTask = self.pile.tasks.get(comparison.get("greaterTaskId"));
			if (greaterTask) {
				var timeScaleId = greaterTask.get("timeScaleId");
				var timeScale = _.filter(Task.timeScales, function (scale) { return scale.id === timeScaleId })[0];
				if (timeScale) {
					range = timeScale.range;
				}
			}

			return age / (range / 2); // divided by 2 so you'll see a task twice in the period, or so
		}
	},

	isNextTask: function (task) {
		var nexts = this.pile.taskForest.potentialNextTasks();
		return nexts.length === 1 && nexts[0].cid === task.cid;
	},
});

var NavBarView = Backbone.View.extend({
	html: '<nav class="navbar navbar-default" role="navigation">' +
	      '<div class="navbar-header">' +
	      '  <button type="button" class="navbar-toggle" data-toggle="collapse" data-target=".navbar-ex1-collapse">' +
	      '    <span class="sr-only">Toggle navigation</span>' +
	      '    <span class="icon-bar"></span>' +
	      '    <span class="icon-bar"></span>' +
	      '    <span class="icon-bar"></span>' +
	      '  </button>' +
	      '  <a class="navbar-brand" href="#"><span>Todo</span>urnament</a>' +
	      '</div>' +
	      '<div class="collapse navbar-collapse navbar-ex1-collapse">' +
	      '  <ul class="nav navbar-nav">' +
	      // '  <form class="navbar-form navbar-left">' +
	      // '    <div class="form-group">' +
	      // '      <select class="form-control"><option>Foo bar</option></select>' +
	      // '    </div>' +
	      // '  </form>' +
	      // '    <li class="dropdown">' +
	      // '      <a href="#" class="dropdown-toggle" data-toggle="dropdown">Utility <b class="caret"></b></a>' +
	      // '      <ul class="dropdown-menu">' +
	      // '        <li><a href="#">Import</a></li>' +
	      // '        <li><a href="#">Export</a></li>' +
	      // '      </ul>' +
	      // '    </li>' +
	      '    <li><button type="button" class="btn btn-default navbar-btn export">Import/Export&#8230;</button></li>' +
	      '    <li><button type="button" class="btn btn-default navbar-btn purge">Purge&#8230;</button></li>' +
	      '  </ul>' +
	      '  <p class="navbar-text description"><span class="count"></span>, saved in <abbr data-toggle="tooltip" title="Saved on your computer (not our server), so don\'t clear your cookies! Dropbox support coming soon.">Local Storage</abbr></p>' +
	      '</div>' +
	      '</nav>',

	events: {
		"click .export" : "importExportClicked",
		"click .purge" : "purgeClicked",
	},

	initialize: function () {
		this.pile = this.model;
		this.$el.html(this.html);

		this.$taskCount = this.$(".description .count");
		this.listenTo(this.pile.tasks, "add remove reset", this.taskCountChanged);
		this.taskCountChanged();

		this.$(".description abbr").tooltip({ placement: "bottom" });
	},

	taskCountChanged: function () {
		this.$taskCount.text(this.pile.tasks.length + " task" + (this.pile.tasks.length === 1 ? "" : "s"));
	},

	importExportClicked: function () {
		var view = new ImportExportView({ model: this.pile });
		view.$el.modal();
	},

	purgeClicked: function () {
		if (confirm("Purge deleted tasks and comparisons? Do this if things get slow. You can use the \"Import/Export\" button to make a backup in case you ever want them back.")) {
			var toDestroy = this.pile.comparisons.filter(function (comparison) {
				var greaterTask = this.pile.tasks.get(comparison.get("greaterTaskId"));
				var lesserTask = this.pile.tasks.get(comparison.get("lesserTaskId"));
				return !greaterTask || !lesserTask;
			}, this);
			_.invoke(toDestroy, "destroy");
		}
	},
});

var ImportExportView = Backbone.View.extend({
	html: '<div class="modal-dialog">' +
	      '  <div class="modal-content">' +
	      '    <div class="modal-header">' +
	      '      <button type="button" class="close" data-dismiss="modal" aria-hidden="true">&times;</button>' +
	      '      <h4 class="modal-title">Import/Export</h4>' +
	      '    </div>' +
	      '    <div class="modal-body">' +
	      '      <form role="form">' +
	      '        <div class="form-group">' +
	      '          <p>All your tasks and prioritization data is encoded as JSON below:</p>' +
	      '          <textarea class="form-control" rows="8"></textarea>' +
	      '        </div>' +
	      '      </form>' +
	      '    </div>' +
	      '    <div class="modal-footer">' +
	      '      <button type="button" class="btn btn-default import-copy">Import as a Copy&#8230;</button>' +
	      '      <button type="button" class="btn btn-primary" data-dismiss="modal">Close</button>' +
	      '    </div>' +
	      '  </div><!-- /.modal-content -->' +
	      '</div><!-- /.modal-dialog -->',

	className: "modal fade",

	events: {
		"click .import-copy" : "importCopyClicked",
	},

	initialize: function () {
		this.pile = this.model;
		this.$el.html(this.html);

		this.$("textarea").val(JSON.stringify(this.pile.toJSON(), null, "  "));
	},

	importCopyClicked: function () {
		if (confirm("This will create a new to-do list with the encoded data above. You will still be able to access the current data at the current URL. Continue?")) {
			var piles = this.pile.collection;
			var pileJSON = JSON.parse(this.$("textarea").val());
			piles.clonePileFromJSON(pileJSON).then(_.bind(function (pile) {
				this.$el.modal("hide");
				goToPile(pile);
			}, this), function (reason) {
				console.log("failed to clone pile", reason); // TODO: tell the user
			});
		}
	},
});

var SelectionView = Backbone.View.extend({
	html: '<div class="question text-center">Which is it more important to do first?</div>' +
	      '<div class="row text-center button-row">' +
	      '  <div class="left col-md-5"><button type="button" class="btn btn-success">This One!</button></div>' +
	      '  <div class="col-md-2"><button type="button" class="btn btn-xs btn-default shuffle" data-toggle="tooltip" title="Choose another 2 tasks to compare instead.">I can\'t decide!</button></div>' +
	      '  <div class="right col-md-5"><button type="button" class="btn btn-success">This One!</button></div>' +
	      '</div>' +
	      '<div class="row task-row">' +
	      '  <div class="left col-md-6"></div>' +
	      '  <div class="right col-md-6"></div>' +
	      '</div>' +
	      '<div class="progress">' +
	      '  <div class="progress-bar" role="progressbar" aria-valuenow="0" aria-valuemin="0" aria-valuemax="100">' +
	      '    <span class="sr-only">0% Complete</span>' +
	      '  </div>' +
	      '</div>',

	className: "selection",

	events: {
		"click .shuffle" : "shuffleClicked",
		"click .button-row .left button" : "leftClicked",
		"click .button-row .right button" : "rightClicked",
	},

	initialize: function () {
		this.$el.html(this.html);
		this.$left = this.$(".task-row .left");
		this.$right = this.$(".task-row .right");

		this.$("button.shuffle").tooltip({ placement: "bottom" });
	},

	render: function () {
		this.renderOne(this.$left, this.leftTask);
		this.renderOne(this.$right, this.rightTask);
	},

	renderOne: function ($el, task) {
		$el.empty();

		if (task) {
			var view = new TaskView({ model: task, className: "task selection-task" });
			$el.append(view.el);

			// var $restHeader = $('<strong>which you said you\'d do before:</strong>');
			// var $rest = $('<div class="rest" />');
			// for (var i = 0; i < 4; i++) {
			// 	var $item = $('<div class="task" />', {
			// 		text: "Task " + i,
			// 	});
			// 	$rest.append($item);
			// }
			// $el.append($task, $restHeader, $rest);
		}
	},

	prepare: function (leftTask, rightTask, progress) {
		this.leftTask = leftTask;
		this.rightTask = rightTask;
		this.setProgress(progress);
	},

	setProgress: function (percent) {
		var outOf100 = percent * 100;
		this.$(".progress-bar")
			.prop("aria-valuenow", Math.floor(outOf100))
			.css("width", outOf100 + "%");
		this.$(".progress-bar span").text(outOf100 + "% Complete");
	},

	shuffleClicked: function () {
		this.trigger("shuffle");
	},

	leftClicked: function (e) {
		this.clicked(e, this.leftTask, this.rightTask);
	},

	rightClicked: function (e) {
		this.clicked(e, this.rightTask, this.leftTask);
	},

	clicked: function (e, greaterTask, lesserTask) {
		this.trigger("compared", greaterTask, lesserTask);
	},
});

var TaskListView = Backbone.View.extend({
	constructor: function (options) {
		this.taskFilter = (options || {}).taskFilter || function () { return true };
		if (options.comparator) this.comparator = options.comparator;
		Backbone.View.apply(this, arguments);
	},

	initialize: function () {
		this.pile = this.model;
		this.tasks = this.pile.tasks;
		this.listenTo(this.tasks, "add", this.taskAdded);
		this.listenTo(this.tasks, "remove", this.taskRemoved);
		this.listenTo(this.tasks, "reset", this._syncViews);
		this.listenTo(this.tasks, "sort", this._syncViews);
		this.listenTo(this.tasks, "change:waitingFor", this._syncViews); // TODO: this one could be done more efficiently
		this.listenTo(this.pile.taskForest, "recalculate", this._syncViews);

		this.taskViews = [];

		this._syncViews();
	},

	taskCount: function () {
		return this.taskViews.length;
	},

	taskAdded: function () {
		var task = arguments[0];
		if (!this.taskFilter(task)) return;

		var options = arguments[2];
		var view = new TaskView({ model: task });
		this.taskViews.push(view);
		this.$el.append(view.render().el);
	},

	taskRemoved: function () {
		var task = arguments[0];
		var options = arguments[2];

		this.taskViews = _.reduce(this.taskViews, function (views, view) {
			if (view.task.cid === task.cid) {
				view.$el.detach();
			} else {
				views.push(view);
			}
			return views;
		}, []);
	},

	_syncViews: function () {
		var viewsByCid = _.indexBy(this.taskViews, function (view) {
			view.$el.detach();
			return view.task.cid;
		});

		var tasks = this.tasks.filter(this.taskFilter);
		if (this.comparator) {
			tasks = _.sortBy(tasks, this.comparator);
		}

		this.taskViews = tasks.map(function (task) {
			if (viewsByCid[task.cid]) {
				return viewsByCid[task.cid];
			} else {
				return new TaskView({ model: task });
			}
		});

		_.each(this.taskViews, function (view) {
			this.$el.append(view.render().el);
		}, this);
	},
});

var TaskView = Backbone.View.extend({
	html: '<div class="tools">' +
	      '<select></select>' +
	      '<button type="button" class="btn btn-xs btn-default edit">Edit&#8230;</button>' +
	      '<button type="button" class="btn btn-xs btn-default reprioritize">Reprioritize</button>' +
	      '<button type="button" class="btn btn-xs btn-warning put-off">Put Off&#8230;</button>' +
	      '<button type="button" class="btn btn-xs btn-success ready">Ready!</button>' +
	      '<button type="button" class="btn btn-xs btn-danger delete">Delete</button>' +
	      '</div> ' +
	      '<span class="text"></span> ' +
	      '<span class="wf"></span>',

	className: "task",

	events: {
		"click button.edit" : "editClicked",
		"click button.reprioritize" : "reprioritizeClicked",
		"click button.put-off" : "putOffClicked",
		"click button.ready" : "readyClicked",
		"click button.done" : "doneClicked",
		"click button.delete" : "deleteClicked",
		"change select" : "timeScaleChanged",
	},

	initialize: function () {
		this.task = this.model;

		this.$el.html(this.html);
		this.$timeScaleSelect = this.$("select");
		this.$text = this.$("span.text");
		this.$wf = this.$("span.wf");

		this.$timeScaleSelect.append("<option />");
		_.each(Task.timeScales, function (scale) {
			var $option = $("<option />", {
				value: scale.id,
				text: scale.label,
			});
			this.$timeScaleSelect.append($option);
		}, this);

		this.listenTo(this.task, "change:text", this.textUpdated);
		this.listenTo(this.task, "change:timeScaleId", this.textUpdated);

		this.timeScaleUpdated();
		this.textUpdated();
		this.wfUpdated();
	},

	timeScaleUpdated: function () {
		var $options = this.$timeScaleSelect.children("option");
		$options.prop("selected", false);

		if (this.task.has("timeScaleId")) {
			$options.filter("[value=" + this.task.get("timeScaleId") + "]")
			        .prop("selected", true);
		}
	},

	textUpdated: function () {
		this.$text.text(this.task.get("text")).linkify();
	},

	wfUpdated: function () {
		if (this.task.has("waitingFor")) {
			this.$wf.show().text(this.task.get("waitingFor")).linkify();
		} else {
			this.$wf.hide().empty();
		}
	},

	timeScaleChanged: function () {
		this.task.save({ timeScaleId: this.$timeScaleSelect.val() });
	},

	editClicked: function () {
		var newText = prompt("", this.task.get("text"));
		if (newText !== null) {
			this.task.save({ text: newText });
		}
	},

	reprioritizeClicked: function () {
		var comparisons = [].concat(
			this.model.collection.pile.comparisons.where({ lesserTaskId: this.task.id }),
			this.model.collection.pile.comparisons.where({ greaterTaskId: this.task.id })
		);
		_.each(comparisons, function (comparison) {
			comparison.invalidate();
		});
	},

	putOffClicked: function () {
		var wf = prompt("What are you waiting for?\n(ex: Tuesday, extra cash, the office)");
		if (wf !== null) {
			this.task.save({ waitingFor: wf });
		}
	},

	readyClicked: function () {
		this.task.unset("waitingFor");
		this.task.save();
	},

	deleteClicked: function () {
		this.task.destroy();
	},
});

var NewTasksView = Backbone.View.extend({
	html: '<form class="form-inline" role="form">' +
	      '<label class="sr-only" for="new-task-textarea">Several to-do items, one per line</label>' +
	      '<textarea class="form-control" rows="8" cols="60" id="new-task-textarea" placeholder="Several tasks, one per line"></textarea>' +
	      '<button type="submit" class="btn btn-default add-several">Add Tasks</button> ' +
	      '<span class="when oneline">To be done <select class="timescale form-control" style="width: 12em"></select></span>' +
	      '<span class="exclude checkbox"><label><input type="checkbox" checked /> Exclude <span class="count"></span></label></span>' +
	      '</form>',

	className: "new-task",

	events: {
		"click button.add-several" : "addSeveralTasks",
		"input textarea#new-task-textarea" : "textChanged",
		"propertychange textarea#new-task-textarea" : "textChanged",
		"change .exclude input" : "textChanged",
	},

	initialize: function () {
		this.pile = this.model;

		this.$el.html(this.html);
		this.$addButton = this.$("button.add-several");
		this.$timeScaleSelect = this.$("select.timescale");
		this.$exclude = this.$(".exclude").hide();
		this.$excludeCheckbox = this.$(".exclude input");
		this.$excludeCount = this.$(".exclude .count");

		_.each(Task.timeScales, function (scale) {
			var $option = $("<option />", {
				value: scale.id,
				text: scale.label,
			});
			this.$timeScaleSelect.append($option);
		}, this);
		this.$timeScaleSelect.append("<option selected>whenever</option>");
	},

	textChanged: function () {
		var texts = this._texts();
		var numDupes = _.filter(texts, this._isDuplicate, this).length;
		var numToAdd = this.$excludeCheckbox.prop("checked") ? texts.length - numDupes : texts.length;

		this.$addButton.text("Add " + numToAdd + " Task" + (numToAdd === 1 ? "" : "s"));

		this.$exclude.toggle(numDupes > 0);
		if (numDupes > 0) {
			this.$excludeCount.text(numDupes + " duplicate task" + (numDupes === 1 ? "" : "s"));
		}
	},

	addSeveralTasks: function (e) {
		e.preventDefault();

		var texts = this._texts();
		if (this.$excludeCheckbox.prop("checked")) {
			texts = _.filter(texts, this._isNotDuplicate, this);
		}

		this.trigger("add-many", texts, this.$timeScaleSelect.val());
		this.$timeScaleSelect.val("");
		this.$("#new-task-textarea").val("");
		this.textChanged();
	},

	_texts: function () {
		var texts = [];
		_.each(this.$("#new-task-textarea").val().split(/[\r\n]+/), function (text) {
			text = text.trim();
			if (text.length > 0) {
				texts.push(text);
			}
		}, this);
		return texts;
	},

	_isDuplicate: function (text) {
		return !!this.pile.tasks.findWhere({ text: text });
	},

	_isNotDuplicate: function (text) {
		return !this._isDuplicate(text);
	},
});
