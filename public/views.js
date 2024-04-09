var PileView = Backbone.View.extend({
	html: '<div class="navigation" />' +
	      '<h3 class="next-task">Here is what you should do now:</h3>' +
	      '  <div class="task-list next"></div>' +
	      '<div class="task-list"><div class="selection task row"></div></div>' +
	      '<h3 class="tasks"><span>Here are the rest of your tasks in very rough order:</span> <button type="button" class="btn btn-xs btn-info reprioritize-top" data-toggle="tooltip" title="Use this periodically to ensure urgent tasks don\'t get buried.">Reprioritize Due Tasks&#8230;</button></h3>' +
	      '  <div class="task-list rest"></div>' +
	      '<h3 class="wf-tasks">Here are tasks that you\'ve put off:</h3>' +
	      '  <div class="task-list wf"></div>' +
	      '<div class="jumbotron introduction">' +
	      '<div class="container">' +
	      '  <h2>What is Todournament?</h2>' +
	      '  <p>Todournament helps you prioritize your to-do list by letting <strong>your tasks duke it out, tournament-style</strong>. It\'s designed to <strong>minimize bookkeeping</strong> while keeping your list ordered. Add to-do items below to begin.</p>' +
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
		this.$selection = this.$(".selection").hide();
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

		this.selectionView = new SelectionView({
			el: this.$selection[0],
			model: this.pile.taskForest,
		});
		this.selectionView.render();
		this.listenTo(this.selectionView, "compared", this.tasksCompared);
		this.listenTo(this.selectionView, "shuffle", this.render);
		$(document).bind("keyup", "ctrl+left", _.bind(function () {
			if (this.showingSelection) {
				this.tasksCompared(this.selectionView.leftTask, this.selectionView.rightTask);
			}
		}, this));
		$(document).bind("keyup", "ctrl+right", _.bind(function () {
			if (this.showingSelection) {
				this.tasksCompared(this.selectionView.rightTask, this.selectionView.leftTask);
			}
		}, this));
		$(document).bind("keyup", "ctrl+up", _.bind(function () {
			if (this.showingSelection) {
				this.render();
			}
		}, this));

		this.nextTaskListView = new TaskListView({
			el: this.$next,
			model: this.pile.taskForest.nextTasks,
		});
		this.nextTaskListView.showTaskNumbers(true);

		this.taskListView = new TaskListView({
			el: this.$rest,
			model: this.pile.taskForest.restTasks,
		});

		this.wfTaskListView = new TaskListView({
			el: this.$wf,
			model: this.pile.taskForest.wfTasks,
		});

		this.newTasksView = new NewTasksView({ el: this.$newTask, model: this.pile });
		this.newTasksView.on("add-many", this.addNewTasks, this);
		this.newTasksView.render();

		this.listenTo(this.pile.tasks, "add remove reset change:waitingFor change:invalidated", atBatchEnd(this.render, this));
		this.listenTo(this.pile.comparisons, "add remove reset change:greaterTaskId change:lesserTaskId change:invalidated", atBatchEnd(this.render, this));
	},

	render: function () {
		var forest = this.pile.taskForest;

		if (forest.potentialNextTasks.length > 1) {
			var pair = forest.randomComparisonTaskPair();
			var numActiveTasks = forest.nextTasks.length + forest.restTasks.length;
			var progress = 1 - ((forest.potentialNextTasks.length - 1) / numActiveTasks);

			this.selectionView.prepare(pair[0], pair[1]);
			this.selectionView.render();
			this.$selection.show();
			this.$selection.effect("highlight", {}, 600);
			this.showingSelection = true;

			this.navBarView.showComparisonLink(this.$selection);
		} else {
			this.$selection.fadeOut();
			this.showingSelection = false;
			this.navBarView.showComparisonLink(false);
		}

		if (forest.restTasks.length > 0) {
			this.$restHeader.show();
			this.$reprioritizeTop.toggle(this.pile.comparisons.where({invalidated: false}).length > 0);
		} else {
			this.$restHeader.hide();
		}

		if (forest.nextTasks.length > 0) {
			this.navBarView.showTasksLink(this.$nextHeader);
		} else if (forest.restTasks.length > 0) {
			this.navBarView.showTasksLink(this.$restHeader);
		} else {
			this.navBarView.showTasksLink(false);
		}

		if (forest.wfTasks.length > 0) {
			this.$wfHeader.show();
			this.navBarView.showWfTasksLink(this.$wfHeader);
		} else {
			this.$wfHeader.hide();
			this.navBarView.showWfTasksLink(false);
		}

		this.$nextHeader.toggle(this.pile.tasks.length > 0);

		this.$addHeader.text(this.pile.tasks.length > 0 ? "Add more tasks:" : "Add tasks:");
		this.$el.toggleClass("non-empty", this.pile.tasks.length > 0);
		this.navBarView.showAddTasksLink(this.$addHeader);

		return this;
	},

	addNewTasks: function (texts, timeScaleId) {
		doBatch(function () {
			var tasks = this.pile.tasks.add(_.map(texts, function (text) {
				return {
					text: text,
					timeScaleId: timeScaleId,
				};
			}));
			_.invoke(tasks, "save");
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
		var view = new ReprioritizeDueView({ model: this.pile });
		view.$el.modal();
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
	      '    <li class="dropdown">' +
	      '      <a href="#" class="dropdown-toggle" data-toggle="dropdown">Tasks <b class="caret"></b></a>' +
	      '      <ul class="dropdown-menu">' +
	      '        <li><a href="#" class="comparison">Comparison</a></li>' +
	      '        <li><a href="#" class="tasks">Next Tasks</a></li>' +
	      '        <li><a href="#" class="wf-tasks">Put-Off Tasks</a></li>' +
	      '        <li><a href="#" class="add">Add Tasks</a></li>' +
	      '      </ul>' +
	      '    </li>' +
	      // '  <form class="navbar-form navbar-left">' +
	      // '    <div class="form-group">' +
	      // '      <select class="form-control"><option>Foo bar</option></select>' +
	      // '    </div>' +
	      // '  </form>' +
	      '    <li class="dropdown">' +
	      '      <a href="#" class="dropdown-toggle" data-toggle="dropdown">Maintenance <b class="caret"></b></a>' +
	      '      <ul class="dropdown-menu">' +
	      '        <li><a href="#" class="export">Import/Export&#8230;</a></li>' +
	      '        <li><a href="#" class="purge">Purge&#8230;</a></li>' +
	      '      </ul>' +
	      '    </li>' +
	      '  </ul>' +
	      '  <p class="navbar-text description hidden-xs"><span class="count"></span>, saved in <abbr data-toggle="tooltip" class="storage"></abbr></p>' +
	      '</div>' +
	      '</nav>',

	events: {
		"click .navbar-brand" : "logoClicked",
		"click .comparison" : "comparisonClicked",
		"click .tasks" : "tasksClicked",
		"click .wf-tasks" : "wfTasksClicked",
		"click .add" : "addTasksClicked",
		"click .export" : "importExportClicked",
		"click .purge" : "purgeClicked",
	},

	initialize: function () {
		this.pile = this.model;
		this.$el.html(this.html);

		this.$comparisonLink = this.$(".comparison").hide();
		this.$tasksLink = this.$(".tasks").hide();
		this.$wfTasksLink = this.$(".wf-tasks").hide();
		this.$addTasksLink = this.$(".add").hide();

		this.$taskCount = this.$(".description .count");
		this.listenTo(this.pile.tasks, "add remove reset change:invalidated", atBatchEnd(this.taskCountChanged, this));
		this.taskCountChanged();

		this.$storage = this.$(".description .storage");
		if (this.pile.collection.storageName === "localStorage") {
			this.$storage
				.prop("title", "Saved on your computer (not our server), so don't clear your cookies! Dropbox support coming soon.")
				.text("Local Storage");
		} else if (this.pile.collection.storageName === "dropbox") {
			this.$storage
				.prop("title", "Saved on your Dropbox account (not our server)")
				.text("Dropbox (NOT SUPPORTED)");
		} else {
			this.$storage
				.prop("title", "Something strange has happened and I can't tell where your data is stored.")
				.text("Somewhere?");
		}

		this.$(".description abbr").tooltip({ placement: "bottom" });
	},

	taskCountChanged: function () {
		var count = this.pile.tasks.where({ invalidated: false }).length;
		this.$taskCount.text(count + " task" + (count === 1 ? "" : "s"));
	},

	showComparisonLink: function ($dom) {
		this.$comparisonLink.toggle(!!$dom);
		this.$comparisonLinkTarget = $dom;
	},

	showTasksLink: function ($dom) {
		this.$tasksLink.toggle(!!$dom);
		this.$tasksLinkTarget = $dom;
	},

	showWfTasksLink: function ($dom) {
		this.$wfTasksLink.toggle(!!$dom);
		this.$wfTasksLinkTarget = $dom;
	},

	showAddTasksLink: function ($dom) {
		this.$addTasksLink.toggle(!!$dom);
		this.$addTasksLinkTarget = $dom;
	},

	logoClicked: function (e) {
		e.preventDefault();
		$(document.body).animate({ scrollTop: 0 });
	},

	comparisonClicked: function (e) {
		e.preventDefault();
		$(document.body).animate({ scrollTop: this.$comparisonLinkTarget.offset().top - 20 });
	},

	tasksClicked: function (e) {
		e.preventDefault();
		$(document.body).animate({ scrollTop: this.$tasksLinkTarget.offset().top - 10 });
	},

	wfTasksClicked: function (e) {
		e.preventDefault();
		$(document.body).animate({ scrollTop: this.$wfTasksLinkTarget.offset().top - 10 });
	},

	addTasksClicked: function (e) {
		e.preventDefault();
		$(document.body).animate({
			scrollTop: this.$addTasksLinkTarget.offset().top - 10,
		}, function () {
			$("#new-task-textarea").focus();
		});
	},

	importExportClicked: function (e) {
		e.preventDefault();
		var view = new ImportExportView({ model: this.pile });
		view.$el.modal();
	},

	purgeClicked: function (e) {
		e.preventDefault();
		if (confirm("Purge deleted tasks and comparisons? Do this if things get slow. You can use the \"Import/Export\" button to make a backup in case you ever want them back.")) {
			doBatch(function () {
				var tasksToDestroy = this.pile.tasks.where({ invalidated: true });
				_.invoke(tasksToDestroy, "destroy");

				var comparisonsToDestroy = this.pile.comparisons.filter(function (comparison) {
					var greaterTask = this.pile.tasks.get(comparison.get("greaterTaskId"));
					var lesserTask = this.pile.tasks.get(comparison.get("lesserTaskId"));
					return comparison.get("invalidated") || !greaterTask || !lesserTask;
				}, this);
				_.invoke(comparisonsToDestroy, "destroy");
			}, this);
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
	      '      <button type="button" class="btn btn-default" data-dismiss="modal">Close</button>' +
	      '      <button type="button" class="btn btn-warning import-copy">Import as a Copy&#8230;</button>' +
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

		this.$el.on("shown.bs.modal", _.bind(function () {
			this.$("textarea").focus().select();
		}, this));
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
	html: '<div class="question text">Choose which of these tasks is more important to do first <span class="num-left"></span> <button type="button" class="btn btn-xs btn-default random" data-toggle="tooltip" title="Randomly decide the outcome of this comparison.">Decide for me!</button> <button type="button" class="btn btn-xs btn-default shuffle" data-toggle="tooltip" title="Randomly choose another 2 tasks to compare instead.">I can\'t decide!</button></div> ' +
	      '<div class="task-row">' +
	      '  <div class="col-md-6"><div class="left"><button type="button" class="btn btn-success this-one">This One!</button><div class="task-spot"></div></div></div>' +
	      '  <div class="col-md-6"><div class="right"><button type="button" class="btn btn-success this-one">This One!</button><div class="task-spot"></div></div></div>' +
	      '</div>',

	className: "selection",

	events: {
		"click .random" : "randomClicked",
		"click .shuffle" : "shuffleClicked",
		"click .left button.this-one" : "leftClicked",
		"click .right button.this-one" : "rightClicked",
	},

	initialize: function () {
		this.forest = this.model;

		this.$el.html(this.html);
		this.$numLeft = this.$(".num-left");
		this.$shuffle = this.$("button.shuffle");
		this.$left = this.$(".task-row .left .task-spot");
		this.$right = this.$(".task-row .right .task-spot");

		this.$shuffle.tooltip({ placement: "top" });
	},

	render: function () {
		var count = this.forest.potentialNextTasks.length - 1;
		this.$shuffle.toggle(count > 1);
		this.$numLeft.text("(" + count + " comparison" + (count === 1 ? "" : "s") + " left until next action is known)")
		this.renderOne(this.$left, this.leftTask);
		this.renderOne(this.$right, this.rightTask);
	},

	renderOne: function ($el, task) {
		$el.empty();

		if (task) {
			var view = new TaskView({
				model: task,
				className: "task selection-task",
			});
			$el.append(view.render().el);
		}
	},

	prepare: function (leftTask, rightTask, progress) {
		this.leftTask = leftTask;
		this.rightTask = rightTask;
	},

	randomClicked: function () {
		if ( Math.random() < 0.5 ) {
			this.trigger("compared", this.leftTask, this.rightTask);
		} else {
			this.trigger("compared", this.rightTask, this.leftTask);
		}
	},

	shuffleClicked: function () {
		let oldLeft = this.leftTask;
		let oldRight = this.rightTask;
		this.trigger("shuffle");
		// using OR instead of AND since it feels more natural to completely
		// switch the options, so no single side ever stays the same
		while ( this.leftTask === oldLeft || this.rightTask === oldRight ) {
			console.log("artificially switching options");
			this.trigger("shuffle");
		}
	},

	leftClicked: function (e) {
		this.clicked(e, this.leftTask, this.rightTask);
	},

	rightClicked: function (e) {
		this.clicked(e, this.rightTask, this.leftTask);
	},

	clicked: function (e, greaterTask, lesserTask) {
		this.trigger("compared", greaterTask, lesserTask);
		$(e.currentTarget).blur();
	},
});

var ReprioritizeDueView = Backbone.View.extend({
	html: '<div class="modal-dialog">' +
	      '  <div class="modal-content">' +
	      '    <div class="modal-header">' +
	      '      <button type="button" class="close" data-dismiss="modal" aria-hidden="true">&times;</button>' +
	      '      <h4 class="modal-title">Reprioritize Due Tasks</h4>' +
	      '    </div>' +
	      '    <div class="modal-body">' +
	      '      <p>Drag the slider from the right to select how many tasks to reprioritize:</p>' +
	      '      <form role="form">' +
	      '        <div class="form-group">' +
	      '          <div class="progress">' +
	      '            <div class="progress-bar progress-bar-success" style="width: 50%"><span class="sr-only">50% Fine</span></div>' +
	      '            <div class="progress-bar progress-bar-warning" style="width: 40%"><span class="sr-only">40% Danger</span></div>' +
	      '            <div class="progress-bar progress-bar-danger" style="width: 11%"><span class="sr-only">10% Overdue</span></div>' +
	      '          </div>' +
	      '          <input type="text" class="sslider" style="width: 100%" />' +
	      '        </div>' +
	      '      </form>' +
	      '      <p class="status">You\'ve selected <span></span>.</p>' +
	      '    </div>' +
	      '    <div class="modal-footer">' +
	      '      <button type="button" class="btn btn-default" data-dismiss="modal">Cancel</button>' +
	      '      <button type="button" class="btn btn-primary" disabled>Reprioritize 0 tasks</button>' +
	      '    </div>' +
	      '  </div><!-- /.modal-content -->' +
	      '</div><!-- /.modal-dialog -->',

	className: "reprioritize-due-dialog modal fade",

	events: {
		"click .btn-primary" : "reprioritizeClicked",
		"click .progress-bar" : "progressBarClicked",
	},

	initialize: function () {
		this.pile = this.model;
		this.$el.html(this.html);

		this.$ok = this.$(".btn-primary");
		this.$slider = this.$(".sslider");
		this.$count = this.$("p.status span");

		var comparisons = this.pile.comparisons.where({invalidated: false});
		this.counts = { fine: 0, danger: 0, overdue: 0 };
		this.total = comparisons.length;
		this.sortedComparisons = _.sortBy(comparisons, function (c) {
			var d = this.dueness(c);
			if (d > 1) this.counts.overdue++;
			else if (d > 0.5) this.counts.danger++;
			else this.counts.fine++;
			return -d;
		}, this);
		this.comparisonsToInvalidate = [];

		this.setProgress(this.$(".progress-bar.progress-bar-success"), this.counts.fine, this.total, "fine");
		this.setProgress(this.$(".progress-bar.progress-bar-warning"), this.counts.danger, this.total, "danger");
		this.setProgress(this.$(".progress-bar.progress-bar-danger"), this.counts.overdue, this.total, "overdue");

		// the slider doesn't layout properly unless it's in the DOM initially,
		// so wait until the dialog has been shown to add it
		// (strike one!)
		this.$el.one("shown.bs.modal", _.bind(function () {
			var initialValue = Math.max(-10, -this.total);

			this.$slider.slider({
				min: -this.total,
				max: 0,
				value: initialValue,
				handle: "triangle",
				formater: _.bind(function (x) { return this.format(-x).short }, this),
			});
			this.$slider.on("slide", _.bind(this.onSlide, this));

			this.onSlide({ value: initialValue });
		}, this));
	},

	reprioritizeClicked: function () {
		doBatch(function () {
			_.invoke(this.comparisonsToInvalidate, "invalidate");
		}, this);

		this.$el.modal("hide");
	},

	progressBarClicked: function (e) {
		var $el = $(e.target);
		var count = 0;
		if ($el.hasClass("progress-bar-success")) count = this.counts.fine + this.counts.danger + this.counts.overdue;
		if ($el.hasClass("progress-bar-warning")) count = this.counts.danger + this.counts.overdue;
		if ($el.hasClass("progress-bar-danger")) count = this.counts.overdue;
		this.$slider.slider("setValue", -count);
		this.onSlide({ value: -count });
	},

	onSlide: function (e) {
		var count = -e.value;
		this.comparisonsToInvalidate = this.sortedComparisons.slice(0, count);

		this.$count.text(this.format(count).long);

		this.$ok.text("Reprioritize " + count + " task" + (count === 1 ? "" : "s"));
		this.$ok.prop("disabled", count === 0);
	},

	setProgress: function ($progressBar, count, total, description) {
		var percent = count / total;
		var outOf100 = percent * 100;
		$progressBar.css("width", outOf100 + "%");
		$progressBar.children("span").text(outOf100 + "% " + description);
		$progressBar.prop("title", count + " task" + (count === 1 ? "" : "s"));
	},

	dueness: function (comparison) {
		var age = (new Date) - Date.parse(comparison.get("createdAt"));
		var range = 4 * 7 * 24 * 60 * 60 * 1000; // default range: 1 month

		var lesserTask = this.pile.tasks.get(comparison.get("lesserTaskId"));
		if (lesserTask) {
			var timeScaleId = lesserTask.get("timeScaleId");
			var timeScale = _.filter(Task.timeScales, function (scale) { return scale.id === timeScaleId })[0];
			if (timeScale) {
				range = timeScale.range;
			}
		}

		return age / range;
	},

	format: function (count) {
		if (count === 0) {
			return { short: "0 tasks", long: "0 tasks" };
		}

		var numOverdue = Math.min(this.counts.overdue, count);
		count = Math.max(0, count - this.counts.overdue);
		var numDanger = Math.min(this.counts.danger, count);
		count = Math.max(0, count - this.counts.danger);
		var numFine = Math.min(this.counts.fine, count);

		var short = []; // ex: ["4 overdue", "2 almost due", "19 tasks"]
		var long = []; // ex: ["1 task that's overdue", "1 task that's not due for a while"]

		if (numOverdue > 0 || (numDanger === 0 && numFine === 0)) {
			long.push(pluralize(numOverdue, "task that's overdue", "tasks that are overdue"));
			short.push(numOverdue + " overdue");
		}
		if (numDanger > 0) {
			long.push(pluralize(numDanger, "task that's almost due", "tasks that are almost due"));
			short.push(numDanger + " almost due");
		}
		if (numFine > 0) {
			long.push(pluralize(numFine, "task that's not due for a while", "tasks that aren't due for a while"));
			short.push(pluralize(numFine, "task", "tasks"));
		}

		return { long: sentenceJoin(long), short: short.join(", ") };

		function pluralize(num, singular, plural) {
			if (num === 1) {
				return num + " " + singular;
			} else {
				return num + " " + plural;
			}
		}

		function sentenceJoin(arr) {
			if (arr.length <= 1) {
				return arr[0];
			} else if (arr.length === 2) {
				return arr[0] + " and " + arr[1];
			} else {
				return arr.slice(0, arr.length - 1).join(", ") + ", and " + arr[arr.length - 1];
			}
		}
	},
});

var TaskListView = Backbone.View.extend({
	initialize: function () {
		this.tasks = this.model;
		this.pile = this.model.pile;
		this.taskViews = {};

		this.listenTo(this.tasks, "reset", atBatchEnd(this._syncViews, this));
		this._syncViews();
	},

	showTaskNumbers: function (show) {
		this.numberTasks = show;
		this._syncViews();
	},

	_syncViews: function () {
		var tasks = this.tasks.toArray();

		var tasksByCid = _.indexBy(tasks, "cid");

		var oldCids = _.keys(this.taskViews);
		var currentCids = _.pluck(tasks, "cid");
		var removedCids = _.difference(oldCids, currentCids);
		var addedCids = _.difference(currentCids, oldCids);

		_.each(removedCids, function (cid) {
			this.taskViews[cid].remove();
			delete this.taskViews[cid];
		}, this);

		_.each(addedCids, function (cid) {
			var task = tasksByCid[cid];
			this.taskViews[cid] = new TaskView({ model: task }).render();
		}, this);

		_.each(tasks, function (task, i) {
			this.$el.append(this.taskViews[task.cid].el);
			if (this.numberTasks) {
				this.taskViews[task.cid].showNumber(i + 1);
			}
		}, this);
	},
});

var TaskView = Backbone.View.extend({
	html: '<div class="tools">' +
	      '<select></select>' +
	      '<button type="button" class="btn btn-xs btn-default edit">Edit&#8230;</button>' +
	      '<button type="button" class="btn btn-xs btn-info reprioritize">Reprioritize</button>' +
	      '<button type="button" class="btn btn-xs btn-warning put-off">Put Off&#8230;</button>' +
	      '<button type="button" class="btn btn-xs btn-success ready">Ready!</button>' +
	      '<button type="button" class="btn btn-xs btn-danger delete">Remove</button>' +
	      '</div> ' +
	      '<span class="number"></span>' +
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
		this.$number = this.$("span.number");
		this.$text = this.$("span.text");
		this.$wf = this.$("span.wf");

		this.$timeScaleSelect.append("<option />");
		_.each(Task.timeScales, function (scale) {
			var $option = $("<option />", {
				value: scale.id,
				text: "do " + scale.label,
			});
			this.$timeScaleSelect.append($option);
		}, this);

		this.listenTo(this.task, "change:text", this.textUpdated);
		this.listenTo(this.task, "change:timeScaleId", this.timeScaleUpdated);
		this.listenTo(this.task, "change:waitingFor", this.wfUpdated);

		this.timeScaleUpdated();
		this.textUpdated();
		this.wfUpdated();
	},

	showNumber: function (number) {
		if (number !== this.number) {
			this.$number.text(number + ". ");
			this.number = number;
		}
	},

	timeScaleUpdated: function () {
		var $options = this.$timeScaleSelect.children("option");
		$options.prop("selected", false);

		if (this.task.get("timeScaleId") != null) {
			$options.filter("[value=" + this.task.get("timeScaleId") + "]")
			        .prop("selected", true);
		}
	},

	textUpdated: function () {
		this.$text.text(this.task.get("text")).linkify();
	},

	wfUpdated: function () {
		if (this.task.get("waitingFor") != null) {
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
		if (!!newText) {
			this.task.save({ text: newText });
		}
	},

	reprioritizeClicked: function () {
		var comparisons = [].concat(
			this.model.collection.pile.comparisons.where({ lesserTaskId: this.task.id }),
			this.model.collection.pile.comparisons.where({ greaterTaskId: this.task.id })
		);
		doBatch(function () {
			_.each(comparisons, function (comparison) {
				comparison.invalidate();
			});
		}, this);
	},

	putOffClicked: function () {
		var wf = prompt("What are you waiting for?\n(ex: Tuesday, extra cash, the office)");
		if (!!wf) {
			this.task.putOff(wf);
		}
	},

	readyClicked: function () {
		this.task.resume();
	},

	deleteClicked: function () {
		console.log("invalidating task", this.task.get("text"));
		this.task.invalidate();
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

		this.$timeScaleSelect.append("<option value='' selected>whenever</option>");
		_.each(Task.timeScales, function (scale) {
			var $option = $("<option />", {
				value: scale.id,
				text: scale.label,
			});
			this.$timeScaleSelect.append($option);
		}, this);
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
		$(e.currentTarget).blur();

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
		return !!this.pile.tasks.findWhere({ invalidated: false, text: text });
	},

	_isNotDuplicate: function (text) {
		return !this._isDuplicate(text);
	},
});

$(function () {
	$(document).on("hidden.bs.modal", ".modal", function () {
		$(this).remove();
	});
});
